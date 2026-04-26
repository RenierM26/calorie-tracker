# Calorie Tracker — Maintainer Notes

This document explains the app structure and how to safely change/redeploy it.

## 1) What this app is

A Dockerized web app for:

- logging meals (date/time/type/description/tags/kg/calories)
- logging daily weight
- graphing calories/weight trends over selectable date ranges
- browsing/editing meal history in a journal view

It is currently served behind reverse proxy at:

- `http://localhost:8092`

---

## 2) Project structure

```text
calorie-tracker/
├─ Dockerfile
├─ docker-compose.yml
├─ package.json
├─ package-lock.json
├─ server.js                 # Express + SQLite API + static hosting
├─ public/
│  ├─ index.html             # Dashboard (entry forms + summary + charts)
│  └─ journal.html           # Journal/history page with filters + edit/delete
└─ MAINTAINER.md             # This file
```

---

## 3) Backend architecture

- Runtime: Node 22 + Express
- DB: SQLite (`node:sqlite` / `DatabaseSync`)
- DB path in container: `/app/data/tracker.db`
- Data persistence: Docker volume `calorie_tracker_data`

### Tables

#### `meals`

- `id` TEXT PK
- `date` TEXT (`YYYY-MM-DD`)
- `time` TEXT (`HH:MM`, optional)
- `type` TEXT (`Breakfast|Lunch|Dinner|Snack|Drink`)
- `description` TEXT
- `tags` TEXT (comma-separated free text)
- `kg` REAL
- `calories` INTEGER
- `created_at` TEXT

#### `weights`

- `id` TEXT PK
- `date` TEXT UNIQUE (`YYYY-MM-DD`)
- `value` REAL
- `created_at` TEXT
- `updated_at` TEXT

### Schema migration behavior

On startup, backend runs `CREATE TABLE IF NOT EXISTS` and adds missing `meals.tags` via:

- `PRAGMA table_info(meals)`
- `ALTER TABLE meals ADD COLUMN tags TEXT` (if missing)

---

## 4) API reference

### Health

- `GET /api/health` → `{ ok: true }`

### Export
- `GET /api/export` → JSON export with `exportedAt`, `schemaVersion`, `meals`, and `weights`

### Meals

- `GET /api/meals?limit=2000`
- `POST /api/meals`
- `PUT /api/meals/:id`
- `DELETE /api/meals/:id`

Meal payload:

```json
{
  "id": "uuid-or-generated-id",
  "date": "2026-03-07",
  "time": "18:30",
  "type": "Dinner",
  "description": "Chicken salad",
  "tags": "starter,protein",
  "kg": 0.35,
  "calories": 420
}
```

### Weights

- `GET /api/weights?limit=2000`
- `POST /api/weights`
- `PUT /api/weights/:id`
- `DELETE /api/weights/:id`

Weight payload:

```json
{
  "id": "uuid-or-generated-id",
  "date": "2026-03-07",
  "value": 72.4
}
```

### Assistant-friendly logging

- `POST /api/log`

Payload:

```json
{ "kind": "meal", "payload": { ...mealPayload } }
```

or

```json
{ "kind": "weight", "payload": { ...weightPayload } }
```

### Optional auth

If `API_TOKEN` env var is set, write routes require header:

- `x-api-token: <token>`

Protected routes:

- `POST /api/meals`, `PUT /api/meals/:id`, `DELETE /api/meals/:id`
- `POST /api/weights`, `PUT /api/weights/:id`, `DELETE /api/weights/:id`
- `POST /api/log`

---

## 5) Frontend behavior

## `public/index.html` (dashboard)

- Add meal / add weight forms
- Summary cards
- Chart.js visualizations:
  - daily calories + weight line chart
  - calories-by-meal-type donut chart
- Date-range selection:
  - presets: 7/14/30/90 days
  - custom start/end
- Quick edit/delete on recent meals and recent weights

## `public/journal.html`

- Full meal history view
- Filters:
  - from date
  - to date
  - type
  - text search (description + tags)
- Edit/delete meals inline (via API)

### ID generation note

For broader browser compatibility on plain HTTP, frontend uses fallback ID generator if `crypto.randomUUID()` is unavailable.

---

## 6) Docker + networking

Container name:

- `calorie-tracker`

Port mapping:

- host `8092` -> container `8080`

Persistent DB volume:

- `calorie_tracker_data:/app/data`

### Important: reverse proxy connectivity

Because reverse proxy proxies by container DNS name (`calorie-tracker:8080`), app must be attached to network:

- `infra_proxy`

If app is recreated with plain `docker run`, it may come up without `infra_proxy` and reverse proxy will return 502 (`lookup calorie-tracker ... no such host`).

Fix:

```bash
docker network connect infra_proxy calorie-tracker
```

---

## 7) Safe redeploy procedure

From `calorie-tracker/`:

```bash
docker rm -f calorie-tracker >/dev/null 2>&1 || true
docker build -t calorie-tracker:latest .
docker run -d --name calorie-tracker --restart unless-stopped \
  -p 8092:8080 \
  -v calorie_tracker_data:/app/data \
  calorie-tracker:latest
docker network connect infra_proxy calorie-tracker 2>/dev/null || true
```

Quick checks:

```bash
docker ps --filter name=calorie-tracker
docker logs --tail 50 calorie-tracker
docker exec <proxy-container> sh -lc 'curl -s -o /dev/null -w "%{http_code}\n" -H "Host: your-tracker.example.com" http://<reverse-proxy>/'
```

Expect `200` for last command.

---

## 8) Common issues + fixes

### A) Page not loading behind reverse proxy

- Symptom: browser says page unavailable / 502
- Cause: container not on `infra_proxy`
- Fix: connect network (`docker network connect infra_proxy calorie-tracker`)

### B) 403 forbidden (older nginx version)

- Cause: restrictive file permissions in image
- Current Node version avoids this path.

### C) Save button appears to do nothing on HTTP

- Cause: `crypto.randomUUID()` unavailable in some contexts
- Fix already implemented with fallback ID generator.

---

## 9) Suggested future improvements

- Add authentication/session login for multi-user privacy
- Add CSV export/import and PDF weekly summary
- Add audit trail for edits/deletes
- Add meal templates and frequent items
- Add category for liquids/sugar-specific insights
- Add HTTPS route for `your-tracker.example.com` (cert + TLS block)

---

## 10) Backup guidance

Back up the persistent `/app/data` volume, especially `tracker.db`, before upgrades. The read-only `GET /api/export` endpoint is useful for quick human-readable exports, but the SQLite database remains the canonical backup target.

## 11) Change discipline

When editing features:

1. Update API + frontend together (if payload shape changes)
2. Keep migration-safe startup logic in `server.js`
3. Rebuild + reconnect `infra_proxy`
4. Update this file with meaningful structural changes
