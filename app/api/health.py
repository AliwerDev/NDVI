"""Health endpoint: shows that the API runs and the database is reachable."""

from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from app.db import check_db_connection

router = APIRouter(tags=["health"])


@router.get("/health")
def health(
    response: Response,
    db_ok: Annotated[bool, Depends(check_db_connection)],
) -> dict[str, str]:
    """Return API and database status. HTTP 503 when the database is down."""
    if not db_ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "error", "database": "unavailable"}
    return {"status": "ok", "database": "ok"}
