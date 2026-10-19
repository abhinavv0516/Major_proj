"""
GET /api/stream?token=<jwt>  -> Server-Sent Events, one `transaction` event per scored transaction.

EventSource can't set an Authorization header, so the JWT comes as a query parameter.
"""
import asyncio
import json
import time

from fastapi import APIRouter, Query, Request
from fastapi.responses import StreamingResponse

from backend.auth import user_from_token
from backend.database import AsyncSessionLocal
from backend.services.events import broker

router = APIRouter(prefix="/api/stream", tags=["live"])

KEEPALIVE_SECONDS = 10
# Each connection ends after this long and the browser reconnects automatically.
# Keeps `uvicorn --reload` from hanging on open streams during development.
MAX_STREAM_SECONDS = 30


@router.get("")
async def stream(request: Request, token: str = Query(..., description="JWT access token")):
    # Validate with a short-lived session; don't hold a DB connection for the whole stream.
    async with AsyncSessionLocal() as db:
        await user_from_token(token, db)

    async def events():
        deadline = time.monotonic() + MAX_STREAM_SECONDS
        async with broker.subscribe() as queue:
            yield "retry: 1000\n\n"
            yield "event: ready\ndata: {}\n\n"
            while time.monotonic() < deadline:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=KEEPALIVE_SECONDS)
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
                    continue
                yield f"event: transaction\ndata: {json.dumps(event, default=str)}\n\n"

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
