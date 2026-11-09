"""The Telegram bot username, for t.me deep links."""

import logging

from aiogram import Bot
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.config import get_settings

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

