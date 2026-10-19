"""Creates a demo analyst account on startup so the app can be shown without registering.
Disable with SEED_DEMO_USER=false in backend/.env (do this for any real deployment)."""
import logging
import os

from backend.auth import get_password_hash, get_user_by_email
from backend.database import AsyncSessionLocal
from backend.models import User

logger = logging.getLogger(__name__)

DEMO_EMAIL = os.getenv("DEMO_EMAIL", "demo@fraudx.dev")
DEMO_PASSWORD = os.getenv("DEMO_PASSWORD", "demo1234")


async def ensure_demo_user() -> None:
    if os.getenv("SEED_DEMO_USER", "true").lower() in {"0", "false", "no"}:
        return
    async with AsyncSessionLocal() as db:
        if await get_user_by_email(db, DEMO_EMAIL):
            return
        db.add(User(email=DEMO_EMAIL, hashed_password=get_password_hash(DEMO_PASSWORD),
                    full_name="Demo Analyst", role="analyst"))
        await db.commit()
        logger.info("Created demo user %s", DEMO_EMAIL)
