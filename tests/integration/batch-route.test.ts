import { beforeAll, beforeEach, afterAll, expect, it } from 'vitest';
import { getTestDatabaseUrl } from '../helpers/database';

let db: typeof import('@/lib/db')['db'];
let post: typeof import('@/app/api/admin/secrets/batch/route')['POST'];
let cookie: string;
beforeAll(async () => {
  process.env.DATABASE_URL = getTestDatabaseUrl();
  process.env.ADMIN_PASSWORD = 'synthetic-password-for-tests';
  process.env.SESSION_SECRET = 'synthetic-session-secret-for-tests-only';
  process.env.SECRET_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  process.env.PUBLIC_BASE_URL = 'http://localhost:3000';
  db = (await import('@/lib/db')).db;
  post = (await import('@/app/api/admin/secrets/batch/route')).POST;
});
beforeEach(async () => {
  await db.secret.deleteMany();
  await db.adminSession.deleteMany();
  const session = await (await import('@/services/auth')).login('synthetic-password-for-tests');
  cookie = `sd_session=${session.token}`;
});
afterAll(async () => { await db?.$disconnect(); });
function request(body: string, headers: Record<string, string> = {}) {
  return new Request('http://localhost:3000/api/admin/secrets/batch', {
    method: 'POST', headers: { origin: 'http://localhost:3000', cookie, ...headers }, body,
  });
}
it('rejects missing, forged and expired sessions without writing secrets', async () => {
  for (const value of ['', 'sd_session=forged']) {
    expect((await post(request('{"text":"sample-secret"}', { cookie: value }))).status).toBe(401);
  }
  await db.adminSession.updateMany({ data: { expiresAt: new Date(0) } });
  expect((await post(request('{"text":"sample-secret"}'))).status).toBe(401);
  expect(await db.secret.count()).toBe(0);
});
it('rejects foreign or missing origin without writing secrets', async () => {
  for (const origin of ['https://evil.example', '']) {
    expect((await post(request('{"text":"sample-secret"}', { origin }))).status).toBe(403);
  }
  expect(await db.secret.count()).toBe(0);
});
it('rejects malformed JSON and invalid batch input before writes', async () => {
  for (const body of ['{', '{"text":""}', '{"text":"sample-secret","maxViews":0}']) {
    const response = await post(request(body));
    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toContain('no-store');
  }
  expect(await db.secret.count()).toBe(0);
});
it('enforces actual body bytes even with forged content length', async () => {
  process.env.REQUEST_BODY_LIMIT = '32';
  try {
    expect((await post(request(JSON.stringify({ text: '长'.repeat(20) }), { 'content-length': '1' }))).status).toBe(413);
    expect(await db.secret.count()).toBe(0);
  } finally { delete process.env.REQUEST_BODY_LIMIT; }
});
it('returns ordered masked results while persisting encrypted duplicate rows', async () => {
  const response = await post(request(JSON.stringify({ text: ' first-synthetic-secret\r\n\nsecond-synthetic-secret\rfirst-synthetic-secret ' })));
  expect(response.status).toBe(201);
  expect(response.headers.get('cache-control')).toContain('no-store');
  const body = await response.text();
  expect(body).not.toContain('first-synthetic-secret');
  expect(body).not.toContain('second-synthetic-secret');
  expect(body).not.toMatch(/ciphertext|authTag|"iv"/);
  const result = JSON.parse(body);
  expect(result).toMatchObject({ total: 3, success: 3, failed: 0 });
  expect(result.items.map((item: { index: number }) => item.index)).toEqual([0, 1, 2]);
  const rows = await db.secret.findMany({ orderBy: { batchIndex: 'asc' } });
  expect(rows).toHaveLength(3);
  expect(result.items.map((item: { url: string }) => item.url)).toEqual(rows.map(row => `http://localhost:3000/k/${row.token}`));
  const { decryptSecret } = await import('@/lib/crypto');
  expect(rows.map(decryptSecret)).toEqual(['first-synthetic-secret', 'second-synthetic-secret', 'first-synthetic-secret']);
});
