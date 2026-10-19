import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware

from backend import ml_service
from backend.database import init_db
from backend.routes import auth, transactions, analytics, predict

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    # Load model + scaler once, off the event loop. If this fails the API still
    # starts; /api/predict returns 503 and /api/health shows the error.
    await run_in_threadpool(ml_service.load_model)
    yield


app = FastAPI(title="Fraud Detection API", lifespan=lifespan)

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(transactions.router)
app.include_router(analytics.router)
app.include_router(predict.router)


@app.get("/")
def read_root():
    return {"message": "Welcome to Fraud Detection API"}


@app.get("/api/health", tags=["health"])
def health():
    return {"status": "ok", "model": ml_service.model_status()}
