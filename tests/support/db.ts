import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterAll, afterEach, inject } from 'vitest';
import { buildApp, type AppOptions } from '../../src/server/app';
import { adminUrl } from './server';
import { DEFAULT_TEST_ORGANIZER, fakeAuth } from './auth';

/**
 * Disposable PostgreSQL databases for API tests. Each call clones the migrated
 * template made in global-setup.ts, so every test starts empty, as `:memory:`
 * SQLite did. Clones take one session advisory lock so workers copy that
 * template one at a time. Apps are closed after each test; the run's databases
 * are dropped when the run ends (global-setup.ts).
 */

const { serverUrl, runId, template } = inject('testDb');
const open = new Set<FastifyInstance>();
let admin: pg.Client | null = null;
let counter = 0;

/** Serializes template clones across workers. Session-level: CREATE DATABASE cannot run inside a transaction. */
export const TEMPLATE_CLONE_LOCK = 'cyclereg-test-template-clone';
/** Stay inside Vitest's 20s test timeout when the template lock is busy. */
const CLONE_BUDGET_MS = 12_000;

async function adminClient(): Promise<pg.Client> {
  if (!admin) {
    admin = new pg.Client({ connectionString: adminUrl(serverUrl) });
    await admin.connect();
  }
  return admin;
}

function cloneWait(err: unknown, deadline: number): boolean {
  const code = (err as { code?: string }).code;
  // 55006: template is in use. 55P03: lock_timeout while waiting to copy it.
  return (code === '55006' || code === '55P03') && Date.now() < deadline;
}

function pause(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 100));
}

/** A new, empty, migrated database (or with `empty`, one with no tables). Returns its connection string. */
export async function testDatabaseUrl(opts: { empty?: boolean } = {}): Promise<string> {
  const name = `cyclereg_test_${runId}_${process.pid}_${++counter}`;
  const client = await adminClient();
  const deadline = Date.now() + CLONE_BUDGET_MS;
  let held = false;
  let failure: unknown;
  try {
    // One queued wait. A short timeout here would drop the waiter to the back of the line.
    await client.query(`SET lock_timeout = ${CLONE_BUDGET_MS}`);
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [TEMPLATE_CLONE_LOCK]);
    held = true;
    // A leftover template lock should fail fast enough to retry inside the same budget.
    await client.query(`SET lock_timeout = 3000`);
    const sql = opts.empty ? `CREATE DATABASE "${name}"` : `CREATE DATABASE "${name}" TEMPLATE "${template}"`;
    for (;;) {
      try {
        await client.query(sql);
        break;
      } catch (err) {
        if (!cloneWait(err, deadline)) throw err;
        await pause();
      }
    }
  } catch (err) {
    failure = err;
    throw err;
  } finally {
    if (held) {
      try {
        await client.query('SELECT pg_advisory_unlock(hashtext($1))', [TEMPLATE_CLONE_LOCK]);
      } catch (unlockErr) {
        // Ending the session releases the lock if the unlock itself failed.
        await client.end().catch(() => undefined);
        admin = null;
        if (!failure) throw unlockErr;
      }
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
