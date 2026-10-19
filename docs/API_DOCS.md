# API Reference

Interactive docs (with request examples) at `http://localhost:8000/docs` while the backend runs.
All paths start with `/api`. Everything except `/auth/register`, `/auth/login` and `/health` needs
`Authorization: Bearer <token>`.

Transaction features are `time`, `v1`…`v28`, `amount` (the dataset's `Time`/`V1`/`Amount` spelling
also works). All 30 are required; unknown keys, NaN and negative amounts are rejected with 422.

## Auth
| Method | Path | Description |
|---|---|---|
| POST | `/auth/register` | `{email, password, full_name}` → user. New users are always `analyst`. |
| POST | `/auth/login` | Form fields `username`, `password` → `{access_token}` |
| GET | `/auth/me` | Current user |

## Scoring (nothing stored)
| Method | Path | Description |
|---|---|---|
| POST | `/predict?explain=true` | One transaction → `is_fraud`, `fraud_probability`, `risk_level`, `threshold`, `model_version`, `top_features`, `shap_values`, `inference_ms` |
| POST | `/predict/batch` | `{transactions: [...≤5000], explain: false}` → per-row results, `elapsed_ms`, `throughput_per_second` |
| GET | `/predict/sample?label=fraud\|legit` | A real row from the held-out test set |
| GET | `/predict/model-info` | Loaded model version, thresholds, feature list |

## Transactions (stored)
| Method | Path | Description |
|---|---|---|
| POST | `/transactions/` | Store, score and explain one transaction; pushed to the live feed |
| POST | `/transactions/async` | Store and queue on Redis for `backend.worker` |
| POST | `/transactions/simulate` | `{count ≤100, fraud_ratio}`: replay held-out rows with their true labels |
| GET | `/transactions/?skip&limit` | Newest first: amount, probability, risk, verdict, review, source, outcome |
| GET | `/transactions/{id}` | Detail: features, SHAP values, reviews, audit trail |
| POST | `/transactions/{id}/review` | `{label: "fraud"\|"legit", notes}` analyst decision |
| DELETE | `/transactions/?confirm=true` | Delete all transactions (demo reset) |

## Analytics
| Method | Path | Description |
|---|---|---|
| GET | `/analytics/` | KPIs, risk mix, amounts, latency, review queue, live precision/recall on labelled traffic |
| GET | `/analytics/timeseries?bucket=minute\|hour\|day&points=24` | Totals and flagged per period |
| GET | `/analytics/drivers?limit=8` | Mean \|SHAP\| per feature over stored transactions (all vs flagged) |
| GET | `/analytics/metrics` | Holdout metrics saved at training time |
| GET | `/analytics/threshold-curve` | Precision / recall / F1 / alerts at thresholds 0.05–0.95 on the holdout |
| GET | `/analytics/validation` | Full validation report from `ml-model/train.py` |

## Live
| Method | Path | Description |
|---|---|---|
| GET | `/stream?token=<jwt>` | Server-Sent Events: `transaction` event per scored transaction. Connections close every 30 s; browsers reconnect automatically. |
| GET | `/health` | Model status and live subscriber count (no auth) |
