"""
Stored transactions: create + score, list, detail, simulate, analyst review.
Business logic lives in backend/services; this module only handles HTTP concerns.
"""
import json

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import get_current_user
from backend.database import get_db
from backend.ml_service import ModelNotLoadedError
from backend.models import AuditLog, Explanation, Review, Score, Transaction, User
from backend.redis_client import get_redis
from backend.schemas import (
    ReviewRequest, SimulationRequest, SimulationResponse, TransactionDetail,
    TransactionFeatures, TransactionResponse, TransactionSummary,
)
from backend.services import scoring
from backend.services.evaluation import sample_transactions
from backend.services.views import TxView, detail, get_tx, list_recent, summarize

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


def _model_unavailable(exc: Exception) -> HTTPException:
    return HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                         detail=f"Fraud model unavailable: {exc}")


@router.post("/", response_model=TransactionDetail, status_code=status.HTTP_201_CREATED)
async def create_transaction(
    features: TransactionFeatures,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Store a transaction, score it synchronously, and push it to the live feed."""
    try:
        view = await scoring.create_and_score(db, features.model_dump(), actor=current_user.email,
                                              source="manual")
    except ModelNotLoadedError as exc:
        raise _model_unavailable(exc)
    return detail(view)


@router.post("/async", response_model=TransactionResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_transaction_async(
    features: TransactionFeatures,
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
    current_user: User = Depends(get_current_user),
):
    """Store a transaction and queue it on the Redis stream for backend/worker.py to score."""
    tx = await scoring.create_transaction(db, features.model_dump(), actor=current_user.email,
                                          source="queue")
    try:
        await redis.xadd("transaction_stream", {"payload": json.dumps({"transaction_id": tx.id})})
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail=f"Queue unavailable (is Redis running?): {exc}")
    return tx


@router.post("/simulate", response_model=SimulationResponse)
async def simulate(
    body: SimulationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Replay real rows from the model's held-out test split (never seen in training).
    Each keeps its true label, so the dashboard can show live precision/recall.
    """
    try:
        samples = sample_transactions(body.count, body.fraud_ratio)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))

    created = []
    try:
        for features, label in samples:
            view = await scoring.create_and_score(db, features, actor=current_user.email,
                                                  source="simulation", ground_truth=label)
            created.append(summarize(view))
    except ModelNotLoadedError as exc:
        raise _model_unavailable(exc)

    return {
        "created": len(created),
        "flagged": sum(1 for t in created if t["is_fraud"]),
        "actual_fraud": sum(1 for _, label in samples if label == 1),
        "transactions": created,
    }


@router.get("/", response_model=list[TransactionSummary])
async def list_transactions(
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Newest first."""
    return [summarize(TxView.of(tx)) for tx in await list_recent(db, limit=limit, offset=skip)]


@router.get("/{tx_id}", response_model=TransactionDetail)
async def get_transaction(
    tx_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tx = await get_tx(db, tx_id)
    if tx is None:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return detail(TxView.of(tx))


@router.post("/{tx_id}/review", response_model=TransactionDetail)
async def review_transaction(
    tx_id: int,
    body: ReviewRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Analyst feedback: confirm a transaction as fraud or clear it as legitimate."""
    tx = await get_tx(db, tx_id)
    if tx is None:
        raise HTTPException(status_code=404, detail="Transaction not found")
    await scoring.add_review(db, tx, label=body.label, notes=body.notes,
                             reviewer_id=current_user.id,
                             reviewer_name=current_user.full_name or current_user.email)
    return detail(TxView.of(await get_tx(db, tx_id)))


@router.delete("/", status_code=status.HTTP_204_NO_CONTENT)
async def clear_transactions(
    confirm: bool = Query(False, description="Must be true. Deletes ALL transactions."),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reset demo data. Users and model files are untouched."""
    if not confirm:
        raise HTTPException(status_code=400, detail="Pass ?confirm=true to delete all transactions")
    for model in (Explanation, Score, Review, AuditLog, Transaction):
        await db.execute(delete(model))
    await db.commit()
