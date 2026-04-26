import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'calorie-tracker-'));
const port = 18080 + Math.floor(Math.random() * 1000);
const child = spawn(process.execPath, ['server.js'], {
  cwd: path.resolve(import.meta.dirname, '..'),
  env: { ...process.env, PORT: String(port), DATA_DIR: dataDir },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
let exited = false;
child.once('exit', () => { exited = true; });
child.stdout.on('data', chunk => { output += chunk; });
child.stderr.on('data', chunk => { output += chunk; });

try {
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 8000;
  let health;
  while (Date.now() < deadline) {
    try {
      health = await fetch(`${base}/api/health`);
      if (health.ok) break;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  if (!health?.ok) throw new Error(`health check failed. Server output:\n${output}`);

  const meal = {
    id: `smoke-${Date.now()}`,
    date: '2026-01-01',
    time: '12:00',
    type: 'Lunch',
    description: 'Smoke test meal',
    tags: 'test',
    kg: 0.25,
    calories: 350,
  };
  const created = await fetch(`${base}/api/meals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(meal),
  });
  if (!created.ok) throw new Error(`meal create failed: ${created.status} ${await created.text()}`);

  const meals = await fetch(`${base}/api/meals?limit=5`).then(r => r.json());
  if (!Array.isArray(meals) || !meals.some(row => row.id === meal.id)) {
    throw new Error('created meal was not returned by /api/meals');
  }
} finally {
  if (!exited) {
    child.kill('SIGTERM');
    await new Promise(resolve => child.once('exit', resolve));
  }
  await rm(dataDir, { recursive: true, force: true });
}
