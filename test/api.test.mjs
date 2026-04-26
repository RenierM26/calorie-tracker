import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

async function startServer() {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'calorie-tracker-test-'));
  const port = 19080 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, API_TOKEN: 'test-token' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
  });

  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return { base, child, dataDir, output: () => output };
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  child.kill('SIGTERM');
  await rm(dataDir, { recursive: true, force: true });
  throw new Error(`server did not start:\n${output}`);
}

async function stopServer(ctx) {
  if (!ctx.child.killed) {
    ctx.child.kill('SIGTERM');
    await new Promise((resolve) => ctx.child.once('exit', resolve));
  }
  await rm(ctx.dataDir, { recursive: true, force: true });
}

async function api(base, path, options = {}) {
  const { headers = {}, ...rest } = options;
  const res = await fetch(`${base}${path}`, {
    ...rest,
    headers: { 'content-type': 'application/json', ...headers },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { res, body };
}

test('meal CRUD works and write routes require token', async () => {
  const ctx = await startServer();
  try {
    const meal = {
      id: 'meal-1',
      date: '2026-01-02',
      time: '07:30',
      type: 'Breakfast',
      description: 'Oats',
      tags: 'test',
      kg: 0.25,
      calories: 320,
    };

    const unauthorized = await api(ctx.base, '/api/meals', {
      method: 'POST',
      body: JSON.stringify(meal),
    });
    assert.equal(unauthorized.res.status, 401);

    const created = await api(ctx.base, '/api/meals', {
      method: 'POST',
      headers: { 'x-api-token': 'test-token' },
      body: JSON.stringify(meal),
    });
    assert.equal(created.res.status, 200);

    const listed = await api(ctx.base, '/api/meals?limit=10');
    assert.equal(listed.res.status, 200);
    assert.equal(listed.body[0].id, meal.id);

    const updated = await api(ctx.base, `/api/meals/${meal.id}`, {
      method: 'PUT',
      headers: { 'x-api-token': 'test-token' },
      body: JSON.stringify({ ...meal, calories: 350 }),
    });
    assert.equal(updated.res.status, 200);

    const deleted = await api(ctx.base, `/api/meals/${meal.id}`, {
      method: 'DELETE',
      headers: { 'x-api-token': 'test-token' },
    });
    assert.equal(deleted.res.status, 200);
  } finally {
    await stopServer(ctx);
  }
});

test('weight upsert and assistant log endpoint work', async () => {
  const ctx = await startServer();
  try {
    const weight = await api(ctx.base, '/api/log', {
      method: 'POST',
      headers: { 'x-api-token': 'test-token' },
      body: JSON.stringify({
        kind: 'weight',
        payload: { id: 'weight-1', date: '2026-01-02', value: 72.4 },
      }),
    });
    assert.equal(weight.res.status, 200);

    const weights = await api(ctx.base, '/api/weights?limit=10');
    assert.equal(weights.res.status, 200);
    assert.equal(weights.body[0].value, 72.4);
  } finally {
    await stopServer(ctx);
  }
});
