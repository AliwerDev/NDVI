"""Tests for GET /health. The DB check is replaced, so no database is needed."""

from fastapi.testclient import TestClient

from app.db import check_db_connection
from app.main import app


def test_health_ok_when_db_is_up(client: TestClient) -> None:
    app.dependency_overrides[check_db_connection] = lambda: True

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


def test_health_503_when_db_is_down(client: TestClient) -> None:
    app.dependency_overrides[check_db_connection] = lambda: False

    response = client.get("/health")

    assert response.status_code == 503
    assert response.json() == {"status": "error", "database": "unavailable"}
