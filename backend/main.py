import asyncio
import contextlib
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware

from backend import ml_service
from backend.database import init_db
from backend.redis_client import redis_client
from backend.routes import analytics, auth, predict, stream, transactions
from backend.services.events import broker, relay_redis_events
from backend.services.seed import ensure_demo_user

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("api")


async def _start_redis_relay() -> asyncio.Task | None:
    """Forward worker events to SSE clients if Redis is up. Optional: the API works without it."""
    try:
        await asyncio.wait_for(redis_client.ping(), timeout=1.0)
    except Exception:  # noqa: BLE001
        logger.info("Redis not reachable: live feed shows API-scored transactions only")
        return None
    return asyncio.create_task(relay_redis_events(redis_client))


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await ensure_demo_user()
    # Load model + scaler once, off the event loop. If this fails the API still
    # starts; scoring endpoints return 503 and /api/health shows the error.
    await run_in_threadpool(ml_service.load_model)
    relay = await _start_redis_relay()
    yield
    if relay:
        relay.cancel()
        with contextlib.suppress(asyncio.CancelledError, Exception):
            await relay


app = FastAPI(
    title="FraudX — Real-time Fraud Detection API",
    description="XGBoost fraud scoring with SHAP explanations, analyst review and live analytics.",
    version="3.0.0",
    lifespan=lifespan,
)

_origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(transactions.router)
app.include_router(analytics.router)
app.include_router(predict.router)
app.include_router(stream.router)


@app.get("/")
def read_root():
    return {"message": "Welcome to Fraud Detection API", "docs": "/docs"}


@app.get("/api/health", tags=["health"])
def health():
    return {"status": "ok", "model": ml_service.model_status(), "live_subscribers": broker.subscriber_count}
