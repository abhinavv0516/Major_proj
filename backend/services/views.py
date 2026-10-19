"""
Read-side helpers: load transactions with everything a view needs in one query,
and flatten ORM objects into the JSON shapes the frontend uses.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.ml_service import normalize_features
from backend.models import Review, Score, Transaction


def tx_query():
    """SELECT Transaction with scores, explanations, reviews and audit logs eager-loaded
    (async SQLAlchemy can't lazy-load relationships)."""
    return select(Transaction).options(
        selectinload(Transaction.scores).selectinload(Score.explanation),
        selectinload(Transaction.reviews).selectinload(Review.reviewer),
        selectinload(Transaction.audit_logs),
    )


async def get_tx(db: AsyncSession, tx_id: int) -> Optional[Transaction]:
    # populate_existing: refresh relationships of objects already in this session
    # (e.g. a transaction we just created and scored).
    stmt = tx_query().where(Transaction.id == tx_id).execution_options(populate_existing=True)
    result = await db.execute(stmt)
    return result.scalars().first()


async def list_recent(db: AsyncSession, limit: int = 200, offset: int = 0) -> list[Transaction]:
    stmt = tx_query().order_by(Transaction.id.desc()).offset(offset).limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())


def utc(dt: Optional[datetime]) -> Optional[datetime]:
    """SQLite drops tzinfo; values are stored in UTC, so re-attach it before serializing."""
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


@dataclass
class TxView:
    tx: Transaction
    score: Optional[Score]
    review: Optional[Review]
    meta: dict

    @classmethod
    def of(cls, tx: Transaction) -> "TxView":
        score = max(tx.scores, key=lambda s: s.id) if tx.scores else None
        review = max(tx.reviews, key=lambda r: r.id) if tx.reviews else None
        created = next((a for a in tx.audit_logs if a.action == "created"), None)
        return cls(tx=tx, score=score, review=review, meta=(created.details or {}) if created else {})

    @property
    def features(self) -> dict[str, float]:
        return normalize_features(self.tx.raw_payload or {})[0]

    @property
    def is_fraud(self) -> Optional[bool]:
        return bool(self.score.prediction) if self.score else None

    @property
    def truth(self) -> Optional[int]:
        """Best known true label: the analyst's review wins over simulation ground truth."""
        if self.review is not None:
            return 1 if self.review.review_status == "fraud" else 0
        gt = self.meta.get("ground_truth")
        return int(gt) if gt is not None else None

    @property
    def outcome(self) -> Optional[str]:
        if self.truth is None or self.is_fraud is None:
            return None
        if self.is_fraud:
            return "TP" if self.truth == 1 else "FP"
        return "FN" if self.truth == 1 else "TN"


def summarize(view: TxView) -> dict:
    tx, score = view.tx, view.score
    feats = view.features
    return {
        "id": tx.id,
        "transaction_uuid": tx.transaction_uuid,
        "submitted_at": utc(tx.submitted_at),
        "status": tx.status,
        "amount": feats["Amount"],
        "time": feats["Time"],
        "fraud_probability": score.fraud_probability if score else None,
        "risk_level": score.risk_level if score else None,
        "is_fraud": view.is_fraud,
        "model_version": score.model_version if score else None,
        "processing_ms": round(score.processing_time * 1000, 2) if score and score.processing_time else None,
        "top_features": (score.explanation.top_features or {}) if score and score.explanation else {},
        "review_status": view.review.review_status if view.review else None,
        "source": view.meta.get("source", "api"),
        "ground_truth": view.meta.get("ground_truth"),
        "outcome": view.outcome,
    }


def detail(view: TxView) -> dict:
    data = summarize(view)
    score = view.score
    data["features"] = view.features
    data["shap_values"] = (score.explanation.shap_values or {}) if score and score.explanation else {}
    data["reviews"] = [
        {
            "id": r.id,
            "review_status": r.review_status,
            "review_notes": r.review_notes,
            "reviewer": r.reviewer.full_name if r.reviewer else None,
            "reviewed_at": utc(r.reviewed_at),
        }
        for r in sorted(view.tx.reviews, key=lambda r: r.id, reverse=True)
    ]
    data["audit_trail"] = [
        {"action": a.action, "actor": a.actor, "details": a.details or {}, "created_at": utc(a.created_at)}
        for a in sorted(view.tx.audit_logs, key=lambda a: a.id)
    ]
    return data


def event_payload(view: TxView) -> dict:
    """JSON-safe summary for the live SSE feed."""
    data = summarize(view)
    data["submitted_at"] = data["submitted_at"].isoformat() if data["submitted_at"] else None
    return data

