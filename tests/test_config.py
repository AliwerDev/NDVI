"""Tests for Settings."""

import pytest

from app.config import Settings


def test_settings_read_environment_variables(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("LOG_LEVEL", "DEBUG")
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://u:p@example:5432/x")

    # _env_file=None: ignore the local .env file so the test gives the same result everywhere.
    settings = Settings(_env_file=None)

    assert settings.app_env == "test"
    assert settings.log_level == "DEBUG"
    assert settings.database_url == "postgresql+psycopg://u:p@example:5432/x"


def test_settings_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in ("APP_ENV", "LOG_LEVEL", "DATABASE_URL"):
        monkeypatch.delenv(name, raising=False)

    settings = Settings(_env_file=None)

    assert settings.app_env == "development"
    assert settings.log_level == "INFO"
