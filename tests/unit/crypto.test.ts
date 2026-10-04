import { afterEach, describe, expect, it, vi } from 'vitest';
import { encryptSecret, decryptSecret } from '@/lib/crypto';
import { createToken } from '@/lib/token';

afterEach(() => vi.unstubAllEnvs());
describe('authenticated encryption', () => {
  it('round trips Unicode and randomizes IVs without storing plaintext', () => {
    vi.stubEnv('SECRET_ENCRYPTION_KEY', Buffer.alloc(32, 7).toString('base64'));
    const value = encryptSecret('演示卡密 🔐 with spaces');
    expect(decryptSecret(value)).toBe('演示卡密 🔐 with spaces');
    expect(JSON.stringify(value)).not.toContain('演示卡密');
    expect(encryptSecret('演示卡密 🔐 with spaces').iv).not.toBe(value.iv);
    expect(Buffer.from(value.iv, 'base64')).toHaveLength(12);
  });
  it('rejects tampering and the wrong key', () => {
    vi.stubEnv('SECRET_ENCRYPTION_KEY', Buffer.alloc(32, 7).toString('base64'));
    const value = encryptSecret('synthetic-secret');
    expect(() => decryptSecret({ ...value, authTag: Buffer.alloc(16).toString('base64') })).toThrow();
    expect(() => decryptSecret({ ...value, ciphertext: Buffer.alloc(16).toString('base64') })).toThrow();
    vi.stubEnv('SECRET_ENCRYPTION_KEY', Buffer.alloc(32, 8).toString('base64'));
    expect(() => decryptSecret(value)).toThrow();
  });
  it.each(['', 'not base64', Buffer.alloc(31).toString('base64'), Buffer.alloc(33).toString('base64')])('rejects invalid keys', key => {
    vi.stubEnv('SECRET_ENCRYPTION_KEY', key);
    expect(() => encryptSecret('synthetic-secret')).toThrow();
  });
});
it('generates 192-bit URL-safe tokens', () => {
  const tokens = Array.from({ length: 1000 }, createToken);
  expect(tokens.every(token => /^[A-Za-z0-9_-]{32}$/.test(token))).toBe(true);
  expect(new Set(tokens).size).toBe(1000);
});
