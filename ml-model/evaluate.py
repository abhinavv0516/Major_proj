"""
Re-evaluate the saved model (scaler.pkl + xgboost_model.pkl) on a labelled CSV.

    python ml-model/evaluate.py                       # the holdout saved by train.py
    python ml-model/evaluate.py --data some_file.csv  # any CSV with Time, V1..V28, Amount, Class

Uses the threshold from model_card.json (or 0.5). Writes evaluation_results.json.
"""
import argparse
import json
from pathlib import Path

import joblib
import pandas as pd

import validation as V

ML_DIR = Path(__file__).resolve().parent
FEATURES = ["Time", *[f"V{i}" for i in range(1, 29)], "Amount"]


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--data", type=Path, default=ML_DIR / "holdout.csv.gz")
    p.add_argument("--threshold", type=float, default=None)
    args = p.parse_args()

    if not args.data.exists():
        raise SystemExit(f"{args.data} not found. Run python ml-model/train.py first, or pass --data.")

    card_path = ML_DIR / "model_card.json"
    card = json.loads(card_path.read_text()) if card_path.exists() else {}
    threshold = args.threshold if args.threshold is not None else card.get("threshold", 0.5)

    df = pd.read_csv(args.data)
    scaler = joblib.load(ML_DIR / "scaler.pkl")
    model = joblib.load(ML_DIR / "xgboost_model.pkl")
    X = pd.DataFrame(scaler.transform(df[FEATURES]), columns=FEATURES)
    probs = model.predict_proba(X)[:, 1]
    y = df["Class"].astype(int).to_numpy()

    results = {
        "model_version": card.get("version", "unknown"),
        "data": str(args.data),
        "rows": len(df), "fraud": int(y.sum()),
        **V.all_metrics(y, probs, threshold),
        "cost": V.cost_analysis(y, probs, df["Amount"].to_numpy(), threshold),
    }
    print(json.dumps(results, indent=2))
    (ML_DIR / "evaluation_results.json").write_text(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
