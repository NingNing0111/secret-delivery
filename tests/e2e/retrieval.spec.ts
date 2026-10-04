import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { createCipheriv, randomBytes, randomUUID } from 'node:crypto';
import { getTestDatabaseUrl } from '../helpers/database';

const db = new PrismaClient({ datasources: { db: { url: getTestDatabaseUrl() } } });
const content = `synthetic-browser-secret-${'长ABC'.repeat(500)}`;
async function seed(data: Record<string, unknown> = {}) {
  const iv = randomBytes(12);
  const encryptor = createCipheriv('aes-256-gcm', Buffer.from(process.env.SECRET_ENCRYPTION_KEY!, 'base64'), iv);
  const ciphertext = Buffer.concat([encryptor.update(content, 'utf8'), encryptor.final()]).toString('base64');
  return db.secret.create({ data: {
    token: randomBytes(24).toString('base64url'), ciphertext, iv: iv.toString('base64'), authTag: encryptor.getAuthTag().toString('base64'),
    batchId: randomUUID(), batchIndex: 0, ...data,
  } });
}
test.beforeEach(async () => { await db.secret.deleteMany(); });
test.afterAll(async () => { await db.$disconnect(); });
test('production navigation consumes once, copy does not, refresh consumes again; mobile wraps', async ({ page, context }) => {
  const row = await seed();
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize({ width: 375, height: 812 });
  const response = await page.goto(`/k/${row.token}`);
  expect(response?.headers()['cache-control']).toContain('no-store');
  await expect(page.getByRole('heading', { name: '商品提取成功' })).toBeVisible();
  await expect(page.getByTestId('secret-content')).toHaveText(content);
  await page.getByRole('button', { name: '一键复制全部内容' }).click();
  await expect(page.getByRole('status')).toHaveText('已复制');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(content);
  expect((await db.secret.findUniqueOrThrow({ where: { id: row.id } })).viewCount).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(await page.locator('a[href^="/admin"]').count()).toBe(0);
  await page.reload();
  await expect(page.getByTestId('secret-content')).toHaveText(content);
  expect((await db.secret.findUniqueOrThrow({ where: { id: row.id } })).viewCount).toBe(2);
});
test('HEAD and explicit prefetch never consume page or API quotas', async ({ request }) => {
  const row = await seed({ maxViews: 1 });
  for (const path of [`/k/${row.token}`, `/api/secret/${row.token}`]) {
    expect((await request.head(path)).status()).toBe(204);
    for (const header of ['purpose', 'next-router-prefetch', 'sec-purpose']) {
      expect((await request.get(path, { headers: { [header]: header === 'next-router-prefetch' ? '1' : 'prefetch' } })).status(), `${path.split('/')[1]} ${header}`).toBe(204);
    }
  }
  expect((await db.secret.findUniqueOrThrow({ where: { id: row.id } })).viewCount).toBe(0);
  const response = await request.get(`/api/secret/${row.token}`);
  expect(response.headers()['cache-control']).toContain('no-store');
  expect(await response.json()).toMatchObject({ ok: true, content });
  expect((await db.secret.findUniqueOrThrow({ where: { id: row.id } })).viewCount).toBe(1);
});
test('shows all four unavailable states without internal metadata', async ({ page }) => {
  const expired = await seed({ expiresAt: new Date(0) });
  const disabled = await seed({ status: 'DISABLED' });
  const exhausted = await seed({ maxViews: 1, viewCount: 1 });
  for (const [token, title] of [
    ['missing', '提取链接不存在'], [expired.token, '提取链接已过期'],
    [disabled.token, '该提取链接已失效'], [exhausted.token, '该提取链接已达到最大查看次数'],
  ]) {
    await page.goto(`/k/${token}`);
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    const html = await page.content();
    for (const value of [content, expired.id, disabled.id, exhausted.id, expired.ciphertext]) expect(html).not.toContain(value);
  }
});
test('copy denial gives a manual-copy message', async ({ page }) => {
  const row = await seed();
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('denied'); } } }));
  await page.goto(`/k/${row.token}`);
  await page.getByRole('button', { name: '一键复制全部内容' }).click();
  await expect(page.getByRole('status')).toHaveText('复制失败，请选中上方内容手动复制');
});
