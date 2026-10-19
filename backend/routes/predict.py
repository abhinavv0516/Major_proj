"""
Stateless fraud scoring.

POST /api/predict            -> score one transaction, nothing is written to the DB
GET  /api/predict/model-info -> which model is loaded, thresholds, expected features

Persisting a scored transaction stays in routes/transactions.py (POST /api/transactions/).
"""
from dataclasses import asdict

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.concurrency import run_in_threadpool

from backend.auth import get_current_user
from backend.feature_spec import FEATURE_COLUMNS
from backend.ml_service import FraudModel, ModelNotLoadedError, get_model, model_status
from backend.models import User
from backend.schemas import ModelInfoResponse, PredictionResponse, TransactionFeatures

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
