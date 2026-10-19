"""
Metric helpers for the training pipeline. Everything here works on plain arrays
(y_true in {0,1}, y_prob in [0,1]) so it is easy to test and reuse.

Why these metrics: with ~0.17% fraud, accuracy is meaningless (predicting "legit"
for everything scores 99.8%). PR-AUC, precision and recall at the operating threshold,
and money caught vs missed are what tell you whether detection actually works.
"""
from __future__ import annotations

import numpy as np
from sklearn.calibration import calibration_curve
from sklearn.metrics import (
    average_precision_score, brier_score_loss, confusion_matrix, f1_score,
    precision_recall_curve, precision_score, recall_score, roc_auc_score, roc_curve,
)


def threshold_metrics(y_true, y_prob, threshold: float) -> dict:
    y_true = np.asarray(y_true).astype(int)
    y_pred = (np.asarray(y_prob) >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
    return {
        "threshold": float(threshold),
        "precision": float(precision_score(y_true, y_pred, zero_division=0)),
        "recall": float(recall_score(y_true, y_pred, zero_division=0)),
        "f1_score": float(f1_score(y_true, y_pred, zero_division=0)),
        "accuracy": float((tp + tn) / len(y_true)),
        "tp": int(tp), "fp": int(fp), "fn": int(fn), "tn": int(tn),
    }


def ranking_metrics(y_true, y_prob) -> dict:
    y_true = np.asarray(y_true).astype(int)
    if y_true.min() == y_true.max():
        return {"roc_auc": None, "pr_auc": None}
    return {
        "roc_auc": float(roc_auc_score(y_true, y_prob)),
        "pr_auc": float(average_precision_score(y_true, y_prob)),
    }


def all_metrics(y_true, y_prob, threshold: float) -> dict:
    return {**ranking_metrics(y_true, y_prob), **threshold_metrics(y_true, y_prob, threshold)}


def choose_threshold(y_true, y_prob, rule: str = "f1", target_precision: float = 0.8,
                     lo: float = 0.05, hi: float = 0.95) -> dict:
    """
    Pick the operating threshold from OUT-OF-FOLD predictions (never from the test set).
      rule="f1":        threshold with the best F1
      rule="precision": lowest threshold whose precision >= target_precision (max recall at that precision)
    """
    precision, recall, thresholds = precision_recall_curve(y_true, y_prob)
    precision, recall = precision[:-1], recall[:-1]  # align with thresholds
    mask = (thresholds >= lo) & (thresholds <= hi)
    if not mask.any():
        return {"threshold": 0.5, "rule": rule, "note": "no candidate thresholds in range; using 0.5"}
    p, r, t = precision[mask], recall[mask], thresholds[mask]

    if rule == "precision":
        ok = np.flatnonzero(p >= target_precision)
        if len(ok):
            i = ok[np.argmax(r[ok])]
            return {"threshold": round(float(t[i]), 4), "rule": f"precision>={target_precision}",
                    "oof_precision": float(p[i]), "oof_recall": float(r[i])}
        rule = "f1"  # target not reachable: fall back

    f1 = np.where(p + r > 0, 2 * p * r / np.maximum(p + r, 1e-12), 0)
    i = int(np.argmax(f1))
    return {"threshold": round(float(t[i]), 4), "rule": rule,
            "oof_precision": float(p[i]), "oof_recall": float(r[i]), "oof_f1": float(f1[i])}


def bootstrap_ci(y_true, y_prob, threshold: float, n: int = 1000, seed: int = 42,
                 alpha: float = 0.05) -> dict:
    """Percentile bootstrap confidence intervals over the test set."""
    y_true = np.asarray(y_true).astype(int)
    y_prob = np.asarray(y_prob)
    rng = np.random.default_rng(seed)
    keys = ("pr_auc", "roc_auc", "precision", "recall", "f1_score")
    samples = {k: [] for k in keys}
    for _ in range(n):
        idx = rng.integers(0, len(y_true), len(y_true))
        yt, yp = y_true[idx], y_prob[idx]
        if yt.min() == yt.max():
            continue  # resample has no fraud (or only fraud): metric undefined
        m = all_metrics(yt, yp, threshold)
        for k in keys:
            samples[k].append(m[k])
    lo, hi = 100 * alpha / 2, 100 * (1 - alpha / 2)
    return {
        k: {"low": float(np.percentile(v, lo)), "high": float(np.percentile(v, hi))} if v else None
        for k, v in samples.items()
    } | {"n_resamples": n, "confidence": 1 - alpha}


def _downsample(points: list[dict], max_points: int = 200) -> list[dict]:
    if len(points) <= max_points:
        return points
    idx = np.unique(np.linspace(0, len(points) - 1, max_points).astype(int))
    return [points[i] for i in idx]


def curves(y_true, y_prob) -> dict:
    fpr, tpr, _ = roc_curve(y_true, y_prob)
    precision, recall, _ = precision_recall_curve(y_true, y_prob)
    roc = [{"fpr": float(a), "tpr": float(b)} for a, b in zip(fpr, tpr)]
    pr = [{"recall": float(r), "precision": float(p)} for p, r in zip(precision, recall)]
    pr.sort(key=lambda d: d["recall"])
    return {"roc": _downsample(roc), "pr": _downsample(pr)}


def calibration(y_true, y_prob, n_bins: int = 10) -> dict:
    frac_pos, mean_pred = calibration_curve(y_true, y_prob, n_bins=n_bins, strategy="quantile")
    return {
        "brier_score": float(brier_score_loss(y_true, y_prob)),
        "bins": [{"mean_predicted": float(m), "fraction_fraud": float(f)} for m, f in zip(mean_pred, frac_pos)],
    }


def cost_analysis(y_true, y_prob, amounts, threshold: float) -> dict:
    """Money view of the confusion matrix: fraud value caught vs missed, and alert workload."""
    y_true = np.asarray(y_true).astype(int)
    pred = np.asarray(y_prob) >= threshold
    amounts = np.asarray(amounts, dtype=float)
    fraud = y_true == 1
    caught = float(amounts[fraud & pred].sum())
    missed = float(amounts[fraud & ~pred].sum())
    total = caught + missed
    return {
        "fraud_amount_total": round(total, 2),
        "fraud_amount_caught": round(caught, 2),
        "fraud_amount_missed": round(missed, 2),
        "share_of_fraud_amount_caught": caught / total if total else None,
        "false_alarms": int((~fraud & pred).sum()),
        "alerts_per_1000_transactions": float(pred.mean() * 1000),
    }


def summarize_folds(fold_metrics: list[dict]) -> dict:
    keys = [k for k in fold_metrics[0] if isinstance(fold_metrics[0][k], (int, float)) or fold_metrics[0][k] is None]
    out = {}
    for k in keys:
        vals = [m[k] for m in fold_metrics if m[k] is not None]
        out[k] = {"mean": float(np.mean(vals)), "std": float(np.std(vals))} if vals else None
    return out
