"""Map images for one observation: NDVI colors or true color (RGB), as a PNG and its lon/lat bounds."""

from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException, Response, status
from geoalchemy2.shape import to_shape
from pydantic import BaseModel
from pystac_client.exceptions import APIError
from rasterio.errors import RasterioIOError
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, DbSession
from app.models import Field, NdviObservation, User
from app.services.render import image_bounds, render_png, render_rgb_png
from app.services.rgb import SceneNotFoundError, ensure_rgb_cog

router = APIRouter(prefix="/observations", tags=["ndvi"])

Layer = Literal["ndvi", "rgb"]


class ObservationImage(BaseModel):
    """Where to get the PNG and where to put it on the map."""

    url: str
    # [west, south, east, north] in longitude/latitude
    bounds: tuple[float, float, float, float]


def _cog_path_or_404(db: Session, observation_id: int, user: User, layer: Layer) -> Path:
    """Return the COG of the layer. The RGB COG is made from the scene on first use."""
    observation = db.get(NdviObservation, observation_id)
    field = db.get(Field, observation.field_id) if observation is not None else None
    if observation is None or field is None or field.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Observation not found")

    if layer == "ndvi":
        path = Path(observation.cog_path)
        if not path.exists():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NDVI file not found")
        return path

    try:
        return ensure_rgb_cog(observation.cog_path, observation.scene_id, to_shape(field.geometry))
    except SceneNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except APIError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"STAC API error: {exc}") from exc
    except RasterioIOError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Could not read satellite data: {exc}"
        ) from exc


@router.get("/{observation_id}/image")
def get_observation_image(
    observation_id: int, user: CurrentUser, db: DbSession, layer: Layer = "ndvi"
) -> ObservationImage:
    """Return the PNG URL and its bounds for a MapLibre image source.

    The first RGB request reads the scene from Planetary Computer and takes a few seconds.
    """
    path = _cog_path_or_404(db, observation_id, user, layer)
    url = f"/observations/{observation_id}/image.png" + ("?layer=rgb" if layer == "rgb" else "")
    return ObservationImage(url=url, bounds=image_bounds(path))


@router.get(
    "/{observation_id}/image.png",
    response_class=Response,
    responses={200: {"content": {"image/png": {}}}},
)
def get_observation_png(observation_id: int, user: CurrentUser, db: DbSession, layer: Layer = "ndvi") -> Response:
    """Return the observation as a PNG in Web Mercator: NDVI colors or true color.

    MapLibre sends the Authorization header through transformRequest in the frontend.
    """
    path = _cog_path_or_404(db, observation_id, user, layer)
    png = render_rgb_png(path) if layer == "rgb" else render_png(path)
    return Response(content=png, media_type="image/png")
