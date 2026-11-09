"""Tests for GET /telegram/bot. No Telegram connection: getMe is replaced."""

import pytest
from fastapi.testclient import TestClient

from app.api import telegram
from app.config import get_settings


def _use_token(monkeypatch: pytest.MonkeyPatch, token: str | None) -> None:
    settings = get_settings().model_copy(update={"telegram_bot_token": token})
    monkeypatch.setattr(telegram, "get_settings", lambda: settings)
    monkeypatch.setattr(telegram, "_usernames", {})


def test_no_token_gives_no_username(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _use_token(monkeypatch, None)
    response = client.get("/telegram/bot")
    assert response.status_code == 200
    assert response.json() == {"username": None}


def test_username_is_fetched_once(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _use_token(monkeypatch, "123:TEST")
    calls: list[str] = []

    async def fake_fetch(token: str) -> str:
        calls.append(token)
        return "ndvi_test_bot"

    monkeypatch.setattr(telegram, "fetch_bot_username", fake_fetch)
    assert client.get("/telegram/bot").json() == {"username": "ndvi_test_bot"}
    assert client.get("/telegram/bot").json() == {"username": "ndvi_test_bot"}
    assert calls == ["123:TEST"]


def test_failed_fetch_is_not_cached(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _use_token(monkeypatch, "123:TEST")
    results = iter([None, "ndvi_test_bot"])

    async def flaky_fetch(token: str) -> str | None:
        return next(results)

    monkeypatch.setattr(telegram, "fetch_bot_username", flaky_fetch)
    assert client.get("/telegram/bot").json() == {"username": None}
    assert client.get("/telegram/bot").json() == {"username": "ndvi_test_bot"}
