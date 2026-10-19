"""
Stateless fraud scoring.

POST /api/predict            -> score one transaction, nothing is written to the DB
GET  /api/predict/model-info -> which model is loaded, thresholds, expected features
POST /api/predict/batch      -> score up to 5,000 transactions in one vectorised call
GET  /api/predict/sample     -> a real row from the held-out test set, to prefill forms

Persisting a scored transaction stays in routes/transactions.py (POST /api/transactions/).
"""
import time
from dataclasses import asdict
from typing import Dict, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.concurrency import run_in_threadpool

from backend.auth import get_current_user
from backend.feature_spec import FEATURE_COLUMNS
from backend.ml_service import FraudModel, ModelNotLoadedError, get_model, model_status
from backend.models import User
from backend.schemas import (
    BatchPredictRequest, BatchPredictResponse, ModelInfoResponse, PredictionResponse, TransactionFeatures,
)
from backend.services.evaluation import sample_transactions

router = APIRouter(prefix="/api/predict", tags=["prediction"])


def require_model() -> FraudModel:
    try:
        return get_model()
    except ModelNotLoadedError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Fraud model unavailable: {exc}",
        )


@router.post("", response_model=PredictionResponse)
async def predict(
    features: TransactionFeatures,
    explain: bool = Query(True, description="Include per-feature SHAP contributions"),
    current_user: User = Depends(get_current_user),   # auth first -> 401 before 503
    model: FraudModel = Depends(require_model),
):
    # predict() is CPU-bound; keep it off the event loop.
    result = await run_in_threadpool(model.predict, features.model_dump(), explain)
    return PredictionResponse(**asdict(result))


@router.post("/batch", response_model=BatchPredictResponse)
async def predict_batch(
    body: BatchPredictRequest,
    current_user: User = Depends(get_current_user),
    model: FraudModel = Depends(require_model),
):
    """Score many transactions at once without storing them (CSV upload, load tests)."""
    rows = [t.model_dump() for t in body.transactions]
    start = time.perf_counter()
    results = await run_in_threadpool(model.predict_batch, rows, body.explain)
    elapsed = time.perf_counter() - start
    return {
        "model_version": model.version,
        "threshold": model.threshold,
        "count": len(results),
        "flagged": sum(r["is_fraud"] for r in results),
        "elapsed_ms": round(elapsed * 1000, 2),
        "throughput_per_second": round(len(results) / elapsed, 1) if elapsed else 0.0,
        "results": results,
    }


@router.get("/model-info", response_model=ModelInfoResponse)
async def model_info(current_user: User = Depends(get_current_user)):
    try:
        m = get_model()
    except ModelNotLoadedError:
        return ModelInfoResponse(features=FEATURE_COLUMNS, **model_status())
    return ModelInfoResponse(
        loaded=True,
        model_version=m.version,
        threshold=m.threshold,
        high_risk_threshold=m.high_risk_threshold,
        features=FEATURE_COLUMNS,
    )


@router.get("/sample", response_model=Dict[str, float])
async def sample(
    label: Literal["fraud", "legit"] = "legit",
    current_user: User = Depends(get_current_user),
):
    """A random real transaction from the held-out test split, with lowercase keys
    ready to send back to POST /api/predict."""
    try:
        features, _ = sample_transactions(1, 1.0 if label == "fraud" else 0.0)[0]
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return {k.lower(): round(v, 6) for k, v in features.items()}
