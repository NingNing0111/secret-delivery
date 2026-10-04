import { beforeEach, expect, it } from 'vitest';
import { assertSameOrigin, sessionCookie, errorResponse } from '@/lib/http';
import { LoginLimiter } from '@/lib/login-limiter';
import { ServiceError } from '@/lib/errors';
beforeEach(() => { process.env.PUBLIC_BASE_URL = 'https://secrets.example'; });
it('rejects absent and cross-origin requests', () => {
  expect(() => assertSameOrigin(new Request('https://secrets.example/api'))).toThrow();
  expect(() => assertSameOrigin(new Request('https://secrets.example/api', { headers: { origin: 'https://evil.example' } }))).toThrow();
  expect(() => assertSameOrigin(new Request('https://secrets.example/api', { headers: { origin: 'https://secrets.example' } }))).not.toThrow();
});
it('uses secure production cookies and explicit local development cookies', () => {
  const production = sessionCookie('abc', new Date(0), true);
  expect(production).toContain('HttpOnly');
  expect(production).toContain('Secure');
  expect(production).toContain('SameSite=Lax');
  expect(sessionCookie('abc', new Date(0), false)).not.toContain('Secure');
});
it('sanitizes internal errors and prevents caching', async () => {
  const response = errorResponse(new Error('sensitive SQL or secret'));
  expect(response.status).toBe(500);
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(await response.text()).not.toContain('sensitive');
  expect(errorResponse(new ServiceError('RATE_LIMITED', '稍后再试')).status).toBe(429);
});
it('bounds login attempts without trusting spoofed client identifiers', () => {
  const limiter = new LoginLimiter(3, 1000);
  for (let i = 0; i < 3; i++) limiter.consume(0);
  expect(() => limiter.consume(1)).toThrow();
  expect(() => limiter.consume(1000)).not.toThrow();
});
