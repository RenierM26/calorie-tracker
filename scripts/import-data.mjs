#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

function usage() {
  console.error(`Usage: node scripts/import-data.mjs <export.json> [baseUrl] [--apply] [--replace] [--token TOKEN]

Defaults are safe:
- dry-run unless --apply is set
- merge unless --replace is set
- baseUrl defaults to CALORIE_TRACKER_URL or http://localhost:8092
- token defaults to CALORIE_TRACKER_API_TOKEN when set`);
  process.exit(2);
}

const args = process.argv.slice(2);
const file = args.find((arg) => !arg.startsWith('--'));
if (!file) usage();
const positional = args.filter((arg) => !arg.startsWith('--'));
const baseUrl = process.env.CALORIE_TRACKER_URL || positional[1] || 'http://localhost:8092';
const dryRun = !args.includes('--apply');
const mode = args.includes('--replace') ? 'replace' : 'merge';
const tokenFlagIndex = args.indexOf('--token');
const token =
  tokenFlagIndex >= 0 ? args[tokenFlagIndex + 1] : process.env.CALORIE_TRACKER_API_TOKEN || '';
if (tokenFlagIndex >= 0 && !token) usage();

const raw = await readFile(file, 'utf8');
const data = JSON.parse(raw);
if (data.schemaVersion !== 1) {
  throw new Error(`Unsupported export schemaVersion: ${data.schemaVersion ?? 'missing'}`);
}
if (!Array.isArray(data.meals) || !Array.isArray(data.weights)) {
  throw new Error('Export must contain meals and weights arrays');
}

const url = new URL('/api/import', baseUrl);
const res = await fetch(url, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    ...(token ? { 'x-api-token': token } : {}),
  },
  body: JSON.stringify({ mode, dryRun, meals: data.meals, weights: data.weights }),
});
const text = await res.text();
let body;
try {
  body = JSON.parse(text);
} catch {
  body = text;
}
if (!res.ok) {
  throw new Error(
    `Import failed: HTTP ${res.status} ${typeof body === 'string' ? body : JSON.stringify(body)}`,
  );
}
console.log(JSON.stringify(body, null, 2));
if (dryRun) {
  console.log(
    'Dry-run only. Re-run with --apply to import. Add --replace to wipe existing rows first.',
  );
}
