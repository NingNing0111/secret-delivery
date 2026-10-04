import { beforeAll, beforeEach, afterAll, expect, it } from 'vitest';
import { getTestDatabaseUrl } from '../helpers/database';

let db: typeof import('@/lib/db')['db'];
let cookie: string;
let id: string;
type Handler = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
let routes: { path: string; method: string; handler: Handler }[];
beforeAll(async () => {
  process.env.DATABASE_URL = getTestDatabaseUrl();
  process.env.ADMIN_PASSWORD = 'synthetic-password-for-tests';
  process.env.SESSION_SECRET = 'synthetic-session-secret-for-tests-only';
  process.env.SECRET_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  process.env.PUBLIC_BASE_URL = 'http://localhost:3000';
  db = (await import('@/lib/db')).db;
  const list = await import('@/app/api/admin/secrets/route');
  const detail = await import('@/app/api/admin/secrets/[id]/route');
  routes = [
    { path: '', method: 'GET', handler: list.GET },
    { path: '/id', method: 'GET', handler: detail.GET },
    { path: '/id', method: 'DELETE', handler: detail.DELETE },
    { path: '/id/reveal', method: 'POST', handler: (await import('@/app/api/admin/secrets/[id]/reveal/route')).POST },
    { path: '/id/disable', method: 'POST', handler: (await import('@/app/api/admin/secrets/[id]/disable/route')).POST },
    { path: '/id/enable', method: 'POST', handler: (await import('@/app/api/admin/secrets/[id]/enable/route')).POST },
    { path: '/batch/delete', method: 'POST', handler: (await import('@/app/api/admin/secrets/batch/delete/route')).POST },
    { path: '/batch/disable', method: 'POST', handler: (await import('@/app/api/admin/secrets/batch/disable/route')).POST },
    { path: '/export', method: 'POST', handler: (await import('@/app/api/admin/secrets/export/route')).POST },
  ];
});
beforeEach(async () => {
  await db.secret.deleteMany();
  await db.adminSession.deleteMany();
  const session = await (await import('@/services/auth')).login('synthetic-password-for-tests');
  cookie = `sd_session=${session.token}`;
  await (await import('@/services/batches')).createBatch({ secrets: ['route-synthetic-secret'], expiresAt: null, maxViews: 1 });
  id = (await db.secret.findFirstOrThrow()).id;
});
afterAll(async () => { await db?.$disconnect(); });
function call(index: number, options: { cookie?: string; origin?: string; body?: string; query?: string } = {}) {
  const route = routes[index];
  return route.handler(new Request(`http://localhost:3000/api/admin/secrets${route.path}${options.query ?? ''}`, {
    method: route.method, headers: { cookie: options.cookie ?? cookie, origin: options.origin ?? 'http://localhost:3000' },
    ...(route.method === 'GET' ? {} : { body: options.body ?? JSON.stringify({ ids: [id], format: 'txt' }) }),
  }), { params: Promise.resolve({ id }) });
}
it('rejects absent, forged and expired sessions for every management endpoint', async () => {
  for (const token of ['', 'sd_session=forged']) {
    for (let i = 0; i < routes.length; i++) expect((await call(i, { cookie: token })).status).toBe(401);
  }
  await db.adminSession.updateMany({ data: { expiresAt: new Date(0) } });
  for (let i = 0; i < routes.length; i++) expect((await call(i)).status).toBe(401);
  expect(await db.secret.count()).toBe(1);
});
it('rejects foreign and missing origins on all writes including reveal and export', async () => {
  for (const origin of ['', 'https://evil.example']) {
    for (let i = 2; i < routes.length; i++) expect((await call(i, { origin })).status).toBe(403);
  }
  expect(await db.secret.count()).toBe(1);
});
it('keeps metadata masked, reveals only explicitly and never increments views', async () => {
  for (const i of [0, 1]) {
    const response = await call(i);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.text()).not.toMatch(/route-synthetic-secret|ciphertext|authTag/);
  }
  expect(await (await call(3)).json()).toEqual({ content: 'route-synthetic-secret' });
  expect((await db.secret.findUniqueOrThrow({ where: { id } })).viewCount).toBe(0);
});
it('validates malformed queries, selection bodies and export formats without writes', async () => {
  expect((await call(0, { query: '?page=0' })).status).toBe(400);
  expect((await call(0, { query: '?createdFrom=nonsense' })).status).toBe(400);
  for (const i of [6, 7, 8]) {
    for (const body of ['{', '{}', '{"ids":[]}', '{"ids":[""]}', JSON.stringify({ ids: Array(5001).fill(id) })]) {
      expect((await call(i, { body })).status).toBe(400);
    }
  }
  expect((await call(8, { body: JSON.stringify({ ids: [id], format: 'raw' }) })).status).toBe(400);
  expect(await db.secret.count()).toBe(1);
});
it('exports only numbered links and performs selected mutations', async () => {
  const row = await db.secret.findUniqueOrThrow({ where: { id } });
  const txt = await call(8);
  expect(txt.headers.get('content-disposition')).toMatch(/attachment; filename="secret-links-.*\.txt"/);
  expect(txt.headers.get('cache-control')).toContain('no-store');
  expect((await txt.text()).trim()).toBe(`http://localhost:3000/k/${row.token}`);
  expect((await (await call(8, { body: JSON.stringify({ ids: [id], format: 'csv' }) })).text()).trim()).toBe(`index,url\n1,http://localhost:3000/k/${row.token}`);
  for (const i of [4, 7]) {
    expect((await call(i)).status).toBe(200);
    expect((await db.secret.findUniqueOrThrow({ where: { id } })).status).toBe('DISABLED');
    expect((await call(5)).status).toBe(200);
    expect((await db.secret.findUniqueOrThrow({ where: { id } })).status).toBe('ACTIVE');
  }
  expect(await (await call(6)).json()).toEqual({ count: 1 });
  expect((await call(1)).status).toBe(404);
});
it('returns generic errors when decryption fails, without encrypted data or stack', async () => {
  await db.secret.update({ where: { id }, data: { authTag: Buffer.alloc(16).toString('base64') } });
  const response = await call(3);
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: '服务暂时不可用，请稍后再试' });
});
