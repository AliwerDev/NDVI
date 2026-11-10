"""ORM models. Import every model here so Alembic sees all tables."""

from app.models.alert import Alert
from app.models.auth_session import AuthSession
from app.models.backfill_job import BackfillJob
from app.models.base import Base
from app.models.field import Field
from app.models.ndvi_observation import NdviObservation
from app.models.telegram_token import TelegramToken
from app.models.user import User
from app.models.weather import WeatherDay

__all__ = [
    "Alert",
    "AuthSession",
    "BackfillJob",
    "Base",
    "Field",
    "NdviObservation",
    "TelegramToken",
    "User",
    "WeatherDay",
]
