import time
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import select

from backend.database import get_db
from backend.models import Transaction, User, Score, Explanation
from backend.schemas import TransactionCreate, TransactionResponse, PredictionResponse, TransactionDetailResponse
from backend.auth import get_current_user
from backend.ml_service import predict_fraud
from backend.redis_client import get_redis
import json

router = APIRouter(prefix="/api/transactions", tags=["transactions"])

@router.post("/", response_model=TransactionDetailResponse)
async def create_transaction(
    transaction: TransactionCreate, 
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    start_time = time.time()
    
    # 1. Save Transaction as 'queued'
    db_transaction = Transaction(
        raw_payload=transaction.payload,
        status="queued"
    )
    db.add(db_transaction)
    await db.commit()
    await db.refresh(db_transaction)
    
    # 2. Predict fraud (Synchronous logic for Phase 2)
    is_fraud, probability, risk_level, shap_dict, top_features = predict_fraud(transaction.payload)
    
    processing_time = time.time() - start_time
    
    # 3. Create Score and Explanation
    db_score = Score(
        transaction_id=db_transaction.id,
        model_version="xgboost-v1",
        fraud_probability=probability,
        risk_level=risk_level,
        prediction=is_fraud,
        processing_time=processing_time
    )
    db.add(db_score)
    # We must commit or flush to get db_score.id for the Explanation
    await db.commit()
    await db.refresh(db_score)
    
    db_explanation = Explanation(
        score_id=db_score.id,
        top_features=top_features,
        shap_values=shap_dict
    )
    db.add(db_explanation)
    
    # 4. Update Transaction status
    db_transaction.status = "scored"
    await db.commit()
    await db.refresh(db_transaction)
    
    # Load relationships for response
    stmt = select(Transaction).options(
        selectinload(Transaction.scores).selectinload(Score.explanation)
    ).filter(Transaction.id == db_transaction.id)
    result = await db.execute(stmt)
    return result.scalars().first()


@router.post("/async", response_model=TransactionResponse)
async def create_transaction_async(
    transaction: TransactionCreate, 
    db: AsyncSession = Depends(get_db),
    redis = Depends(get_redis),
    current_user: User = Depends(get_current_user)
):
    # 1. Save Transaction as 'queued'
    db_transaction = Transaction(
        raw_payload=transaction.payload,
        status="queued"
    )
    db.add(db_transaction)
    await db.commit()
    await db.refresh(db_transaction)
    
    # 2. Publish to Redis Stream
    payload = {
        "transaction_id": db_transaction.id
    }
    await redis.xadd("transaction_stream", {"payload": json.dumps(payload)})
    
    return db_transaction

@router.get("/", response_model=List[TransactionDetailResponse])
async def get_transactions(
    skip: int = 0, 
    limit: int = 100, 
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    stmt = select(Transaction).options(
        selectinload(Transaction.scores).selectinload(Score.explanation)
    ).order_by(Transaction.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()
