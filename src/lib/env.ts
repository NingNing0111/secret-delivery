import { z } from 'zod';
const schema = z.object({
  DATABASE_URL: z.string().url().refine(value => ['postgres:', 'postgresql:'].includes(URL.parse(value)?.protocol ?? '')),
  ADMIN_PASSWORD: z.string().min(16),
  SESSION_SECRET: z.string().min(32),
  SECRET_ENCRYPTION_KEY: z.string().refine(value => { const bytes = Buffer.from(value, 'base64'); return bytes.length === 32 && bytes.toString('base64') === value; }),
  PUBLIC_BASE_URL: z.string().url().refine(value => {
    const url = URL.parse(value);
    return !!url && ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash;
  }).transform(value => URL.parse(value)!.origin),
  REQUEST_BODY_LIMIT: z.coerce.number().int().positive().max(256 * 1024 * 1024).default(16 * 1024 * 1024),
});
export function parseEnv(values: Record<string, string | undefined>) {
  const result = schema.safeParse(values);
  if (!result.success) throw new Error(`Invalid configuration: ${result.error.issues.map(issue => issue.path.join('.')).join(', ')}`);
  return result.data;
}
export function getEnv() { return parseEnv(process.env); }
