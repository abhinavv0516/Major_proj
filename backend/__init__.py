# Load backend/.env before any submodule reads os.environ at import time
# (ml_service, auth, redis_client and database all read settings on import).
from pathlib import Path as _Path

from dotenv import load_dotenv as _load_dotenv

_load_dotenv(_Path(__file__).resolve().parent / ".env")
