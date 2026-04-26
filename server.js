import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'tracker.db');
const API_TOKEN = process.env.API_TOKEN || '';

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);

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

const mealCols = db.prepare("PRAGMA table_info(meals)").all();
if (!mealCols.some(c => c.name === 'tags')) {
  db.exec("ALTER TABLE meals ADD COLUMN tags TEXT");
}

app.use(express.json());
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

app.get('/api/meals', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  const rows = db.prepare(`
    SELECT id, date, time, type, description, tags, kg, calories, created_at as createdAt
    FROM meals
    ORDER BY date DESC, COALESCE(time, '') DESC, created_at DESC
    LIMIT ?
  `).all(limit);
  res.json(rows);
});

app.post('/api/meals', requireToken, (req, res) => {
  const { id, date, time = '', type, description = '', kg, calories, tags = '' } = req.body || {};
  if (!id || !date || !type || !Number.isFinite(Number(kg)) || Number(kg) <= 0 || !Number.isFinite(Number(calories)) || Number(calories) < 0) {
    return res.status(400).json({ error: 'Invalid meal payload' });
  }

  db.prepare(`
    INSERT INTO meals (id, date, time, type, description, tags, kg, calories)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, date, time, type, description, tags, Number(kg), Math.round(Number(calories)));

  res.json({ ok: true });
});

app.put('/api/meals/:id', requireToken, (req, res) => {
  const { id } = req.params;
  const { date, time = '', type, description = '', tags = '', kg, calories } = req.body || {};
  if (!date || !type || !Number.isFinite(Number(kg)) || Number(kg) <= 0 || !Number.isFinite(Number(calories)) || Number(calories) < 0) {
    return res.status(400).json({ error: 'Invalid meal payload' });
  }
  const r = db.prepare(`
    UPDATE meals SET date=?, time=?, type=?, description=?, tags=?, kg=?, calories=? WHERE id=?
  `).run(date, time, type, description, tags, Number(kg), Math.round(Number(calories)), id);
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
  const rows = db.prepare(`
    SELECT id, date, value, created_at as createdAt, updated_at as updatedAt
    FROM weights
    ORDER BY date DESC
    LIMIT ?
  `).all(limit);
  res.json(rows);
});

app.post('/api/weights', requireToken, (req, res) => {
  const { id, date, value } = req.body || {};
  if (!id || !date || !Number.isFinite(Number(value)) || Number(value) <= 0) {
    return res.status(400).json({ error: 'Invalid weight payload' });
  }

  db.prepare(`
    INSERT INTO weights (id, date, value)
    VALUES (?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET value=excluded.value, updated_at=datetime('now')
  `).run(id, date, Number(value));

  res.json({ ok: true });
});

app.put('/api/weights/:id', requireToken, (req, res) => {
  const { id } = req.params;
  const { date, value } = req.body || {};
  if (!date || !Number.isFinite(Number(value)) || Number(value) <= 0) {
    return res.status(400).json({ error: 'Invalid weight payload' });
  }
  const r = db.prepare(`UPDATE weights SET date=?, value=?, updated_at=datetime('now') WHERE id=?`).run(date, Number(value), id);
  if (r.changes === 0) return res.status(404).json({ error: 'Weight not found' });
  res.json({ ok: true });
});

app.delete('/api/weights/:id', requireToken, (req, res) => {
  const { id } = req.params;
  const r = db.prepare(`DELETE FROM weights WHERE id=?`).run(id);
  if (r.changes === 0) return res.status(404).json({ error: 'Weight not found' });
  res.json({ ok: true });
});

// Assistant-friendly endpoint for natural logging integrations
app.post('/api/log', requireToken, (req, res) => {
  const { kind, payload } = req.body || {};
  if (kind === 'meal') {
    const { id, date, time = '', type, description = '', tags = '', kg, calories } = payload || {};
    if (!id || !date || !type || !Number.isFinite(Number(kg)) || Number(kg) <= 0 || !Number.isFinite(Number(calories)) || Number(calories) < 0) {
      return res.status(400).json({ error: 'Invalid meal payload' });
    }
    db.prepare(`INSERT INTO meals (id, date, time, type, description, tags, kg, calories) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, date, time, type, description, tags, Number(kg), Math.round(Number(calories)));
    return res.json({ ok: true, kind: 'meal' });
  }

  if (kind === 'weight') {
    const { id, date, value } = payload || {};
    if (!id || !date || !Number.isFinite(Number(value)) || Number(value) <= 0) {
      return res.status(400).json({ error: 'Invalid weight payload' });
    }
    db.prepare(`
      INSERT INTO weights (id, date, value)
      VALUES (?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET value=excluded.value, updated_at=datetime('now')
    `).run(id, date, Number(value));
    return res.json({ ok: true, kind: 'weight' });
  }

  return res.status(400).json({ error: 'Unknown kind. Use meal|weight.' });
});

app.use((_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Calorie tracker running on :${PORT}`);
  console.log(`Database: ${DB_PATH}`);
});
