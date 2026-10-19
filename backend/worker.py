"""
Redis Streams worker: scores transactions queued by POST /api/transactions/async.

Run from the repo root:  python -m backend.worker
"""
import asyncio
import json
import logging
import os
import socket

from backend.database import AsyncSessionLocal, init_db
from backend.ml_service import load_model
from backend.models import Transaction
from backend.redis_client import redis_client
from backend.services.events import publish_to_redis
from backend.services.scoring import load_view, score_transaction
from backend.services.views import event_payload

STREAM_KEY = "transaction_stream"
GROUP_NAME = "fraud_workers"
# Unique per process so several workers can share the consumer group (horizontal scaling):
#   python -m backend.worker   (run it N times, or `docker compose up --scale worker=3`)
CONSUMER_NAME = os.getenv("WORKER_NAME") or f"worker-{socket.gethostname()}-{os.getpid()}"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("worker")


async def process_message(payload_str: str) -> None:
    data = json.loads(payload_str)
    transaction_id = data.get("transaction_id")

    async with AsyncSessionLocal() as db:
        tx = await db.get(Transaction, transaction_id)
        if tx is None:
            logger.warning("Transaction %s not found", transaction_id)
            return
        if tx.status != "queued":
            logger.info("Transaction %s already processed (status: %s)", transaction_id, tx.status)
            return

        await score_transaction(db, tx)
        view = await load_view(db, tx.id)
        if view:
            # The API process relays this channel to dashboard clients (SSE).
            await publish_to_redis(redis_client, event_payload(view))
        logger.info("Scored transaction %s", transaction_id)


async def main() -> None:
    await init_db()
    if load_model() is None:
        logger.error("Model failed to load; queued transactions will be marked as errors")

    try:
        await redis_client.xgroup_create(STREAM_KEY, GROUP_NAME, id="0", mkstream=True)
    except Exception as e:  # noqa: BLE001
        if "BUSYGROUP" not in str(e):
            logger.error("Error creating consumer group: %s", e)

    logger.info("Worker %s listening on %s...", CONSUMER_NAME, STREAM_KEY)

    while True:
        try:
            messages = await redis_client.xreadgroup(
                GROUP_NAME, CONSUMER_NAME, {STREAM_KEY: ">"}, count=10, block=5000
            )
            for _stream, stream_messages in messages or []:
                for message_id, message_data in stream_messages:
                    payload_str = message_data.get("payload")
                    if payload_str:
                        try:
                            await process_message(payload_str)
                        except Exception:  # noqa: BLE001 - one bad message must not stop the worker
                            logger.exception("Error processing message %s", message_id)
                    await redis_client.xack(STREAM_KEY, GROUP_NAME, message_id)
        except Exception:  # noqa: BLE001
            logger.exception("Worker loop error; retrying in 5s")
            await asyncio.sleep(5)


if __name__ == "__main__":
    asyncio.run(main())
