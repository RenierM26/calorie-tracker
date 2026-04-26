#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.CALORIE_TRACKER_URL || process.argv[2] || 'http://localhost:8092';
const outputArg = process.env.CALORIE_TRACKER_EXPORT_PATH || process.argv[3];
const outputPath =
  outputArg ||
  path.join('backups', `calorie-tracker-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);

const url = new URL('/api/export', baseUrl);
const res = await fetch(url);
if (!res.ok) {
  throw new Error(`Export failed: HTTP ${res.status} ${await res.text()}`);
}

const body = await res.text();
JSON.parse(body);

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, body + '\n', { mode: 0o600 });
console.log(`Exported ${url.href} -> ${outputPath}`);
