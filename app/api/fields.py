"""CRUD endpoints for fields. Input and output use GeoJSON."""

from datetime import date

from fastapi import APIRouter, HTTPException, status
from geoalchemy2 import WKBElement
from geoalchemy2.shape import from_shape, to_shape
from pystac_client.exceptions import APIError
from shapely.geometry import mapping, shape
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, DbSession
from app.config import get_settings
from app.models import Field, User
from app.services.stac import Scene, find_best_scene
from app.schemas.field import (
    FieldCreate,
    FieldFeature,
    FieldFeatureCollection,
    FieldProperties,
    FieldUpdate,
    PolygonGeometry,
)

router = APIRouter(prefix="/fields", tags=["fields"])


def _to_db_geometry(geometry: PolygonGeometry) -> WKBElement:
    """Convert a GeoJSON polygon to a PostGIS value."""
    return from_shape(shape(geometry.model_dump()), srid=4326)


def _to_feature(field: Field) -> FieldFeature:
    """Convert a Field row to a GeoJSON Feature."""
    return FieldFeature(
        id=field.id,
        geometry=PolygonGeometry.model_validate(mapping(to_shape(field.geometry))),
        properties=FieldProperties(name=field.name, created_at=field.created_at),
    )


def get_field_or_404(db: Session, field_id: int, user: User) -> Field:
    """Return the user's field. Another user's field also gives 404, so its existence stays hidden."""
    field = db.get(Field, field_id)
    if field is None or field.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Field not found")
    return field


@router.post("", status_code=status.HTTP_201_CREATED)
def create_field(body: FieldCreate, user: CurrentUser, db: DbSession) -> FieldFeature:
    """Create a field from a name and a GeoJSON Polygon."""
    field = Field(owner_id=user.id, name=body.name, geometry=_to_db_geometry(body.geometry))
    db.add(field)
    db.commit()
    # Reload the row to get values set by the database (id, created_at).
    db.refresh(field)
    return _to_feature(field)


@router.get("")
def list_fields(user: CurrentUser, db: DbSession) -> FieldFeatureCollection:
    """Return the user's fields, oldest first."""
    fields = db.scalars(select(Field).where(Field.owner_id == user.id).order_by(Field.id)).all()
    return FieldFeatureCollection(features=[_to_feature(f) for f in fields])


@router.get("/{field_id}")
def get_field(field_id: int, user: CurrentUser, db: DbSession) -> FieldFeature:
    """Return one field."""
    return _to_feature(get_field_or_404(db, field_id, user))


@router.patch("/{field_id}")
def update_field(field_id: int, body: FieldUpdate, user: CurrentUser, db: DbSession) -> FieldFeature:
    """Change the name and/or the geometry of a field."""
    field = get_field_or_404(db, field_id, user)
    if body.name is not None:
        field.name = body.name
    if body.geometry is not None:
        field.geometry = _to_db_geometry(body.geometry)
    db.commit()
    db.refresh(field)
    return _to_feature(field)


@router.delete("/{field_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_field(field_id: int, user: CurrentUser, db: DbSession) -> None:
    """Delete a field."""
    field = get_field_or_404(db, field_id, user)
    db.delete(field)
    db.commit()


@router.get("/{field_id}/scenes/best")
def get_best_scene(field_id: int, start: date, end: date, user: CurrentUser, db: DbSession) -> Scene:
    """Find the newest Sentinel-2 scene for the field with cloud cover <= MAX_CLOUD_COVER."""
    if start > end:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="start must be on or before end"
        )
    field = get_field_or_404(db, field_id, user)

    try:
        scene = find_best_scene(to_shape(field.geometry), start, end)
    except APIError as exc:
        # pystac-client raises APIError for HTTP and connection errors.
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"STAC API error: {exc}"
        ) from exc

    if scene is None:
        max_cloud = get_settings().max_cloud_cover
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No scene with cloud cover <= {max_cloud}% covers this field between {start} and {end}",
        )
    return scene
