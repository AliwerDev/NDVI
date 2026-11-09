# NDVI Field Monitor

A field-monitoring service for farmers in Uzbekistan. The service computes NDVI from Sentinel-2 imagery for each field.

Status: Milestone 1 (project skeleton). The full README comes in Milestone 9.

## Requirements

- [uv](https://docs.astral.sh/uv/)
- Docker with Docker Compose

## Setup

1. Copy `.env.example` to `.env`.
2. Change `POSTGRES_PASSWORD` in `.env`. Use the same password in `DATABASE_URL`.
3. Run `uv sync`. This command creates `.venv` and `uv.lock`.
4. Commit `uv.lock`. The Docker build needs this file.

## Run the tests

```
uv run pytest
```

The tests do not need a database.

## Run the service

```
docker compose up --build
```

- Health check: http://localhost:8000/health
- API docs (Swagger UI): http://localhost:8000/docs

If the database is down, `/health` returns HTTP 503.
