import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterAll, afterEach, inject } from 'vitest';
import { buildApp, type AppOptions } from '../../src/server/app';
import { adminUrl } from './server';

/**
 * Disposable PostgreSQL databases for API tests. Each call clones the migrated
 * template made in global-setup.ts, so every test starts empty, as `:memory:`
 * SQLite did. Apps are closed after each test; the file's databases are dropped
 * after the file.
 */

const { serverUrl, runId, template } = inject('testDb');
const created: string[] = [];
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

/** A new, empty, migrated database. Returns its connection string. */
export async function testDatabaseUrl(): Promise<string> {
  const name = `cyclereg_test_${runId}_${process.pid}_${++counter}`;
  const client = await adminClient();
  // Cloning fails while another session is copying the same template; retry briefly.
  for (let attempt = 0; ; attempt++) {
    try {
      await client.query(`CREATE DATABASE "${name}" TEMPLATE "${template}"`);
      break;
    } catch (err) {
      if ((err as { code?: string }).code !== '55006' || attempt >= 50) throw err;
      await new Promise((r) => setTimeout(r, 50 + Math.random() * 100));
    }
  }
  created.push(name);
  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

/** buildApp on a fresh database (or the given one). The app is closed after the test. */
export async function testApp(opts: Partial<AppOptions> = {}) {
  const built = buildApp({ ...opts, databaseUrl: opts.databaseUrl ?? (await testDatabaseUrl()) });
  open.add(built.app);
  built.app.addHook('onClose', async () => {
    open.delete(built.app);
  });
  return built;
}

afterEach(async () => {
  await Promise.all([...open].map((app) => app.close()));
});

afterAll(async () => {
  if (!admin) return;
  for (const name of created.splice(0)) await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.end();
  admin = null;
});
