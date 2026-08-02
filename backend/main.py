from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.database import init_db
from backend.routes import auth, transactions, analytics

app = FastAPI(title="Fraud Detection API")

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize DB
@app.on_event("startup")
async def on_startup():
    await init_db()

# Include routers
app.include_router(auth.router)
app.include_router(transactions.router)
app.include_router(analytics.router)

@app.get("/")
def read_root():
    return {"message": "Welcome to Fraud Detection API"}
