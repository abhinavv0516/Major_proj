import json
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import get_current_user
from backend.database import get_db
from backend.ml_service import ModelNotLoadedError, get_model, read_model_card
from backend.models import User
from backend.schemas import (
    AnalyticsResponse, FeatureDriver, ModelMetricsResponse, ThresholdCurveResponse, TimeseriesPoint,
)
from backend.services import analytics as svc
from backend.services.evaluation import threshold_curve
from backend.services.views import TxView, list_recent

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

ML_DIR = Path(__file__).resolve().parents[2] / "ml-model"
METRICS_PATH = ML_DIR / "metrics.json"
VALIDATION_PATH = ML_DIR / "validation_report.json"


async def _recent_views(db: AsyncSession) -> list[TxView]:
    return [TxView.of(tx) for tx in await list_recent(db, limit=svc.ANALYTICS_WINDOW)]


@router.get("/", response_model=AnalyticsResponse)
async def get_analytics(db: AsyncSession = Depends(get_db),
                        current_user: User = Depends(get_current_user)):
    """KPIs, risk mix, review queue and live performance over recent transactions."""
    return svc.summary(await _recent_views(db))


@router.get("/timeseries", response_model=list[TimeseriesPoint])
async def get_timeseries(
    bucket: Literal["minute", "hour", "day"] = "hour",
    points: int = Query(24, ge=2, le=180),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return svc.timeseries(await _recent_views(db), bucket=bucket, points=points)


@router.get("/drivers", response_model=list[FeatureDriver])
async def get_drivers(
    limit: int = Query(8, ge=1, le=30),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Which features push the model's decisions most (mean |SHAP|), globally and on flagged cases."""
    return svc.drivers(await _recent_views(db), limit=limit)


@router.get("/metrics", response_model=ModelMetricsResponse)
async def get_model_metrics(current_user: User = Depends(get_current_user)):
    """Offline metrics saved by ml-model/train.py."""
    try:
        data = json.loads(METRICS_PATH.read_text())
    except (OSError, ValueError):
        raise HTTPException(status_code=404,
                            detail="Metrics not found. Run the training pipeline: python ml-model/train.py")
    metrics = data.get("metrics", data)  # supports both {"metrics": {...}} and a flat dict
    try:
        version = get_model().version
    except ModelNotLoadedError:
        version = None
    card = read_model_card()
    return {
        "model_version": version,
        "algorithm": card.get("algorithm", "XGBoost"),
        "metrics": {k: float(v) for k, v in metrics.items() if isinstance(v, (int, float))},
        "confusion_matrix": data.get("confusion_matrix"),
    }


@router.get("/threshold-curve", response_model=ThresholdCurveResponse)
async def get_threshold_curve(current_user: User = Depends(get_current_user)):
    """Precision / recall / alert volume at each decision threshold, on the held-out test split."""
    try:
        model = get_model()
    except ModelNotLoadedError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail=f"Fraud model unavailable: {exc}")
    try:
        return await run_in_threadpool(threshold_curve, model)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/validation")
async def get_validation_report(current_user: User = Depends(get_current_user)):
    """
    Full validation report from ml-model/train.py: dataset card, cross-validated comparison
    against baselines, out-of-time holdout with bootstrap CIs, curves, calibration,
    money caught vs missed, and a shuffled-label leakage check.
    """
    try:
        return json.loads(VALIDATION_PATH.read_text())
    except (OSError, ValueError):
        raise HTTPException(
            status_code=404,
            detail="No validation report yet. Run: python ml-model/train.py (then restart the API)",
        )
