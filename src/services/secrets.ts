import { Prisma, type Secret } from '@prisma/client';
import { z } from 'zod';
import { db } from '@/lib/db';
import { decryptSecret } from '@/lib/crypto';
import { getEnv } from '@/lib/env';
import { ServiceError } from '@/lib/errors';
import { secretPreview } from '@/lib/preview';

// Filter controls explicitly use UTC, never the deployment host's local timezone.
const date = z.string().min(1).transform(value => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value) ? `${value}Z` : value)
  .refine(value => Number.isFinite(Date.parse(value)), '日期无效');
const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().max(128).optional(),
  status: z.enum(['ACTIVE', 'EXPIRED', 'DISABLED']).optional(),
  createdFrom: date.optional(), createdTo: date.optional(),
  expiresFrom: date.optional(), expiresTo: date.optional(),
}).refine(q => (!q.createdFrom || !q.createdTo || Date.parse(q.createdFrom) <= Date.parse(q.createdTo)) && (!q.expiresFrom || !q.expiresTo || Date.parse(q.expiresFrom) <= Date.parse(q.expiresTo)));
export type SecretQuery = z.input<typeof querySchema>;
const idsSchema = z.array(z.string().trim().min(1).max(128)).min(1).max(5000);
export function parseIds(value: unknown): string[] {
  const result = idsSchema.safeParse(value);
  if (!result.success) throw new ServiceError('INVALID_INPUT', '请选择 1–5000 条记录');
  return [...new Set(result.data)];
}
export function stateWhere(status: 'ACTIVE' | 'EXPIRED' | 'DISABLED', now: Date): Prisma.SecretWhereInput {
  if (status === 'DISABLED') return { status: 'DISABLED' };
  if (status === 'EXPIRED') return { status: 'ACTIVE', expiresAt: { lte: now } };
  return { status: 'ACTIVE', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
}
function metadata(row: Secret) {
  return {
    id: row.id, token: row.token, url: `${getEnv().PUBLIC_BASE_URL}/k/${row.token}`,
    status: row.status, expiresAt: row.expiresAt, maxViews: row.maxViews,
    viewCount: row.viewCount, lastViewedAt: row.lastViewedAt,
    createdAt: row.createdAt, updatedAt: row.updatedAt,
    batchId: row.batchId, batchIndex: row.batchIndex,
    preview: secretPreview(decryptSecret(row)),
  };
}
export type SecretMetadata = ReturnType<typeof metadata>;
export async function listSecrets(query: SecretQuery = {}): Promise<{ items: SecretMetadata[]; total: number }> {
  const parsed = querySchema.safeParse(query);
  if (!parsed.success) throw new ServiceError('INVALID_INPUT', '分页或筛选条件无效');
  const q = parsed.data;
  const where: Prisma.SecretWhereInput = { AND: [
    ...(q.status ? [stateWhere(q.status, new Date())] : []),
    ...(q.search ? [{ OR: [{ id: q.search }, { token: q.search }] }] : []),
    ...(q.createdFrom || q.createdTo ? [{ createdAt: { ...(q.createdFrom ? { gte: new Date(q.createdFrom) } : {}), ...(q.createdTo ? { lte: new Date(q.createdTo) } : {}) } }] : []),
    ...(q.expiresFrom || q.expiresTo ? [{ expiresAt: { ...(q.expiresFrom ? { gte: new Date(q.expiresFrom) } : {}), ...(q.expiresTo ? { lte: new Date(q.expiresTo) } : {}) } }] : []),
  ] };
  const [rows, total] = await db.$transaction([
    db.secret.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    db.secret.count({ where }),
  ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  return { items: rows.map(metadata), total };
}
async function findSecret(id: string) {
  parseIds([id]);
  const row = await db.secret.findUnique({ where: { id } });
  if (!row) throw new ServiceError('NOT_FOUND', '记录不存在');
  return row;
}
export async function getSecret(id: string): Promise<SecretMetadata> { return metadata(await findSecret(id)); }
export async function revealSecret(id: string): Promise<string> { return decryptSecret(await findSecret(id)); }
export async function setSecretStatus(ids: string[], status: 'ACTIVE' | 'DISABLED'): Promise<number> {
  return (await db.secret.updateMany({ where: { id: { in: parseIds(ids) } }, data: { status } })).count;
}
export async function deleteSecrets(ids: string[]): Promise<number> {
  return (await db.secret.deleteMany({ where: { id: { in: parseIds(ids) } } })).count;
}
export async function getExportUrls(ids: string[]): Promise<string[]> {
  const selected = parseIds(ids);
  // Batch timestamp is shared by all rows created by createBatch, including chunks.
  const rows = await db.secret.findMany({ where: { id: { in: selected } }, select: { token: true }, orderBy: [{ createdAt: 'asc' }, { batchId: 'asc' }, { batchIndex: 'asc' }] });
  const base = getEnv().PUBLIC_BASE_URL;
  return rows.map(row => `${base}/k/${row.token}`);
}
