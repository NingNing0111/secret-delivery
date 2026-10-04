import { beforeAll, beforeEach, afterAll, expect, it } from 'vitest';
import { getTestDatabaseUrl } from '../helpers/database';

let db: typeof import('@/lib/db')['db'];
let management: typeof import('@/services/secrets');
let dashboard: typeof import('@/services/dashboard');
beforeAll(async () => {
  process.env.DATABASE_URL = getTestDatabaseUrl();
  process.env.ADMIN_PASSWORD = 'synthetic-password-for-tests';
  process.env.SESSION_SECRET = 'synthetic-session-secret-for-tests-only';
  process.env.SECRET_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  process.env.PUBLIC_BASE_URL = 'http://localhost:3000';
  db = (await import('@/lib/db')).db;
  management = await import('@/services/secrets');
  dashboard = await import('@/services/dashboard');
});
beforeEach(async () => { await db.secret.deleteMany(); });
afterAll(async () => { await db?.$disconnect(); });
async function seed() {
  const { createBatch } = await import('@/services/batches');
  await createBatch({ secrets: ['first-synthetic-secret', 'second-synthetic-secret', 'third-synthetic-secret', 'fourth-synthetic-secret'], expiresAt: null, maxViews: 2 });
  const rows = await db.secret.findMany({ orderBy: { batchIndex: 'asc' } });
  await db.secret.updateMany({ data: { createdAt: new Date('2025-01-01') } });
  await db.secret.update({ where: { id: rows[1].id }, data: { expiresAt: new Date('2025-02-01'), viewCount: 1 } });
  await db.secret.update({ where: { id: rows[2].id }, data: { status: 'DISABLED', expiresAt: new Date('2025-02-01'), viewCount: 2 } });
  await db.secret.update({ where: { id: rows[3].id }, data: { viewCount: 2 } });
  return rows;
}
it('paginates stably and returns only masked metadata', async () => {
  const rows = await seed();
  const expected = rows.map(row => row.id).sort().reverse();
  const first = await management.listSecrets({ page: 1, pageSize: 2 });
  const second = await management.listSecrets({ page: 2, pageSize: 2 });
  expect(first.total).toBe(4);
  expect([...first.items, ...second.items].map(row => row.id)).toEqual(expected);
  const serialized = JSON.stringify(first);
  expect(serialized).not.toMatch(/synthetic-secret|ciphertext|authTag|"iv"/);
  expect((await management.getSecret(rows[0].id)).preview).toBe('fir********');
});
it('combines exact token/id search with status and creation/expiry ranges', async () => {
  const rows = await seed();
  expect((await management.listSecrets({ search: rows[1].token, status: 'EXPIRED', createdFrom: '2024-12-31', createdTo: '2025-01-02', expiresFrom: '2025-01-31', expiresTo: '2025-02-02' })).items.map(row => row.id)).toEqual([rows[1].id]);
  expect((await management.listSecrets({ search: rows[1].id, status: 'ACTIVE' })).total).toBe(0);
  expect((await management.listSecrets({ status: 'DISABLED' })).items.map(row => row.id)).toEqual([rows[2].id]);
  expect((await management.listSecrets({ status: 'ACTIVE' })).total).toBe(2);
});
it('interprets timezone-less UTC filter inputs independently of server timezone', async () => {
  await seed();
  const previous = process.env.TZ;
  process.env.TZ = 'Asia/Shanghai';
  try {
    expect((await management.listSecrets({ createdFrom: '2025-01-01T00:00', createdTo: '2025-01-01T00:00' })).total).toBe(4);
  } finally {
    if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
  }
});
it('counts mutually exclusive dashboard states and all views', async () => {
  await seed();
  expect(await dashboard.getDashboard()).toEqual({ total: 4, active: 2, expired: 1, disabled: 1, views: 5 });
});
it('reveals without consuming and enables without resetting expiry or quota', async () => {
  const rows = await seed();
  expect(await management.revealSecret(rows[0].id)).toBe('first-synthetic-secret');
  expect((await db.secret.findUniqueOrThrow({ where: { id: rows[0].id } })).viewCount).toBe(0);
  expect(await management.setSecretStatus([rows[1].id, rows[3].id], 'DISABLED')).toBe(2);
  expect(await management.setSecretStatus([rows[1].id, rows[3].id], 'ACTIVE')).toBe(2);
  const { retrieveSecret } = await import('@/services/retrieval');
  expect(await retrieveSecret(rows[1].token)).toEqual({ ok: false, reason: 'expired' });
  expect(await retrieveSecret(rows[3].token)).toEqual({ ok: false, reason: 'exhausted' });
  expect(await management.deleteSecrets([rows[0].id])).toBe(1);
  expect(await retrieveSecret(rows[0].token)).toEqual({ ok: false, reason: 'not_found' });
  await expect(management.getSecret(rows[0].id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
it('exports selected links by batch creation then batch id and input order', async () => {
  const rows = await seed();
  const { createBatch } = await import('@/services/batches');
  const batch = await createBatch({ secrets: ['later-synthetic-secret'], expiresAt: null, maxViews: null });
  const later = await db.secret.findUniqueOrThrow({ where: { token: batch.items[0].url.split('/').pop()! } });
  expect(await management.getExportUrls([later.id, rows[2].id, rows[0].id])).toEqual([`http://localhost:3000/k/${rows[0].token}`, `http://localhost:3000/k/${rows[2].token}`, batch.items[0].url]);
});
it('rejects empty selections, excessive selections and malformed queries', async () => {
  for (const ids of [[], [''], Array.from({ length: 5001 }, (_, i) => `id-${i}`)]) {
    await expect(management.deleteSecrets(ids)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(management.getExportUrls(ids)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  }
  for (const query of [{ page: 0 }, { pageSize: 501 }, { createdFrom: 'invalid' }, { expiresFrom: '2025-02-01', expiresTo: '2025-01-01' }]) {
    await expect(management.listSecrets(query)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  }
});
