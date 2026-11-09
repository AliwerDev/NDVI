"""Accounts, password hashing, login sessions and one-time Telegram codes."""

import base64
import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from enum import Enum
from functools import cache

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import AuthSession, Field, TelegramToken, User
from app.models.telegram_token import KIND_LINK, KIND_LOGIN

PASSWORD_MIN_LENGTH = 8

# scrypt from the standard library: no extra dependency. About 16 MB of memory per hash.
_SCRYPT_N = 2**14
_SCRYPT_R = 8
_SCRYPT_P = 1


def _now() -> datetime:
    return datetime.now(UTC)


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


# --- Passwords ---


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


def hash_password(password: str) -> str:
    """Return "scrypt$n$r$p$salt$hash". The parameters are stored, so they can change later."""
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P, dklen=32)
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${_b64(salt)}${_b64(digest)}"


@cache
def _dummy_hash() -> str:
    return hash_password(secrets.token_urlsafe(16))


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt, digest = stored.split("$")
    except ValueError:
        return False
    if scheme != "scrypt":
        return False
    expected = base64.b64decode(digest)
    actual = hashlib.scrypt(
        password.encode(), salt=base64.b64decode(salt), n=int(n), r=int(r), p=int(p), dklen=len(expected)
    )
    return hmac.compare_digest(actual, expected)


def normalize_username(username: str) -> str:
    return username.strip().lower()


# --- Users ---


def _claim_unowned_fields(db: Session, user: User) -> None:
    """The first account gets the fields that were created before accounts existed."""
    other_users = db.scalar(select(func.count()).select_from(User).where(User.id != user.id))
    if other_users == 0:
        db.execute(update(Field).where(Field.owner_id.is_(None)).values(owner_id=user.id))


def create_password_user(db: Session, username: str, password: str) -> User | None:
    """Create an account. Returns None if the username is taken."""
    username = normalize_username(username)
    if db.scalar(select(User).where(User.username == username)) is not None:
        return None
    user = User(username=username, password_hash=hash_password(password))
    db.add(user)
    db.flush()
    _claim_unowned_fields(db, user)
    db.commit()
    return user


def authenticate(db: Session, username: str, password: str) -> User | None:
    user = db.scalar(select(User).where(User.username == normalize_username(username)))
    if user is None or user.password_hash is None:
        # Hash anyway, so the response time does not show whether the username exists.
        verify_password(password, _dummy_hash())
        return None
    return user if verify_password(password, user.password_hash) else None


@dataclass(frozen=True)
class TelegramIdentity:
    """The Telegram account that sent a message to the bot."""

    id: int
    username: str | None
    full_name: str | None


def _find_or_create_telegram_user(db: Session, identity: TelegramIdentity) -> User:
    user = db.scalar(select(User).where(User.telegram_id == identity.id))
    if user is None:
        user = User(telegram_id=identity.id)
        db.add(user)
        db.flush()
        _claim_unowned_fields(db, user)
    user.telegram_username = identity.username
    user.display_name = identity.full_name
    return user


# --- Sessions ---


def create_session(db: Session, user: User) -> str:
    """Start a login session and return its token. Only the hash is stored."""
    token = secrets.token_urlsafe(32)
    expires_at = _now() + timedelta(days=get_settings().session_days)
    db.add(AuthSession(user_id=user.id, token_hash=_sha256(token), expires_at=expires_at))
    db.commit()
    return token


def user_for_token(db: Session, token: str) -> User | None:
    session = db.scalar(select(AuthSession).where(AuthSession.token_hash == _sha256(token)))
    if session is None or session.expires_at <= _now():
        return None
    return db.get(User, session.user_id)


def delete_session(db: Session, token: str) -> None:
    db.execute(delete(AuthSession).where(AuthSession.token_hash == _sha256(token)))
    db.commit()


# --- Telegram login: browser -> t.me deep link -> bot confirms -> browser polls ---


def _code_expiry() -> datetime:
    return _now() + timedelta(minutes=get_settings().telegram_code_minutes)


@dataclass(frozen=True)
class TelegramLoginStart:
    code: str
    poll_token: str
    expires_at: datetime


def start_telegram_login(db: Session) -> TelegramLoginStart:
    # 24 random bytes give 32 URL-safe characters. With "login_" the deep link payload stays under 64.
    code = secrets.token_urlsafe(24)
    poll_token = secrets.token_urlsafe(32)
    token = TelegramToken(
        kind=KIND_LOGIN,
        code_hash=_sha256(code),
        poll_token_hash=_sha256(poll_token),
        expires_at=_code_expiry(),
    )
    db.add(token)
    db.commit()
    return TelegramLoginStart(code=code, poll_token=poll_token, expires_at=token.expires_at)


def _open_token(db: Session, kind: str, code: str) -> TelegramToken | None:
    """Return the token if it exists, has this kind, is not expired and is not used yet."""
    token = db.scalar(select(TelegramToken).where(TelegramToken.code_hash == _sha256(code)))
    if token is None or token.kind != kind or token.confirmed_at is not None or token.expires_at <= _now():
        return None
    return token


def confirm_telegram_login(db: Session, code: str, identity: TelegramIdentity) -> bool:
    """Called by the bot. Returns False if the code is unknown, expired or already used."""
    token = _open_token(db, KIND_LOGIN, code)
    if token is None:
        return False
    user = _find_or_create_telegram_user(db, identity)
    token.user_id = user.id
    token.confirmed_at = _now()
    db.commit()
    return True


@dataclass(frozen=True)
class TelegramLoginPoll:
    status: str  # "pending", "confirmed" or "expired"
    user: User | None = None
    session_token: str | None = None


def poll_telegram_login(db: Session, poll_token: str) -> TelegramLoginPoll:
    """Called by the browser. A confirmed login gives a session exactly once."""
    token = db.scalar(select(TelegramToken).where(TelegramToken.poll_token_hash == _sha256(poll_token)))
    if token is None or token.consumed_at is not None or token.expires_at <= _now():
        return TelegramLoginPoll(status="expired")
    if token.confirmed_at is None or token.user_id is None:
        return TelegramLoginPoll(status="pending")
    token.consumed_at = _now()
    user = db.get(User, token.user_id)
    assert user is not None  # the foreign key deletes the token together with the user
    return TelegramLoginPoll(status="confirmed", user=user, session_token=create_session(db, user))


# --- Telegram link: a signed-in user binds one Telegram account. Alerts for all their fields go there. ---


def create_link_code(db: Session, user: User) -> str:
    code = secrets.token_urlsafe(24)
    db.add(TelegramToken(kind=KIND_LINK, code_hash=_sha256(code), user_id=user.id, expires_at=_code_expiry()))
    db.commit()
    return code


class LinkResult(Enum):
    LINKED = "linked"
    ALREADY_LINKED = "already_linked"
    # The Telegram account belongs to another user. One Telegram account opens only one account.
    TAKEN = "taken"
    EXPIRED = "expired"


def use_link_code(db: Session, code: str, identity: TelegramIdentity) -> LinkResult:
    """Called by the bot. Binds the Telegram account to the user of the code.

    A user who had another Telegram account gets the new one: the user clicked the link while signed in.
    """
    token = _open_token(db, KIND_LINK, code)
    user = db.get(User, token.user_id) if token is not None and token.user_id is not None else None
    if token is None or user is None:
        return LinkResult.EXPIRED

    owner = db.scalar(select(User).where(User.telegram_id == identity.id))
    if owner is not None and owner.id != user.id:
        return LinkResult.TAKEN

    token.confirmed_at = _now()
    result = LinkResult.ALREADY_LINKED if owner is not None else LinkResult.LINKED
    user.telegram_id = identity.id
    user.telegram_username = identity.username
    user.display_name = user.display_name or identity.full_name
    db.commit()
    return result


def unlink_telegram(db: Session, user: User) -> bool:
    """Remove the Telegram account from the user. Returns False for a Telegram-only account:
    without Telegram it would have no way to sign in."""
    if user.password_hash is None:
        return False
    user.telegram_id = None
    user.telegram_username = None
    db.commit()
    return True
