import { expect, it } from 'vitest';
import { parseEnv } from '@/lib/env';
const valid = { DATABASE_URL: 'postgresql://localhost/example', ADMIN_PASSWORD: 'synthetic-password-long', SESSION_SECRET: 's'.repeat(32), SECRET_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'), PUBLIC_BASE_URL: 'https://example.test' };
it('validates deployment configuration and defaults', () => {
  expect(parseEnv(valid).REQUEST_BODY_LIMIT).toBe(16777216);
  expect(parseEnv(valid).PUBLIC_BASE_URL).toBe('https://example.test');
});
it.each(['DATABASE_URL', 'ADMIN_PASSWORD', 'SESSION_SECRET', 'SECRET_ENCRYPTION_KEY', 'PUBLIC_BASE_URL'])('rejects missing %s', field => {
  expect(() => parseEnv({ ...valid, [field]: '' })).toThrow();
});
it.each(['https://user:pass@example.test', 'https://example.test/path', 'ftp://example.test', 'https://example.test?x=1'])('rejects unsafe public URL %s', PUBLIC_BASE_URL => {
  expect(() => parseEnv({ ...valid, PUBLIC_BASE_URL })).toThrow();
});
it('rejects invalid byte limits and short keys', () => {
  expect(() => parseEnv({ ...valid, REQUEST_BODY_LIMIT: '0' })).toThrow();
  expect(() => parseEnv({ ...valid, SECRET_ENCRYPTION_KEY: 'broken' })).toThrow();
  expect(() => parseEnv({ ...valid, SESSION_SECRET: 'short' })).toThrow();
});
