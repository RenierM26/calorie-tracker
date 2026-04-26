# Deployment Guide

This guide covers a practical self-hosted Docker/Compose deployment for Calorie Tracker.

## Image tags

Release images are published to GHCR:

```text
ghcr.io/renierm26/calorie-tracker
```

Recommended tags:

- `latest` — latest stable GitHub Release.
- `vX.Y.Z` — pinned stable release, useful when you want manual upgrades.
- `X.Y.Z` and `X.Y` — release aliases.
- `sha-<commit>` — exact rollback/debug image.
- `main` — current main branch build, not recommended for stable home use.

For most home deployments, use either:

```yaml
image: ghcr.io/renierm26/calorie-tracker:latest
```

or a pinned release:

```yaml
image: ghcr.io/renierm26/calorie-tracker:v1.0.5
```

## Docker Compose example

```yaml
services:
  calorie-tracker:
    image: ghcr.io/renierm26/calorie-tracker:latest
    container_name: calorie-tracker
    restart: unless-stopped
    ports:
      - "8092:8080"
    environment:
      PORT: "8080"
      DATA_DIR: /app/data
      # Optional: require x-api-token on write endpoints
      # API_TOKEN: change-me
    volumes:
      - calorie_tracker_data:/app/data

volumes:
  calorie_tracker_data:
```

Start it:

```bash
docker compose up -d
```

Check health:

```bash
curl http://localhost:8092/api/health
```

Expected response:

```json
{"ok":true}
```

## Reverse proxy notes

If a reverse proxy routes by Docker DNS name, attach the app to the proxy network.

Example with an existing external network called `infra_proxy`:

```yaml
services:
  calorie-tracker:
    image: ghcr.io/renierm26/calorie-tracker:latest
    container_name: calorie-tracker
    restart: unless-stopped
    ports:
      - "8092:8080"
    environment:
      PORT: "8080"
      DATA_DIR: /app/data
    volumes:
      - calorie_tracker_data:/app/data
    networks:
      - default
      - infra_proxy

volumes:
  calorie_tracker_data:

networks:
  infra_proxy:
    external: true
```

If the proxy returns `502` after recreating the container, verify the app is on the proxy network:

```bash
docker inspect calorie-tracker --format '{{json .NetworkSettings.Networks}}'
```

## Authentication model

`API_TOKEN` is optional lightweight write protection.

When set, write endpoints require:

```http
x-api-token: <token>
```

Protected routes include meal/weight writes, deletes, `/api/log`, and `/api/import`.

Important: `API_TOKEN` is not a full login system. If you expose the app outside a trusted LAN, put it behind a real access layer such as:

- reverse-proxy authentication
- VPN
- identity-aware gateway
- private network only

## Backup

The important state is SQLite data under `/app/data` in the Docker volume.

### JSON export

```bash
curl http://localhost:8092/api/export > calorie-tracker-export.json
```

Or use the helper:

```bash
npm run export -- http://localhost:8092
```

### SQLite volume backup

For a raw DB backup, stop the container or use SQLite-aware backup tooling, then copy:

```text
/app/data/tracker.db
/app/data/tracker.db-shm
/app/data/tracker.db-wal
```

On Docker hosts, the volume path is platform-specific. Inspect it with:

```bash
docker volume inspect calorie_tracker_data
```

## Restore from JSON export

Imports are safe by default: dry-run unless `--apply` is provided.

Dry-run:

```bash
npm run import -- calorie-tracker-export.json http://localhost:8092
```

Merge/upsert import:

```bash
npm run import -- calorie-tracker-export.json http://localhost:8092 --apply
```

Replace all existing rows first:

```bash
npm run import -- calorie-tracker-export.json http://localhost:8092 --apply --replace
```

If `API_TOKEN` is configured:

```bash
CALORIE_TRACKER_API_TOKEN='change-me' npm run import -- calorie-tracker-export.json http://localhost:8092 --apply
```

You can also call the API directly:

```bash
curl -X POST http://localhost:8092/api/import \
  -H 'content-type: application/json' \
  -H 'x-api-token: change-me' \
  --data @calorie-tracker-export.json
```

For direct API calls, include `dryRun` and `mode` in the JSON body when needed.

## Updating

For `latest` deployments:

```bash
docker compose pull
docker compose up -d
```

For pinned deployments, edit the tag first:

```yaml
image: ghcr.io/renierm26/calorie-tracker:v1.0.5
```

Then:

```bash
docker compose pull
docker compose up -d
```

Recommended post-update checks:

```bash
curl http://localhost:8092/api/health
curl http://localhost:8092/api/export > /tmp/calorie-export-check.json
```

## Synology Container Manager note

Some Synology Container Manager versions can show stale container references after Compose replaces a named container. If the service is healthy but the UI reports a weird missing container name, do a clean recreate from the project directory:

```bash
docker compose down
docker compose up -d
```

`docker compose down` preserves named volumes by default. Do not use `-v` unless you intentionally want to delete the database volume.

## Troubleshooting

### Health check fails

Check logs:

```bash
docker logs --tail 100 calorie-tracker
```

Common causes:

- data volume ownership prevents SQLite writes
- port `8092` is already in use
- reverse proxy cannot reach the container network

### SQLite readonly error

If logs show `attempt to write a readonly database`, the volume may be owned by a different user from an older image. The app image runs as the non-root `node` user.

On Linux hosts, fix ownership cautiously:

```bash
sudo chown -R 1000:1000 /path/to/calorie_tracker_data/_data
```

Back up the database before changing ownership.

### GHCR pull fails

Verify the tag exists:

```bash
docker pull ghcr.io/renierm26/calorie-tracker:latest
```

If a pinned tag fails, check the GitHub Releases page and use a known published tag such as `v1.0.5`.
