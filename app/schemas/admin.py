"""Pydantic schemas for the admin panel."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel


class DailyCount(BaseModel):
    day: date
    count: int


class SignInMethods(BaseModel):
    telegram_only: int
    password_only: int
    both: int


class AlertCounts(BaseModel):
    """Alerts created in the last 30 days, by kind."""

    ndvi_drop: int
    ndmi_stress: int
    ndre_low: int
    frost: int
    heat: int


class FailedBackfill(BaseModel):
    field_id: int
    field_name: str
    owner_name: str | None
    finished_at: datetime | None


class AdminStats(BaseModel):
    generated_at: datetime

    users_total: int
    users_new_7d: int
    users_active_7d: int
    users_telegram: int
    users_without_fields: int
    sign_in_methods: SignInMethods

    fields_total: int
    fields_area_ha: float
    fields_without_observations: int

    observations_total: int
    observations_new_7d: int

    alerts_30d: AlertCounts
    # Alerts and weather warnings that the bot did not send yet. Many old ones mean the bot or the scheduler is down.
    alerts_unsent: int
    alerts_unsent_oldest: datetime | None

    backfill_running: int
    # Running jobs without progress for an hour: the worker probably stopped.
    backfill_stuck: int
    backfill_failed_30d: int
    recent_failed_backfills: list[FailedBackfill]

    latest_scene_date: date | None
    weather_fetched_at: datetime | None

    # One item per day for the last 30 days, today included, in the time zone of the fields.
    new_users_daily: list[DailyCount]
    observations_daily: list[DailyCount]


UserSort = Literal["last_seen", "created", "name", "fields", "area", "observations"]


class AdminUserRow(BaseModel):
    id: int
    display_name: str
    username: str | None
    telegram_linked: bool
    telegram_username: str | None
    has_password: bool
    is_admin: bool
    fields: int
    area_ha: float
    observations: int
    last_observed_on: date | None
    created_at: datetime
    last_seen_at: datetime | None


class AdminUserPage(BaseModel):
    total: int
    page: int
    per_page: int
    items: list[AdminUserRow]
