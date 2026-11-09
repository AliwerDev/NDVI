"""Shared pytest fixtures."""

from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from geoalchemy2.shape import from_shape
from shapely.geometry import box
from sqlalchemy import Engine, create_engine, make_url, text
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.config import get_settings
from app.db import get_db
from app.main import app
from app.models import Field, User
from app.services.auth import create_session, hash_password

ALEMBIC_INI = Path(__file__).resolve().parents[1] / "alembic.ini"


TELEGRAM_USER_ID = 555000111


@pytest.fixture
def client() -> Iterator[TestClient]:
    """Test client without a database. A signed-in user is faked, so validation tests reach the body checks."""
    app.dependency_overrides[get_current_user] = lambda: User(id=1, username="tester")
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _create_database_if_missing(url: str) -> None:
    """Create the test database on the same server if it does not exist."""
    db_url = make_url(url)
    # CREATE DATABASE cannot run inside a transaction, so use AUTOCOMMIT.
    admin_engine = create_engine(db_url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin_engine.connect() as conn:
        exists = conn.scalar(
            text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": db_url.database}
        )
        if not exists:
            conn.execute(text(f'CREATE DATABASE "{db_url.database}"'))
    admin_engine.dispose()


def _run_migrations(url: str) -> None:
    """Apply all Alembic migrations to the test database."""
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    command.upgrade(config, "head")


@pytest.fixture(scope="session")
def db_engine() -> Iterator[Engine]:
    """Engine for the test database, with migrations applied once per test run."""
    url = get_settings().test_database_url
    if not url:
        pytest.skip("TEST_DATABASE_URL is not set, database tests are skipped")
    _create_database_if_missing(url)
    _run_migrations(url)
    engine = create_engine(url)
    yield engine
    engine.dispose()


@pytest.fixture
def db_session(db_engine: Engine) -> Iterator[Session]:
    """Session inside a transaction that is rolled back after the test.

    db.commit() in the app code only releases a SAVEPOINT, so no test data stays in the database.
    """
    connection = db_engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint", expire_on_commit=False)
    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def user(db_session: Session) -> User:
    """A stored account with a password and a linked Telegram account."""
    user = User(username="fermer", password_hash=hash_password("parol-12345"), telegram_id=TELEGRAM_USER_ID)
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def field(db_session: Session, user: User) -> Field:
    """A stored field of `user`: a small square near Tashkent."""
    field = Field(owner_id=user.id, name="Paxta-1", geometry=from_shape(box(69.20, 41.30, 69.21, 41.31), srid=4326))
    db_session.add(field)
    db_session.commit()
    return field


@pytest.fixture
def anonymous_client(db_session: Session) -> Iterator[TestClient]:
    """Test client on the test database without a login."""
    app.dependency_overrides[get_db] = lambda: db_session
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def db_client(anonymous_client: TestClient, db_session: Session, user: User) -> TestClient:
    """Test client on the test database, signed in as `user` with a real session token."""
    anonymous_client.headers["Authorization"] = f"Bearer {create_session(db_session, user)}"
    return anonymous_client
