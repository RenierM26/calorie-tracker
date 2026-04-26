import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { DatabaseSync } from 'node:sqlite';
import rateLimit from 'express-rate-limit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'tracker.db');
const API_TOKEN = process.env.API_TOKEN || '';
const FIFTEEN_MINUTES = 15 * 60 * 1000;
const apiLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
const spaFallbackLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS meals (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  time TEXT,
  type TEXT NOT NULL,
  description TEXT,
  tags TEXT,
  kg REAL NOT NULL,
  calories INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS weights (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL UNIQUE,
  value REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_meals_date ON meals(date);
CREATE INDEX IF NOT EXISTS idx_weights_date ON weights(date);
`);

const mealCols = db.prepare('PRAGMA table_info(meals)').all();
if (!mealCols.some((c) => c.name === 'tags')) {
  db.exec('ALTER TABLE meals ADD COLUMN tags TEXT');
}

app.use(express.json());
app.use('/api', apiLimiter);
app.use(express.static(path.join(__dirname, 'public')));

function requireToken(req, res, next) {
  if (!API_TOKEN) return next();
  const token = req.headers['x-api-token'];
  if (token !== API_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/export', (_req, res) => {
  const meals = db
    .prepare(
      `
    SELECT id, date, time, type, description, tags, kg, calories, created_at as createdAt
    FROM meals
    ORDER BY date ASC, COALESCE(time, '') ASC, created_at ASC
  `,
    )
    .all();
  const weights = db
    .prepare(
      `
    SELECT id, date, value, created_at as createdAt, updated_at as updatedAt
    FROM weights
    ORDER BY date ASC
  `,
    )
    .all();
  res.json({
    exportedAt: new Date().toISOString(),
    schemaVersion: 1,
    meals,
    weights,
  });
});

app.get('/api/meals', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  const rows = db
    .prepare(
      `
    SELECT id, date, time, type, description, tags, kg, calories, created_at as createdAt
    FROM meals
    ORDER BY date DESC, COALESCE(time, '') DESC, created_at DESC
    LIMIT ?
  `,
    )
    .all(limit);
  res.json(rows);
});

app.post('/api/meals', requireToken, (req, res) => {
  const { id, date, time = '', type, description = '', kg, calories, tags = '' } = req.body || {};
  if (
    !id ||
    !date ||
    !type ||
    !Number.isFinite(Number(kg)) ||
    Number(kg) <= 0 ||
    !Number.isFinite(Number(calories)) ||
    Number(calories) < 0
  ) {
    return res.status(400).json({ error: 'Invalid meal payload' });
  }

  db.prepare(
    `
    INSERT INTO meals (id, date, time, type, description, tags, kg, calories)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(id, date, time, type, description, tags, Number(kg), Math.round(Number(calories)));

  res.json({ ok: true });
});

app.put('/api/meals/:id', requireToken, (req, res) => {
  const { id } = req.params;
  const { date, time = '', type, description = '', tags = '', kg, calories } = req.body || {};
  if (
    !date ||
    !type ||
    !Number.isFinite(Number(kg)) ||
    Number(kg) <= 0 ||
    !Number.isFinite(Number(calories)) ||
    Number(calories) < 0
  ) {
    return res.status(400).json({ error: 'Invalid meal payload' });
  }
  const r = db
    .prepare(
      `
    UPDATE meals SET date=?, time=?, type=?, description=?, tags=?, kg=?, calories=? WHERE id=?
  `,
    )
    .run(date, time, type, description, tags, Number(kg), Math.round(Number(calories)), id);
  if (r.changes === 0) return res.status(404).json({ error: 'Meal not found' });
  res.json({ ok: true });
});

app.delete('/api/meals/:id', requireToken, (req, res) => {
  const { id } = req.params;
  const r = db.prepare(`DELETE FROM meals WHERE id=?`).run(id);
  if (r.changes === 0) return res.status(404).json({ error: 'Meal not found' });
  res.json({ ok: true });
});

app.get('/api/weights', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 400, 2000);
  const rows = db
    .prepare(
      `
    SELECT id, date, value, created_at as createdAt, updated_at as updatedAt
    FROM weights
    ORDER BY date DESC
    LIMIT ?
  `,
    )
    .all(limit);
  res.json(rows);
});

app.post('/api/weights', requireToken, (req, res) => {
  const { id, date, value } = req.body || {};
  if (!id || !date || !Number.isFinite(Number(value)) || Number(value) <= 0) {
    return res.status(400).json({ error: 'Invalid weight payload' });
  }

  db.prepare(
    `
    INSERT INTO weights (id, date, value)
    VALUES (?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET value=excluded.value, updated_at=datetime('now')
  `,
  ).run(id, date, Number(value));

  res.json({ ok: true });
});

app.put('/api/weights/:id', requireToken, (req, res) => {
  const { id } = req.params;
  const { date, value } = req.body || {};
  if (!date || !Number.isFinite(Number(value)) || Number(value) <= 0) {
    return res.status(400).json({ error: 'Invalid weight payload' });
  }
  const r = db
    .prepare(`UPDATE weights SET date=?, value=?, updated_at=datetime('now') WHERE id=?`)
    .run(date, Number(value), id);
  if (r.changes === 0) return res.status(404).json({ error: 'Weight not found' });
  res.json({ ok: true });
});

app.delete('/api/weights/:id', requireToken, (req, res) => {
  const { id } = req.params;
  const r = db.prepare(`DELETE FROM weights WHERE id=?`).run(id);
  if (r.changes === 0) return res.status(404).json({ error: 'Weight not found' });
  res.json({ ok: true });
});

app.post('/api/import', requireToken, (req, res) => {
  const { mode = 'merge', dryRun = true, meals = [], weights = [] } = req.body || {};
  if (!['merge', 'replace'].includes(mode)) {
    return res.status(400).json({ error: 'mode must be merge or replace' });
  }
  if (!Array.isArray(meals) || !Array.isArray(weights)) {
    return res.status(400).json({ error: 'meals and weights must be arrays' });
  }

  for (const meal of meals) {
    if (
      !meal?.id ||
      !meal?.date ||
      !meal?.type ||
      !Number.isFinite(Number(meal.kg)) ||
      Number(meal.kg) <= 0 ||
      !Number.isFinite(Number(meal.calories)) ||
      Number(meal.calories) < 0
    ) {
      return res.status(400).json({ error: `Invalid meal in import: ${meal?.id || 'missing id'}` });
    }
  }
  for (const weight of weights) {
    if (
      !weight?.id ||
      !weight?.date ||
      !Number.isFinite(Number(weight.value)) ||
      Number(weight.value) <= 0
    ) {
      return res
        .status(400)
        .json({ error: `Invalid weight in import: ${weight?.id || 'missing id'}` });
    }
  }

  const existingMeals = db.prepare('SELECT COUNT(*) AS count FROM meals').get().count;
  const existingWeights = db.prepare('SELECT COUNT(*) AS count FROM weights').get().count;
  if (dryRun) {
    return res.json({
      ok: true,
      dryRun: true,
      mode,
      existing: { meals: existingMeals, weights: existingWeights },
      incoming: { meals: meals.length, weights: weights.length },
    });
  }

  try {
    db.exec('BEGIN');
    if (mode === 'replace') {
      db.prepare('DELETE FROM meals').run();
      db.prepare('DELETE FROM weights').run();
    }

    const mealStmt = db.prepare(`
      INSERT INTO meals (id, date, time, type, description, tags, kg, calories, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
      ON CONFLICT(id) DO UPDATE SET
        date=excluded.date,
        time=excluded.time,
        type=excluded.type,
        description=excluded.description,
        tags=excluded.tags,
        kg=excluded.kg,
        calories=excluded.calories
    `);
    const weightStmt = db.prepare(`
      INSERT INTO weights (id, date, value, created_at, updated_at)
      VALUES (?, ?, ?, COALESCE(?, datetime('now')), ?)
      ON CONFLICT(date) DO UPDATE SET
        id=excluded.id,
        value=excluded.value,
        updated_at=COALESCE(excluded.updated_at, datetime('now'))
    `);

    for (const meal of meals) {
      mealStmt.run(
        meal.id,
        meal.date,
        meal.time || '',
        meal.type,
        meal.description || '',
        meal.tags || '',
        Number(meal.kg),
        Math.round(Number(meal.calories)),
        meal.createdAt || meal.created_at || null,
      );
    }
    for (const weight of weights) {
      weightStmt.run(
        weight.id,
        weight.date,
        Number(weight.value),
        weight.createdAt || weight.created_at || null,
        weight.updatedAt || weight.updated_at || null,
      );
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  res.json({
    ok: true,
    dryRun: false,
    mode,
    imported: { meals: meals.length, weights: weights.length },
  });
});

// Assistant-friendly endpoint for natural logging integrations
app.post('/api/log', requireToken, (req, res) => {
  const { kind, payload } = req.body || {};
  if (kind === 'meal') {
    const { id, date, time = '', type, description = '', tags = '', kg, calories } = payload || {};
    if (
      !id ||
      !date ||
      !type ||
      !Number.isFinite(Number(kg)) ||
      Number(kg) <= 0 ||
      !Number.isFinite(Number(calories)) ||
      Number(calories) < 0
    ) {
      return res.status(400).json({ error: 'Invalid meal payload' });
    }
    db.prepare(
      `INSERT INTO meals (id, date, time, type, description, tags, kg, calories) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, date, time, type, description, tags, Number(kg), Math.round(Number(calories)));
    return res.json({ ok: true, kind: 'meal' });
  }

  if (kind === 'weight') {
    const { id, date, value } = payload || {};
    if (!id || !date || !Number.isFinite(Number(value)) || Number(value) <= 0) {
      return res.status(400).json({ error: 'Invalid weight payload' });
    }
    db.prepare(
      `
      INSERT INTO weights (id, date, value)
      VALUES (?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET value=excluded.value, updated_at=datetime('now')
    `,
    ).run(id, date, Number(value));
    return res.json({ ok: true, kind: 'weight' });
  }

  return res.status(400).json({ error: 'Unknown kind. Use meal|weight.' });
});

app.use(spaFallbackLimiter, (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = app.listen(PORT, () => {
  console.log(`Calorie tracker running on :${PORT}`);
  console.log(`Database: ${DB_PATH}`);
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    db.close();
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
