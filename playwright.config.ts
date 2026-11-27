import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against the production build served by the API server,
// using a throwaway PostgreSQL database (reset before each run) so they never touch local working data.
// Sign-in uses the local-only test provider (AUTH_MODE=test, fictional .test emails), so no Clerk keys
// are needed. That provider refuses NODE_ENV=production, so the server serves the build with SERVE_WEB=1.
const port = 3105;
const databaseUrl = process.env.E2E_DATABASE_URL ?? 'postgres://cyclereg:cyclereg@127.0.0.1:5432/cyclereg_e2e';

export default defineConfig({
  testDir: 'e2e',
  testIgnore: '**/*.rehearsal.spec.ts',
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
    command: `VITE_AUTH_MODE=test npm run build && DATABASE_URL='${databaseUrl}' tsx src/server/reset-db-cli.ts && AUTH_MODE=test SERVE_WEB=1 PORT=${port} DATABASE_URL='${databaseUrl}' tsx src/server/index.ts`,
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
