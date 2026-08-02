import asyncio
import json
import time
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from backend.redis_client import redis_client
from backend.database import AsyncSessionLocal
from backend.models import Transaction, Score, Explanation
from backend.ml_service import predict_fraud

STREAM_KEY = "transaction_stream"
GROUP_NAME = "fraud_workers"
CONSUMER_NAME = "worker_1"

async def process_message(db, message_id, payload_str):
    try:
        data = json.loads(payload_str)
        transaction_id = data.get("transaction_id")
        
        # Fetch transaction
        stmt = select(Transaction).filter(Transaction.id == transaction_id)
        result = await db.execute(stmt)
        transaction = result.scalars().first()
        
        if not transaction:
            print(f"Transaction {transaction_id} not found")
            return
            
        if transaction.status != "queued":
            print(f"Transaction {transaction_id} already processed (status: {transaction.status})")
            return
            
        start_time = time.time()
        
        # Predict
        is_fraud, probability, risk_level, shap_dict, top_features = predict_fraud(transaction.raw_payload)
        
        processing_time = time.time() - start_time
        
        # Create Score and Explanation
        db_score = Score(
            transaction_id=transaction.id,
            model_version="xgboost-v1",
            fraud_probability=probability,
            risk_level=risk_level,
            prediction=is_fraud,
            processing_time=processing_time
        )
        db.add(db_score)
        await db.commit()
        await db.refresh(db_score)
        
        db_explanation = Explanation(
            score_id=db_score.id,
            top_features=top_features,
            shap_values=shap_dict
        )
        db.add(db_explanation)
        
        transaction.status = "scored"
        await db.commit()
        
        print(f"Successfully processed transaction {transaction_id}")
        
    except Exception as e:
        print(f"Error processing message {message_id}: {e}")
        # In a real app, send to DLQ here

async def main():
    try:
        await redis_client.xgroup_create(STREAM_KEY, GROUP_NAME, mkstream=True)
    except Exception as e:
        if "BUSYGROUP Consumer Group name already exists" not in str(e):
            print(f"Error creating consumer group: {e}")

    print(f"Worker {CONSUMER_NAME} started, listening to {STREAM_KEY}...")

    while True:
        try:
            # Read from stream
            messages = await redis_client.xreadgroup(
                GROUP_NAME,
                CONSUMER_NAME,
                {STREAM_KEY: ">"},
                count=10,
                block=5000
            )
            
            if not messages:
                continue
                
            async with AsyncSessionLocal() as db:
                for stream, stream_messages in messages:
                    for message_id, message_data in stream_messages:
                        payload_str = message_data.get("payload")
                        if payload_str:
                            await process_message(db, message_id, payload_str)
                            
                        # Acknowledge message
                        await redis_client.xack(STREAM_KEY, GROUP_NAME, message_id)
                        
        except Exception as e:
            print(f"Worker error: {e}")
            await asyncio.sleep(5)

if __name__ == "__main__":
    asyncio.run(main())
