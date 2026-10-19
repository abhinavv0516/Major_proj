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
  download_creditcard.py   fetches the real ULB dataset (OpenML / Kaggle)
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

## Tests

```bash
python -m pytest backend/tests -q
python scripts/load_test.py -n 1000 -c 50 --batch-size 5000   # API must be running
```
