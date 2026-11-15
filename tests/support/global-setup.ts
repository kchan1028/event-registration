import pg from 'pg';
import type { TestProject } from 'vitest/node';
import { openDb } from '../../src/server/db';
import { adminUrl, TEST_SERVER_URL } from './server';

declare module 'vitest' {
  export interface ProvidedContext {
    testDb: { serverUrl: string; runId: string; template: string };
  }
}

/**
 * Creates one migrated template database per test run. Each test then clones
 * it (CREATE DATABASE ... TEMPLATE), which is much faster than migrating.
 * Teardown drops the template and every database this run created.
 */
export default async function setup(project: TestProject) {
  const runId = `${process.pid}_${Date.now().toString(36)}`;
  const template = `cyclereg_test_${runId}_template`;
  const admin = new pg.Client({ connectionString: adminUrl(TEST_SERVER_URL) });
  try {
    await admin.connect();
  } catch (err) {
    throw new Error(
      `The API tests need PostgreSQL at ${new URL(TEST_SERVER_URL).host} (set TEST_DATABASE_URL to change it). See docs/runbooks/local-setup.md. ${(err as Error).message}`,
    );
  }
  await admin.query(`CREATE DATABASE "${template}"`);
  const url = new URL(TEST_SERVER_URL);
  url.pathname = `/${template}`;
  const db = openDb(url.toString());
  await db.migrate();
  await db.close();
  project.provide('testDb', { serverUrl: TEST_SERVER_URL, runId, template });

  return async () => {
    const { rows } = await admin.query<{ datname: string }>(`SELECT datname FROM pg_database WHERE datname LIKE $1`, [`cyclereg_test_${runId}_%`]);
    for (const r of rows) await admin.query(`DROP DATABASE IF EXISTS "${r.datname}" WITH (FORCE)`);
    await admin.end();
  };
}
