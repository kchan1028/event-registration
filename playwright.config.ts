import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against the production build served by the API server,
// using a throwaway PostgreSQL database (reset before each run) so they never touch local working data.
const port = 3105;
const databaseUrl = process.env.E2E_DATABASE_URL ?? 'postgres://cyclereg:cyclereg@127.0.0.1:5432/cyclereg_e2e';

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
    command: `npm run build && DATABASE_URL='${databaseUrl}' tsx src/server/reset-db-cli.ts && NODE_ENV=production PORT=${port} DATABASE_URL='${databaseUrl}' tsx src/server/index.ts`,
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
