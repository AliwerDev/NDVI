"""Telegram bot info for the frontend: the bot username for the one-click deep link."""

import logging

from aiogram import Bot
from fastapi import APIRouter
from pydantic import BaseModel

from app.config import get_settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/telegram", tags=["telegram"])

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
        logger.warning("Telegram getMe failed, the frontend shows the /link command instead", exc_info=True)
        return None
    return me.username


@router.get("/bot")
async def telegram_bot() -> TelegramBotInfo:
    """Return the bot username, or null when the bot is disabled or Telegram is unreachable."""
    token = get_settings().telegram_bot_token
    if not token:
        return TelegramBotInfo(username=None)
    if token not in _usernames:
        username = await fetch_bot_username(token)
        if username is None:
            return TelegramBotInfo(username=None)
        _usernames[token] = username
    return TelegramBotInfo(username=_usernames[token])
