import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

// Deliberately restricted to the local synthetic stack; never run against production.
assert(existsSync('compose.yml'), 'compose.yml must exist');
assert(existsSync('.env.local'), '.env.local must exist');
process.loadEnvFile('.env.local');
const base = process.env.PUBLIC_BASE_URL;
assert.equal(base, 'http://127.0.0.1:8080', 'Only the local Compose acceptance stack is allowed');
const args = ['compose', '--env-file', '.env.local', '-f', 'compose.yml', '-f', 'compose.local.yml'];
const docker = (...extra) => execFileSync('docker', [...args, ...extra], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const request = (path, options = {}) => fetch(`${base}${path}`, { ...options, signal: AbortSignal.timeout(10000) });
async function healthy() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await request('/api/health')).ok) return; } catch { /* bounded startup wait */ }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('Application did not become healthy');
}
await healthy();
let rows = [];
for (let attempt = 0; attempt < 60; attempt++) {
  rows = docker('ps', '-a', '--format', 'json').trim().split('\n').map(line => JSON.parse(line));
  if (['db', 'app', 'caddy'].every(service => rows.some(row => row.Service === service && row.Health === 'healthy'))) break;
  await new Promise(resolve => setTimeout(resolve, 1000));
}
for (const service of ['db', 'app', 'caddy']) assert(rows.some(row => row.Service === service && row.Health === 'healthy'), `${service} health`);
assert(rows.some(row => row.Service === 'migrate' && row.ExitCode === 0), 'migration exits successfully');
assert.equal((await request('/api/admin/secrets')).status, 401);
assert.equal((await request('/api/admin/login', { method: 'POST', headers: { origin: 'https://wrong.invalid', 'content-type': 'application/json' }, body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }) })).status, 403);
const login = await request('/api/admin/login', { method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }) });
assert.equal(login.status, 200);
const setCookie = login.headers.get('set-cookie');
assert.match(setCookie, /HttpOnly/); assert.match(setCookie, /SameSite=Lax/);
assert(!setCookie.includes('; Secure'), 'explicit local HTTP cookie override');
const cookie = setCookie.split(';')[0];
const sample = `synthetic-compose-${randomUUID()}`;
const created = await request('/api/admin/secrets/batch', { method: 'POST', headers: { cookie, origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ text: sample, maxViews: 3 }) });
assert.equal(created.status, 201);
const body = await created.text(); assert(!body.includes(sample));
const token = new URL(JSON.parse(body).items[0].url).pathname.split('/').at(-1);
async function retrieve() {
  const response = await request(`/api/secret/${token}`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal((await response.json()).content, sample);
}
await retrieve();
docker('restart', 'db');
await healthy();
docker('restart', 'app');
await healthy();
await retrieve();
const logs = docker('logs', '--no-color', 'app', 'caddy', 'db', 'migrate');
assert(!logs.includes(sample) && !logs.includes(token), 'logs exclude secrets and retrieval tokens');
console.log('PASS: healthy services, migration, auth/origin, masked creation, retrieval, DB/app restart persistence, no secret/token logs');
