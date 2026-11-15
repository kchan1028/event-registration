import pg from 'pg';
import { describe, expect, it } from 'vitest';
import type { EventConfig } from '../src/shared/schema';
import { as, fakeAuth } from './support/auth';
import { testApp, testDatabaseUrl } from './support/db';

// Guardian access to juniors (owner decision, November 15, 2026; docs/discovery/guardian-accounts.md):
// one guardian per junior, and an optional read-only login for the junior. Sessions are faked.

const ORGANIZER = 'owner@valley.test';
const PARENT = 'parent@family-a.test';
const OTHER_PARENT = 'parent@family-b.test';
const JUNIOR = 'sam@family-a.test';

type Method = 'GET' | 'POST';

async function setup() {
  const databaseUrl = await testDatabaseUrl();
  const { app } = await testApp({ auth: fakeAuth(), databaseUrl });
  const call = (who: string, method: Method, url: string, payload?: object) => app.inject({ method, url, headers: as(who), payload });
  const { eventId } = (await call(ORGANIZER, 'POST', '/api/demo')).json() as { eventId: string };
  await call(ORGANIZER, 'POST', `/api/events/${eventId}/publish`, { acknowledgeWarnings: true });
  const { config } = (await call(ORGANIZER, 'GET', `/api/events/${eventId}`)).json() as { config: EventConfig };
  const juniorCat = config.categories.find((c) => c.timingCode === 'RR-J1516')!.id;
  let n = 0;
  const registerJunior = async (who: string, firstName: string) => {
    const rider = {
      firstName,
      lastName: 'Example',
      email: '',
      team: '',
      racingAge: 16,
      licenseCategory: null,
      licenseType: 'annual',
      competitionClass: 'men',
      collegiateDivision: null,
      guardian: { name: 'Pat Example', relationship: 'Parent', email: who, phone: '' },
      emergencyContact: { name: 'Pat Example', phone: '555-555-0199' },
    };
    const waiver = { version: config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Pat Example', signerRole: 'guardian' };
    const res = await call(who, 'POST', `/api/rider/events/${eventId}/orders`, { clientRequestId: `junior-${++n}-xxxxxx`, categoryIds: [juniorCat], rider, waiver });
    expect(res.statusCode, res.body).toBe(201);
    return (res.json() as { id: string }).id;
  };
  return { call, registerJunior, databaseUrl };
}

describe('guardian and junior access', () => {
  it('keeps one profile per junior for the guardian who registers them, and hides it from other households', async () => {
    const { call, registerJunior } = await setup();
    const first = await registerJunior(PARENT, 'Sam');
    await registerJunior(PARENT, 'sam '); // the same junior, typed differently
    await registerJunior(PARENT, 'Alex');
    const juniors = (await call(PARENT, 'GET', '/api/rider/juniors')).json() as { id: string; firstName: string; viewerEmail: string | null }[];
    expect(juniors.map((j) => j.firstName)).toEqual(['Sam', 'Alex']);
    expect(((await call(PARENT, 'GET', '/api/rider/registrations')).json() as { placedByYou: boolean }[]).map((o) => o.placedByYou)).toEqual([true, true, true]);

    // Another household sees none of it, and cannot name a login for this junior.
    expect((await call(OTHER_PARENT, 'GET', `/api/orders/${first}`)).statusCode).toBe(404);
    expect((await call(OTHER_PARENT, 'GET', '/api/rider/juniors')).json()).toEqual([]);
    expect((await call(OTHER_PARENT, 'GET', '/api/rider/registrations')).json()).toEqual([]);
    expect((await call(OTHER_PARENT, 'POST', `/api/rider/juniors/${juniors[0].id}/viewer`, { email: OTHER_PARENT })).statusCode).toBe(404);
  });

  it('lets the junior’s own login look at their registrations, never act, until the guardian stops sharing', async () => {
    const { call, registerJunior } = await setup();
    const orderId = await registerJunior(PARENT, 'Sam');
    const [sam] = (await call(PARENT, 'GET', '/api/rider/juniors')).json() as { id: string }[];

    expect((await call(JUNIOR, 'GET', `/api/orders/${orderId}`)).statusCode).toBe(404);
    expect((await call(PARENT, 'POST', `/api/rider/juniors/${sam.id}/viewer`, { email: PARENT })).statusCode).toBe(422);
    const shared = (await call(PARENT, 'POST', `/api/rider/juniors/${sam.id}/viewer`, { email: ' Sam@Family-A.test ' })).json() as { viewerEmail: string }[];
    expect(shared[0].viewerEmail).toBe(JUNIOR);

    expect((await call(JUNIOR, 'GET', `/api/orders/${orderId}`)).statusCode).toBe(200);
    const mine = (await call(JUNIOR, 'GET', '/api/rider/registrations')).json() as { id: string; placedByYou: boolean }[];
    expect(mine).toEqual([expect.objectContaining({ id: orderId, placedByYou: false })]);
    // Looking only: paying and cancelling stay with the guardian.
    expect((await call(JUNIOR, 'POST', `/api/orders/${orderId}/cancel`)).statusCode).toBe(404);
    expect((await call(JUNIOR, 'POST', `/api/orders/${orderId}/payment`, { attemptId: 'attempt-junior-1', outcome: 'success' })).statusCode).toBe(404);

    await call(PARENT, 'POST', `/api/rider/juniors/${sam.id}/viewer`, { email: null });
    expect((await call(JUNIOR, 'GET', `/api/orders/${orderId}`)).statusCode).toBe(404);
    expect((await call(JUNIOR, 'GET', '/api/rider/registrations')).json()).toEqual([]);
  });

  it('links junior orders placed before profiles existed when the guardian opens their juniors', async () => {
    const { call, registerJunior, databaseUrl } = await setup();
    const orderId = await registerJunior(PARENT, 'Sam');
    // As if the order predates migration 24: no profile link and no profile.
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query(`UPDATE orders SET junior_profile_id = NULL`);
    await client.query(`DELETE FROM junior_profiles`);
    await client.end();
    const [sam] = (await call(PARENT, 'GET', '/api/rider/juniors')).json() as { id: string; firstName: string }[];
    expect(sam.firstName).toBe('Sam');
    await call(PARENT, 'POST', `/api/rider/juniors/${sam.id}/viewer`, { email: JUNIOR });
    expect((await call(JUNIOR, 'GET', `/api/orders/${orderId}`)).statusCode).toBe(200);
  });

  it('keeps one profile when an organizer corrects the junior’s name', async () => {
    const { call, registerJunior } = await setup();
    const first = await registerJunior(PARENT, 'Sma');
    const [profile] = (await call(PARENT, 'GET', '/api/rider/juniors')).json() as { id: string }[];
    await call(PARENT, 'POST', `/api/rider/juniors/${profile.id}/viewer`, { email: JUNIOR });
    expect((await call(ORGANIZER, 'POST', `/api/orders/${first}/rider-corrections`, { changes: { firstName: 'Sam' }, reason: 'Typo at checkout' })).statusCode).toBe(200);
    const second = await registerJunior(PARENT, 'Sam');
    const juniors = (await call(PARENT, 'GET', '/api/rider/juniors')).json() as { id: string; firstName: string; viewerEmail: string | null }[];
    expect(juniors).toEqual([{ id: profile.id, firstName: 'Sam', lastName: 'Example', viewerEmail: JUNIOR }]);
    expect(((await call(JUNIOR, 'GET', '/api/rider/registrations')).json() as { id: string }[]).map((o) => o.id).sort()).toEqual([first, second].sort());
  });
});
