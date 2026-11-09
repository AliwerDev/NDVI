# NDVI Field Monitor

A field-monitoring service for farmers in Uzbekistan. The service tracks the vegetation health of each field with NDVI from Sentinel-2 satellite imagery. When NDVI drops sharply, a Telegram bot sends an alert in Uzbek.

## Features

- Draw a field boundary on a map, or send it as GeoJSON to the API.
- Find the newest Sentinel-2 L2A scene for the field with low cloud cover.
- Compute NDVI for the field. The service masks clouds with the `SCL` band and saves the result as a Cloud Optimized GeoTIFF (COG).
- Store an NDVI time series for each field and show it as a chart.
- Update all fields every day and detect a sharp NDVI drop.
- Send the drop alert to the Telegram chats that are linked to the field.

## Architecture

```
                 ┌───────────────────────────┐
                 │ Frontend (Next.js +       │
  Browser ──────▶│ MapLibre GL), port 3000   │
                 └─────────────┬─────────────┘
                               │ HTTP (JSON, PNG)
                 ┌─────────────▼─────────────┐      ┌──────────────────────────┐
                 │ API (FastAPI), port 8000  │─────▶│ Planetary Computer       │
                 │  - fields CRUD            │ STAC │ STAC API + COG files     │
                 │  - NDVI, history, images  │◀─────│ (Sentinel-2 L2A)         │
                 └──────┬──────────────┬─────┘      └────────────▲─────────────┘
                        │              │                         │
                        │ SQL          │ files                   │ STAC + COG
                 ┌──────▼──────┐  ┌────▼──────────┐   ┌─────────┴──────────────┐
                 │ PostgreSQL  │  │ data/ndvi/    │◀──│ Scheduler (APScheduler)│
                 │ + PostGIS   │◀─│ NDVI COG files│   │ every day at 07:00     │
                 └──────▲──────┘  └───────────────┘   └─────────┬──────────────┘
                        │                                       │ alerts
                        │ SQL                         ┌─────────▼──────────────┐
                        └─────────────────────────────│ Telegram bot (aiogram) │──▶ Telegram
                                                      └────────────────────────┘
```

The Docker Compose file starts four services:

| Service | Command | Purpose |
|---|---|---|
| `db` | PostGIS image | Stores fields, NDVI observations, alerts, and Telegram links. |
| `api` | `uvicorn app.main:app` | REST API. |
| `scheduler` | `python -m app.scheduler` | Daily NDVI update and drop detection. Sends the alerts. |
| `bot` | `python -m app.bot` | Telegram commands: `/start`, `/link`, `/unlink`, `/fields`. |

The frontend runs on your computer with `npm run dev`.

### Daily update

1. The scheduler starts at `SCHEDULER_HOUR:SCHEDULER_MINUTE` in `SCHEDULER_TIMEZONE`.
2. For each field, it searches for scenes after the last observation. A field without observations is searched `SCHEDULER_LOOKBACK_DAYS` back.
3. It computes NDVI for the newest clear scene and stores the observation.
4. It compares the new mean NDVI with the previous observation. If the drop is `NDVI_DROP_THRESHOLD` or more, it creates an alert.
5. It sends all unsent alerts to the linked Telegram chats.

## Requirements

- [uv](https://docs.astral.sh/uv/)
- Docker with Docker Compose
- Node.js 20.9 or later (for the frontend)

## Setup

1. Copy `.env.example` to `.env`.
2. Change `POSTGRES_PASSWORD` in `.env`. Use the same password in `DATABASE_URL` and `TEST_DATABASE_URL`.
3. If port 5432 is in use on your computer, set `POSTGRES_HOST_PORT` to a free port. Use the same port in `TEST_DATABASE_URL`.
4. Run `uv sync`. This command creates `.venv`.
5. Optional: to enable Telegram, get a bot token from [@BotFather](https://t.me/BotFather) and set `TELEGRAM_BOT_TOKEN`.

## Run the backend

```
docker compose up --build -d
docker compose exec api alembic upgrade head
```

The second command applies the database migrations. Run it again after each new migration.

- API docs (Swagger UI): http://localhost:8000/docs
- Health check: http://localhost:8000/health

To run the daily update one time now:

```
docker compose exec scheduler python -m app.scheduler --once
```

To read the logs of a service:

```
docker compose logs -f scheduler
```

## Run the frontend

```
cd frontend
npm install
npm run dev
```

Open http://localhost:3000.

1. Click **Yangi maydon chizish** and click the corners of the field on the map.
2. Type a name and click **Saqlash**.
3. Click **NDVI hisoblash (30 kun)** to compute NDVI for the newest clear scene.
4. Click **Mavsum tarixini yuklash** to fill the chart from 1 March. This job runs in the background for 1–3 minutes.
5. Click a point on the chart to show the NDVI map of that date.

If the API does not run on `http://localhost:8000`, copy `frontend/.env.example` to `frontend/.env.local` and change `NEXT_PUBLIC_API_URL`. Add the frontend address to `CORS_ORIGINS` in `.env`.

## Telegram bot

1. Set `TELEGRAM_BOT_TOKEN` in `.env`.
2. Run `docker compose up -d bot`.
3. In Telegram, send `/start` to the bot.
4. Send `/link 3` to receive alerts for field 3. The frontend shows the field number.

| Command | Result |
|---|---|
| `/start` | Shows the help text. |
| `/link <id>` | Links the chat to the field. |
| `/unlink <id>` | Removes the link. |
| `/fields` | Lists the linked fields with the latest NDVI. |

If `TELEGRAM_BOT_TOKEN` is empty, the `bot` service stops at start, and alerts stay in the database as unsent.

## Configuration

All settings come from `.env`. See `.env.example` for the full list.

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | – | Database for the services. The host is `db` inside Docker. |
| `TEST_DATABASE_URL` | – | Database for pytest. If it is empty, pytest skips the database tests. |
| `STAC_API_URL` | Planetary Computer | STAC API for Sentinel-2 scenes. |
| `MAX_CLOUD_COVER` | `20` | Maximum scene cloud cover in percent (full tile). |
| `MIN_CLEAR_FRACTION` | `0.8` | Minimum share of clear field pixels (0–1). |
| `DATA_DIR` | `data` | Folder for the NDVI COG files. |
| `NDVI_DROP_THRESHOLD` | `0.15` | Alert threshold for the mean NDVI drop (absolute). |
| `SCHEDULER_TIMEZONE` | `Asia/Tashkent` | Time zone of the daily job. |
| `SCHEDULER_HOUR`, `SCHEDULER_MINUTE` | `7`, `0` | Time of the daily job. |
| `SCHEDULER_LOOKBACK_DAYS` | `10` | Search period for a field without observations. |
| `TELEGRAM_BOT_TOKEN` | empty | Bot token. Empty disables Telegram. |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated browser origins that can call the API. |

## API

| Method | Path | Result |
|---|---|---|
| `GET` | `/health` | API and database status. HTTP 503 if the database is down. |
| `POST` | `/fields` | Creates a field. Returns a GeoJSON Feature (201). |
| `GET` | `/fields` | Returns all fields as a GeoJSON FeatureCollection. |
| `GET` | `/fields/{id}` | Returns one field. |
| `PATCH` | `/fields/{id}` | Changes `name` and/or `geometry`. |
| `DELETE` | `/fields/{id}` | Deletes a field and its observations (204). |
| `GET` | `/fields/{id}/scenes/best?start=&end=` | Returns the newest usable Sentinel-2 scene. |
| `POST` | `/fields/{id}/ndvi?start=&end=` | Computes NDVI for the newest clear scene, saves a COG, and stores the observation. |
| `GET` | `/fields/{id}/ndvi?start=&end=` | Returns the NDVI time series. `start` and `end` are optional. |
| `POST` | `/fields/{id}/ndvi/backfill?start=&end=` | Fills the history in the background (202). |
| `GET` | `/observations/{id}/image` | Returns the PNG URL and its lon/lat bounds. |
| `GET` | `/observations/{id}/image.png` | Returns the NDVI map as a colored PNG. |

Dates use the format `YYYY-MM-DD`. Request body for `POST /fields`. GeoJSON uses the order `[longitude, latitude]`:

```json
{
  "name": "Paxta-1",
  "geometry": {
    "type": "Polygon",
    "coordinates": [[[69.20, 41.30], [69.21, 41.30], [69.21, 41.31], [69.20, 41.31], [69.20, 41.30]]]
  }
}
```

## How NDVI is computed

`NDVI = (B08 - B04) / (B08 + B04)`

1. The service searches the Planetary Computer STAC API. A scene is a candidate if:
   - the tile cloud cover is `MAX_CLOUD_COVER` or less;
   - the scene covers the full field;
   - the scene has the `B04`, `B08`, and `SCL` assets.
2. The service signs the asset URLs and reads only the area around the field from the COG files.
3. It reprojects the field polygon from lon/lat to the UTM projection of the scene.
4. It resamples `SCL` from 20 m to 10 m with the nearest-neighbor method.
5. It removes the `+1000` offset from the pixel values. All data from processing baseline 04.00 (January 2022) and later has this offset.
6. It keeps a pixel only if:
   - the pixel is inside the field;
   - the `SCL` class is 4 (vegetation), 5 (bare soil), or 6 (water);
   - the reflectance values are positive.
7. If less than `MIN_CLEAR_FRACTION` of the field is clear, the service tries the next older scene, up to 5 scenes.
8. The service saves a float32 COG in `data/ndvi/{field_id}/{date}_{scene_id}.tif`. The value is `NaN` outside the field and under clouds.

## Tests

```
uv run pytest
```

- The tests do not use the network. They use small synthetic GeoTIFF files, fake STAC items, and fake Telegram delivery.
- The database tests need the `db` container and `TEST_DATABASE_URL`. The tests create the `ndvi_test` database and apply the migrations. Each test runs in a transaction that is rolled back.
- GitHub Actions runs the Python tests with a PostGIS service container and builds the frontend.

## Project structure

```
app/
  api/           FastAPI routers: fields, ndvi, observations, health
  bot/           Telegram bot: commands, Uzbek messages, alert delivery
  models/        SQLAlchemy models: Field, NdviObservation, Alert, TelegramSubscription
  schemas/       Pydantic request and response models
  services/      stac (scene search), ndvi (computation), history, alerts, render (PNG)
  config.py      Settings from .env
  db.py          Database engine and session
  main.py        FastAPI app
  scheduler.py   Daily update job
alembic/         Database migrations
frontend/        Next.js + MapLibre GL web app
tests/           pytest tests
data/            NDVI COG files (not in git)
```

## Known limitations

- **Tile cloud cover.** The STAC filter uses the cloud cover of the full 110 × 110 km tile. A clear tile can have clouds over the field, and a cloudy tile can be clear over the field. The `SCL` check catches the first case, but the second case causes missed scenes.
- **SCL quality.** The `SCL` mask misses some thin clouds, haze, and cloud edges. These pixels can lower the mean NDVI and cause a false alert.
- **One scene per update.** The daily job uses only the newest clear scene since the last observation. If several days pass, the intermediate scenes are skipped. The job compares with the last stored observation, even if that observation is old. A long gap can give an alert for a normal seasonal change.
- **Small fields.** A field smaller than one 10 m pixel has no pixels and never gets NDVI.
- **Speed.** One NDVI request reads three bands over HTTPS and takes a few seconds. With five cloudy scenes, the request can take 20–30 seconds. A backfill reads at most 40 scenes.
- **Planetary Computer limits.** The API limits are not published. Many fields in one run can hit a rate limit. Without `PC_SDK_SUBSCRIPTION_KEY`, the token limits are lower.
- **No access control.** The API has no authentication. Any chat can send `/link <id>` for any field.
- **Old files stay.** When you delete a field, its COG files stay in `data/`.
- **Alert delivery.** An alert is marked as sent after one delivery attempt, also if Telegram fails for some chats.
- **Map tiles.** The OpenStreetMap and Esri World Imagery tiles are for development only. For production, use a tile provider with a license for your use.
- **No pagination.** `GET /fields` returns all fields.
