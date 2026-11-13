"""Statistics and the user list for the admin panel."""

from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import Date, cast, func, or_, select
from sqlalchemy.orm import InstrumentedAttribute, Session
from sqlalchemy.sql.elements import ColumnElement

from app.config import get_settings
from app.models import Alert, BackfillJob, Field, NdviObservation, User, WeatherAlert, WeatherDay
from app.models.alert import ALERT_NDMI_STRESS, ALERT_NDRE_LOW, ALERT_NDVI_DROP
from app.models.backfill_job import STATUS_FAILED, STATUS_RUNNING
from app.models.weather import WEATHER_FROST, WEATHER_HEAT
from app.schemas.admin import (
    AdminStats,
    AdminUserPage,
    AdminUserRow,
    AlertCounts,
    DailyCount,
    FailedBackfill,
    SignInMethods,
    UserSort,
)
from app.schemas.auth import display_name_of
from app.services.area import SQUARE_METERS_PER_HECTARE

DAILY_DAYS = 30
BACKFILL_STUCK_AFTER = timedelta(hours=1)
RECENT_FAILED_LIMIT = 5


def _area_m2(geometry: InstrumentedAttribute) -> ColumnElement[float]:
    # The ellipsoid area of PostGIS. It differs from app.services.area (sphere) by less than 0.5 %.
    return func.ST_Area(func.geography(geometry))


def _count(db: Session, *where: ColumnElement[bool], of: InstrumentedAttribute) -> int:
    return db.scalar(select(func.count(of)).where(*where)) or 0


def _daily(db: Session, column: InstrumentedAttribute, timezone: str, today: date) -> list[DailyCount]:
    """Rows per local day for the last DAILY_DAYS days. Days without rows get 0."""
    start = today - timedelta(days=DAILY_DAYS - 1)
    since = datetime.combine(start, time(), ZoneInfo(timezone))
    # A subquery, so GROUP BY uses the same expression as SELECT (the time zone is a bound parameter).
    days = select(cast(func.timezone(timezone, column), Date).label("day")).where(column >= since).subquery()
    rows = db.execute(select(days.c.day, func.count()).group_by(days.c.day)).all()
    counts: dict[date, int] = {day: count for day, count in rows}
    return [
        DailyCount(day=start + timedelta(days=offset), count=counts.get(start + timedelta(days=offset), 0))
        for offset in range(DAILY_DAYS)
    ]


def _alert_counts(db: Session, since: datetime) -> AlertCounts:
    index_rows = db.execute(
        select(Alert.kind, func.count()).where(Alert.created_at >= since).group_by(Alert.kind)
    ).all()
    weather_rows = db.execute(
        select(WeatherAlert.kind, func.count()).where(WeatherAlert.created_at >= since).group_by(WeatherAlert.kind)
    ).all()
    counts: dict[str, int] = {kind: count for kind, count in [*index_rows, *weather_rows]}
    return AlertCounts(
        ndvi_drop=counts.get(ALERT_NDVI_DROP, 0),
        ndmi_stress=counts.get(ALERT_NDMI_STRESS, 0),
        ndre_low=counts.get(ALERT_NDRE_LOW, 0),
        frost=counts.get(WEATHER_FROST, 0),
        heat=counts.get(WEATHER_HEAT, 0),
    )


def _unsent_alerts(db: Session) -> tuple[int, datetime | None]:
    total = 0
    oldest: datetime | None = None
    for model in (Alert, WeatherAlert):
        count, first = db.execute(
            select(func.count(model.id), func.min(model.created_at)).where(model.sent_at.is_(None))
        ).one()
        total += count
        if first is not None and (oldest is None or first < oldest):
            oldest = first
    return total, oldest


def _recent_failed_backfills(db: Session) -> list[FailedBackfill]:
    rows = db.execute(
        select(BackfillJob, Field, User)
        .join(Field, Field.id == BackfillJob.field_id)
        .outerjoin(User, User.id == Field.owner_id)
        .where(BackfillJob.status == STATUS_FAILED)
        .order_by(func.coalesce(BackfillJob.finished_at, BackfillJob.updated_at).desc())
        .limit(RECENT_FAILED_LIMIT)
    ).all()
    return [
        FailedBackfill(
            field_id=field.id,
            field_name=field.name,
            owner_name=display_name_of(owner) if owner is not None else None,
            finished_at=job.finished_at,
        )
        for job, field, owner in rows
    ]


def admin_stats(db: Session) -> AdminStats:
    settings = get_settings()
    timezone = settings.scheduler_timezone
    now = datetime.now(UTC)
    today = now.astimezone(ZoneInfo(timezone)).date()
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)

    has_password = User.password_hash.is_not(None)
    has_telegram = User.telegram_id.is_not(None)
    telegram_only, password_only, both = db.execute(
        select(
            func.count().filter(has_telegram, User.password_hash.is_(None)),
            func.count().filter(has_password, User.telegram_id.is_(None)),
            func.count().filter(has_password, has_telegram),
        ).select_from(User)
    ).one()

    fields_total, area_m2 = db.execute(
        select(func.count(Field.id), func.coalesce(func.sum(_area_m2(Field.geometry)), 0.0))
    ).one()

    unsent, unsent_oldest = _unsent_alerts(db)
    owns_field = select(Field.id).where(Field.owner_id == User.id).exists()
    has_observation = select(NdviObservation.id).where(NdviObservation.field_id == Field.id).exists()
    running = BackfillJob.status == STATUS_RUNNING

    return AdminStats(
        generated_at=now,
        users_total=_count(db, of=User.id),
        users_new_7d=_count(db, User.created_at >= week_ago, of=User.id),
        users_active_7d=_count(db, User.last_seen_at >= week_ago, of=User.id),
        users_telegram=_count(db, has_telegram, of=User.id),
        users_without_fields=_count(db, ~owns_field, of=User.id),
        sign_in_methods=SignInMethods(telegram_only=telegram_only, password_only=password_only, both=both),
        fields_total=fields_total,
        fields_area_ha=round(float(area_m2) / SQUARE_METERS_PER_HECTARE, 2),
        fields_without_observations=_count(db, ~has_observation, of=Field.id),
        observations_total=_count(db, of=NdviObservation.id),
        observations_new_7d=_count(db, NdviObservation.created_at >= week_ago, of=NdviObservation.id),
        alerts_30d=_alert_counts(db, month_ago),
        alerts_unsent=unsent,
        alerts_unsent_oldest=unsent_oldest,
        backfill_running=_count(db, running, of=BackfillJob.id),
        backfill_stuck=_count(db, running, BackfillJob.updated_at < now - BACKFILL_STUCK_AFTER, of=BackfillJob.id),
        backfill_failed_30d=_count(
            db,
            BackfillJob.status == STATUS_FAILED,
            func.coalesce(BackfillJob.finished_at, BackfillJob.updated_at) >= month_ago,
            of=BackfillJob.id,
        ),
        recent_failed_backfills=_recent_failed_backfills(db),
        latest_scene_date=db.scalar(select(func.max(NdviObservation.observed_on))),
        weather_fetched_at=db.scalar(select(func.max(WeatherDay.fetched_at))),
        new_users_daily=_daily(db, User.created_at, timezone, today),
        observations_daily=_daily(db, NdviObservation.created_at, timezone, today),
    )


def user_page(
    db: Session, query: str, sort: UserSort, descending: bool, page: int, per_page: int
) -> AdminUserPage:
    """One page of users with the totals of their fields and observations."""
    field_totals = (
        select(
            Field.owner_id.label("user_id"),
            func.count(Field.id).label("fields"),
            func.sum(_area_m2(Field.geometry)).label("area_m2"),
        )
        .where(Field.owner_id.is_not(None))
        .group_by(Field.owner_id)
        .subquery()
    )
    observation_totals = (
        select(
            Field.owner_id.label("user_id"),
            func.count(NdviObservation.id).label("observations"),
            func.max(NdviObservation.observed_on).label("last_observed_on"),
        )
        .join(NdviObservation, NdviObservation.field_id == Field.id)
        .where(Field.owner_id.is_not(None))
        .group_by(Field.owner_id)
        .subquery()
    )
    fields = func.coalesce(field_totals.c.fields, 0)
    area_m2 = func.coalesce(field_totals.c.area_m2, 0.0)
    observations = func.coalesce(observation_totals.c.observations, 0)
    name = func.lower(func.coalesce(User.display_name, User.username, User.telegram_username, ""))

    statement = (
        select(User, fields, area_m2, observations, observation_totals.c.last_observed_on)
        .outerjoin(field_totals, field_totals.c.user_id == User.id)
        .outerjoin(observation_totals, observation_totals.c.user_id == User.id)
    )
    text = query.strip().lstrip("@")
    if text:
        conditions = [
            User.username.icontains(text, autoescape=True),
            User.display_name.icontains(text, autoescape=True),
            User.telegram_username.icontains(text, autoescape=True),
        ]
        if text.lstrip("#").isdigit():
            conditions.append(User.id == int(text.lstrip("#")))
        statement = statement.where(or_(*conditions))

    total = db.scalar(select(func.count()).select_from(statement.subquery())) or 0
    sort_column = {
        "last_seen": User.last_seen_at,
        "created": User.created_at,
        "name": name,
        "fields": fields,
        "area": area_m2,
        "observations": observations,
    }[sort]
    order = sort_column.desc().nulls_last() if descending else sort_column.asc().nulls_last()
    rows = db.execute(statement.order_by(order, User.id.desc()).offset((page - 1) * per_page).limit(per_page)).all()

    return AdminUserPage(
        total=total,
        page=page,
        per_page=per_page,
        items=[
            AdminUserRow(
                id=user.id,
                display_name=display_name_of(user),
                username=user.username,
                telegram_linked=user.telegram_id is not None,
                telegram_username=user.telegram_username if user.telegram_id is not None else None,
                has_password=user.password_hash is not None,
                is_admin=user.is_admin,
                fields=field_count,
                area_ha=round(float(area) / SQUARE_METERS_PER_HECTARE, 2),
                observations=observation_count,
                last_observed_on=last_observed_on,
                created_at=user.created_at,
                last_seen_at=user.last_seen_at,
            )
            for user, field_count, area, observation_count, last_observed_on in rows
        ],
    )
