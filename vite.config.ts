import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiPort = Number(process.env.API_PORT ?? 3001);

export default defineConfig({
  plugins: [react()],
  root: 'src/web',
  build: { outDir: '../../dist/web', emptyOutDir: true },
  server: {
    host: '127.0.0.1',
    port: 5273,
    strictPort: true,
    proxy: { '/api/': `http://127.0.0.1:${apiPort}` },
  },
  test: {
    root: '.',
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // API tests run against PostgreSQL: one migrated template per run, one database per test (tests/support).
    globalSetup: ['tests/support/global-setup.ts'],
    testTimeout: 20_000,
  },
} as never);
