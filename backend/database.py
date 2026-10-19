import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base

BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(BACKEND_DIR / ".env")


def _resolve_database_url(url: str) -> str:
    """
    Make relative SQLite paths relative to backend/, not to wherever uvicorn was
    started from. Without this, `sqlite+aiosqlite:///./sql_app.db` silently points
    at a different file depending on the current directory.
    """
    prefix = "sqlite+aiosqlite:///"
    if url.startswith(prefix):
        path = url[len(prefix):]
        if path and path != ":memory:" and not Path(path).is_absolute():
            return prefix + str((BACKEND_DIR / path).resolve())
    return url


SQLALCHEMY_DATABASE_URL = _resolve_database_url(
    os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./sql_app.db")
)

_engine_kwargs: dict = {"echo": False}
if not SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    # PostgreSQL connection pool (tune for the number of API workers you run)
    _engine_kwargs.update(
        pool_size=int(os.getenv("DB_POOL_SIZE", "10")),
        max_overflow=int(os.getenv("DB_MAX_OVERFLOW", "20")),
        pool_pre_ping=True,
    )

engine = create_async_engine(SQLALCHEMY_DATABASE_URL, **_engine_kwargs)
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

Base = declarative_base()


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
