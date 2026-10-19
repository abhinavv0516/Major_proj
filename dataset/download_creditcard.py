"""
Download the real credit-card fraud dataset used in the literature and save it as
dataset/creditcard.csv (the training pipeline picks it up automatically).

Dataset: "Credit Card Fraud Detection", Machine Learning Group, Université Libre de
Bruxelles (ULB) with Worldline. 284,807 card transactions by European cardholders over
two days in September 2013; 492 are fraud (0.172%). Columns: Time, V1..V28 (PCA
components, anonymised), Amount, Class. Same schema as dataset/sample_creditcard.csv.

Cite: A. Dal Pozzolo, O. Caelen, R. A. Johnson, G. Bontempi. "Calibrating Probability
with Undersampling for Unbalanced Classification." IEEE SSCI / CIDM, 2015.

Sources tried, in order:
  1. OpenML dataset 1597 ("creditcard") through scikit-learn  -> needs internet only
  2. Kaggle CLI (mlg-ulb/creditcardfraud)                    -> needs ~/.kaggle/kaggle.json

Usage (from the repo root):
    python dataset/download_creditcard.py
    python dataset/download_creditcard.py --source kaggle
"""
import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import pandas as pd

OUT = Path(__file__).resolve().parent / "creditcard.csv"
EXPECTED_COLUMNS = ["Time", *[f"V{i}" for i in range(1, 29)], "Amount", "Class"]
EXPECTED_ROWS = 284_807
EXPECTED_FRAUD = 492


def from_openml() -> pd.DataFrame:
    from sklearn.datasets import fetch_openml

    print("Downloading OpenML dataset 1597 (creditcard)... this is ~150 MB, give it a minute.")
    bunch = fetch_openml(data_id=1597, as_frame=True, parser="auto")
    df = bunch.frame.copy()
    target = bunch.target_names[0] if getattr(bunch, "target_names", None) else "Class"
    if target != "Class":
        df = df.rename(columns={target: "Class"})
    return df


def from_kaggle() -> pd.DataFrame:
    if shutil.which("kaggle") is None:
        raise RuntimeError("Kaggle CLI not found. `pip install kaggle` and put your API token in ~/.kaggle/kaggle.json")
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(
            ["kaggle", "datasets", "download", "-d", "mlg-ulb/creditcardfraud", "-p", tmp, "--unzip"],
            check=True,
        )
        return pd.read_csv(Path(tmp) / "creditcard.csv")


def validate(df: pd.DataFrame) -> pd.DataFrame:
    missing = [c for c in EXPECTED_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"Downloaded data is missing columns: {missing}")
    df = df[EXPECTED_COLUMNS].copy()
    df["Class"] = pd.to_numeric(df["Class"].astype(str).str.strip("'\""), errors="raise").astype(int)
    for col in EXPECTED_COLUMNS[:-1]:
        df[col] = pd.to_numeric(df[col], errors="raise").astype(float)

    rows, fraud = len(df), int(df["Class"].sum())
    print(f"Rows: {rows:,}  Fraud: {fraud:,}  ({fraud / rows:.3%})")
    if rows != EXPECTED_ROWS or fraud != EXPECTED_FRAUD:
        print(f"WARNING: expected {EXPECTED_ROWS:,} rows and {EXPECTED_FRAUD} fraud cases; "
              "check you downloaded the right dataset.")
    return df


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", choices=["openml", "kaggle"], default="openml")
    args = parser.parse_args()

    loaders = {"openml": from_openml, "kaggle": from_kaggle}
    order = [args.source] + [s for s in loaders if s != args.source]
    for source in order:
        try:
            df = validate(loaders[source]())
        except Exception as exc:  # noqa: BLE001
            print(f"[{source}] failed: {exc}")
            continue
        df.to_csv(OUT, index=False)
        print(f"Saved {OUT}  ({OUT.stat().st_size / 1e6:.0f} MB). Now run: python ml-model/train.py")
        return 0

    print("\nAutomatic download failed. Manual option:\n"
          "  1. Download creditcard.csv from https://www.kaggle.com/datasets/mlg-ulb/creditcardfraud\n"
          f"  2. Put it at {OUT}\n  3. Run: python ml-model/train.py")
    return 1


if __name__ == "__main__":
    sys.exit(main())
