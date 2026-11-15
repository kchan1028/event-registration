import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterAll, afterEach, inject } from 'vitest';
import { buildApp, type AppOptions } from '../../src/server/app';
import { adminUrl } from './server';
import { DEFAULT_TEST_ORGANIZER, fakeAuth } from './auth';

/**
 * Disposable PostgreSQL databases for API tests. Each call clones the migrated
 * template made in global-setup.ts, so every test starts empty, as `:memory:`
 * SQLite did. Apps are closed after each test; the run's databases are dropped
 * when the run ends (global-setup.ts).
 */

const { serverUrl, runId, template } = inject('testDb');
const open = new Set<FastifyInstance>();
let admin: pg.Client | null = null;
let counter = 0;

async function adminClient(): Promise<pg.Client> {
  if (!admin) {
    admin = new pg.Client({ connectionString: adminUrl(serverUrl) });
    await admin.connect();
  }
  return admin;
}

/** A new, empty, migrated database (or with `empty`, one with no tables). Returns its connection string. */
export async function testDatabaseUrl(opts: { empty?: boolean } = {}): Promise<string> {
  const name = `cyclereg_test_${runId}_${process.pid}_${++counter}`;
  const client = await adminClient();
  // Cloning fails while another session is copying the same template; retry briefly.
  for (let attempt = 0; ; attempt++) {
    try {
      await client.query(opts.empty ? `CREATE DATABASE "${name}"` : `CREATE DATABASE "${name}" TEMPLATE "${template}"`);
      break;
    } catch (err) {
      if ((err as { code?: string }).code !== '55006' || attempt >= 50) throw err;
      await new Promise((r) => setTimeout(r, 50 + Math.random() * 100));
    }
  }
  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

/**
 * buildApp on a fresh database (or the given one). The app is closed after the test.
 * Unless `auth` is given, requests without a sign-in header act as one fictional organizer
 * (tests/support/auth.ts), who owns every organization they create or load.
 */
export async function testApp(opts: Partial<AppOptions> = {}) {
  const built = buildApp({ ...opts, auth: opts.auth ?? fakeAuth({ defaultEmail: DEFAULT_TEST_ORGANIZER }), databaseUrl: opts.databaseUrl ?? (await testDatabaseUrl()) });
  open.add(built.app);
  built.app.addHook('onClose', async () => {
    open.delete(built.app);
  });
  return built;
}

afterEach(async () => {
  await Promise.all([...open].map((app) => app.close()));
});

// The databases are dropped once, in global-setup.ts teardown. Dropping them here, per file,
// competes with other files' CREATE DATABASE and can exceed the hook timeout.
afterAll(async () => {
  await admin?.end();
  admin = null;
});
