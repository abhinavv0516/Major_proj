"""
Write-side scoring workflow, shared by the API routes and the Redis worker:

    create_transaction()  -> Transaction(status="queued") + "created" audit entry
    score_transaction()   -> Score + Explanation, status "scored" (or "error"), "scored" audit entry
    create_and_score()    -> both, then publishes the result to the live feed
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from backend.ml_service import get_model, normalize_features
from backend.models import AuditLog, Explanation, Review, Score, Transaction
from backend.services.events import broker
from backend.services.views import TxView, event_payload, get_tx

logger = logging.getLogger(__name__)


async def create_transaction(db: AsyncSession, features: dict[str, float], *, actor: str,
                             source: str = "api", ground_truth: Optional[int] = None,
                             commit: bool = True) -> Transaction:
    tx = Transaction(raw_payload=features, status="queued")
    db.add(tx)
    await db.flush()  # assigns tx.id
    details = {"source": source}
    if ground_truth is not None:
        details["ground_truth"] = int(ground_truth)
    db.add(AuditLog(transaction_id=tx.id, action="created", actor=actor, details=details))
    if commit:
        await db.commit()
    return tx


async def score_transaction(db: AsyncSession, tx: Transaction) -> Optional[Score]:
    """Run the model on a stored transaction and persist the score. Commits."""
    features, missing = normalize_features(tx.raw_payload or {})
    start = time.perf_counter()
    try:
        model = get_model()
        # CPU-bound: keep it off the event loop.
        result = await asyncio.to_thread(model.predict, features, True)
    except Exception as exc:
        logger.exception("Scoring failed for transaction %s", tx.id)
        tx.status = "error"
        db.add(AuditLog(transaction_id=tx.id, action="error", actor="model",
                        details={"error": f"{type(exc).__name__}: {exc}"}))
        await db.commit()
        raise

    score = Score(
        transaction_id=tx.id,
        model_version=result.model_version,
        fraud_probability=result.fraud_probability,
        risk_level=result.risk_level,
        prediction=result.is_fraud,
        processing_time=time.perf_counter() - start,
    )
    score.explanation = Explanation(top_features=result.top_features, shap_values=result.shap_values or {})
    db.add(score)
    tx.status = "scored"
    db.add(AuditLog(
        transaction_id=tx.id, action="scored", actor=f"model:{result.model_version}",
        details={
            "fraud_probability": round(result.fraud_probability, 6),
            "risk_level": result.risk_level,
            "threshold": result.threshold,
            "missing_features": missing,
        },
    ))
    await db.commit()
    return score


async def load_view(db: AsyncSession, tx_id: int) -> Optional[TxView]:
    tx = await get_tx(db, tx_id)
    return TxView.of(tx) if tx else None


async def create_and_score(db: AsyncSession, features: dict[str, float], *, actor: str,
                           source: str = "api", ground_truth: Optional[int] = None,
                           publish: bool = True) -> TxView:
    tx = await create_transaction(db, features, actor=actor, source=source,
                                  ground_truth=ground_truth, commit=False)
    await score_transaction(db, tx)
    view = await load_view(db, tx.id)
    if publish and view:
        broker.publish(event_payload(view))
    return view


async def add_review(db: AsyncSession, tx: Transaction, *, label: str, notes: Optional[str],
                     reviewer_id: int, reviewer_name: str) -> None:
    """Analyst feedback: label is 'fraud' or 'legit'."""
    db.add(Review(transaction_id=tx.id, review_status=label, review_notes=notes, reviewed_by=reviewer_id))
    db.add(AuditLog(transaction_id=tx.id, action="reviewed", actor=reviewer_name,
                    details={"label": label, "notes": notes}))
    await db.commit()
