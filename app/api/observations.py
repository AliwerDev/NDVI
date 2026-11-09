"""NDVI map image for one observation: a PNG and its lon/lat bounds."""

from pathlib import Path

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.fields import DbSession
from app.models import NdviObservation
from app.services.render import image_bounds, render_png

router = APIRouter(prefix="/observations", tags=["ndvi"])


class ObservationImage(BaseModel):
    """Where to get the PNG and where to put it on the map."""

    url: str
    # [west, south, east, north] in longitude/latitude
    bounds: tuple[float, float, float, float]


def _cog_path_or_404(db: Session, observation_id: int) -> Path:
    observation = db.get(NdviObservation, observation_id)
    if observation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Observation not found")
    path = Path(observation.cog_path)
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NDVI file not found")
    return path


@router.get("/{observation_id}/image")
def get_observation_image(observation_id: int, db: DbSession) -> ObservationImage:
    """Return the PNG URL and its bounds for a MapLibre image source."""
    path = _cog_path_or_404(db, observation_id)
    return ObservationImage(url=f"/observations/{observation_id}/image.png", bounds=image_bounds(path))


@router.get(
    "/{observation_id}/image.png",
    response_class=Response,
    responses={200: {"content": {"image/png": {}}}},
)
def get_observation_png(observation_id: int, db: DbSession) -> Response:
    """Return the NDVI of the observation as a colored PNG in Web Mercator."""
    path = _cog_path_or_404(db, observation_id)
    return Response(content=render_png(path), media_type="image/png")
