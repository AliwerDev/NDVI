"""CRUD endpoints for fields. Input and output use GeoJSON."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from geoalchemy2 import WKBElement
from geoalchemy2.shape import from_shape, to_shape
from shapely.geometry import mapping, shape
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Field
from app.schemas.field import (
    FieldCreate,
    FieldFeature,
    FieldFeatureCollection,
    FieldProperties,
    FieldUpdate,
    PolygonGeometry,
)

router = APIRouter(prefix="/fields", tags=["fields"])

DbSession = Annotated[Session, Depends(get_db)]


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


def _get_field_or_404(db: Session, field_id: int) -> Field:
    field = db.get(Field, field_id)
    if field is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Field not found")
    return field


@router.post("", status_code=status.HTTP_201_CREATED)
def create_field(body: FieldCreate, db: DbSession) -> FieldFeature:
    """Create a field from a name and a GeoJSON Polygon."""
    field = Field(name=body.name, geometry=_to_db_geometry(body.geometry))
    db.add(field)
    db.commit()
    # Reload the row to get values set by the database (id, created_at).
    db.refresh(field)
    return _to_feature(field)


@router.get("")
def list_fields(db: DbSession) -> FieldFeatureCollection:
    """Return all fields, oldest first."""
    fields = db.scalars(select(Field).order_by(Field.id)).all()
    return FieldFeatureCollection(features=[_to_feature(f) for f in fields])


@router.get("/{field_id}")
def get_field(field_id: int, db: DbSession) -> FieldFeature:
    """Return one field."""
    return _to_feature(_get_field_or_404(db, field_id))


@router.patch("/{field_id}")
def update_field(field_id: int, body: FieldUpdate, db: DbSession) -> FieldFeature:
    """Change the name and/or the geometry of a field."""
    field = _get_field_or_404(db, field_id)
    if body.name is not None:
        field.name = body.name
    if body.geometry is not None:
        field.geometry = _to_db_geometry(body.geometry)
    db.commit()
    db.refresh(field)
    return _to_feature(field)


@router.delete("/{field_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_field(field_id: int, db: DbSession) -> None:
    """Delete a field."""
    field = _get_field_or_404(db, field_id)
    db.delete(field)
    db.commit()
