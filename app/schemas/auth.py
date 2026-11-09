"""Pydantic schemas for accounts and login."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, StringConstraints

from app.models import User
from app.services.auth import PASSWORD_MIN_LENGTH

# Lowercase letters, digits, "_" and ".". Upper case is accepted and turned into lower case.
Username = Annotated[
    str, StringConstraints(strip_whitespace=True, to_lower=True, pattern=r"^[a-z0-9_.]{3,32}$")
]
Password = Annotated[str, StringConstraints(min_length=PASSWORD_MIN_LENGTH, max_length=128)]


class RegisterRequest(BaseModel):
    username: Username
    password: Password


class LoginRequest(BaseModel):
    # No format rules here: a wrong value only gives "invalid username or password".
    username: str
    password: str


class UserRead(BaseModel):
    id: int
    username: str | None
    display_name: str
    telegram_linked: bool

    @classmethod
    def from_user(cls, user: User) -> "UserRead":
        name = user.username or user.display_name or user.telegram_username or f"#{user.id}"
        return cls(
            id=user.id, username=user.username, display_name=name, telegram_linked=user.telegram_id is not None
        )


class AuthResult(BaseModel):
    """A new session. The frontend sends the token as "Authorization: Bearer <token>"."""

    token: str
    user: UserRead


class TelegramLoginStartResponse(BaseModel):
    url: str
    poll_token: str
    expires_at: datetime


class TelegramPollRequest(BaseModel):
    poll_token: str


class TelegramPollResponse(BaseModel):
    status: Literal["pending", "confirmed"]
    token: str | None = None
    user: UserRead | None = None


class TelegramLinkResponse(BaseModel):
    url: str
