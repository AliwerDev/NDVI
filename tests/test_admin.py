"""Tests for the admin panel: access rules, statistics, the user list and the CLI. They need TEST_DATABASE_URL."""

from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from geoalchemy2.shape import from_shape
from shapely.geometry import box
from sqlalchemy.orm import Session

from app.cli import UserNotFound, set_admin
from app.models import Alert, BackfillJob, Field, NdviObservation, User, WeatherAlert
from app.models.alert import ALERT_NDMI_STRESS, ALERT_NDVI_DROP
from app.models.backfill_job import STATUS_FAILED, STATUS_RUNNING
from app.models.weather import WEATHER_FROST


def _observation(db: Session, field: Field, day: date, ndvi: float = 0.6) -> NdviObservation:
    observation = NdviObservation(
        field_id=field.id,
        observed_on=day,
        scene_id=f"S2_{day.isoformat()}",
        scene_cloud_cover=1.0,
        ndvi_mean=ndvi,
        ndvi_min=ndvi - 0.1,
        ndvi_max=ndvi + 0.1,
        clear_fraction=0.95,
        cog_path=f"data/ndvi/{field.id}/{day.isoformat()}.tif",
    )
    db.add(observation)
    db.commit()
    return observation


@pytest.fixture
def admin(db_session: Session, user: User) -> User:
    user.is_admin = True
    db_session.commit()
    return user


@pytest.fixture
def telegram_user(db_session: Session) -> User:
    """A Telegram-only account with one big field and no observations."""
    other = User(telegram_id=777000222, telegram_username="dehqon_tg", display_name="Dehqon")
    db_session.add(other)
    db_session.commit()
    db_session.add(Field(owner_id=other.id, name="Katta", geometry=from_shape(box(69.0, 41.0, 69.05, 41.05), srid=4326)))
    db_session.commit()
    return other


# --- Access ---


def test_admin_endpoints_need_login(anonymous_client: TestClient) -> None:
    assert anonymous_client.get("/admin/stats").status_code == 401
    assert anonymous_client.get("/admin/users").status_code == 401


def test_admin_endpoints_refuse_normal_users(db_client: TestClient) -> None:
    assert db_client.get("/admin/stats").status_code == 403
    assert db_client.get("/admin/users").status_code == 403


def test_me_shows_admin_flag(db_client: TestClient, admin: User) -> None:
    assert db_client.get("/auth/me").json()["is_admin"] is True


def test_request_records_last_seen(db_client: TestClient, db_session: Session, user: User) -> None:
    assert user.last_seen_at is None
    db_client.get("/auth/me")
    db_session.refresh(user)
    assert user.last_seen_at is not None


# --- Statistics ---


def test_stats_counts_users_fields_observations_and_alerts(
    db_client: TestClient, db_session: Session, admin: User, field: Field, telegram_user: User
) -> None:
    today = date.today()
    first = _observation(db_session, field, today - timedelta(days=5))
    second = _observation(db_session, field, today - timedelta(days=1), ndvi=0.4)
    db_session.add_all(
        [
            Alert(field_id=field.id, kind=ALERT_NDVI_DROP, observation_id=second.id,
                  previous_observation_id=first.id, previous_mean=0.6, current_mean=0.4, drop=0.2),
            Alert(field_id=field.id, kind=ALERT_NDMI_STRESS, observation_id=second.id, current_mean=-0.1,
                  sent_at=datetime.now(UTC)),
            WeatherAlert(field_id=field.id, kind=WEATHER_FROST, day=today, last_day=today, value=-3.0),
            BackfillJob(field_id=field.id, start=today, end=today, status=STATUS_FAILED,
                        finished_at=datetime.now(UTC)),
            BackfillJob(field_id=field.id, start=today, end=today, status=STATUS_RUNNING,
                        updated_at=datetime.now(UTC) - timedelta(hours=2)),
        ]
    )
    db_session.commit()

    response = db_client.get("/admin/stats")
    assert response.status_code == 200, response.text
    stats = response.json()

    assert stats["users_total"] == 2
    assert stats["users_new_7d"] == 2
    # Only the admin sent a request.
    assert stats["users_active_7d"] == 1
    assert stats["users_telegram"] == 2
    assert stats["users_without_fields"] == 0
    assert stats["sign_in_methods"] == {"telegram_only": 1, "password_only": 0, "both": 1}

    assert stats["fields_total"] == 2
    # About 93 ha (Paxta-1, 0.01°) plus about 2340 ha (Katta, 0.05°) near latitude 41.
    assert 2300 < stats["fields_area_ha"] < 2600
    assert stats["fields_without_observations"] == 1

    assert stats["observations_total"] == 2
    assert stats["observations_new_7d"] == 2
    assert stats["latest_scene_date"] == (today - timedelta(days=1)).isoformat()

    assert stats["alerts_30d"] == {"ndvi_drop": 1, "ndmi_stress": 1, "ndre_low": 0, "frost": 1, "heat": 0}
    assert stats["alerts_unsent"] == 2
    assert stats["alerts_unsent_oldest"] is not None

    assert stats["backfill_running"] == 1
    assert stats["backfill_stuck"] == 1
    assert stats["backfill_failed_30d"] == 1
    assert stats["recent_failed_backfills"][0]["field_name"] == "Paxta-1"
    assert stats["recent_failed_backfills"][0]["owner_name"] == "fermer"

    assert len(stats["new_users_daily"]) == 30
    assert sum(item["count"] for item in stats["new_users_daily"]) == 2
    assert sum(item["count"] for item in stats["observations_daily"]) == 2


def test_stats_on_empty_service(db_client: TestClient, admin: User) -> None:
    stats = db_client.get("/admin/stats").json()
    assert stats["fields_total"] == 0
    assert stats["fields_area_ha"] == 0
    assert stats["latest_scene_date"] is None
    assert stats["alerts_unsent_oldest"] is None
    assert stats["users_without_fields"] == 1


# --- User list ---


def test_users_list_has_totals(db_client: TestClient, db_session: Session, admin: User, field: Field,
                               telegram_user: User) -> None:
    _observation(db_session, field, date.today())

    page = db_client.get("/admin/users", params={"sort": "fields"}).json()
    assert page["total"] == 2
    rows = {row["id"]: row for row in page["items"]}
    assert rows[admin.id]["fields"] == 1
    assert rows[admin.id]["observations"] == 1
    assert rows[admin.id]["last_observed_on"] == date.today().isoformat()
    assert rows[admin.id]["is_admin"] is True
    assert rows[telegram_user.id]["observations"] == 0
    assert rows[telegram_user.id]["has_password"] is False
    assert rows[telegram_user.id]["telegram_username"] == "dehqon_tg"


def test_users_list_sorts_by_area(db_client: TestClient, admin: User, field: Field, telegram_user: User) -> None:
    ids = [row["id"] for row in db_client.get("/admin/users", params={"sort": "area"}).json()["items"]]
    assert ids == [telegram_user.id, admin.id]
    ids = [row["id"] for row in db_client.get("/admin/users", params={"sort": "area", "order": "asc"}).json()["items"]]
    assert ids == [admin.id, telegram_user.id]


@pytest.mark.parametrize("query", ["dehqon", "@DEHQON_TG", "Dehq"])
def test_users_list_search(db_client: TestClient, admin: User, telegram_user: User, query: str) -> None:
    page = db_client.get("/admin/users", params={"q": query}).json()
    assert [row["id"] for row in page["items"]] == [telegram_user.id]


def test_users_list_search_by_id(db_client: TestClient, admin: User, telegram_user: User) -> None:
    page = db_client.get("/admin/users", params={"q": f"#{telegram_user.id}"}).json()
    assert [row["id"] for row in page["items"]] == [telegram_user.id]


def test_users_list_pages(db_client: TestClient, admin: User, telegram_user: User) -> None:
    first = db_client.get("/admin/users", params={"per_page": 1, "page": 1, "sort": "created"}).json()
    second = db_client.get("/admin/users", params={"per_page": 1, "page": 2, "sort": "created"}).json()
    assert first["total"] == second["total"] == 2
    assert {first["items"][0]["id"], second["items"][0]["id"]} == {admin.id, telegram_user.id}


def test_users_list_rejects_bad_sort(db_client: TestClient, admin: User) -> None:
    assert db_client.get("/admin/users", params={"sort": "password"}).status_code == 422


# --- CLI ---


def test_set_admin_by_login_telegram_and_id(db_session: Session, user: User, telegram_user: User) -> None:
    assert set_admin(db_session, "FERMER", True).id == user.id
    assert user.is_admin is True
    assert set_admin(db_session, "@dehqon_tg", True).id == telegram_user.id
    assert set_admin(db_session, f"#{user.id}", False).is_admin is False


@pytest.mark.parametrize("ref", ["nobody", "@nobody", "#999999"])
def test_set_admin_unknown_user(db_session: Session, ref: str) -> None:
    with pytest.raises(UserNotFound):
        set_admin(db_session, ref, True)
