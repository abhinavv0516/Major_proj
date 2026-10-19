"""
Test settings: a throwaway SQLite database and no Redis. Must run before `backend` is imported,
which pytest guarantees for conftest.py. Run from the repo root:

    python -m pytest backend/tests -q
"""
import os
import tempfile
from pathlib import Path

_tmp = Path(tempfile.mkdtemp(prefix="fraudx-test-"))
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_tmp / 'test.db'}"
os.environ["REDIS_URL"] = "redis://127.0.0.1:1/0"  # unreachable on purpose: API must work without Redis
os.environ["SEED_DEMO_USER"] = "true"
os.environ["JWT_SECRET"] = "test-secret"
