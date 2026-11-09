"""Telegram bot process (long polling). Run: python -m app.bot"""

import asyncio
import logging
from collections.abc import Callable

from aiogram import Bot, Dispatcher, Router
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.types import Message

from app.bot import messages
from app.bot.subscriptions import link_chat, list_chat_fields, parse_field_id, unlink_chat
from app.config import get_settings
from app.db import SessionLocal

logger = logging.getLogger(__name__)
router = Router()


async def _run_db(func: Callable[..., str], *args: object) -> str:
    """Run a sync database function in a worker thread, so the bot event loop does not block."""

    def call() -> str:
        with SessionLocal() as db:
            return func(db, *args)

    return await asyncio.to_thread(call)


@router.message(CommandStart())
async def handle_start(message: Message) -> None:
    await message.answer(messages.WELCOME)


@router.message(Command("link"))
async def handle_link(message: Message, command: CommandObject) -> None:
    field_id = parse_field_id(command.args)
    if field_id is None:
        await message.answer(messages.LINK_USAGE)
        return
    await message.answer(await _run_db(link_chat, message.chat.id, field_id))


@router.message(Command("unlink"))
async def handle_unlink(message: Message, command: CommandObject) -> None:
    field_id = parse_field_id(command.args)
    if field_id is None:
        await message.answer(messages.UNLINK_USAGE)
        return
    await message.answer(await _run_db(unlink_chat, message.chat.id, field_id))


@router.message(Command("fields"))
async def handle_fields(message: Message) -> None:
    await message.answer(await _run_db(list_chat_fields, message.chat.id))


async def run() -> None:
    settings = get_settings()
    if not settings.telegram_bot_token:
        logger.warning("TELEGRAM_BOT_TOKEN is not set, the bot is disabled")
        return
    bot = Bot(settings.telegram_bot_token)
    dispatcher = Dispatcher()
    dispatcher.include_router(router)
    logger.info("Bot started")
    await dispatcher.start_polling(bot)


def main() -> None:
    logging.basicConfig(level=get_settings().log_level)
    asyncio.run(run())
