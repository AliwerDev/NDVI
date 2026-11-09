"""Application settings loaded from environment variables and the .env file."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Typed settings. Environment variables override values from .env."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = "development"
    log_level: str = "INFO"
    # Default has no password on purpose. The real URL comes from .env.
    database_url: str = "postgresql+psycopg://postgres@localhost:5432/ndvi"
    # Separate database for pytest. If it is not set, the database tests are skipped.
    test_database_url: str | None = None


@lru_cache
def get_settings() -> Settings:
    """Return one shared Settings instance."""
    return Settings()
