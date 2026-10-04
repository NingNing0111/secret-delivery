import { beforeAll, afterAll, beforeEach, expect, it } from 'vitest';
import { getTestDatabaseUrl } from '../helpers/database';

let db: typeof import('@/lib/db')['db'];
let auth: typeof import('@/services/auth');
beforeAll(async () => {
  process.env.DATABASE_URL = getTestDatabaseUrl();
  process.env.ADMIN_PASSWORD = 'synthetic-password-for-tests';
  process.env.SESSION_SECRET = 'synthetic-session-secret-for-tests-only';
  process.env.SECRET_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  process.env.PUBLIC_BASE_URL = 'http://localhost:3000';
  db = (await import('@/lib/db')).db;
  auth = await import('@/services/auth');
});
beforeEach(async () => { await db.adminSession.deleteMany(); });
afterAll(async () => { await db?.$disconnect(); });
it('protects login/logout routes, sets cookies, validates body and rate limits', async () => {
  const loginRoute = await import('@/app/api/admin/login/route');
  const logoutRoute = await import('@/app/api/admin/logout/route');
  const req = (origin: string, body: string) => new Request('http://localhost:3000/api/admin/login', { method: 'POST', headers: { origin }, body });
  expect((await loginRoute.POST(req('https://evil.example', '{}'))).status).toBe(403);
  expect((await loginRoute.POST(req('http://localhost:3000', '{'))).status).toBe(400);
  expect((await loginRoute.POST(req('http://localhost:3000', JSON.stringify({ password: 'x'.repeat(9000) })))).status).toBe(413);
  const response = await loginRoute.POST(req('http://localhost:3000', JSON.stringify({ password: 'synthetic-password-for-tests' })));
  expect(response.status).toBe(200);
  const cookie = response.headers.get('set-cookie')!;
  expect(cookie).toContain('HttpOnly');
  const token = cookie.split(';')[0].split('=')[1];
  await expect(auth.requireAdmin(token)).resolves.toHaveProperty('id');
  const out = await logoutRoute.POST(new Request('http://localhost:3000/api/admin/logout', { method: 'POST', headers: { origin: 'http://localhost:3000', cookie } }));
  expect(out.status).toBe(200);
  await expect(auth.requireAdmin(token)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  let limited = false;
  for (let i = 0; i < 21; i++) {
    if ((await loginRoute.POST(req('http://localhost:3000', '{"password":"wrong"}'))).status === 429) limited = true;
  }
  expect(limited).toBe(true);
});
it('stores only a session digest and expires after twelve hours', async () => {
  const start = Date.now();
  const session = await auth.login('synthetic-password-for-tests');
  const row = await db.adminSession.findFirstOrThrow();
  expect(row.tokenHash).not.toBe(session.token);
  expect(JSON.stringify(row)).not.toContain(session.token);
  expect(session.expiresAt.getTime() - start).toBeGreaterThanOrEqual(12 * 3600_000);
  expect(session.expiresAt.getTime() - start).toBeLessThan(12 * 3600_000 + 2000);
  expect(await auth.requireAdmin(session.token)).toEqual({ id: row.id });
});
it('rejects incorrect passwords without creating sessions', async () => {
  await expect(auth.login('wrong')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  expect(await db.adminSession.count()).toBe(0);
});
it('rejects expired, missing and logged-out credentials', async () => {
  await expect(auth.requireAdmin(undefined)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  const first = await auth.login('synthetic-password-for-tests');
  await auth.logout(first.token);
  await expect(auth.requireAdmin(first.token)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  const second = await auth.login('synthetic-password-for-tests');
  await db.adminSession.updateMany({ data: { expiresAt: new Date(0) } });
  await expect(auth.requireAdmin(second.token)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});
