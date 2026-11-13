"""Admin panel endpoints: statistics of the whole service and the user list. Admins only."""

from typing import Annotated, Literal

from fastapi import APIRouter, Query

from app.api.deps import AdminUser, DbSession
from app.schemas.admin import AdminStats, AdminUserPage, UserSort
from app.services.admin import admin_stats, user_page

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/stats")
def stats(_admin: AdminUser, db: DbSession) -> AdminStats:
    return admin_stats(db)


@router.get("/users")
def users(
    _admin: AdminUser,
    db: DbSession,
    q: Annotated[str, Query(max_length=100)] = "",
    sort: UserSort = "last_seen",
    order: Literal["asc", "desc"] = "desc",
    page: Annotated[int, Query(ge=1)] = 1,
    per_page: Annotated[int, Query(ge=1, le=100)] = 20,
) -> AdminUserPage:
    """Search by login, name or Telegram username (or "#12" for an id)."""
    return user_page(db, q, sort, order == "desc", page, per_page)
