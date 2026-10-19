"""
Offline evaluation and simulation data, both built on the model's held-out test set:
  - simulated transactions are rows the model never trained on, and
  - the threshold curve reports honest, out-of-sample precision/recall.

Source of the held-out rows, in order:
  1. ml-model/holdout.csv.gz, written by ml-model/train.py (matches the trained model exactly)
  2. only for models trained by the old script (no model_card.json): the stratified split of
     dataset/sample_creditcard.csv (test_size=0.2, random_state=42)
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.model_selection import train_test_split

from backend.feature_spec import FEATURE_COLUMNS
from backend.ml_service import FraudModel

ROOT = Path(__file__).resolve().parents[2]
HOLDOUT_PATH = ROOT / "ml-model" / "holdout.csv.gz"
DATA_PATH = ROOT / "dataset" / "sample_creditcard.csv"
TEST_SIZE = 0.2
RANDOM_STATE = 42


@lru_cache(maxsize=1)
def load_test_split() -> tuple[pd.DataFrame, pd.Series]:
    if HOLDOUT_PATH.exists():
        df = pd.read_csv(HOLDOUT_PATH)
        return df[FEATURE_COLUMNS].reset_index(drop=True), df["Class"].astype(int).reset_index(drop=True)
    if (ROOT / "ml-model" / "model_card.json").exists():
        raise FileNotFoundError(
            "ml-model/holdout.csv.gz is missing. It is written by `python ml-model/train.py` "
            "and must ship with the model it belongs to.")
    if not DATA_PATH.exists():
        raise FileNotFoundError(f"Dataset not found: {DATA_PATH}. Run dataset/generate_sample_data.py")
    df = pd.read_csv(DATA_PATH)
    X = df[FEATURE_COLUMNS]
    y = df["Class"].astype(int)
    _, X_test, _, y_test = train_test_split(
        X, y, test_size=TEST_SIZE, random_state=RANDOM_STATE, stratify=y
    )
    return X_test.reset_index(drop=True), y_test.reset_index(drop=True)


def sample_transactions(count: int, fraud_ratio: float,
                        rng: np.random.Generator | None = None) -> list[tuple[dict[str, float], int]]:
    """
    Draw `count` rows from the test split, each fraudulent with probability `fraud_ratio`.
    Returns (features, ground_truth_label) pairs.
    """
    X, y = load_test_split()
    rng = rng or np.random.default_rng()
    fraud_idx = np.flatnonzero(y.to_numpy() == 1)
    legit_idx = np.flatnonzero(y.to_numpy() == 0)

    n_fraud = int(rng.binomial(count, fraud_ratio)) if len(fraud_idx) else 0
    picks = np.concatenate([
        rng.choice(fraud_idx, size=n_fraud, replace=True) if n_fraud else np.array([], dtype=int),
        rng.choice(legit_idx, size=count - n_fraud, replace=True),
    ]).astype(int)
    rng.shuffle(picks)

    return [
        ({col: float(X.iat[i, j]) for j, col in enumerate(FEATURE_COLUMNS)}, int(y.iat[i]))
        for i in picks
    ]


def _point(y_true: np.ndarray, probs: np.ndarray, threshold: float) -> dict:
    pred = probs >= threshold
    tp = int(np.sum(pred & (y_true == 1)))
    fp = int(np.sum(pred & (y_true == 0)))
    fn = int(np.sum(~pred & (y_true == 1)))
    tn = int(np.sum(~pred & (y_true == 0)))
    precision = tp / (tp + fp) if (tp + fp) else None
    recall = tp / (tp + fn) if (tp + fn) else None
    f1 = (2 * precision * recall / (precision + recall)
          if precision is not None and recall is not None and (precision + recall) else None)
    return {
        "threshold": round(float(threshold), 2),
        "precision": precision, "recall": recall, "f1": f1,
        "flagged": tp + fp, "tp": tp, "fp": fp, "fn": fn, "tn": tn,
    }


@lru_cache(maxsize=4)
def _threshold_curve_cached(model: FraudModel) -> dict:
    X, y = load_test_split()
    probs = model.predict_proba_batch(X)
    y_true = y.to_numpy()
    thresholds = np.round(np.arange(0.05, 1.0, 0.05), 2)
    points = [_point(y_true, probs, t) for t in thresholds]
    best = max((p for p in points if p["f1"] is not None), key=lambda p: p["f1"], default=None)
    return {
        "model_version": model.version,
        "source": HOLDOUT_PATH.name if HOLDOUT_PATH.exists() else f"{DATA_PATH.name} (stratified 20% split)",
        "n_test": int(len(y_true)),
        "n_fraud": int(y_true.sum()),
        "roc_auc": float(roc_auc_score(y_true, probs)) if 0 < y_true.sum() < len(y_true) else None,
        "pr_auc": float(average_precision_score(y_true, probs)) if y_true.sum() else None,
        "current_threshold": model.threshold,
        "current": _point(y_true, probs, model.threshold),
        "best_f1_threshold": best["threshold"] if best else None,
        "points": points,
    }


def threshold_curve(model: FraudModel) -> dict:
    """Precision / recall / flagged-count at thresholds 0.05..0.95 on the test split (cached)."""
    return _threshold_curve_cached(model)  # cache is keyed on the loaded model object
