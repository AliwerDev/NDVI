"""Telegram bot process (long polling). Run: python -m app.bot"""

import asyncio
import logging
from collections.abc import Callable

from aiogram import Bot, Dispatcher, Router
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.types import BotCommand, Message

from app.bot import messages
from app.bot.subscriptions import confirm_login, link_with_code, list_user_fields, parse_start_payload, user_weather
from app.config import get_settings
from app.db import SessionLocal
from app.services.auth import TelegramIdentity
from app.services.weather import local_today

logger = logging.getLogger(__name__)
router = Router()


async def _run_db[T](func: Callable[..., T], *args: object) -> T:
    """Run a sync database function in a worker thread, so the bot event loop does not block."""

    def call() -> T:
        with SessionLocal() as db:
            return func(db, *args)

    return await asyncio.to_thread(call)


def _identity(message: Message) -> TelegramIdentity | None:
    user = message.from_user
    if user is None:
        return None
    return TelegramIdentity(id=user.id, username=user.username, full_name=user.full_name)


@router.message(CommandStart())
async def handle_start(message: Message, command: CommandObject) -> None:
    # The website opens the bot with "login_<code>" (sign in) or "link_<code>" (bind Telegram to the account).
    payload = parse_start_payload(command.args)
    identity = _identity(message)
    if payload is None or identity is None:
        await message.answer(messages.WELCOME)
        return
    if payload.kind == "login":
        reply = await _run_db(confirm_login, payload.code, identity)
    else:
        reply = await _run_db(link_with_code, payload.code, identity)
    await message.answer(reply)


@router.message(Command("fields"))
async def handle_fields(message: Message) -> None:
    identity = _identity(message)
    if identity is None:
        await message.answer(messages.NO_FIELDS)
        return
    for part in await _run_db(list_user_fields, identity.id, local_today()):
        await message.answer(part, parse_mode="HTML")


@router.message(Command("weather"))
async def handle_weather(message: Message) -> None:
    identity = _identity(message)
    if identity is None:
        await message.answer(messages.NO_FIELDS)
        return
    for part in await _run_db(user_weather, identity.id, local_today()):
        await message.answer(part)


async def run() -> None:
    settings = get_settings()
    if not settings.telegram_bot_token:
        logger.warning("TELEGRAM_BOT_TOKEN is not set, the bot is disabled")
        return
    bot = Bot(settings.telegram_bot_token)
    dispatcher = Dispatcher()
    dispatcher.include_router(router)
    # The menu comes from the code, so a new command appears in Telegram after a restart.
    await bot.set_my_commands([BotCommand(command=name, description=text) for name, text in messages.COMMANDS])
    logger.info("Bot started")
    await dispatcher.start_polling(bot)


def main() -> None:
    logging.basicConfig(level=get_settings().log_level)
    asyncio.run(run())
