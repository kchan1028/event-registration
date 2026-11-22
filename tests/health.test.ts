import pg from 'pg';
import { expect, it } from 'vitest';
import { fakeAuth } from './support/auth';
import { MIGRATIONS, openDb } from '../src/server/db';
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

it.each(['between queries', 'during a query', 'between nested queries'])('rejects a transaction whose connection drops %s and keeps serving', async (when) => {
  const databaseUrl = await testDatabaseUrl();
  const reported: Error[] = [];
  const db = openDb(databaseUrl, (err) => reported.push(err));
  const other = new pg.Client({ connectionString: databaseUrl });
  await other.connect();
  try {
    await db.run('CREATE TABLE drop_probe (id integer)');
    let interrupted: unknown;
    let stopped: unknown;
    let active = when !== 'during a query';
    const drop = async () => {
      const { pid } = (await db.get<{ pid: number }>('SELECT pg_backend_pid() AS pid'))!;
      await db.run('INSERT INTO drop_probe VALUES (1)');
      const waiting = when === 'during a query' ? db.run('SELECT pg_sleep(5)') : null;
      const outcome = waiting?.then(() => new Error('The query was not interrupted.'), (err: Error) => err);
      if (waiting) {
        for (let i = 0; i < 80 && !active; i++) {
          active = (await other.query(`SELECT 1 FROM pg_stat_activity WHERE pid = $1 AND state = 'active' AND query LIKE '%pg_sleep%'`, [pid])).rowCount === 1;
          if (!active) await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }
      stopped = (await other.query('SELECT pg_terminate_backend($1, 5000) AS stopped', [pid])).rows;
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (outcome) {
        interrupted = await outcome;
        throw interrupted;
      }
    };
    await expect(db.transaction(() => (when === 'between nested queries' ? db.transaction(drop) : drop()))).rejects.toThrow();
    // Checked out here, where a failed check cannot pass as the expected rejection.
    if (when === 'during a query') expect(interrupted).toMatchObject({ code: '57P01' });
    expect(active).toBe(true);
    expect(stopped).toEqual([{ stopped: true }]);
    expect(reported).toHaveLength(1);
    expect(await db.all('SELECT id FROM drop_probe')).toEqual([]);
    await db.transaction(() => db.run('INSERT INTO drop_probe VALUES (2)'));
    expect(await db.all('SELECT id FROM drop_probe')).toEqual([{ id: 2 }]);
  } finally {
    await other.end();
    await db.close();
  }
});

it('rejects a migration whose connection drops and migrates on the next try', async () => {
  const databaseUrl = await testDatabaseUrl({ empty: true });
  const db = openDb(databaseUrl);
  const other = new pg.Client({ connectionString: databaseUrl });
  await other.connect();
  try {
    await other.query('SELECT pg_advisory_lock($1)', [4_241_017]);
    const outcome = db.migrate().then(() => null, (err: Error) => err);
    const waiting = async () => (await other.query<{ pid: number }>(
      `SELECT pid FROM pg_locks WHERE locktype = 'advisory' AND NOT granted AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`,
    )).rows;
    await expect.poll(async () => (await waiting()).length, { timeout: 5000 }).toBe(1);
    await other.query('SELECT pg_terminate_backend($1, 5000)', [(await waiting())[0]!.pid]);
    expect(await outcome).toBeInstanceOf(Error);
    await other.query('SELECT pg_advisory_unlock($1)', [4_241_017]);
    await db.migrate();
    expect(await db.get('SELECT max(version) AS version FROM schema_migrations')).toEqual({ version: MIGRATIONS.length });
  } finally {
    await other.end();
    await db.close();
  }
});

it('survives a connection error during the handoff from idle to checked out', async () => {
  const reported: Error[] = [];
  const db = openDb(await testDatabaseUrl(), (err) => reported.push(err));
  const connect = pg.Pool.prototype.connect;
  try {
    await db.get('SELECT 1');
    pg.Pool.prototype.connect = async function (this: pg.Pool) {
      const client = await (connect as () => Promise<pg.PoolClient>).call(this);
      // The pool has stopped listening, and the caller has not resumed yet.
      client.emit('error', new Error('Fictional loss during handoff'));
      return client;
    } as typeof connect;
    await db.transaction(async () => undefined).catch(() => undefined);
    expect(reported.map((err) => err.message)).toContain('Fictional loss during handoff');
  } finally {
    pg.Pool.prototype.connect = connect;
    await db.close();
  }
});
