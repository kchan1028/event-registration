import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { as, DEFAULT_TEST_ORGANIZER, fakeAuth } from './support/auth';
import { testApp, testDatabaseUrl } from './support/db';

const PHONE = '555-555-0199';
const NAME = 'Robin Demo';

describe('emergency contact lookup', () => {
  it('lets every organizer role look up a contact and records the lookup without storing it', async () => {
    const databaseUrl = await testDatabaseUrl();
    const now = new Date('2027-03-01T18:00:00Z');
    const { app } = await testApp({ databaseUrl, auth: fakeAuth(), now: () => now });
    const owner = as(DEFAULT_TEST_ORGANIZER);
    const demo = await app.inject({ method: 'POST', url: '/api/demo', headers: owner });
    expect(demo.statusCode).toBe(201);
    const { eventId, organizationId } = demo.json() as { eventId: string; organizationId: string };
    expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/publish`, headers: owner, payload: { acknowledgeWarnings: true } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/check-in-demo-riders`, headers: owner })).statusCode).toBe(201);

    const list = (await app.inject({ method: 'GET', url: `/api/events/${eventId}/check-in`, headers: owner })).json() as {
      riders: { orderId: string; name: string; entries: { id: string }[] }[];
    };
    const alex = list.riders.find((r) => r.name.startsWith('Alex'))!;
    const entryId = alex.entries[0].id;
    const lookup = (headers: Record<string, string> | undefined, payload: Record<string, string>, url = `/api/events/${eventId}/emergency-contact`) =>
      app.inject({ method: 'POST', url, headers, payload });

    expect((await lookup(undefined, { orderId: alex.orderId })).statusCode).toBe(401);
    expect((await lookup(as('rider.only@example.test'), { orderId: alex.orderId })).statusCode).toBe(404);
    expect((await lookup(owner, { orderId: alex.orderId, entryId })).statusCode).toBe(400);

    for (const role of ['registration_manager', 'check_in_volunteer', 'timer_export', 'finance'] as const) {
      const grant = await app.inject({
        method: 'POST',
        url: `/api/organizations/${organizationId}/members`,
        headers: owner,
        payload: { email: `${role}@example.test`, role },
      });
      expect(grant.statusCode).toBe(200);
    }

    const ownerAccount = (await app.inject({ method: 'GET', url: '/api/me', headers: owner })).json() as { account: { id: string } };
    const first = await lookup(owner, { orderId: alex.orderId });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ name: NAME, phone: PHONE });
    expect(await lookup(owner, { orderId: alex.orderId })).toMatchObject({ statusCode: 200 });
    expect((await lookup(as('timer_export@example.test'), { entryId })).json()).toEqual({ name: NAME, phone: PHONE });
    for (const role of ['registration_manager', 'check_in_volunteer', 'finance'] as const) {
      expect((await lookup(as(`${role}@example.test`), { orderId: alex.orderId })).statusCode).toBe(200);
    }

    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      const columns = await client.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'emergency_contact_views'`,
      );
      expect(columns.rows.map((row) => row.column_name).sort()).toEqual(['actor_account_id', 'event_id', 'id', 'order_id', 'viewed_at']);
      const rows = (await client.query(
        `SELECT actor_account_id, event_id, order_id, viewed_at FROM emergency_contact_views WHERE order_id = $1`,
        [alex.orderId],
      )).rows as { actor_account_id: string; event_id: string; order_id: string; viewed_at: Date }[];
      expect(rows).toHaveLength(6);
      expect(rows.filter((row) => row.actor_account_id === ownerAccount.account.id)).toHaveLength(2);
      expect(rows.every((row) => row.event_id === eventId && row.order_id === alex.orderId && row.viewed_at.toISOString() === now.toISOString())).toBe(true);
      expect(JSON.stringify(rows)).not.toContain(NAME);
      expect(JSON.stringify(rows)).not.toContain(PHONE);
      expect((await client.query(
        `UPDATE orders SET rider_json = jsonb_set(rider_json, '{emergencyContact}', '{"name":"","phone":""}'::jsonb) WHERE id = $1`,
        [alex.orderId],
      )).rowCount).toBe(1);
    } finally {
      await client.end();
    }

    const missing = await lookup(owner, { orderId: alex.orderId });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ error: 'This registration has no emergency contact on file.' });

    const other = await app.inject({ method: 'POST', url: '/api/demo', headers: owner });
    const otherId = (other.json() as { eventId: string }).eventId;
    expect((await lookup(owner, { entryId }, `/api/events/${otherId}/emergency-contact`)).statusCode).toBe(404);

    const desk = await app.inject({ method: 'GET', url: `/api/events/${eventId}/check-in`, headers: owner });
    expect(desk.body).not.toContain(PHONE);
    expect(desk.body).not.toContain(NAME);
    const lists = (await app.inject({ method: 'GET', url: `/api/events/${eventId}/start-lists`, headers: as('timer_export@example.test') })).json() as { races: { raceId: string }[] };
    const csv = await app.inject({ method: 'GET', url: `/api/events/${eventId}/start-lists/${lists.races[0].raceId}/csv`, headers: as('timer_export@example.test') });
    expect(csv.statusCode).toBe(200);
    expect(csv.body).not.toContain(PHONE);
    expect(csv.body).not.toContain(NAME);
    const entries = await app.inject({ method: 'GET', url: `/api/events/${eventId}/exports/entries.csv`, headers: owner });
    expect(entries.body).not.toContain(PHONE);
  });
});
