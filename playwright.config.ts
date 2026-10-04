import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:3100', trace: 'off', screenshot: 'off' },
  webServer: { command: 'pnpm start', env: { PORT: '3100', HOSTNAME: '127.0.0.1' }, url: 'http://127.0.0.1:3100', reuseExistingServer: false },
});
