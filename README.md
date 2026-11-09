# NDVI Field Monitor

A field-monitoring service for farmers in Uzbekistan. The service tracks the vegetation health of each field with NDVI from Sentinel-2 satellite imagery. When NDVI drops sharply, a Telegram bot sends an alert in Uzbek.

## Features

- Draw a field boundary on a map, or send it as GeoJSON to the API.
- Find the newest Sentinel-2 L2A scene for the field with low cloud cover.
- Compute NDVI for the field. The service masks clouds with the `SCL` band and saves the result as a Cloud Optimized GeoTIFF (COG).
- Store an NDVI time series for each field and show it as a chart.
- Update all fields every day and detect a sharp NDVI drop.
- Send the drop alert to the Telegram account of the field's owner.

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
| `db` | PostGIS image | Stores users, sessions, fields, NDVI observations, and alerts. |
| `api` | `uvicorn app.main:app` | REST API. |
| `scheduler` | `python -m app.scheduler` | Daily NDVI update and drop detection. Sends the alerts. |
| `bot` | `python -m app.bot` | Telegram login, account linking, and `/fields`. |

The frontend runs on your computer with `npm run dev`.

### Daily update

1. The scheduler starts at `SCHEDULER_HOUR:SCHEDULER_MINUTE` in `SCHEDULER_TIMEZONE`.
2. For each field, it searches for scenes after the last observation. A field without observations is searched `SCHEDULER_LOOKBACK_DAYS` back.
3. It computes NDVI for the newest clear scene and stores the observation.
4. It compares the new mean NDVI with the previous observation. If the drop is `NDVI_DROP_THRESHOLD` or more, it creates an alert.
5. It sends all unsent alerts to the Telegram account of each field's owner.

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

Open http://localhost:3000. The home page explains NDVI in simple Uzbek. The map app is at http://localhost:3000/monitoring.

1. Click **Yangi maydon chizish** and click the corners of the field on the map.
2. Type a name and click **Saqlash**.
3. Click **NDVI hisoblash (30 kun)** to compute NDVI for the newest clear scene.
4. Click **Mavsum tarixini yuklash** to fill the chart from 1 March. This job runs in the background for 1–3 minutes.
5. Click a point on the chart to show the NDVI map of that date.

If the API does not run on `http://localhost:8000`, copy `frontend/.env.example` to `frontend/.env.local` and change `NEXT_PUBLIC_API_URL`. Add the frontend address to `CORS_ORIGINS` in `.env`.

## Accounts

Each user sees only their own fields. Another user's field gives `404`.

A user signs in on `/login` in one of two ways:

- **Username and password.** Registration is open. The username has 3–32 characters: `a–z`, `0–9`, `_`, `.`. The password has at least 8 characters. The API stores a salted scrypt hash.
- **Telegram.** The browser opens `https://t.me/<bot>?start=login_<code>`. The user taps "Start", and the bot confirms the login. The browser polls `POST /auth/telegram/poll` with a secret `poll_token` and gets the session. The code is valid for `TELEGRAM_CODE_MINUTES` and works once.

A login gives a session token. The frontend keeps it in `localStorage` and sends `Authorization: Bearer <token>`. The API stores only the SHA-256 hash of the token. A session lasts `SESSION_DAYS`.

The first registered user gets all fields that existed before accounts (fields without an owner).

## Telegram bot

1. Set `TELEGRAM_BOT_TOKEN` in `.env`.
2. Run `docker compose up -d bot`.

Each user has one Telegram account. The alerts for all fields of the user go to its private chat with the bot.

- A user who signed in with Telegram already has it. Nothing else is necessary.
- A user with a username and password clicks **Telegramni ulash** in the account card, and then taps "Start" in Telegram. The button opens a one-time link `https://t.me/<bot>?start=link_<code>`. After that, "Telegram orqali kirish" opens the same account.
- **Uzish** removes the Telegram account. It is not available for a Telegram-only account, because that account has no other way to sign in.
- One Telegram account belongs to one website account only. The bot refuses a link to a second account.

The API gets the bot username from Telegram (`GET /telegram/bot`). If the token is empty or Telegram is unreachable, the frontend hides the Telegram buttons.

| Command | Result |
|---|---|
| `/start` | Shows the help text. |
| `/start login_<code>` | Confirms a website login. The login page sends it. |
| `/start link_<code>` | Binds this Telegram account to the website account. **Telegramni ulash** sends it. |
| `/fields` | Lists the fields of the account with the latest NDVI. |

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
| `SESSION_DAYS` | `30` | Lifetime of a login session. |
| `TELEGRAM_CODE_MINUTES` | `10` | Lifetime of a Telegram login or link code. |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated browser origins that can call the API. |

## API

All endpoints except `/health`, `/auth/register`, `/auth/login`, `/auth/telegram/*`, and `/telegram/bot` need `Authorization: Bearer <token>`. Without it, the API returns `401`.

| Method | Path | Result |
|---|---|---|
| `GET` | `/health` | API and database status. HTTP 503 if the database is down. |
| `POST` | `/auth/register` | Creates an account and signs in (201). Returns `token` and `user`. `409` if the username is taken. |
| `POST` | `/auth/login` | Signs in with a username and password. `401` if they are wrong. |
| `POST` | `/auth/logout` | Ends the current session (204). |
| `GET` | `/auth/me` | Returns the signed-in user. |
| `POST` | `/auth/telegram/start` | Starts a Telegram login. Returns the t.me `url` and a `poll_token`. `503` without a bot. |
| `POST` | `/auth/telegram/poll` | Returns `pending`, or `confirmed` with a session once. `410` when the code expired. |
| `POST` | `/auth/telegram/link` | Returns a one-time t.me `url` that binds a Telegram account to the signed-in user. |
| `DELETE` | `/auth/telegram` | Removes the Telegram account (204). `409` for a Telegram-only account. |
| `POST` | `/fields` | Creates a field for the signed-in user. Returns a GeoJSON Feature (201). |
| `GET` | `/fields` | Returns the user's fields as a GeoJSON FeatureCollection. |
| `GET` | `/fields/{id}` | Returns one field. |
| `PATCH` | `/fields/{id}` | Changes `name` and/or `geometry`. |
| `DELETE` | `/fields/{id}` | Deletes a field and its observations (204). |
| `GET` | `/fields/{id}/scenes/best?start=&end=` | Returns the newest usable Sentinel-2 scene. |
| `POST` | `/fields/{id}/ndvi?start=&end=` | Computes NDVI for the newest clear scene, saves a COG, and stores the observation. |
| `GET` | `/fields/{id}/ndvi?start=&end=` | Returns the NDVI time series. `start` and `end` are optional. |
| `POST` | `/fields/{id}/ndvi/backfill?start=&end=` | Fills the history in the background (202). |
| `GET` | `/observations/{id}/image` | Returns the PNG URL and its lon/lat bounds. |
| `GET` | `/observations/{id}/image.png` | Returns the NDVI map as a colored PNG. |
| `GET` | `/telegram/bot` | Returns the bot username for the deep link, or `null`. |

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
  api/           FastAPI routers: auth, fields, ndvi, observations, telegram, health
  bot/           Telegram bot: commands, login confirmation, Uzbek messages, alert delivery
  models/        SQLAlchemy models: User, AuthSession, TelegramToken, Field, NdviObservation, Alert
  schemas/       Pydantic request and response models
  services/      auth (passwords, sessions, Telegram codes), stac (scene search), ndvi (computation),
                 history, alerts, render (PNG)
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
- **No login rate limit.** The API does not limit failed password attempts. Put a rate limit in the reverse proxy for production.
- **Token in localStorage.** A script that runs on the page (XSS) can read the session token. An HttpOnly cookie is safer, but it needs the frontend and the API on the same site.
- **No password reset.** A user who forgets the password and has no linked Telegram account cannot sign in.
- **Old files stay.** When you delete a field, its COG files stay in `data/`.
- **Alert delivery.** An alert is marked as sent after one delivery attempt, also if Telegram fails. An alert of an owner without Telegram is also marked as sent, so linking Telegram later does not send old alerts.
- **Map tiles.** The OpenStreetMap and Esri World Imagery tiles are for development only. For production, use a tile provider with a license for your use.
- **No pagination.** `GET /fields` returns all fields.
