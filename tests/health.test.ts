import pg from 'pg';
import { expect, it } from 'vitest';
import { fakeAuth } from './support/auth';
import { testApp, testDatabaseUrl } from './support/db';
import { adminUrl } from './support/server';

it('reports a database outage and recovers on the same public health endpoint', async () => {
  const databaseUrl = await testDatabaseUrl();
  const name = new URL(databaseUrl).pathname.slice(1);
  expect(name).toMatch(/^cyclereg_test_[a-z0-9_]+$/);
  const { app } = await testApp({ databaseUrl, auth: fakeAuth() });
  const health = () => app.inject({ method: 'GET', url: '/api/health' });

  const before = await health();
  expect(before.statusCode).toBe(200);
  expect(before.json()).toEqual({ ok: true });

  const admin = new pg.Client({ connectionString: adminUrl(databaseUrl) });
  await admin.connect();
  try {
    // Refuse new connections and close only the existing connections to this disposable database.
    await admin.query(`ALTER DATABASE "${name}" ALLOW_CONNECTIONS false`);
    const { rows } = await admin.query<{ stopped: boolean }>(
      'SELECT pg_terminate_backend(pid, 5000) AS stopped FROM pg_stat_activity WHERE datname = $1',
      [name],
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(({ stopped }) => stopped)).toBe(true);

    const during = await health();
    expect(during.statusCode).toBe(503);
    expect(during.json()).toEqual({ ok: false, error: 'The database cannot be reached.' });
  } finally {
    try {
      await admin.query(`ALTER DATABASE "${name}" ALLOW_CONNECTIONS true`);
    } finally {
      await admin.end();
    }
  }

  const after = await health();
  expect(after.statusCode).toBe(200);
  expect(after.json()).toEqual({ ok: true });
}, 25_000);
