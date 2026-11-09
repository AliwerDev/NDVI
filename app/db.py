"""Database engine, session factory and connection check."""

from collections.abc import Iterator

from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings

# create_engine does not connect yet. The first connection opens on first use.
engine = create_engine(
    get_settings().database_url,
    pool_pre_ping=True,
    connect_args={"connect_timeout": 5},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """FastAPI dependency: give one session per request and close it after."""
    with SessionLocal() as session:
        yield session


def check_db_connection() -> bool:
    """Return True if Postgres answers and the PostGIS extension is available."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            conn.execute(text("SELECT PostGIS_Version()"))
        return True
    except SQLAlchemyError:
        return False
