import { beforeAll, beforeEach, afterAll, expect, it } from 'vitest';
import { getTestDatabaseUrl } from '../helpers/database';

let db: typeof import('@/lib/db')['db'];
let retrieve: typeof import('@/services/retrieval')['retrieveSecret'];
let createBatch: typeof import('@/services/batches')['createBatch'];
beforeAll(async () => {
  process.env.DATABASE_URL = getTestDatabaseUrl();
  process.env.ADMIN_PASSWORD = 'synthetic-password-for-tests';
  process.env.SESSION_SECRET = 'synthetic-session-secret-for-tests-only';
  process.env.SECRET_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  process.env.PUBLIC_BASE_URL = 'http://localhost:3000';
  db = (await import('@/lib/db')).db;
  createBatch = (await import('@/services/batches')).createBatch;
  retrieve = (await import('@/services/retrieval')).retrieveSecret;
});
beforeEach(async () => { await db.secret.deleteMany(); });
afterAll(async () => { await db?.$disconnect(); });
async function seed(maxViews: number | null = null) {
  await createBatch({ secrets: ['synthetic-提取-secret'], expiresAt: null, maxViews });
  return db.secret.findFirstOrThrow();
}
it('allows exactly one of twenty concurrent requests to consume the final view', async () => {
  const row = await seed(1);
  const results = await Promise.all(Array.from({ length: 20 }, () => retrieve(row.token)));
  expect(results.filter(result => result.ok)).toEqual([{ ok: true, content: 'synthetic-提取-secret', expiresAt: null }]);
  expect(results.filter(result => !result.ok)).toHaveLength(19);
  expect(results.filter(result => !result.ok).every(result => result.reason === 'exhausted')).toBe(true);
  expect(await db.secret.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ viewCount: 1, lastViewedAt: expect.any(Date) });
});
it('distinguishes unavailable states without leaking metadata or consuming views', async () => {
  expect(await retrieve('absent')).toEqual({ ok: false, reason: 'not_found' });
  const row = await seed(1);
  await db.secret.update({ where: { id: row.id }, data: { status: 'DISABLED', expiresAt: new Date(0), viewCount: 1 } });
  expect(await retrieve(row.token)).toEqual({ ok: false, reason: 'disabled' });
  await db.secret.update({ where: { id: row.id }, data: { status: 'ACTIVE' } });
  expect(await retrieve(row.token)).toEqual({ ok: false, reason: 'expired' });
  await db.secret.update({ where: { id: row.id }, data: { expiresAt: null } });
  expect(await retrieve(row.token)).toEqual({ ok: false, reason: 'exhausted' });
  expect((await db.secret.findUniqueOrThrow({ where: { id: row.id } })).viewCount).toBe(1);
});
it('rolls back increment and timestamps when authentication tag fails', async () => {
  const row = await seed(1);
  await db.secret.update({ where: { id: row.id }, data: { authTag: Buffer.alloc(16).toString('base64') } });
  await expect(retrieve(row.token)).rejects.toThrow();
  expect(await db.secret.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ viewCount: 0, lastViewedAt: null });
});
it('increments unlimited views for every request', async () => {
  const row = await seed();
  const results = await Promise.all(Array.from({ length: 12 }, () => retrieve(row.token)));
  expect(results.every(result => result.ok)).toBe(true);
  expect((await db.secret.findUniqueOrThrow({ where: { id: row.id } })).viewCount).toBe(12);
});
