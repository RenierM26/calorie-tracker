# Calorie & Weight Tracker

Shared browser-based calorie and weight tracker with an Express API, SQLite persistence, Docker packaging, and an included assistant skill for assistant logging.

## Features

- Shared SQLite-backed meal and weight history
- REST API for meals, weights, edits, deletes, and assistant-friendly logging
- Dashboard and journal pages served from the same container
- Optional `API_TOKEN` write protection via `x-api-token`
- Docker image build workflow for GitHub Actions / GHCR
- Bundled skill at `skills/calorie-tracker-api/`

## Repository layout

```text
.
├─ .github/workflows/container.yml   # CI: check, smoke test, build/publish image
├─ Dockerfile                        # Production container image
├─ docker-compose.yml                # Local/self-hosted deployment example
├─ package.json
├─ package-lock.json
├─ server.js                         # Express + SQLite API + static hosting
├─ public/                           # Browser UI
├─ scripts/smoke-test.mjs            # API smoke test used by CI
└─ skills/calorie-tracker-api/        # assistant skill for agent/API usage
```

## Local development

Requires Node.js 22.x because the backend uses `node:sqlite`.

```bash
npm ci
npm run check
npm run smoke
npm start
```

Open: <http://localhost:8080>

By default the database is created at `./data/tracker.db`. Override with `DATA_DIR` or `DB_PATH` if needed.

## Docker build and run

```bash
docker build -t calorie-tracker:local .
docker run --rm -p 8092:8080 -v calorie_tracker_data:/app/data calorie-tracker:local
```

Open: <http://localhost:8092>

Or use Compose:

```bash
docker compose up -d --build
```

## GitHub Actions container flow

The included workflow in `.github/workflows/container.yml` does this on pull requests and pushes:

1. Install dependencies with `npm ci`
2. Run `npm run check`
3. Run `npm run smoke`
4. Build the Docker image with Buildx
5. Publish to GHCR on non-PR pushes

Published image tags include:

- `main` for default-branch builds
- branch tags for branch pushes
- version tags for `v*.*.*` tags
- `sha-<commit>` tags for traceability

The manual Release workflow publishes `latest`. In other words, `latest` means latest stable release, while `main` means current main-branch build.

Expected image path once the repository is on GitHub:

```text
ghcr.io/<owner>/<repo>:latest
```

If the repository name contains uppercase letters, rename it or adjust the workflow image name to lowercase before first publish; GHCR image names must be lowercase.

## Backup and restore

The important state is the SQLite database in the Docker volume mounted at `/app/data`. For home deployments, back this volume up before upgrades and on a regular schedule.

Simple export check:

```bash
curl http://localhost:8092/api/export > calorie-tracker-export.json
```

Or use the bundled helper, which writes to `backups/` by default:

```bash
npm run export -- http://localhost:8092
```

Override the destination path:

```bash
CALORIE_TRACKER_EXPORT_PATH=/safe/backups/calorie-tracker.json npm run export
```

For a full database backup, stop the container or use SQLite-aware backup tooling, then copy `tracker.db` from the data volume.

### Restore from JSON export

Imports are safe by default: the helper performs a dry-run unless `--apply` is provided. The default mode is merge/upsert.

Dry-run an export restore:

```bash
npm run import -- backups/calorie-tracker-export.json http://localhost:8092
```

Apply a merge/upsert restore:

```bash
npm run import -- backups/calorie-tracker-export.json http://localhost:8092 --apply
```

Replace all existing rows before importing:

```bash
npm run import -- backups/calorie-tracker-export.json http://localhost:8092 --apply --replace
```

If `API_TOKEN` is set on the server, pass it with `--token` or `CALORIE_TRACKER_API_TOKEN`.

## Optional API auth

Set `API_TOKEN` to require `x-api-token` on write endpoints:

```yaml
environment:
  - API_TOKEN=change-me
```

Protected routes:

- `POST /api/meals`, `PUT /api/meals/:id`, `DELETE /api/meals/:id`
- `POST /api/weights`, `PUT /api/weights/:id`, `DELETE /api/weights/:id`
- `POST /api/log`

Security note: `API_TOKEN` is lightweight API write protection, not a complete user login system. For internet-facing or multi-user deployments, add reverse-proxy auth, VPN access, or another trusted access layer in front of the app.

## API endpoints

- `GET /api/health`
- `GET /api/export`
- `POST /api/import`
- `GET /api/meals?limit=2000`
- `POST /api/meals`
- `PUT /api/meals/:id`
- `DELETE /api/meals/:id`
- `GET /api/weights?limit=2000`
- `POST /api/weights`
- `PUT /api/weights/:id`
- `DELETE /api/weights/:id`
- `POST /api/log` with `{ "kind": "meal|weight", "payload": { ... } }`

## assistant skill

The repo includes `skills/calorie-tracker-api/SKILL.md`. After cloning/installing the repo where assistant can read it, copy or symlink that skill folder into the assistant skills directory if it is not automatically mounted by your deployment.

## Deployment note for the home reverse proxy route

For the existing `your-tracker.example.com` deployment, keep the container reachable by reverse proxy. If reverse proxy proxies by Docker DNS name, attach the container to the same proxy network used by reverse proxy, for example:

```bash
docker network connect infra_proxy calorie-tracker 2>/dev/null || true
```

## Releases

Use the **Release** workflow to create a version tag from the current `main` branch:

1. Open **Actions → Release → Run workflow**.
2. Enter a semver version like `2.0.1`.
3. The workflow creates and pushes tag `v2.0.1`.
4. The Release workflow creates the tag, publishes versioned GHCR tags directly, and creates a GitHub Release with image references.

The Release workflow publishes these image tags:

- `latest`
- `vX.Y.Z`
- `X.Y.Z`
- `X.Y`
- `sha-<commit>`

Recommended deployment tags:

- `ghcr.io/<owner>/<repo>:latest` for automatic latest stable release updates
- `ghcr.io/<owner>/<repo>:vX.Y.Z` for pinned stable home deployments
- `ghcr.io/<owner>/<repo>:sha-<commit>` for exact rollback/debugging
- `ghcr.io/<owner>/<repo>:main` only when you intentionally want newest main-branch build

## License

GPL-3.0, matching the repository license.
