"""FastAPI application entry point."""

import logging

from fastapi import FastAPI

from app.api import health
from app.config import get_settings

settings = get_settings()
logging.basicConfig(level=settings.log_level)

app = FastAPI(title="NDVI Field Monitor", version="0.1.0")
app.include_router(health.router)
