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
    let beforeMissing = 0;
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
      beforeMissing = rows.length;
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
    const afterMissing = new pg.Client({ connectionString: databaseUrl });
    await afterMissing.connect();
    try {
      const counted = await afterMissing.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM emergency_contact_views WHERE order_id = $1`, [alex.orderId]);
      expect(counted.rows[0].n).toBe(beforeMissing);
    } finally {
      await afterMissing.end();
    }

    const other = await app.inject({ method: 'POST', url: '/api/demo', headers: owner });
    const otherId = (other.json() as { eventId: string }).eventId;
    expect((await lookup(owner, { entryId }, `/api/events/${otherId}/emergency-contact`)).statusCode).toBe(404);

    const desk = await app.inject({ method: 'GET', url: `/api/events/${eventId}/check-in`, headers: owner });
    expect(desk.body).not.toContain(PHONE);
    expect(desk.body).not.toContain(NAME);
    const lists = (await app.inject({ method: 'GET', url: `/api/events/${eventId}/start-lists`, headers: as('timer_export@example.test') })).json() as { races: { raceId: string }[] };
    const csvs = await Promise.all(lists.races.map((race) => app.inject({ method: 'GET', url: `/api/events/${eventId}/start-lists/${race.raceId}/csv`, headers: as('timer_export@example.test') })));
    const alexCsv = csvs.find((csv) => csv.body.includes('Alex'));
    expect(alexCsv?.statusCode).toBe(200);
    expect(alexCsv?.body).not.toContain(PHONE);
    expect(alexCsv?.body).not.toContain(NAME);
    const entries = await app.inject({ method: 'GET', url: `/api/events/${eventId}/exports/entries.csv`, headers: owner });
    expect(entries.statusCode).toBe(200);
    expect(entries.body).not.toContain(PHONE);
    expect(entries.body).not.toContain(NAME);

    const placer = as('placing.rider@example.test');
    expect((await app.inject({ method: 'GET', url: '/api/me', headers: placer })).statusCode).toBe(200);
    expect((await lookup(placer, { orderId: alex.orderId })).statusCode).toBe(404);
  });

  it('looks up the registration the check-in card shows when an earlier linked order is expired', async () => {
    const databaseUrl = await testDatabaseUrl();
    let tick = 0;
    const start = Date.parse('2027-03-01T18:00:00Z');
    const { app } = await testApp({ databaseUrl, auth: fakeAuth(), now: () => new Date(start + tick++ * 1000) });
    const owner = as(DEFAULT_TEST_ORGANIZER);
    const demo = await app.inject({ method: 'POST', url: '/api/demo', headers: owner });
    const { eventId } = demo.json() as { eventId: string };
    expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/publish`, headers: owner, payload: { acknowledgeWarnings: true } })).statusCode).toBe(200);
    const ev = (await app.inject({ method: 'GET', url: `/api/events/${eventId}`, headers: owner })).json() as { config: { categories: { id: string; timingCode: string }[]; registration: { waiverVersion: string }; days: { id: string }[] } };
    const category = (code: string) => ev.config.categories.find((row) => row.timingCode === code)!.id;
    const buy = async (firstName: string, contact: string, code: string) => {
      const rider = {
        firstName, lastName: 'Linked', email: 'linked.rider@example.test', team: 'Demo Wheelers', racingAge: 40, licenseCategory: '3', licenseType: 'annual', licenseNumber: 'DEMO-LINK-1',
        competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: contact, phone: contact === 'Contact-A' ? '555-555-0101' : '555-555-0102' },
      };
      const waiver = { version: ev.config.registration.waiverVersion, read: true, agreed: true, signatureName: `${firstName} Linked`, signerRole: 'rider' };
      const placed = await app.inject({ method: 'POST', url: `/api/rider/events/${eventId}/orders`, headers: owner, payload: { clientRequestId: `link-${firstName}-xxxx`, categoryIds: [category(code)], rider, waiver } });
      expect(placed.statusCode, placed.body).toBe(201);
      const id = (placed.json() as { id: string }).id;
      expect((await app.inject({ method: 'POST', url: `/api/orders/${id}/payment`, headers: owner, payload: { attemptId: `att-${firstName}-xxxx`, outcome: 'success' } })).statusCode).toBe(200);
      return id;
    };
    const earlier = await buy('Ada', 'Contact-A', 'RR-M35-34');
    const live = await buy('Bea', 'Contact-B', 'CR-M35-34');
    expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/rider-identity/link`, headers: owner, payload: { orderIds: [earlier, live] } })).statusCode).toBe(200);
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      expect((await client.query(`UPDATE orders SET status = 'expired' WHERE id = $1`, [earlier])).rowCount).toBe(1);
    } finally {
      await client.end();
    }
    const cards = (await app.inject({ method: 'GET', url: `/api/events/${eventId}/check-in?q=Bea`, headers: owner })).json() as { riders: { orderId: string; detailsOrderId: string; name: string }[] };
    const card = cards.riders.find((rider) => rider.name === 'Bea Linked');
    expect(card).toMatchObject({ orderId: earlier, detailsOrderId: live, name: 'Bea Linked' });
    const looked = await app.inject({ method: 'POST', url: `/api/events/${eventId}/emergency-contact`, headers: owner, payload: { orderId: card!.detailsOrderId } });
    expect(looked.statusCode).toBe(200);
    expect(looked.json()).toEqual({ name: 'Contact-B', phone: '555-555-0102' });
    const audit = new pg.Client({ connectionString: databaseUrl });
    await audit.connect();
    try {
      const recorded = await audit.query<{ order_id: string }>(`SELECT order_id FROM emergency_contact_views WHERE event_id = $1`, [eventId]);
      expect(recorded.rows.map((row) => row.order_id)).toEqual([live]);
    } finally {
      await audit.end();
    }
  });

  it('omits the contact from staff order responses and still returns it to the rider and guardian', async () => {
    const databaseUrl = await testDatabaseUrl();
    const { app } = await testApp({ databaseUrl, auth: fakeAuth(), now: () => new Date('2027-03-01T18:00:00Z') });
    const owner = as(DEFAULT_TEST_ORGANIZER);
    const demo = await app.inject({ method: 'POST', url: '/api/demo', headers: owner });
    const { eventId, organizationId } = demo.json() as { eventId: string; organizationId: string };
    expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/publish`, headers: owner, payload: { acknowledgeWarnings: true } })).statusCode).toBe(200);
    for (const role of ['registration_manager', 'finance'] as const) {
      expect((await app.inject({ method: 'POST', url: `/api/organizations/${organizationId}/members`, headers: owner, payload: { email: `${role}.desk@example.test`, role } })).statusCode).toBe(200);
    }
    const ev = (await app.inject({ method: 'GET', url: `/api/events/${eventId}`, headers: owner })).json() as { config: { categories: { id: string; timingCode: string }[]; registration: { waiverVersion: string } } };
    const category = ev.config.categories.find((row) => row.timingCode === 'RR-M35-34')!.id;
    const juniorCategory = ev.config.categories.find((row) => row.timingCode === 'RR-J1516')!.id;
    const phone = '555-555-0142';
    const nextPhone = '555-555-0143';
    const riderHeaders = as('reg.rider@example.test');
    const rider = {
      firstName: 'Quinn', lastName: 'Lookup', email: 'quinn.lookup@example.test', team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual',
      competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Casey Lookup', phone },
    };
    const waiver = { version: ev.config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Quinn Lookup', signerRole: 'rider' };
    const placed = await app.inject({ method: 'POST', url: `/api/rider/events/${eventId}/orders`, headers: riderHeaders, payload: { clientRequestId: 'staff-redact-0001', categoryIds: [category], rider, waiver } });
    expect(placed.statusCode, placed.body).toBe(201);
    const orderId = (placed.json() as { id: string }).id;
    expect((await app.inject({ method: 'POST', url: `/api/orders/${orderId}/payment`, headers: riderHeaders, payload: { attemptId: 'staff-redact-pay-1', outcome: 'success' } })).statusCode).toBe(200);

    const staffList = async (headers: Record<string, string>) => app.inject({ method: 'GET', url: `/api/events/${eventId}/orders`, headers });
    for (const headers of [owner, as('registration_manager.desk@example.test'), as('finance.desk@example.test')]) {
      const list = await staffList(headers);
      expect(list.statusCode).toBe(200);
      expect(list.body).not.toContain(phone);
      expect(list.body).not.toContain('Casey Lookup');
    }
    const staffOrder = await app.inject({ method: 'GET', url: `/api/orders/${orderId}`, headers: owner });
    expect(staffOrder.statusCode).toBe(200);
    expect(staffOrder.body).not.toContain(phone);
    expect(staffOrder.body).not.toContain('Casey Lookup');
    const own = await app.inject({ method: 'GET', url: `/api/orders/${orderId}`, headers: riderHeaders });
    expect(own.body).toContain(phone);
    const registrations = await app.inject({ method: 'GET', url: '/api/rider/registrations', headers: riderHeaders });
    expect(registrations.body).toContain(phone);

    expect((await app.inject({ method: 'POST', url: `/api/orders/${orderId}/rider-corrections`, headers: owner, payload: { changes: { emergencyContactPhone: '' }, reason: 'Blank must not clear the contact' } })).statusCode).toBe(422);
    const corrected = await app.inject({ method: 'POST', url: `/api/orders/${orderId}/rider-corrections`, headers: owner, payload: { changes: { emergencyContactPhone: nextPhone }, reason: 'Rider called with a new contact phone' } });
    expect(corrected.statusCode).toBe(200);
    expect(corrected.body).not.toContain(phone);
    expect(corrected.body).not.toContain(nextPhone);
    expect(corrected.body).not.toContain('Casey Lookup');
    expect(JSON.stringify((corrected.json() as { corrections: unknown }).corrections)).toContain('emergencyContactPhone');
    const after = await app.inject({ method: 'GET', url: `/api/orders/${orderId}`, headers: riderHeaders });
    expect(after.body).toContain(nextPhone);
    expect((await staffList(owner)).body).not.toContain(nextPhone);
    expect((await lookupStatus(app, owner, eventId, orderId))).toBe(200);

    const parent = as('parent.lookup@example.test');
    const junior = {
      firstName: 'Sam', lastName: 'Lookup', email: '', team: '', racingAge: 16, licenseCategory: null, licenseType: 'annual', competitionClass: 'men', collegiateDivision: null,
      guardian: { name: 'Pat Lookup', relationship: 'Parent', email: 'parent.lookup@example.test', phone: '' },
      emergencyContact: { name: 'Pat Lookup', phone: '555-555-0177' },
    };
    const juniorWaiver = { version: ev.config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Pat Lookup', signerRole: 'guardian' };
    const juniorOrder = await app.inject({ method: 'POST', url: `/api/rider/events/${eventId}/orders`, headers: parent, payload: { clientRequestId: 'staff-redact-junior', categoryIds: [juniorCategory], rider: junior, waiver: juniorWaiver } });
    expect(juniorOrder.statusCode, juniorOrder.body).toBe(201);
    const juniorId = (juniorOrder.json() as { id: string }).id;
    expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/emergency-contact`, headers: parent, payload: { orderId: juniorId } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/api/orders/${juniorId}`, headers: parent })).body).toContain('555-555-0177');
  });
});

async function lookupStatus(app: { inject: (opts: { method: 'POST'; url: string; headers: Record<string, string>; payload: { orderId: string } }) => Promise<{ statusCode: number }> }, headers: Record<string, string>, eventId: string, orderId: string) {
  return (await app.inject({ method: 'POST', url: `/api/events/${eventId}/emergency-contact`, headers, payload: { orderId } })).statusCode;
}
