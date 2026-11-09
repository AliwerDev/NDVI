# NDVI Field Monitor

A field-monitoring service for farmers in Uzbekistan. The service computes NDVI from Sentinel-2 imagery for each field.

Status: Milestone 2 (fields CRUD). The full README comes in Milestone 9.

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
