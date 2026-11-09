"""Tests for accounts: passwords, sessions, field ownership, and Telegram login and linking."""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from geoalchemy2.shape import from_shape
from shapely.geometry import box
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api import telegram
from app.bot import messages
from app.bot.subscriptions import confirm_login, link_with_code, subscribed_chat_ids
from app.models import AuthSession, Field, TelegramToken, User
from app.services.auth import (
    TelegramIdentity,
    create_link_code,
    create_session,
    hash_password,
    start_telegram_login,
    verify_password,
)

SQUARE = {
    "type": "Polygon",
    "coordinates": [[[69.20, 41.30], [69.21, 41.30], [69.21, 41.31], [69.20, 41.31], [69.20, 41.30]]],
}
TELEGRAM = TelegramIdentity(id=777000222, username="dehqon", full_name="Ali Valiyev")
CHAT = 987654321


def _register(client: TestClient, username: str = "Ali_01", password: str = "parol-12345") -> dict:
    response = client.post("/auth/register", json={"username": username, "password": password})
    assert response.status_code == 201, response.text
    return response.json()


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# --- Passwords (no database needed) ---


def test_password_hash_round_trip() -> None:
    stored = hash_password("parol-12345")
    assert stored.startswith("scrypt$")
    assert "parol-12345" not in stored
    assert verify_password("parol-12345", stored)
    assert not verify_password("parol-12346", stored)
    assert not verify_password("parol-12345", "not-a-hash")


def test_same_password_gives_different_hashes() -> None:
    assert hash_password("parol-12345") != hash_password("parol-12345")


@pytest.mark.parametrize(
    "body",
    [
        {"username": "ab", "password": "parol-12345"},
        {"username": "bad name", "password": "parol-12345"},
        {"username": "ali", "password": "short"},
    ],
)
def test_register_validates_input(client: TestClient, body: dict) -> None:
    assert client.post("/auth/register", json=body).status_code == 422


# --- Password accounts and sessions ---


def test_register_login_me_logout(anonymous_client: TestClient) -> None:
    registered = _register(anonymous_client)
    assert registered["user"]["username"] == "ali_01"
    assert registered["user"]["telegram_linked"] is False

    # The username is not case sensitive.
    login = anonymous_client.post("/auth/login", json={"username": "ALI_01", "password": "parol-12345"})
    assert login.status_code == 200
    token = login.json()["token"]

    me = anonymous_client.get("/auth/me", headers=_auth(token))
    assert me.status_code == 200
    assert me.json()["display_name"] == "ali_01"

    assert anonymous_client.post("/auth/logout", headers=_auth(token)).status_code == 204
    assert anonymous_client.get("/auth/me", headers=_auth(token)).status_code == 401
    # The session from registration is a different session and still works.
    assert anonymous_client.get("/auth/me", headers=_auth(registered["token"])).status_code == 200


def test_register_rejects_taken_username(anonymous_client: TestClient) -> None:
    _register(anonymous_client)
    response = anonymous_client.post("/auth/register", json={"username": "ali_01", "password": "boshqa-parol"})
    assert response.status_code == 409


@pytest.mark.parametrize(("username", "password"), [("ali_01", "notogri-parol"), ("yoq_user", "parol-12345")])
def test_login_rejects_wrong_credentials(anonymous_client: TestClient, username: str, password: str) -> None:
    _register(anonymous_client)
    response = anonymous_client.post("/auth/login", json={"username": username, "password": password})
    assert response.status_code == 401


def test_expired_session_is_rejected(anonymous_client: TestClient, db_session: Session, user: User) -> None:
    token = create_session(db_session, user)
    session = db_session.scalars(select(AuthSession).where(AuthSession.user_id == user.id)).one()
    session.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    db_session.commit()
    assert anonymous_client.get("/auth/me", headers=_auth(token)).status_code == 401


@pytest.mark.parametrize("path", ["/fields", "/auth/me"])
def test_endpoints_need_login(anonymous_client: TestClient, path: str) -> None:
    response = anonymous_client.get(path)
    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"


# --- Field ownership ---


def test_first_user_gets_fields_without_owner(anonymous_client: TestClient, db_session: Session) -> None:
    # Every test runs in a rolled-back transaction, so the database has no users here.
    old = Field(name="Eski", geometry=from_shape(box(69.2, 41.3, 69.21, 41.31), srid=4326))
    db_session.add(old)
    db_session.commit()

    first = _register(anonymous_client, "birinchi")
    second = _register(anonymous_client, "ikkinchi")

    first_fields = anonymous_client.get("/fields", headers=_auth(first["token"])).json()["features"]
    second_fields = anonymous_client.get("/fields", headers=_auth(second["token"])).json()["features"]
    assert [f["properties"]["name"] for f in first_fields] == ["Eski"]
    assert second_fields == []


def test_user_cannot_see_other_users_field(db_client: TestClient, field: Field) -> None:
    # db_client sends the owner's token by default. The explicit header below replaces it.
    other = _auth(_register(db_client, "begona")["token"])

    assert db_client.get("/fields", headers=other).json()["features"] == []
    assert db_client.get(f"/fields/{field.id}", headers=other).status_code == 404
    assert db_client.delete(f"/fields/{field.id}", headers=other).status_code == 404
    assert db_client.get(f"/fields/{field.id}/ndvi", headers=other).status_code == 404

    assert db_client.get(f"/fields/{field.id}").status_code == 200


def test_created_field_belongs_to_creator(db_client: TestClient, db_session: Session, user: User) -> None:
    created = db_client.post("/fields", json={"name": "Yangi", "geometry": SQUARE}).json()
    assert db_session.get(Field, created["id"]).owner_id == user.id


# --- Telegram login ---


@pytest.fixture
def bot_username(monkeypatch: pytest.MonkeyPatch) -> str:
    async def fake_username() -> str:
        return "ndvi_test_bot"

    monkeypatch.setattr(telegram, "get_bot_username", fake_username)
    return "ndvi_test_bot"


def test_telegram_login_flow(anonymous_client: TestClient, db_session: Session, bot_username: str) -> None:
    start = anonymous_client.post("/auth/telegram/start").json()
    assert start["url"].startswith(f"https://t.me/{bot_username}?start=login_")
    code = start["url"].split("login_", 1)[1]
    assert len(f"login_{code}") <= 64  # the Telegram limit for a deep link payload

    poll = {"poll_token": start["poll_token"]}
    assert anonymous_client.post("/auth/telegram/poll", json=poll).json() == {
        "status": "pending",
        "token": None,
        "user": None,
    }

    assert confirm_login(db_session, code, TELEGRAM) == messages.LOGIN_CONFIRMED
    # The code works once.
    assert confirm_login(db_session, code, TELEGRAM) == messages.LOGIN_EXPIRED

    confirmed = anonymous_client.post("/auth/telegram/poll", json=poll).json()
    assert confirmed["status"] == "confirmed"
    assert confirmed["user"]["display_name"] == "Ali Valiyev"
    assert confirmed["user"]["telegram_linked"] is True
    assert anonymous_client.get("/auth/me", headers=_auth(confirmed["token"])).status_code == 200

    # The session is given only once.
    assert anonymous_client.post("/auth/telegram/poll", json=poll).status_code == 410


def test_telegram_login_reuses_linked_account(db_session: Session, user: User) -> None:
    started = start_telegram_login(db_session)
    identity = TelegramIdentity(id=user.telegram_id, username="fermer_tg", full_name="Fermer")
    confirm_login(db_session, started.code, identity)

    token = db_session.scalars(select(TelegramToken).where(TelegramToken.user_id == user.id)).one()
    assert token.confirmed_at is not None
    assert db_session.scalars(select(User)).all() == [user]


def test_expired_telegram_code_is_refused(anonymous_client: TestClient, db_session: Session) -> None:
    started = start_telegram_login(db_session)
    token = db_session.scalars(select(TelegramToken)).one()
    token.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    db_session.commit()

    assert confirm_login(db_session, started.code, TELEGRAM) == messages.LOGIN_EXPIRED
    response = anonymous_client.post("/auth/telegram/poll", json={"poll_token": started.poll_token})
    assert response.status_code == 410


def test_telegram_start_without_bot(anonymous_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    async def no_bot() -> None:
        return None

    monkeypatch.setattr(telegram, "get_bot_username", no_bot)
    assert anonymous_client.post("/auth/telegram/start").status_code == 503


# --- Telegram link for field alerts ---


def test_link_code_subscribes_chat_and_binds_telegram(db_session: Session) -> None:
    owner = User(username="parolli", password_hash=hash_password("parol-12345"))
    db_session.add(owner)
    db_session.commit()
    field = Field(owner_id=owner.id, name="Gʻoʻza", geometry=from_shape(box(69.2, 41.3, 69.21, 41.31), srid=4326))
    db_session.add(field)
    db_session.commit()

    code = create_link_code(db_session, owner, field)
    assert link_with_code(db_session, code, TELEGRAM, CHAT) == messages.linked("Gʻoʻza")
    assert subscribed_chat_ids(db_session, field.id) == [CHAT]
    assert owner.telegram_id == TELEGRAM.id
    # The code works once.
    assert link_with_code(db_session, code, TELEGRAM, CHAT) == messages.LINK_EXPIRED


def test_link_endpoint(db_client: TestClient, field: Field, bot_username: str) -> None:
    response = db_client.post(f"/fields/{field.id}/telegram-link")
    assert response.status_code == 200
    assert response.json()["url"].startswith(f"https://t.me/{bot_username}?start=link_")
    assert db_client.post("/fields/999999/telegram-link").status_code == 404
