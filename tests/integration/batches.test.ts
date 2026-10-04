import { beforeAll, beforeEach, afterAll, expect, it, vi } from 'vitest';
import { getTestDatabaseUrl } from '../helpers/database';
import { decryptSecret } from '@/lib/crypto';
import * as tokens from '@/lib/token';
let db: typeof import('@/lib/db')['db'];
let createBatch: typeof import('@/services/batches')['createBatch'];
beforeAll(async () => {
  process.env.DATABASE_URL = getTestDatabaseUrl();
  process.env.ADMIN_PASSWORD = 'synthetic-password-for-tests';
  process.env.SESSION_SECRET = 'synthetic-session-secret-for-tests-only';
  process.env.SECRET_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  process.env.PUBLIC_BASE_URL = 'http://localhost:3000';
  db = (await import('@/lib/db')).db;
  createBatch = (await import('@/services/batches')).createBatch;
});
beforeEach(async () => { vi.restoreAllMocks(); await db.secret.deleteMany(); });
afterAll(async () => { vi.restoreAllMocks(); await db?.$disconnect(); });
it.each([1000, 5000])('persists %i encrypted records in exact input order including duplicates', async count => {
  const secrets = Array.from({ length: count }, (_, i) => `synthetic-${i % 99}-秘密`);
  const start = performance.now();
  const result = await createBatch({ secrets, expiresAt: null, maxViews: 2 });
  console.info(`BATCH count=${count} elapsedMs=${Math.round(performance.now() - start)} PostgreSQL16 local`);
  expect(result.success).toBe(count);
  expect(result.failed).toBe(0);
  const rows = await db.secret.findMany({ orderBy: { batchIndex: 'asc' } });
  expect(rows).toHaveLength(count);
  expect(new Set(rows.map(row => row.token)).size).toBe(count);
  for (let i = 0; i < count; i++) {
    expect(decryptSecret(rows[i])).toBe(secrets[i]);
    expect(rows[i].ciphertext).not.toContain(secrets[i]);
    expect(result.items[i]).toMatchObject({ index: i, url: `http://localhost:3000/k/${rows[i].token}` });
  }
  expect(JSON.stringify(result)).not.toContain(secrets[0]);
});
it('rolls back the first chunk when a database constraint rejects the second', async () => {
  await db.$executeRawUnsafe(`ALTER TABLE "Secret" ADD CONSTRAINT "test_second_chunk" CHECK ("batchIndex" < 500)`);
  try {
    await expect(createBatch({ secrets: Array(501).fill('synthetic-fault'), expiresAt: null, maxViews: null })).rejects.toThrow();
    expect(await db.secret.count()).toBe(0);
  } finally { await db.$executeRawUnsafe(`ALTER TABLE "Secret" DROP CONSTRAINT "test_second_chunk"`); }
});
it('retries a token collision without losing input rows', async () => {
  const spy = vi.spyOn(tokens, 'createToken').mockReturnValueOnce('a'.repeat(32)).mockReturnValueOnce('a'.repeat(32));
  const result = await createBatch({ secrets: ['first', 'second'], expiresAt: null, maxViews: null });
  expect(result.success).toBe(2);
  expect(await db.secret.count()).toBe(2);
  expect(spy.mock.calls.length).toBe(4);
});
it('stops after bounded collision retries with no partial records', async () => {
  const spy = vi.spyOn(tokens, 'createToken').mockReturnValue('a'.repeat(32));
  await expect(createBatch({ secrets: ['first', 'second'], expiresAt: null, maxViews: null })).rejects.toThrow();
  expect(spy.mock.calls.length).toBe(6);
  expect(await db.secret.count()).toBe(0);
});
