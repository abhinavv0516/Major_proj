# FraudX — Real-time Fraud Detection & Analytics Platform

End-to-end machine-learning system for detecting fraudulent card transactions: a validated
XGBoost model with per-decision SHAP explanations, a FastAPI backend that scores, stores and
streams transactions live, and a React dashboard for analysts to monitor, review and measure
the model.

Final-year engineering project.

## What it does

| Area | Features |
|---|---|
| **Scoring** | Real-time scoring (`POST /api/predict`), vectorised batch scoring of up to 5,000 rows per call, async scoring through a Redis Streams queue with horizontally scalable workers |
| **Explainability** | Exact TreeSHAP contributions for every decision; global drivers across live traffic and the test set |
| **Analyst workflow** | Live feed over Server-Sent Events, review queue, confirm-fraud / clear actions with notes, full audit trail per transaction |
| **Validation** | Real ULB credit-card dataset, out-of-time holdout, leak-free cross-validation against baselines, bootstrap confidence intervals, calibration, threshold chosen on out-of-fold predictions, shuffled-label leakage check, money caught vs. missed |
| **Monitoring** | Live precision / recall on labelled traffic (simulation labels + analyst reviews), threshold tuner, risk mix, traffic over time |
| **Scale** | Batch endpoint, CSV upload in the UI, load-test script (throughput and p95 latency), PostgreSQL connection pooling, multiple workers |

## Architecture

```
React (Vite) ──REST/JSON──▶ FastAPI ──▶ services/scoring ──▶ ml_service (scaler + XGBoost + TreeSHAP)
     ▲                         │                 │
     └──── SSE /api/stream ◀───┤                 └──▶ SQLAlchemy (async) ──▶ PostgreSQL / SQLite
                               └──▶ Redis Stream ──▶ worker(s) ──▶ Redis pub/sub ──▶ SSE relay
```

```
backend/
  main.py              app, lifespan (DB, demo user, model load, Redis relay), routers
  ml_service.py        model loading and inference only (no HTTP, no DB)
  feature_spec.py      the 30 input features shared by API and ML layers
  schemas.py           Pydantic request/response models
  routes/              predict, transactions, analytics, stream, auth (HTTP only)
  services/            scoring, views, analytics, evaluation, events, seed (business logic)
  worker.py            Redis Streams consumer
  tests/               API flow + inference tests
ml-model/
  train.py             training + validation pipeline (writes the model and its report)
  validation.py        metric helpers (CIs, calibration, curves, cost)
  evaluate.py          re-evaluate the saved model on any labelled CSV
dataset/
  download_creditcard.py   fetches the real ULB dataset from Kaggle (no account needed)
  generate_sample_data.py  small synthetic sample for development
frontend/src/
  pages/               Dashboard, Transactions, Live Analyzer, Model & Validation
  components/          drawer, SHAP bars, simulation modal, batch scoring, UI kit
scripts/load_test.py   latency/throughput benchmark
docs/                  installation, API, validation methodology, report material
```

## Quick start

```bash
# Backend (from the repo root)
python -m venv venv && source venv/bin/activate      # Windows: .\venv\Scripts\activate
pip install -r backend/requirements.txt -r ml-model/requirements.txt

# Real data + training (recommended; ~150 MB download, a few minutes to train)
python dataset/download_creditcard.py
python ml-model/train.py

uvicorn backend.main:app --reload --timeout-graceful-shutdown 2

# Frontend (second terminal)
cd frontend && npm install && npm run dev
```

Open http://localhost:5173 and click **Continue with Demo Account** (`demo@fraudx.dev` / `demo1234`).
Then **Simulate traffic** on the dashboard. API docs: http://localhost:8000/docs.

Full instructions, PostgreSQL and Docker: [docs/INSTALLATION.md](docs/INSTALLATION.md).
Validation methodology: [docs/VALIDATION.md](docs/VALIDATION.md). API reference: [docs/API_DOCS.md](docs/API_DOCS.md).

## Results (real data, out-of-time holdout)

Trained on the ULB credit-card dataset (283,726 transactions after removing 1,081 duplicates,
473 fraud). The last 20% of transactions by time (56,746 rows, 74 fraud) are held out and scored
once. Model: `XGBoost (tuned)`, depth 4, √-class-weighting, threshold 0.70 chosen on
out-of-fold predictions.

| Metric (holdout) | Value | 95% bootstrap CI |
|---|---|---|
| PR-AUC | **0.807** | 0.724 – 0.885 |
| ROC-AUC | 0.990 | 0.981 – 0.997 |
| Precision | 0.932 | 0.864 – 0.985 |
| Recall | 0.743 | 0.646 – 0.839 |
| F1 | 0.827 | 0.754 – 0.891 |

55 frauds caught, 19 missed, **4 false alarms in 56,672 legitimate transactions** (about one
alert per 1,000 transactions); 65% of fraud value caught. A model trained on shuffled labels
scores PR-AUC 0.0011 against a fraud rate of 0.0013, so nothing leaks.

| Model | CV PR-AUC (mean ± std) | Holdout PR-AUC | Holdout precision / recall |
|---|---|---|---|
| Logistic Regression | 0.752 ± 0.075 | 0.761 | 0.07 / 0.89 |
| Random Forest | 0.789 ± 0.032 | 0.813 | 0.98 / 0.70 |
| XGBoost (class weights) | 0.795 ± 0.025 | 0.792 | 0.64 / 0.78 |
| XGBoost + SMOTE | 0.787 ± 0.026 | 0.774 | 0.46 / 0.76 |
| **XGBoost (tuned)** — selected | **0.811 ± 0.015** | 0.807 | 0.93 / 0.74 |

Selection uses cross-validation only. Random Forest happens to edge it on the holdout, but
inside the confidence interval; the tuned XGBoost is the most stable across folds, has far
better ROC-AUC, and supports exact TreeSHAP explanations. Details: [docs/VALIDATION.md](docs/VALIDATION.md).

**Throughput** (`scripts/load_test.py`, one Uvicorn worker on a laptop, SQLite, 1,000 requests at
concurrency 25): **175 requests/s** for single predictions with SHAP explanations, p50 134 ms,
p95 189 ms, 0 errors (latency is mostly queueing at that concurrency; the model itself takes ~6 ms).
The batch endpoint scores **2,000 rows in 92 ms** round trip (~130k rows/s of model time).
Add Uvicorn workers or Redis-queue workers to scale further.

## Tests

```bash
python -m pytest backend/tests -q
python scripts/load_test.py -n 1000 -c 50 --batch-size 5000   # API must be running
```
