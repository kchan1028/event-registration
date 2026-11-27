import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { testApp, testDatabaseUrl } from './support/db';
import { publishReviewed } from './support/publish';

/* The public event read takes a shared event lock: other readers do not block it, a writer does. */

async function setup() {
  const databaseUrl = await testDatabaseUrl();
  const { app } = await testApp({ databaseUrl });
  const { eventId } = (await app.inject({ method: 'POST', url: '/api/demo' })).json<{ eventId: string }>();
  await publishReviewed(app, `/api/events/${eventId}`, { acknowledgeWarnings: true });
  const other = new pg.Client({ connectionString: databaseUrl });
  await other.connect();
  // Holds the event's advisory lock in another session, as a concurrent request would.
  const hold = async (mode: 'shared' | 'exclusive') => {
    await other.query('BEGIN');
    await other.query(mode === 'shared' ? 'SELECT pg_advisory_xact_lock_shared(hashtext($1))' : 'SELECT pg_advisory_xact_lock(hashtext($1))', [`event:${eventId}`]);
    return () => other.query('COMMIT');
  };
  const read = () => app.inject({ url: `/api/public/events/${eventId}` });
  return { other, hold, read };
}

describe('public event read lock', () => {
  it('is not blocked by another reader holding the shared event lock', async () => {
    const { other, hold, read } = await setup();
    try {
      const release = await hold('shared');
      const response = await read();
      expect(response.statusCode, response.body).toBe(200);
      await release();
    } finally {
      await other.end();
    }
  });

  it('waits for a writer holding the event lock and answers once it commits', async () => {
    const { other, hold, read } = await setup();
    try {
      const release = await hold('exclusive');
      let answered = false;
      const pending = read().then((response) => { answered = true; return response; });
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(answered).toBe(false);
      await release();
      const response = await pending;
      expect(response.statusCode, response.body).toBe(200);
    } finally {
      await other.end();
    }
  });
});
