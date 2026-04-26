# Contributing

Thanks for improving Calorie Tracker. This project is intentionally small: keep changes practical, easy to self-host, and safe for personal health data.

## Local development

Requirements:

- Node.js 22 or newer
- npm

Setup:

```bash
npm ci
npm start
```

Open <http://localhost:8080>.

By default, local data is stored in `./data/tracker.db`. Use `DATA_DIR` or `DB_PATH` to point at a temporary database while developing.

## Quality checks

Run these before opening a PR:

```bash
npm run format:check
npm run lint
npm test
npm run smoke
```

Use this to auto-format:

```bash
npm run format
```

## Pull requests

For each PR, include:

- what changed
- why it changed
- verification performed
- any deployment impact
- any privacy/data impact

Keep PRs focused. Prefer a few small PRs over one broad mixed change.

## Privacy and sample data

Do not commit real user food logs, weights, exports, screenshots, or SQLite databases.

Use synthetic examples only. If screenshots are needed, use demo/mock data and clearly label them as synthetic.

## Security-sensitive changes

For auth, import/export, backup, or data handling changes, include tests where practical and explain the failure mode you considered.

If you discover a vulnerability, do not open a public issue with exploit details. See [SECURITY.md](SECURITY.md).
