"""
Dashboard aggregates, computed in Python over the most recent transactions.

Amounts live inside the JSON payload, and SQLite/PostgreSQL query JSON differently,
so aggregating in Python keeps one code path for both databases. Fine at demo scale
(the window is capped by ANALYTICS_WINDOW).
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from statistics import mean
from typing import Iterable, Literal, Optional

from backend.services.views import TxView, utc

ANALYTICS_WINDOW = 5000
Bucket = Literal["minute", "hour", "day"]


def _ratio(num: int, den: int) -> Optional[float]:
    return num / den if den else None


def summary(views: list[TxView]) -> dict:
    scored = [v for v in views if v.score is not None]
    flagged = [v for v in scored if v.is_fraud]
    by_risk = defaultdict(int)
    for v in scored:
        by_risk[v.score.risk_level] += 1

    reviewed = [v for v in scored if v.review is not None]
    confirmed = sum(1 for v in reviewed if v.is_fraud and v.review.review_status == "fraud")
    false_pos = sum(1 for v in reviewed if v.is_fraud and v.review.review_status == "legit")
    missed = sum(1 for v in reviewed if not v.is_fraud and v.review.review_status == "fraud")

    outcomes = defaultdict(int)
    for v in scored:
        if v.outcome:
            outcomes[v.outcome] += 1
    tp, fp, fn, tn = (outcomes[k] for k in ("TP", "FP", "FN", "TN"))
    labelled = tp + fp + fn + tn

    total = len(scored)
    latencies = [v.score.processing_time for v in scored if v.score.processing_time is not None]
    return {
        # original fields (kept for compatibility)
        "total_transactions": total,
        "fraud_transactions": len(flagged),
        "legitimate_transactions": total - len(flagged),
        "fraud_percentage": (len(flagged) / total * 100) if total else 0.0,
        # risk & money
        "risk_counts": {k: by_risk.get(k, 0) for k in ("low", "medium", "high")},
        "amount_total": round(sum(v.features["Amount"] for v in scored), 2),
        "amount_flagged": round(sum(v.features["Amount"] for v in flagged), 2),
        "avg_fraud_probability": mean(v.score.fraud_probability for v in scored) if scored else None,
        "avg_latency_ms": mean(latencies) * 1000 if latencies else None,
        "errors": sum(1 for v in views if v.tx.status == "error"),
        # analyst review queue
        "review": {
            "reviewed": len(reviewed),
            "pending": sum(1 for v in flagged if v.review is None),
            "confirmed_fraud": confirmed,
            "false_positives": false_pos,
            "missed_fraud": missed,
        },
        # live performance against known labels (analyst reviews + simulation ground truth)
        "live_performance": {
            "labelled": labelled,
            "tp": tp, "fp": fp, "fn": fn, "tn": tn,
            "accuracy": _ratio(tp + tn, labelled),
            "precision": _ratio(tp, tp + fp),
            "recall": _ratio(tp, tp + fn),
        },
    }


def _floor(dt: datetime, bucket: Bucket) -> datetime:
    if bucket == "minute":
        return dt.replace(second=0, microsecond=0)
    if bucket == "hour":
        return dt.replace(minute=0, second=0, microsecond=0)
    return dt.replace(hour=0, minute=0, second=0, microsecond=0)


_STEP = {"minute": timedelta(minutes=1), "hour": timedelta(hours=1), "day": timedelta(days=1)}


def timeseries(views: Iterable[TxView], bucket: Bucket = "hour", points: int = 24,
               now: Optional[datetime] = None) -> list[dict]:
    """Totals per time bucket for the last `points` buckets, oldest first, gaps filled with zeros."""
    now = _floor(now or datetime.now(timezone.utc), bucket)
    start = now - _STEP[bucket] * (points - 1)
    rows = {start + _STEP[bucket] * i: {"total": 0, "flagged": 0, "amount": 0.0, "amount_flagged": 0.0}
            for i in range(points)}
    for v in views:
        if v.score is None or v.tx.submitted_at is None:
            continue
        key = _floor(utc(v.tx.submitted_at), bucket)
        if key not in rows:
            continue
        amount = v.features["Amount"]
        row = rows[key]
        row["total"] += 1
        row["amount"] += amount
        if v.is_fraud:
            row["flagged"] += 1
            row["amount_flagged"] += amount
    return [
        {"bucket": k, "total": r["total"], "flagged": r["flagged"],
         "legit": r["total"] - r["flagged"],
         "amount": round(r["amount"], 2), "amount_flagged": round(r["amount_flagged"], 2)}
        for k, r in sorted(rows.items())
    ]


def drivers(views: Iterable[TxView], limit: int = 8) -> list[dict]:
    """
    Global explanation: mean |SHAP| per feature across all scored transactions and
    across flagged ones, plus the mean signed SHAP on flagged transactions
    (positive = pushes towards fraud).
    """
    all_abs: dict[str, list[float]] = defaultdict(list)
    flagged_abs: dict[str, list[float]] = defaultdict(list)
    flagged_signed: dict[str, list[float]] = defaultdict(list)
    for v in views:
        if not (v.score and v.score.explanation and v.score.explanation.shap_values):
            continue
        for feat, val in v.score.explanation.shap_values.items():
            all_abs[feat].append(abs(val))
            if v.is_fraud:
                flagged_abs[feat].append(abs(val))
                flagged_signed[feat].append(val)
    rows = [
        {
            "feature": f,
            "mean_abs_shap": mean(vals),
            "mean_abs_shap_flagged": mean(flagged_abs[f]) if flagged_abs[f] else 0.0,
            "mean_shap_flagged": mean(flagged_signed[f]) if flagged_signed[f] else 0.0,
        }
        for f, vals in all_abs.items()
    ]
    rows.sort(key=lambda r: r["mean_abs_shap"], reverse=True)
    return rows[:limit]
