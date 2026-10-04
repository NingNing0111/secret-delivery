import { afterEach, expect, it, vi } from 'vitest';
import { sessionCookie } from '@/lib/http';
afterEach(() => vi.unstubAllEnvs());
it('defaults production cookies to Secure and permits only explicit loopback HTTP override', () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('PUBLIC_BASE_URL', 'https://secrets.example.com');
  vi.stubEnv('ALLOW_INSECURE_LOCAL_COOKIE', 'true');
  expect(sessionCookie('test', new Date())).toContain('; Secure');
  vi.stubEnv('PUBLIC_BASE_URL', 'http://127.0.0.1:8080');
  expect(sessionCookie('test', new Date())).not.toContain('; Secure');
  vi.stubEnv('ALLOW_INSECURE_LOCAL_COOKIE', 'false');
  expect(sessionCookie('test', new Date())).toContain('; Secure');
});
