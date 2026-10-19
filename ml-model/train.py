"""
Training + validation pipeline for the fraud model.

    python ml-model/train.py                       # uses dataset/creditcard.csv if present
    python ml-model/train.py --data dataset/sample_creditcard.csv --cv-folds 3
    python ml-model/train.py --split stratified --threshold-rule precision --target-precision 0.85

Protocol (designed to avoid the leakage problems common in fraud-detection papers):
  1. Load data, drop exact duplicate rows (they would leak across splits).
  2. Hold out the LAST 20% of transactions by Time (out-of-time test set) - or a
     stratified random 20% with --split stratified. The holdout is touched once, at the end.
  3. On the training part only: stratified k-fold cross-validation comparing
     Logistic Regression, Random Forest, XGBoost (class weights) and XGBoost + SMOTE.
     Scaling and SMOTE are fitted inside each training fold only.
  4. Pick the production XGBoost variant by mean CV PR-AUC, then choose the decision
     threshold from its out-of-fold predictions.
  5. Refit on the whole training part, evaluate once on the holdout: metrics at the
     threshold, bootstrap 95% CIs, ROC/PR curves, calibration, money caught vs missed,
     every candidate's holdout score, and a shuffled-label sanity check.

Writes to ml-model/:
  xgboost_model.pkl, scaler.pkl   - what the API loads (unchanged contract)
  metrics.json                    - holdout metrics at the chosen threshold
  model_card.json                 - dataset, split, threshold, version
  validation_report.json          - everything above, shown on the app's Model page
  holdout.csv.gz                  - the untouched test rows (used by the app's simulator)
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier

import validation as V

ROOT = Path(__file__).resolve().parent.parent
ML_DIR = ROOT / "ml-model"
REAL_DATA = ROOT / "dataset" / "creditcard.csv"
SAMPLE_DATA = ROOT / "dataset" / "sample_creditcard.csv"
FEATURES = ["Time", *[f"V{i}" for i in range(1, 29)], "Amount"]
TARGET = "Class"

DATASET_INFO = {
    "creditcard": {
        "name": "ULB Credit Card Fraud Detection (Kaggle / OpenML 1597)",
        "source": "Machine Learning Group, Université Libre de Bruxelles & Worldline; "
                  "European cardholders, September 2013",
        "citation": "Dal Pozzolo, Caelen, Johnson, Bontempi. Calibrating Probability with "
                    "Undersampling for Unbalanced Classification. IEEE CIDM 2015.",
        "synthetic": False,
    },
    "sample_creditcard": {
        "name": "Synthetic sample (dataset/generate_sample_data.py)",
        "source": "Randomly generated; same schema as the ULB dataset. For development only.",
        "citation": None,
        "synthetic": True,
    },
}


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


# ── Data ──────────────────────────────────────────────────────────────────────

def load_data(path: Path) -> tuple[pd.DataFrame, dict]:
    df = pd.read_csv(path)
    missing = [c for c in FEATURES + [TARGET] if c not in df.columns]
    if missing:
        sys.exit(f"{path} is missing columns: {missing}")
    df = df[FEATURES + [TARGET]].copy()
    df[TARGET] = df[TARGET].astype(int)
    rows_raw = len(df)
    df = df.drop_duplicates().reset_index(drop=True)
    info = DATASET_INFO.get(path.stem, {"name": path.name, "source": "user-supplied", "citation": None,
                                         "synthetic": None})
    stats = {
        **info,
        "file": str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path),
        "rows_raw": rows_raw,
        "duplicates_removed": rows_raw - len(df),
        "rows": len(df),
        "fraud": int(df[TARGET].sum()),
        "prevalence": float(df[TARGET].mean()),
    }
    log(f"Loaded {path.name}: {rows_raw:,} rows, {stats['duplicates_removed']:,} duplicates removed, "
        f"{stats['fraud']:,} fraud ({stats['prevalence']:.3%})")
    return df, stats


def split(df: pd.DataFrame, strategy: str, test_size: float, seed: int):
    if strategy == "temporal":
        df = df.sort_values("Time", kind="stable").reset_index(drop=True)
        cut = int(len(df) * (1 - test_size))
        train, test = df.iloc[:cut], df.iloc[cut:]
        info = {"time_cutoff": float(test["Time"].iloc[0])}
    else:
        train, test = train_test_split(df, test_size=test_size, random_state=seed, stratify=df[TARGET])
        info = {}
    for name, part in (("training", train), ("holdout", test)):
        if part[TARGET].nunique() < 2:
            sys.exit(f"The {name} split has only one class; use --split stratified or more data.")
    info.update({
        "strategy": strategy, "test_size": test_size,
        "train_rows": len(train), "train_fraud": int(train[TARGET].sum()),
        "holdout_rows": len(test), "holdout_fraud": int(test[TARGET].sum()),
    })
    log(f"Split ({strategy}): train {len(train):,} rows / {info['train_fraud']} fraud, "
        f"holdout {len(test):,} rows / {info['holdout_fraud']} fraud")
    return train.reset_index(drop=True), test.reset_index(drop=True), info


# ── Candidate models ─────────────────────────────────────────────────────────

XGB_PARAMS = dict(n_estimators=300, max_depth=4, learning_rate=0.05, subsample=0.8,
                  colsample_bytree=0.8, min_child_weight=1, tree_method="hist",
                  eval_metric="aucpr", n_jobs=-1)


def make_xgb(y_train, seed: int, balanced: bool = True) -> XGBClassifier:
    pos = max(int(np.sum(y_train)), 1)
    spw = (len(y_train) - pos) / pos if balanced else 1.0
    return XGBClassifier(**XGB_PARAMS, scale_pos_weight=spw, random_state=seed)


def smote_available() -> bool:
    try:
        import imblearn  # noqa: F401
        return True
    except ImportError:
        return False


def make_scaler() -> StandardScaler:
    # Output DataFrames so XGBoost is trained with feature names (the API relies on them).
    return StandardScaler().set_output(transform="pandas")


def candidates(seed: int, include_baselines: bool, include_smote: bool) -> dict:
    """name -> factory(y_train) returning an unfitted estimator (scaling included)."""
    out = {}
    if include_baselines:
        out["Logistic Regression"] = lambda y: Pipeline([
            ("scale", make_scaler()),
            ("clf", LogisticRegression(class_weight="balanced", max_iter=2000)),
        ])
        out["Random Forest"] = lambda y: Pipeline([
            ("scale", make_scaler()),
            ("clf", RandomForestClassifier(n_estimators=200, min_samples_leaf=2,
                                           class_weight="balanced_subsample", n_jobs=-1, random_state=seed)),
        ])
    out["XGBoost (class weights)"] = lambda y: Pipeline([
        ("scale", make_scaler()), ("clf", make_xgb(y, seed, balanced=True)),
    ])
    if include_smote:
        from imblearn.over_sampling import SMOTE
        from imblearn.pipeline import Pipeline as ImbPipeline
        out["XGBoost + SMOTE"] = lambda y: ImbPipeline([
            ("scale", make_scaler()),
            ("smote", SMOTE(random_state=seed)),  # inside the pipeline -> only ever sees training folds
            ("clf", make_xgb(y, seed, balanced=False)),
        ])
    return out


def cross_validate(train: pd.DataFrame, models: dict, folds: int, seed: int) -> tuple[dict, dict]:
    X, y = train[FEATURES], train[TARGET].to_numpy()
    skf = StratifiedKFold(n_splits=folds, shuffle=True, random_state=seed)
    results, oof = {}, {}
    for name, factory in models.items():
        t0 = time.time()
        probs = np.zeros(len(y))
        fold_metrics = []
        for k, (tr, va) in enumerate(skf.split(X, y), 1):
            est = factory(y[tr])
            est.fit(X.iloc[tr], y[tr])
            probs[va] = est.predict_proba(X.iloc[va])[:, 1]
            fold_metrics.append(V.all_metrics(y[va], probs[va], 0.5))
        results[name] = {
            "summary": V.summarize_folds(fold_metrics),
            "folds": fold_metrics,
            "seconds": round(time.time() - t0, 1),
        }
        oof[name] = probs
        s = results[name]["summary"]
        log(f"CV {name:<24} PR-AUC {s['pr_auc']['mean']:.3f} ± {s['pr_auc']['std']:.3f}   "
            f"ROC-AUC {s['roc_auc']['mean']:.3f}   recall@0.5 {s['recall']['mean']:.3f}   "
            f"({results[name]['seconds']}s)")
    return results, oof


# ── Main ─────────────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--data", type=Path, default=None,
                   help="CSV with Time, V1..V28, Amount, Class (default: dataset/creditcard.csv, "
                        "else the synthetic sample)")
    p.add_argument("--split", choices=["temporal", "stratified"], default="temporal")
    p.add_argument("--test-size", type=float, default=0.2)
    p.add_argument("--cv-folds", type=int, default=5)
    p.add_argument("--threshold-rule", choices=["f1", "precision"], default="f1")
    p.add_argument("--target-precision", type=float, default=0.8)
    p.add_argument("--bootstrap", type=int, default=1000)
    p.add_argument("--no-baselines", action="store_true", help="skip Logistic Regression / Random Forest")
    p.add_argument("--no-smote", action="store_true")
    p.add_argument("--no-mlflow", action="store_true")
    p.add_argument("--seed", type=int, default=42)
    return p.parse_args()


def main() -> None:
    args = parse_args()
    data_path = args.data or (REAL_DATA if REAL_DATA.exists() else SAMPLE_DATA)
    if data_path == SAMPLE_DATA and args.data is None:
        log("dataset/creditcard.csv not found -> using the SYNTHETIC sample. "
            "Run `python dataset/download_creditcard.py` for the real dataset.")
    started = time.time()

    df, data_stats = load_data(data_path)
    train, holdout, split_info = split(df, args.split, args.test_size, args.seed)

    # Sanity check: no identical rows on both sides of the split.
    overlap = len(train.merge(holdout, on=FEATURES + [TARGET], how="inner"))
    split_info["rows_in_both_splits"] = overlap

    use_smote = not args.no_smote and smote_available()
    if not args.no_smote and not use_smote:
        log("imbalanced-learn not installed -> skipping the SMOTE variant")
    models = candidates(args.seed, include_baselines=not args.no_baselines, include_smote=use_smote)

    # 1) Cross-validation on the training part only
    cv_results, oof = cross_validate(train, models, args.cv_folds, args.seed)

    # 2) Pick the production XGBoost variant by CV PR-AUC (the API needs an XGBoost booster for SHAP)
    xgb_names = [n for n in models if n.startswith("XGBoost")]
    selected = max(xgb_names, key=lambda n: cv_results[n]["summary"]["pr_auc"]["mean"])
    y_train = train[TARGET].to_numpy()
    thr = V.choose_threshold(y_train, oof[selected], rule=args.threshold_rule,
                             target_precision=args.target_precision)
    threshold = thr["threshold"]
    log(f"Selected: {selected}. Threshold {threshold} ({thr['rule']}, chosen on out-of-fold predictions)")

    # 3) Refit every candidate on the full training part; score the holdout once
    X_train, X_hold = train[FEATURES], holdout[FEATURES]
    y_hold = holdout[TARGET].to_numpy()
    holdout_comparison, fitted = [], {}
    for name, factory in models.items():
        est = factory(y_train)
        est.fit(X_train, y_train)
        fitted[name] = est
        probs = est.predict_proba(X_hold)[:, 1]
        t = threshold if name == selected else 0.5
        holdout_comparison.append({"model": name, "threshold": t, **V.all_metrics(y_hold, probs, t)})

    final = fitted[selected]
    p_hold = final.predict_proba(X_hold)[:, 1]
    holdout_metrics = V.all_metrics(y_hold, p_hold, threshold)
    log(f"Holdout ({selected} @ {threshold}): PR-AUC {holdout_metrics['pr_auc']:.3f}  "
        f"ROC-AUC {holdout_metrics['roc_auc']:.3f}  precision {holdout_metrics['precision']:.3f}  "
        f"recall {holdout_metrics['recall']:.3f}")

    # 4) Sanity check: the same pipeline on shuffled labels must collapse to chance
    rng = np.random.default_rng(args.seed)
    shuffled = rng.permutation(y_train)
    sanity_est = models[selected](shuffled)
    sanity_est.fit(X_train, shuffled)
    sanity_pr_auc = V.ranking_metrics(y_hold, sanity_est.predict_proba(X_hold)[:, 1])["pr_auc"]

    # 5) Global explanation on the holdout: mean |SHAP| per feature
    scaler, clf = final.named_steps["scale"], final.named_steps["clf"]
    X_hold_scaled = pd.DataFrame(scaler.transform(X_hold), columns=FEATURES)
    import xgboost as xgb
    contribs = clf.get_booster().predict(xgb.DMatrix(X_hold_scaled), pred_contribs=True)[:, :-1]
    importance = sorted(
        ({"feature": f, "mean_abs_shap": float(v)} for f, v in zip(FEATURES, np.abs(contribs).mean(axis=0))),
        key=lambda d: d["mean_abs_shap"], reverse=True,
    )

    trained_at = datetime.now(timezone.utc)
    version = f"xgboost-{data_path.stem.replace('_', '-')}-{trained_at:%Y%m%d-%H%M}"

    report = {
        "version": version,
        "generated_at": trained_at.isoformat(),
        "dataset": data_stats,
        "split": split_info,
        "protocol": {
            "cv_folds": args.cv_folds,
            "cv_strategy": "StratifiedKFold(shuffle=True) on the training part only",
            "preprocessing": "StandardScaler (and SMOTE) fitted inside each training fold",
            "selection": "Production XGBoost variant chosen by mean CV PR-AUC",
            "threshold": "Chosen on out-of-fold predictions; the holdout is never used for tuning",
            "seed": args.seed,
        },
        "cv": cv_results,
        "selected_model": selected,
        "threshold_selection": thr,
        "holdout": {
            "metrics": holdout_metrics,
            "metrics_at_0_5": V.all_metrics(y_hold, p_hold, 0.5),
            "confidence_intervals": V.bootstrap_ci(y_hold, p_hold, threshold, n=args.bootstrap, seed=args.seed),
            "curves": V.curves(y_hold, p_hold),
            "calibration": V.calibration(y_hold, p_hold),
            "cost": V.cost_analysis(y_hold, p_hold, holdout["Amount"].to_numpy(), threshold),
        },
        "holdout_comparison": holdout_comparison,
        "sanity_checks": {
            "holdout_prevalence": float(y_hold.mean()),
            "shuffled_label_pr_auc": sanity_pr_auc,
            "note": "A model trained on shuffled labels should score close to the prevalence. "
                    "If it doesn't, something leaks.",
            "rows_in_both_splits": overlap,
        },
        "feature_importance": importance,
        "runtime_seconds": round(time.time() - started, 1),
    }

    card = {
        "version": version,
        "algorithm": selected,
        "trained_at": trained_at.isoformat(),
        "threshold": threshold,
        "threshold_rule": thr["rule"],
        "params": {k: v for k, v in XGB_PARAMS.items()},
        "features": FEATURES,
        "dataset": data_stats,
        "split": split_info,
        "holdout_metrics": holdout_metrics,
    }

    # ── Save artifacts (the API contract: scaler.pkl + xgboost_model.pkl) ────────
    joblib.dump(clf, ML_DIR / "xgboost_model.pkl")
    joblib.dump(scaler, ML_DIR / "scaler.pkl")
    (ML_DIR / "metrics.json").write_text(json.dumps({
        "metrics": {k: holdout_metrics[k] for k in ("accuracy", "precision", "recall", "f1_score", "roc_auc", "pr_auc")},
        "confusion_matrix": [[holdout_metrics["tn"], holdout_metrics["fp"]],
                             [holdout_metrics["fn"], holdout_metrics["tp"]]],
        "threshold": threshold,
    }, indent=2))
    (ML_DIR / "model_card.json").write_text(json.dumps(card, indent=2))
    (ML_DIR / "validation_report.json").write_text(json.dumps(report, indent=2))
    holdout.to_csv(ML_DIR / "holdout.csv.gz", index=False, compression="gzip")
    log(f"Saved model {version} and reports to {ML_DIR}")

    if not args.no_mlflow:
        log_to_mlflow(report, card, args)

    log(f"Done in {report['runtime_seconds']}s. Restart the API to load the new model.")


def log_to_mlflow(report: dict, card: dict, args) -> None:
    try:
        import mlflow
    except ImportError:
        log("mlflow not installed -> skipping experiment tracking")
        return
    mlflow.set_tracking_uri(f"sqlite:///{ML_DIR / 'mlflow.db'}")
    mlflow.set_experiment("Fraud_Detection")
    with mlflow.start_run(run_name=card["version"]):
        mlflow.log_params({
            "algorithm": card["algorithm"], "threshold": card["threshold"], "split": args.split,
            "cv_folds": args.cv_folds, "dataset": report["dataset"]["file"], **card["params"],
        })
        h = report["holdout"]["metrics"]
        mlflow.log_metrics({f"holdout_{k}": v for k, v in h.items() if isinstance(v, (int, float))})
        for name, res in report["cv"].items():
            key = name.lower().replace(" ", "_").replace("(", "").replace(")", "").replace("+", "plus")
            mlflow.log_metric(f"cv_pr_auc_{key}", res["summary"]["pr_auc"]["mean"])
        for f in ("validation_report.json", "model_card.json", "metrics.json"):
            mlflow.log_artifact(str(ML_DIR / f))
    log("Logged run to MLflow (ml-model/mlflow.db)")


if __name__ == "__main__":
    main()
