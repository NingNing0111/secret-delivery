import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { db } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { ServiceError } from '@/lib/errors';

function sessionHash(token: string): string {
  return createHmac('sha256', getEnv().SESSION_SECRET).update(token).digest('hex');
}
export async function login(password: string): Promise<{ token: string; expiresAt: Date }> {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  if (!timingSafeEqual(digest(password), digest(getEnv().ADMIN_PASSWORD))) {
    throw new ServiceError('UNAUTHORIZED', '密码错误');
  }
  const now = new Date();
  await db.adminSession.deleteMany({ where: { expiresAt: { lte: now } } });
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + 12 * 3600_000);
  await db.adminSession.create({ data: { tokenHash: sessionHash(token), expiresAt } });
  return { token, expiresAt };
}
export async function requireAdmin(token: string | undefined): Promise<{ id: string }> {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new ServiceError('UNAUTHORIZED', '请先登录');
  const session = await db.adminSession.findUnique({ where: { tokenHash: sessionHash(token) }, select: { id: true, expiresAt: true } });
  if (!session || session.expiresAt <= new Date()) throw new ServiceError('UNAUTHORIZED', '请先登录');
  return { id: session.id };
}
export async function logout(token: string | undefined): Promise<void> {
  if (token) await db.adminSession.deleteMany({ where: { tokenHash: sessionHash(token) } });
}
