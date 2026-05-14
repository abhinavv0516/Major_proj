from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from backend.database import get_db
from backend.models import Transaction, User
from backend.schemas import TransactionCreate, TransactionResponse, PredictionResponse
from backend.auth import get_current_user
from backend.ml_service import predict_fraud

router = APIRouter(prefix="/api/transactions", tags=["transactions"])

@router.post("/", response_model=TransactionResponse)
def create_transaction(
    transaction: TransactionCreate, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Predict fraud
    is_fraud, probability = predict_fraud(transaction.dict())
    
    # Save to db
    db_transaction = Transaction(
        **transaction.dict(),
        is_fraud=is_fraud,
        fraud_probability=probability
    )
    db.add(db_transaction)
    db.commit()
    db.refresh(db_transaction)
    return db_transaction

@router.post("/predict", response_model=PredictionResponse)
def predict_only(
    transaction: TransactionCreate,
    current_user: User = Depends(get_current_user)
):
    """
    Predict without saving to DB.
    """
    is_fraud, probability = predict_fraud(transaction.dict())
    return {"is_fraud": is_fraud, "fraud_probability": probability}

@router.get("/", response_model=List[TransactionResponse])
def get_transactions(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    transactions = db.query(Transaction).order_by(Transaction.created_at.desc()).offset(skip).limit(limit).all()
    return transactions
