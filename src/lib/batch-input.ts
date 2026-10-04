import { z } from 'zod';
import { ServiceError } from './errors';
import type { CreateBatchInput } from '@/services/types';
export function normalizeLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/).map(line => line.trim()).filter(Boolean);
}
const schema = z.object({
  text: z.string(),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
  maxViews: z.number().int().positive().max(2147483647).nullable().optional(),
});
export function parseBatchInput(value: unknown): CreateBatchInput {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ServiceError('INVALID_INPUT', '请检查内容、有效期和查看次数');
  const secrets = normalizeLines(parsed.data.text);
  if (!secrets.length || secrets.length > 5000) throw new ServiceError('INVALID_INPUT', '每批需要 1 至 5000 条有效内容');
  if (secrets.some(secret => Buffer.byteLength(secret, 'utf8') > 32768)) throw new ServiceError('INVALID_INPUT', '单条内容不能超过 32 KB');
  const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
  if (expiresAt && expiresAt.getTime() <= Date.now()) throw new ServiceError('INVALID_INPUT', '有效期必须晚于当前时间');
  return { secrets, expiresAt, maxViews: parsed.data.maxViews ?? null };
}
