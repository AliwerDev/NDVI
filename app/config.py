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

    # Satellite data (Microsoft Planetary Computer STAC API)
    stac_api_url: str = "https://planetarycomputer.microsoft.com/api/stac/v1"
    stac_collection: str = "sentinel-2-l2a"
    # Max scene cloud cover in percent. It is measured for the whole tile, not for the field.
    max_cloud_cover: float = 20.0

    # NDVI
    # Folder for output files (NDVI COGs). Relative paths start from the working directory.
    data_dir: str = "data"
    # Share of field pixels (0..1) that must be clear in SCL. Cloudier scenes are skipped.
    min_clear_fraction: float = 0.8

    # Alerts and scheduler
    # Alert when mean NDVI falls by at least this much since the previous observation (absolute value).
    ndvi_drop_threshold: float = 0.15
    # Water stress: alert when mean NDMI goes below this value, or falls by at least the drop value.
    ndmi_stress_threshold: float = 0.0
    ndmi_drop_threshold: float = 0.10
    # Nitrogen: mean NDRE below the low value means a likely shortage, at or above the ok value means enough.
    ndre_low_threshold: float = 0.20
    ndre_ok_threshold: float = 0.30
    # Below this mean NDVI the plants are too sparse for a reliable NDRE. No nitrogen advice is given.
    ndre_min_ndvi: float = 0.30
    # The thresholds depend on the crop and its growth stage. Change them in .env.
    scheduler_timezone: str = "Asia/Tashkent"
    scheduler_hour: int = 7
    scheduler_minute: int = 0
    # A field without observations is searched for this many days back.
    scheduler_lookback_days: int = 10

    # Weather (Open-Meteo). The free API is for non-commercial use only.
    # A commercial plan gives an API key and its own host: change the URLs and set the key.
    open_meteo_url: str = "https://api.open-meteo.com/v1/forecast"
    open_meteo_archive_url: str = "https://archive-api.open-meteo.com/v1/archive"
    open_meteo_api_key: str | None = None
    weather_timeout_seconds: float = 20.0
    # The daily update stores this many past days and forecast days for each grid cell.
    weather_past_days: int = 7
    weather_forecast_days: int = 7

    # Telegram. Without a token the bot does not start and alerts are not sent.
    telegram_bot_token: str | None = None

    # Accounts. A login session lasts this many days.
    session_days: int = 30
    # A Telegram login or link code works for this many minutes.
    telegram_code_minutes: int = 10

    # Comma-separated list of web origins that may call the API from a browser (the frontend).
    cors_origins: str = "http://localhost:3000"


@lru_cache
def get_settings() -> Settings:
    """Return one shared Settings instance."""
    return Settings()
