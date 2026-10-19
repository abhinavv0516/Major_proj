"""
Live event fan-out for the dashboard's real-time feed (Server-Sent Events).

- The API process publishes straight into the in-memory `broker`.
- The Redis worker runs in another process, so it publishes to a Redis channel;
  `relay_redis_events` (started in main.py when Redis is reachable) forwards
  those into the same broker.
"""
from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from typing import AsyncIterator

logger = logging.getLogger(__name__)

REDIS_CHANNEL = "fraud_events"


class EventBroker:
    def __init__(self, max_queue: int = 200):
        self._subscribers: set[asyncio.Queue] = set()
        self._max_queue = max_queue

    @property
    def subscriber_count(self) -> int:
        return len(self._subscribers)

    def publish(self, event: dict) -> None:
        for queue in list(self._subscribers):
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                pass  # slow client: drop the event rather than block scoring

    @contextlib.asynccontextmanager
    async def subscribe(self) -> AsyncIterator[asyncio.Queue]:
        queue: asyncio.Queue = asyncio.Queue(maxsize=self._max_queue)
        self._subscribers.add(queue)
        try:
            yield queue
        finally:
            self._subscribers.discard(queue)


broker = EventBroker()


async def publish_to_redis(redis, event: dict) -> None:
    """Used by the worker process."""
    try:
        await redis.publish(REDIS_CHANNEL, json.dumps(event, default=str))
    except Exception:  # noqa: BLE001 - the live feed is best-effort
        logger.warning("Could not publish event to Redis", exc_info=True)


async def relay_redis_events(redis) -> None:
    """Background task in the API process: Redis channel -> in-memory broker."""
    pubsub = redis.pubsub()
    await pubsub.subscribe(REDIS_CHANNEL)
    logger.info("Relaying worker events from Redis channel '%s'", REDIS_CHANNEL)
    try:
        async for message in pubsub.listen():
            if message.get("type") == "message":
                try:
                    broker.publish(json.loads(message["data"]))
                except (TypeError, ValueError):
                    logger.warning("Ignoring malformed event on %s", REDIS_CHANNEL)
    finally:
        with contextlib.suppress(Exception):
            await pubsub.unsubscribe(REDIS_CHANNEL)
            close = getattr(pubsub, "aclose", None) or pubsub.close
            await close()
