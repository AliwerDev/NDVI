"""Pydantic schemas for fields: GeoJSON input and output."""

from datetime import datetime
from typing import Annotated, Literal, Self

from pydantic import BaseModel, StringConstraints, model_validator
from shapely.geometry import shape
from shapely.validation import explain_validity

# GeoJSON order is (longitude, latitude), not (lat, lon).
Position = tuple[float, float]

FieldName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class PolygonGeometry(BaseModel):
    """GeoJSON Polygon in WGS 84. The first ring is the outer boundary, other rings are holes."""

    type: Literal["Polygon"]
    coordinates: list[list[Position]]

    @model_validator(mode="after")
    def check_polygon(self) -> Self:
        if not self.coordinates:
            raise ValueError("Polygon must have at least one ring")
        for ring in self.coordinates:
            if len(ring) < 4:
                raise ValueError("Each ring must have at least 4 positions")
            if ring[0] != ring[-1]:
                raise ValueError("Each ring must be closed: the first and last positions must be equal")
            for lon, lat in ring:
                if not (-180 <= lon <= 180 and -90 <= lat <= 90):
                    raise ValueError(f"Position ({lon}, {lat}) is out of range. Use [longitude, latitude]")

        polygon = shape(self.model_dump())
        if not polygon.is_valid:
            raise ValueError(f"Invalid polygon: {explain_validity(polygon)}")
        return self


class FieldCreate(BaseModel):
    """Request body for POST /fields."""

    name: FieldName
    geometry: PolygonGeometry


class FieldUpdate(BaseModel):
    """Request body for PATCH /fields/{id}. Omitted or null values stay unchanged."""

    name: FieldName | None = None
    geometry: PolygonGeometry | None = None


class FieldProperties(BaseModel):
    name: str
    created_at: datetime


class FieldFeature(BaseModel):
    """One field as a GeoJSON Feature."""

    type: Literal["Feature"] = "Feature"
    id: int
    geometry: PolygonGeometry
    properties: FieldProperties


class FieldFeatureCollection(BaseModel):
    """A list of fields as a GeoJSON FeatureCollection."""

    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[FieldFeature]
