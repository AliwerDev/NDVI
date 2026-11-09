"""Telegram endpoints: the bot username, and one-time deep links that link a field to a chat."""

import logging

from aiogram import Bot
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.api.deps import CurrentUser, DbSession
from app.api.fields import get_field_or_404
from app.config import get_settings
from app.schemas.auth import TelegramLinkResponse
from app.services.auth import create_link_code

logger = logging.getLogger(__name__)
router = APIRouter(tags=["telegram"])

# The username does not change while the token is the same, so one getMe call is enough.
_usernames: dict[str, str] = {}


class TelegramBotInfo(BaseModel):
    username: str | None


async def fetch_bot_username(token: str) -> str | None:
    """Ask Telegram for the bot username. Returns None if Telegram cannot be reached."""
    try:
        async with Bot(token) as bot:
            me = await bot.get_me()
    except Exception:
        logger.warning("Telegram getMe failed, Telegram login and linking are not available", exc_info=True)
        return None
    return me.username


async def get_bot_username() -> str | None:
    """Return the bot username, or None when the bot is disabled or Telegram is unreachable."""
    token = get_settings().telegram_bot_token
    if not token:
        return None
    if token not in _usernames:
        username = await fetch_bot_username(token)
        if username is None:
            return None
        _usernames[token] = username
    return _usernames[token]


async def require_bot_username() -> str:
    username = await get_bot_username()
    if username is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Telegram bot is not available")
    return username


@router.get("/telegram/bot")
async def telegram_bot() -> TelegramBotInfo:
    """Return the bot username, or null when the bot is disabled or Telegram is unreachable."""
    return TelegramBotInfo(username=await get_bot_username())


@router.post("/fields/{field_id}/telegram-link")
async def create_field_telegram_link(field_id: int, user: CurrentUser, db: DbSession) -> TelegramLinkResponse:
    """Return a one-time t.me link. The bot subscribes the chat to this field's alerts."""
    field = get_field_or_404(db, field_id, user)
    bot = await require_bot_username()
    code = create_link_code(db, user, field)
    return TelegramLinkResponse(url=f"https://t.me/{bot}?start=link_{code}")
