import pg from 'pg';
import { expect, inject, it } from 'vitest';
import { TEMPLATE_CLONE_LOCK, testDatabaseUrl } from './support/db';
import { adminUrl } from './support/server';

const { serverUrl } = inject('testDb');

async function untilWaiting(holder: pg.Client): Promise<void> {
  const deadline = Date.now() + 5_000;
  for (;;) {
    const { rows } = await holder.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_locks
       WHERE locktype = 'advisory' AND NOT granted
         AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`,
    );
    if (rows[0].n > 0) return;
    if (Date.now() > deadline) throw new Error('clone did not wait for the template lock');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

it('clones a database after another session releases the template lock', async () => {
  const holder = new pg.Client({ connectionString: adminUrl(serverUrl) });
  await holder.connect();
  let locked = false;
  try {
    await holder.query('SELECT pg_advisory_lock(hashtext($1))', [TEMPLATE_CLONE_LOCK]);
    locked = true;
    let settled = false;
    const pending = testDatabaseUrl().then(
      (url) => {
        settled = true;
        return url;
      },
      (err) => {
        settled = true;
        throw err;
      },
    );
    await untilWaiting(holder);
    expect(settled).toBe(false);
    await holder.query('SELECT pg_advisory_unlock(hashtext($1))', [TEMPLATE_CLONE_LOCK]);
    locked = false;
    const url = await pending;
    expect(new URL(url).pathname).toMatch(/^\/cyclereg_test_[a-z0-9_]+$/);
    const again = await testDatabaseUrl();
    expect(new URL(again).pathname).not.toBe(new URL(url).pathname);
  } finally {
    if (locked) await holder.query('SELECT pg_advisory_unlock(hashtext($1))', [TEMPLATE_CLONE_LOCK]);
    await holder.end();
  }
});
