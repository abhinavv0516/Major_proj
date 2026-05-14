import json
import os
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.database import get_db
from backend.models import Transaction, User
from backend.schemas import AnalyticsResponse
from backend.auth import get_current_user

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

@router.get("/", response_model=AnalyticsResponse)
def get_analytics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    total = db.query(Transaction).count()
    fraud = db.query(Transaction).filter(Transaction.is_fraud == True).count()
    legit = total - fraud
    
    percentage = (fraud / total * 100) if total > 0 else 0.0
    
    return {
        "total_transactions": total,
        "fraud_transactions": fraud,
        "legitimate_transactions": legit,
        "fraud_percentage": percentage
    }

@router.get("/metrics")
def get_model_metrics(current_user: User = Depends(get_current_user)):
    """
    Returns metrics saved from training.
    """
    metrics_path = os.path.join(os.path.dirname(__file__), "..", "..", "ml-model", "metrics.json")
    try:
        with open(metrics_path, 'r') as f:
            data = json.load(f)
        return data
    except Exception as e:
        return {"error": "Metrics not found. Please run training pipeline first."}
