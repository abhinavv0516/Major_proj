"""
ML inference layer.

Pure Python: no FastAPI, no SQLAlchemy imports. Routes and the Redis worker
call into this module; it knows nothing about HTTP or the database.

Lifecycle:
    load_model()  -> called once at app startup (backend/main.py lifespan)
    get_model()   -> returns the loaded FraudModel (lazy-loads in the worker / tests)
    FraudModel.predict(features) -> PredictionResult
"""
from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import joblib
import numpy as np
import pandas as pd
import xgboost as xgb

from backend.feature_spec import FEATURE_COLUMNS

logger = logging.getLogger(__name__)

# ── Config (override via backend/.env) ────────────────────────────────────────
ML_DIR = Path(__file__).resolve().parent.parent / "ml-model"
MODEL_PATH = Path(os.getenv("MODEL_PATH", str(ML_DIR / "xgboost_model.pkl")))
SCALER_PATH = Path(os.getenv("SCALER_PATH", str(ML_DIR / "scaler.pkl")))
MODEL_CARD_PATH = ML_DIR / "model_card.json"
TOP_K_FEATURES = 5


def read_model_card() -> dict:
    """model_card.json is written by ml-model/train.py (version, tuned threshold, dataset...)."""
    try:
        return json.loads(MODEL_CARD_PATH.read_text())
    except (OSError, ValueError):
        return {}


def resolve_settings(card: dict) -> tuple[str, float, float]:
    """
    Version and thresholds. Precedence: backend/.env > model_card.json > defaults.
      FRAUD_THRESHOLD      probability >= this  -> is_fraud, risk "medium"
      HIGH_RISK_THRESHOLD  probability >= this  -> risk "high"
    """
    version = os.getenv("MODEL_VERSION") or card.get("version") or "xgboost-v1"
    threshold = float(os.getenv("FRAUD_THRESHOLD") or card.get("threshold") or 0.5)
    default_high = max(0.8, round((threshold + 1) / 2, 4))  # always above the fraud threshold
    high = float(os.getenv("HIGH_RISK_THRESHOLD") or default_high)
    return version, threshold, max(high, threshold)


class ModelNotLoadedError(RuntimeError):
    """Raised when inference is requested but the model artifacts could not be loaded."""


@dataclass(frozen=True)
class PredictionResult:
    is_fraud: bool
    fraud_probability: float
    risk_level: str                          # "low" | "medium" | "high"
    threshold: float
    model_version: str
    top_features: dict[str, float]           # top-K features by |SHAP|
    shap_values: Optional[dict[str, float]]  # None when explain=False
    inference_ms: float


class FraudModel:
    """Wraps the fitted StandardScaler + XGBClassifier pair produced by ml-model/train.py."""

    def __init__(self, model: xgb.XGBClassifier, scaler, version: str,
                 threshold: float, high_risk_threshold: float):
        fitted_cols = list(getattr(scaler, "feature_names_in_", FEATURE_COLUMNS))
        if fitted_cols != FEATURE_COLUMNS:
            raise ValueError(
                f"Scaler was fitted on columns {fitted_cols}, expected {FEATURE_COLUMNS}. "
                "Retrain or update backend/feature_spec.py."
            )
        self.model = model
        self.booster = model.get_booster()
        self.scaler = scaler
        self.version = version
        self.threshold = threshold
        self.high_risk_threshold = high_risk_threshold

    @classmethod
    def from_disk(cls, model_path: Path = MODEL_PATH, scaler_path: Path = SCALER_PATH) -> "FraudModel":
        if not model_path.exists():
            raise FileNotFoundError(f"Model file not found: {model_path}")
        if not scaler_path.exists():
            raise FileNotFoundError(f"Scaler file not found: {scaler_path}")
        version, threshold, high = resolve_settings(read_model_card())
        return cls(
            model=joblib.load(model_path),
            scaler=joblib.load(scaler_path),
            version=version,
            threshold=threshold,
            high_risk_threshold=high,
        )

    def risk_level(self, probability: float) -> str:
        if probability >= self.high_risk_threshold:
            return "high"
        if probability >= self.threshold:
            return "medium"
        return "low"

    def predict_proba_batch(self, X: pd.DataFrame) -> "np.ndarray":
        """Fraud probabilities for many rows at once (used for offline evaluation)."""
        scaled = pd.DataFrame(self.scaler.transform(X[FEATURE_COLUMNS]), columns=FEATURE_COLUMNS)
        return self.model.predict_proba(scaled)[:, 1]

    def predict_batch(self, rows: list[dict[str, float]], explain: bool = False) -> list[dict]:
        """Vectorised scoring for many transactions in one pass (much faster than a loop)."""
        frame = pd.DataFrame([[float(r[c]) for c in FEATURE_COLUMNS] for r in rows], columns=FEATURE_COLUMNS)
        scaled = pd.DataFrame(self.scaler.transform(frame), columns=FEATURE_COLUMNS)
        probs = self.model.predict_proba(scaled)[:, 1]
        tops: list[dict[str, float]] = [{} for _ in rows]
        if explain:
            contribs = self.booster.predict(xgb.DMatrix(scaled), pred_contribs=True)[:, :-1]
            for i, row in enumerate(contribs):
                order = np.argsort(-np.abs(row))[:TOP_K_FEATURES]
                tops[i] = {FEATURE_COLUMNS[j]: float(row[j]) for j in order}
        return [
            {
                "index": i,
                "fraud_probability": float(p),
                "is_fraud": bool(p >= self.threshold),
                "risk_level": self.risk_level(float(p)),
                "top_features": tops[i],
            }
            for i, p in enumerate(probs)
        ]

    def predict(self, features: dict[str, float], explain: bool = True) -> PredictionResult:
        """
        `features` must contain every column in FEATURE_COLUMNS (validated upstream
        by schemas.TransactionFeatures). Synchronous and CPU-bound: call it from a
        threadpool inside async routes.
        """
        start = time.perf_counter()

        row = pd.DataFrame([[float(features[c]) for c in FEATURE_COLUMNS]], columns=FEATURE_COLUMNS)
        scaled = pd.DataFrame(self.scaler.transform(row), columns=FEATURE_COLUMNS)

        probability = float(self.model.predict_proba(scaled)[0, 1])

        shap_values: Optional[dict[str, float]] = None
        top_features: dict[str, float] = {}
        if explain:
            # XGBoost's built-in TreeSHAP: same values shap.TreeExplainer returns
            # (log-odds space), without the `shap` dependency. Last column is the bias term.
            contribs = self.booster.predict(xgb.DMatrix(scaled), pred_contribs=True)[0]
            shap_values = {col: float(v) for col, v in zip(FEATURE_COLUMNS, contribs[:-1])}
            top_features = dict(
                sorted(shap_values.items(), key=lambda kv: abs(kv[1]), reverse=True)[:TOP_K_FEATURES]
            )

        return PredictionResult(
            is_fraud=probability >= self.threshold,
            fraud_probability=probability,
            risk_level=self.risk_level(probability),
            threshold=self.threshold,
            model_version=self.version,
            top_features=top_features,
            shap_values=shap_values,
            inference_ms=round((time.perf_counter() - start) * 1000, 3),
        )


# ── Process-wide singleton ────────────────────────────────────────────────────
_model: Optional[FraudModel] = None
_load_error: Optional[str] = None


def load_model() -> Optional[FraudModel]:
    """Load artifacts from disk. Never raises: failures are logged and surfaced as 503s."""
    global _model, _load_error
    try:
        _model = FraudModel.from_disk()
        _load_error = None
        logger.info("Fraud model loaded: version=%s threshold=%.2f path=%s",
                    _model.version, _model.threshold, MODEL_PATH)
    except Exception as exc:  # noqa: BLE001 - we want the API to start even if the model is broken
        _model = None
        _load_error = f"{type(exc).__name__}: {exc}"
        logger.exception("Failed to load fraud model")
    return _model


def get_model() -> FraudModel:
    if _model is None:
        load_model()  # lazy path for the Redis worker and tests
    if _model is None:
        raise ModelNotLoadedError(_load_error or "Model not loaded")
    return _model


def model_status() -> dict:
    return {"loaded": _model is not None, "error": _load_error}


def normalize_features(data: dict) -> tuple[dict[str, float], list[str]]:
    """
    Map a payload with 'V1' or 'v1' style keys onto FEATURE_COLUMNS.
    Returns (features, missing); missing features are filled with 0.0.
    """
    features: dict[str, float] = {}
    missing: list[str] = []
    for col in FEATURE_COLUMNS:
        val = data.get(col, data.get(col.lower()))
        if val is None:
            missing.append(col)
            val = 0.0
        features[col] = float(val)
    return features, missing


def predict_fraud(transaction_data: dict) -> tuple[bool, float, str, dict, dict]:
    """
    Backward-compatible tuple API. New code should use get_model().predict().
    """
    features, missing = normalize_features(transaction_data)
    if missing:
        logger.warning("predict_fraud: %d feature(s) missing, defaulted to 0.0: %s", len(missing), missing)

    r = get_model().predict(features, explain=True)
    return r.is_fraud, r.fraud_probability, r.risk_level, r.shap_values or {}, r.top_features
