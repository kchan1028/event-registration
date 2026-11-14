import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against the production build served by the API server,
// using a throwaway database file so they never touch local working data.
const port = 3105;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: `npm run build && rm -f data/e2e.sqlite && NODE_ENV=production PORT=${port} DB_PATH=data/e2e.sqlite tsx src/server/index.ts`,
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
