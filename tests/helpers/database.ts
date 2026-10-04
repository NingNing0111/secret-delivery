export function getTestDatabaseUrl(env: Record<string, string | undefined> = process.env): string {
  const value = env.TEST_DATABASE_URL;
  if (!value) throw new Error('TEST_DATABASE_URL is required; production fallback is forbidden');
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]', 'db-test'].includes(url.hostname) || url.pathname !== '/secret_delivery_test') {
    throw new Error('Only the dedicated local secret_delivery_test database is allowed');
  }
  return value;
}
