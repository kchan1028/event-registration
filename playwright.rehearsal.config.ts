import { defineConfig, devices } from '@playwright/test';

// Isolated rehearsal runner. The default Playwright config ignores *.rehearsal.spec.ts
// so the regular suite does not treat a rehearsal as a regression test.
// This file uses its own port and a database whose name ends in _e2e.
const port = 3417;
const databaseUrl = process.env.REHEARSAL_DATABASE_URL ?? 'postgres://cyclereg:cyclereg@127.0.0.1:5432/cyclereg_phase3_rehearsal_e2e';

export default defineConfig({
  testDir: 'e2e/rehearsals',
  testMatch: '**/*.rehearsal.spec.ts',
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'on',
    screenshot: 'on',
    actionTimeout: 15_000,
  },
  expect: { timeout: 10_000 },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: `VITE_AUTH_MODE=test npm run build && DATABASE_URL='${databaseUrl}' tsx src/server/reset-db-cli.ts && AUTH_MODE=test SERVE_WEB=1 PORT=${port} DATABASE_URL='${databaseUrl}' tsx src/server/index.ts`,
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
