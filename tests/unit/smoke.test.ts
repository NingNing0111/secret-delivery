import { describe, expect, it } from 'vitest';
import { getTestDatabaseUrl } from '../helpers/database';

describe('test database safety boundary', () => {
  it('never falls back to production DATABASE_URL', () => {
    expect(() => getTestDatabaseUrl({ DATABASE_URL: 'postgresql://localhost/production' })).toThrow();
  });
  it.each(['postgresql://localhost/production', 'postgresql://remote.example/secret_delivery_test', 'file:test.db'])('rejects unsafe cleanup target %s', (url) => {
    expect(() => getTestDatabaseUrl({ TEST_DATABASE_URL: url })).toThrow();
  });
  it('accepts the dedicated local test database', () => {
    expect(getTestDatabaseUrl({ TEST_DATABASE_URL: 'postgresql://test:test@127.0.0.1:55432/secret_delivery_test' })).toBe('postgresql://test:test@127.0.0.1:55432/secret_delivery_test');
  });
});
