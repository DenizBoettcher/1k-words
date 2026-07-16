#!/usr/bin/env node
/**
 * Imports every JSON file in systemdata/ as an official SYSTEM word list, via
 * the admin API. Works against ANY running deployment — node-server, local
 * wrangler dev, or the deployed Cloudflare Worker — because the import logic
 * (dedup, versioning, idempotency) lives server-side in POST /api/admin/system-sets.
 *
 * Usage:
 *   node scripts/import-system-sets.mjs --url http://localhost:8787 --email admin@you.de --password ...
 *
 * Typical targets:
 *   node-server            --url http://localhost:8787   (npm run dev in node-server)
 *   Cloudflare LOCAL D1    --url http://localhost:8787   (npm start in cloudflare-server)
 *   Cloudflare REMOTE D1   --url https://1k-words.<you>.workers.dev
 *
 * Idempotent: unchanged sets are skipped, changed sets get a new version.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : (process.env[name.toUpperCase()] ?? fallback);
}

const baseUrl = (arg('url') ?? '').replace(/\/$/, '');
const email = arg('email');
const password = arg('password');
const dir = arg('dir', path.join(process.cwd(), 'systemdata'));

if (!baseUrl || !email || !password) {
  console.error('Usage: node scripts/import-system-sets.mjs --url <base-url> --email <admin-email> --password <admin-password> [--dir systemdata]');
  process.exit(1);
}

async function main() {
  // 1. login as admin
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!loginRes.ok) {
    console.error(`Login failed (${loginRes.status}):`, await loginRes.text());
    process.exit(1);
  }
  const { token, user } = await loginRes.json();
  if (user.role !== 'ADMIN') {
    console.error(`User ${user.email} is not an ADMIN.`);
    process.exit(1);
  }
  console.log(`Logged in as ${user.username ?? user.email} → ${baseUrl}`);

  // 2. import every json in systemdata/
  const files = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith('.json'));
  if (files.length === 0) {
    console.log(`No .json files in ${dir} — nothing to do.`);
    return;
  }

  let failed = 0;
  for (const file of files) {
    const raw = await readFile(path.join(dir, file), 'utf8');
    let body;
    try { body = JSON.parse(raw); }
    catch { console.error(`  ✗ ${file}: invalid JSON`); failed++; continue; }

    const res = await fetch(`${baseUrl}/api/admin/system-sets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`  ✗ ${file}: ${json.message ?? res.status}`);
      failed++;
    } else {
      console.log(`  ✓ ${file}: ${json.action} (v1.${json.version}, ${json.itemCount} words)`);
    }
  }
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
