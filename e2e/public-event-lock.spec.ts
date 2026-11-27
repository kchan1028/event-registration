// @covers src/server/orders.ts
// @covers src/server/db.ts
import pg from 'pg';
import type { APIResponse } from '@playwright/test';
import { expect, test, type Page } from './fixtures';
import { publishReviewed } from './support/publish';

const EVENT_NAME = 'Example Valley Omnium (demonstration)';

function databaseUrl(): string {
  const url = new URL(process.env.E2E_DATABASE_URL ?? 'postgres://cyclereg:cyclereg@127.0.0.1:5432/cyclereg_e2e');
  expect(['localhost', '127.0.0.1', '::1', '[::1]']).toContain(url.hostname);
  return url.toString();
}

/** Number of sessions in this database queued for an advisory lock they have not been granted. */
async function advisoryWaiters(): Promise<number> {
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND NOT granted AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`);
    return rows[0].n as number;
  } finally {
    await client.end();
  }
}

async function publishedEvent(page: Page) {
  const { eventId } = await (await page.request.post('/api/demo')).json();
  expect((await page.request.delete(`/api/events/${eventId}/test-entries`)).status()).toBe(200);
  expect((await publishReviewed(page.request, `/api/events/${eventId}`, { acknowledgeWarnings: true })).status()).toBe(200);
  const event = await (await page.request.get(`/api/events/${eventId}`)).json();
  const categoryId = event.config.categories.find((category: { timingCode: string }) => category.timingCode === 'RR-M35-34').id as string;
  return { eventId, publishedVersion: event.publishedVersion as number, categoryId };
}

async function expectPublicSnapshot(response: APIResponse, eventId: string, publishedVersion: number, categoryId: string) {
  const text = await response.text();
  expect(response.status(), text).toBe(200);
  const body = JSON.parse(text);
  expect(body.eventId).toBe(eventId);
  expect(body.publishedVersion).toBe(publishedVersion);
  expect(body.config.event.name).toBe(EVENT_NAME);
  expect(body.cancellation).toEqual({ scopes: [], categoryIds: [] });
  expect(body.remaining[categoryId]).toBe(60);
  return body;
}

/** Holds the event advisory lock the public read uses, in another database session. */
async function holdEventLock(eventId: string, mode: 'shared' | 'exclusive') {
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  let committed = false;
  try {
    await client.query('BEGIN');
    await client.query(
      mode === 'shared' ? 'SELECT pg_advisory_xact_lock_shared(hashtext($1))' : 'SELECT pg_advisory_xact_lock(hashtext($1))',
      [`event:${eventId}`],
    );
  } catch (error) {
    await client.end().catch(() => {});
    throw error;
  }
  return {
    async release() {
      if (committed) return;
      await client.query('COMMIT');
      committed = true;
    },
    async close() {
      if (!committed) await client.query('ROLLBACK').catch(() => {});
      await client.end();
    },
  };
}

test('registration page loads while another public reader holds the event lock', { tag: '@smoke' }, async ({ page }) => {
  const { eventId, publishedVersion, categoryId } = await publishedEvent(page);
  const holder = await holdEventLock(eventId, 'shared');
  try {
    const [first, second] = await Promise.all([
      page.request.get(`/api/public/events/${eventId}`, { timeout: 8_000 }),
      page.request.get(`/api/public/events/${eventId}`, { timeout: 8_000 }),
    ]);
    const firstBody = await expectPublicSnapshot(first, eventId, publishedVersion, categoryId);
    const secondBody = await expectPublicSnapshot(second, eventId, publishedVersion, categoryId);
    expect(secondBody.remaining).toEqual(firstBody.remaining);
    expect(secondBody.cancellation).toEqual(firstBody.cancellation);

    await page.goto(`/#/register/${eventId}`, { timeout: 8_000 });
    await expect(page.getByRole('heading', { name: EVENT_NAME })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Saturday road race' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /RR-M35-34/ })).toBeVisible();
  } finally {
    await holder.close();
  }
});

test('public event read waits for a writer holding the event lock', async ({ page }) => {
  const { eventId, publishedVersion, categoryId } = await publishedEvent(page);
  const holder = await holdEventLock(eventId, 'exclusive');
  let answered = false;
  const pending = page.request.get(`/api/public/events/${eventId}`).then((response) => {
    answered = true;
    return response;
  });
  try {
    // The read is queued on the held event lock in PostgreSQL, not merely slow.
    await expect.poll(advisoryWaiters).toBe(1);
    expect(answered).toBe(false);
    await holder.release();
    await expectPublicSnapshot(await pending, eventId, publishedVersion, categoryId);

    await page.goto(`/#/register/${eventId}`);
    await expect(page.getByRole('heading', { name: EVENT_NAME })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Saturday road race' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /RR-M35-34/ })).toBeVisible();
  } finally {
    await holder.close();
    await pending.catch(() => {});
  }
});
