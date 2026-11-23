import pg from 'pg';
import { expect, inject, it } from 'vitest';
import { TEMPLATE_CLONE_LOCK, templateCloneSessionName, testDatabaseUrl } from './support/db';
import { adminUrl } from './support/server';

const { serverUrl } = inject('testDb');

async function untilWaiting(holder: pg.Client): Promise<void> {
  const deadline = Date.now() + 5_000;
  for (;;) {
    const { rows } = await holder.query<{ n: number }>(
      `SELECT count(*)::int AS n
         FROM pg_locks held
         JOIN pg_locks waiting USING (database, classid, objid, objsubid)
         JOIN pg_stat_activity waiter ON waiter.pid = waiting.pid
        WHERE held.pid = pg_backend_pid() AND held.locktype = 'advisory' AND held.granted
          AND waiting.locktype = 'advisory' AND NOT waiting.granted
          AND waiter.application_name = $1`,
      [templateCloneSessionName()],
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
    const pending = testDatabaseUrl();
    pending.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await untilWaiting(holder);
    expect(settled).toBe(false);
    await holder.query('SELECT pg_advisory_unlock(hashtext($1))', [TEMPLATE_CLONE_LOCK]);
    locked = false;
    const url = await pending;
    expect(new URL(url).pathname).toMatch(/^\/cyclereg_test_[a-z0-9_]+$/);
    // Same-session lock is reentrant, so the next clone cannot show a leaked lock. Another session can.
    await expect.poll(async () => {
      const { rows } = await holder.query<{ ok: boolean }>('SELECT pg_try_advisory_lock(hashtext($1)) AS ok', [TEMPLATE_CLONE_LOCK]);
      if (!rows[0].ok) return false;
      await holder.query('SELECT pg_advisory_unlock(hashtext($1))', [TEMPLATE_CLONE_LOCK]);
      return true;
    }, { timeout: 5_000 }).toBe(true);
    const again = await testDatabaseUrl();
    expect(new URL(again).pathname).not.toBe(new URL(url).pathname);
  } finally {
    if (locked) await holder.query('SELECT pg_advisory_unlock(hashtext($1))', [TEMPLATE_CLONE_LOCK]);
    await holder.end();
  }
});
