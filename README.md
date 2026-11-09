# NDVI Field Monitor

A field-monitoring service for farmers in Uzbekistan. The service computes NDVI from Sentinel-2 imagery for each field.

Status: Milestone 4 (NDVI for one date). The full README comes in Milestone 9.

## Requirements

- [uv](https://docs.astral.sh/uv/)
- Docker with Docker Compose

## Setup

1. Copy `.env.example` to `.env`.
2. Change `POSTGRES_PASSWORD` in `.env`. Use the same password in `DATABASE_URL`.
3. Run `uv sync`. This command creates `.venv` and `uv.lock`.
4. Commit `uv.lock`. The Docker build needs this file.

If port 5432 is in use on your computer, set `POSTGRES_HOST_PORT` in `.env` to a free port. Use the same port in `TEST_DATABASE_URL`.

## Run the service

```
docker compose up --build
docker compose exec api alembic upgrade head
```

The second command applies the database migrations. Run it again after each new migration.

- Health check: http://localhost:8000/health
- API docs (Swagger UI): http://localhost:8000/docs

If the database is down, `/health` returns HTTP 503.

## Run the tests

```
uv run pytest
```

- The validation tests and the `/health` tests do not need a database.
- The CRUD tests need the `db` container and `TEST_DATABASE_URL` in `.env`. The tests create the `ndvi_test` database and apply the migrations. If `TEST_DATABASE_URL` is not set, pytest skips these tests.

## API

| Method | Path | Result |
|---|---|---|
| `POST` | `/fields` | Creates a field. Returns a GeoJSON Feature (201). |
| `GET` | `/fields` | Returns all fields as a GeoJSON FeatureCollection. |
| `GET` | `/fields/{id}` | Returns one field, or 404. |
| `PATCH` | `/fields/{id}` | Changes `name` and/or `geometry`. |
| `DELETE` | `/fields/{id}` | Deletes a field (204). |
| `GET` | `/fields/{id}/scenes/best?start=YYYY-MM-DD&end=YYYY-MM-DD` | Returns the newest Sentinel-2 scene for the field, or 404. |
| `POST` | `/fields/{id}/ndvi?start=YYYY-MM-DD&end=YYYY-MM-DD` | Computes NDVI for the newest clear scene and saves a COG. Returns the statistics, or 404. |

Request body for `POST /fields`. GeoJSON uses the order `[longitude, latitude]`:

```json
{
  "name": "Paxta-1",
  "geometry": {
    "type": "Polygon",
    "coordinates": [[[69.20, 41.30], [69.21, 41.30], [69.21, 41.31], [69.20, 41.31], [69.20, 41.30]]]
  }
}
```

## Satellite data

The service searches Sentinel-2 L2A scenes in the Microsoft Planetary Computer STAC API. No account is necessary.

A scene is a candidate when all of these conditions are true:

- The scene cloud cover is `MAX_CLOUD_COVER` percent or less (default: 20).
- The scene footprint covers the full field.
- The scene has the `B04`, `B08`, and `SCL` assets.

From the candidates, the service picks the newest scene.

The cloud cover value applies to the full tile (about 110 × 110 km), not to the field. The NDVI step checks the clouds over the field with the `SCL` band.

## NDVI

`NDVI = (B08 - B04) / (B08 + B04)`

1. The service reads only the area around the field from the COG files over HTTPS.
2. It removes the `+1000` offset from the pixel values. All data from processing baseline 04.00 (January 2022) and later has this offset.
3. It keeps a pixel only if the pixel is inside the field and its `SCL` class is 4 (vegetation), 5 (bare soil), or 6 (water).
4. If less than `MIN_CLEAR_FRACTION` of the field is clear (default: 0.8), the service tries the next older scene. It tries at most 5 scenes.
5. The service saves the result as a float32 COG in `data/ndvi/{field_id}/{date}_{scene_id}.tif`. The value is `NaN` outside the field and under clouds.
