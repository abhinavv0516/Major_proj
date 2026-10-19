# Installation Guide

All commands run from the repository root unless a step says otherwise.

## Prerequisites
- Python 3.11+
- Node.js 20+
- Optional: Docker (for PostgreSQL / Redis / the full stack), Redis (for the async queue)

## 1. Clone
```bash
git clone https://github.com/abhinavv0516/Major_proj.git
cd Major_proj
```

## 2. Python environment
```bash
python -m venv venv
source venv/bin/activate          # Windows: .\venv\Scripts\activate
pip install -r backend/requirements.txt -r ml-model/requirements.txt
cp backend/.env.example backend/.env   # only if backend/.env doesn't exist yet
```

## 3. Data and model

### Real dataset (use this for results you report)
```bash
python dataset/download_creditcard.py     # kagglehub (no Kaggle account needed), then the Kaggle CLI
python ml-model/train.py                  # ~5–15 min on a laptop; prints CV and holdout results
```
`download_creditcard.py` saves `dataset/creditcard.csv` (284,807 transactions, 492 fraud). If both
automatic sources fail, download `creditcard.csv` from
https://www.kaggle.com/datasets/mlg-ulb/creditcardfraud and put it in `dataset/`.

`train.py` writes `xgboost_model.pkl`, `scaler.pkl`, `metrics.json`, `model_card.json`,
`validation_report.json` and `holdout.csv.gz` into `ml-model/`. Commit these together: the app's
simulator and threshold analysis read the holdout that belongs to the model.

Useful options:
```bash
python ml-model/train.py --cv-folds 3 --bootstrap 300      # faster run
python ml-model/train.py --split stratified                # random instead of out-of-time holdout
python ml-model/train.py --threshold-rule precision --target-precision 0.9
python ml-model/train.py --no-baselines                    # skip Logistic Regression / Random Forest
```

### Synthetic sample (development only)
```bash
python dataset/generate_sample_data.py
python ml-model/train.py --data dataset/sample_creditcard.csv --cv-folds 3
```

## 4. Backend
```bash
uvicorn backend.main:app --reload --timeout-graceful-shutdown 2
```
- API docs: http://localhost:8000/docs · health: http://localhost:8000/api/health
- A demo analyst is created on startup: `demo@fraudx.dev` / `demo1234` (`SEED_DEMO_USER=false` to disable).
- `--timeout-graceful-shutdown 2` stops reloads waiting on open live-feed connections.

## 5. Frontend
```bash
cd frontend
npm install
npm run dev
```
Open http://localhost:5173. To point at another API, create `frontend/.env` with
`VITE_API_URL=http://host:8000/api`. In development you don't need it: the Vite dev server proxies
`/api` to `http://127.0.0.1:8000` (change with `VITE_PROXY_TARGET`), so the browser only talks to
port 5173.

## 6. PostgreSQL (production database)
```bash
docker compose up -d db
# in backend/.env:
#   DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5432/fraud_db
cd backend && alembic upgrade head && cd ..
uvicorn backend.main:app --reload
```
The code has no SQLite-specific SQL, so the same app runs on both. Pool size: `DB_POOL_SIZE`,
`DB_MAX_OVERFLOW`.

## 7. Async queue and workers (optional)
```bash
docker compose up -d redis
python -m backend.worker          # run it in several terminals to scale out
```
`POST /api/transactions/async` queues a transaction; any worker scores it and the API relays the
result to the dashboard's live feed.

## 8. Everything in Docker
```bash
docker compose up --build                  # API :8000, frontend :80, Postgres, Redis, MLflow
docker compose up --build --scale worker=3 # three workers
```

## 9. Tests and load test
```bash
python -m pytest backend/tests -q
python scripts/load_test.py -n 1000 -c 50 --batch-size 5000
```

## Troubleshooting
| Symptom | Fix |
|---|---|
| Dashboard shows "Cannot reach the API" | Start the backend on port 8000, or set `VITE_API_URL` |
| `/api/health` shows `"loaded": false` | Run `python ml-model/train.py`; the error text says which file is missing |
| Model page says "No validation report yet" | The current model came from the old script: retrain with `ml-model/train.py` |
| `holdout.csv.gz is missing` | Retrain, or copy `ml-model/holdout.csv.gz` from wherever the model was trained |
| Login works, then everything redirects to login | Token expired (`ACCESS_TOKEN_EXPIRE_MINUTES`) or `JWT_SECRET` changed: sign in again |
