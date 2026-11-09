"""Shared FastAPI dependencies: the database session and the signed-in user."""

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.services.auth import user_for_token

DbSession = Annotated[Session, Depends(get_db)]

# auto_error=False: a missing header gives our 401 below, not FastAPI's 403.
_bearer = HTTPBearer(auto_error=False)
BearerToken = Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]


def get_current_user(db: DbSession, credentials: BearerToken) -> User:
    """Return the user of the "Authorization: Bearer <token>" header, or answer 401."""
    user = user_for_token(db, credentials.credentials) if credentials else None
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not signed in",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
