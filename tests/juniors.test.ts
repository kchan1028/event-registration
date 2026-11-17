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
  const registerJunior = async (who: string, firstName: string, lastName = 'Example') => {
    const rider = {
      firstName,
      lastName,
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
  it('records the authenticated waiver signer and declared age without rewriting them after a correction', async () => {
    const { call, registerJunior, databaseUrl } = await setup();
    const orderId = await registerJunior(PARENT, 'Sam');
    const account = (await call(PARENT, 'GET', '/api/me')).json().account;
    const original = (await call(PARENT, 'GET', `/api/orders/${orderId}`)).json();
    expect(original.waiverEvidence).toEqual({ signerAccountId: account.id, riderRacingAge: 16, acceptedAt: original.createdAt });
    expect((await call(ORGANIZER, 'POST', `/api/orders/${orderId}/rider-corrections`, { changes: { firstName: 'Sammie' }, reason: 'Correct the fictional rider name' })).statusCode).toBe(200);
    const corrected = (await call(PARENT, 'GET', `/api/orders/${orderId}`)).json();
    expect(corrected.rider.firstName).toBe('Sammie');
    expect(corrected.waiver).toEqual(original.waiver);
    expect(corrected.waiverEvidence).toEqual(original.waiverEvidence);
    const legacy = new pg.Client({ connectionString: databaseUrl });
    await legacy.connect();
    try { await legacy.query('UPDATE orders SET waiver_evidence_json = NULL WHERE id = $1', [orderId]); }
    finally { await legacy.end(); }
    expect((await call(PARENT, 'GET', `/api/orders/${orderId}`)).json().waiverEvidence).toBeNull();
  });

  it('keeps one profile per junior for the guardian who registers them, and hides it from other households', async () => {
    const { call, registerJunior } = await setup();
    const first = await registerJunior(PARENT, 'Sam');
    await registerJunior(PARENT, 'sam '); // the same junior, typed differently
    await registerJunior(PARENT, 'Alex');
    // Same letters, different first/last split: two juniors.
    await registerJunior(PARENT, 'Sam Example', 'Jones');
    await registerJunior(PARENT, 'Sam', 'Example Jones');
    const juniors = (await call(PARENT, 'GET', '/api/rider/juniors')).json() as { id: string; firstName: string; viewerEmail: string | null }[];
    expect(juniors.map((j) => j.firstName)).toEqual(['Sam', 'Alex', 'Sam Example', 'Sam']);
    expect(((await call(PARENT, 'GET', '/api/rider/registrations')).json() as { placedByYou: boolean }[]).map((o) => o.placedByYou)).toEqual([true, true, true, true, true]);

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
    // As if the order predates migration 25: no profile link and no profile.
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

  it('merges two profiles of the same junior when a correction makes their names match', async () => {
    const { call, registerJunior } = await setup();
    const typo1 = await registerJunior(PARENT, 'Sma');
    const typo2 = await registerJunior(PARENT, 'Sma');
    const right = await registerJunior(PARENT, 'Sam');
    const before = (await call(PARENT, 'GET', '/api/rider/juniors')).json() as { id: string; firstName: string }[];
    const typoProfile = before.find((j) => j.firstName === 'Sma')!;
    await call(PARENT, 'POST', `/api/rider/juniors/${typoProfile.id}/viewer`, { email: JUNIOR });
    expect((await call(ORGANIZER, 'POST', `/api/orders/${typo1}/rider-corrections`, { changes: { firstName: 'Sam' }, reason: 'Typo at checkout' })).statusCode).toBe(200);
    const after = (await call(PARENT, 'GET', '/api/rider/juniors')).json() as { firstName: string; viewerEmail: string | null }[];
    expect(after).toEqual([expect.objectContaining({ firstName: 'Sam', viewerEmail: JUNIOR })]);
    expect(((await call(JUNIOR, 'GET', '/api/rider/registrations')).json() as { id: string }[]).map((o) => o.id).sort()).toEqual([typo1, typo2, right].sort());
  });

  it('finds a profile saved with the earlier space-joined key, keeping its viewer access', async () => {
    const { call, registerJunior, databaseUrl } = await setup();
    const first = await registerJunior(PARENT, 'Sam');
    const [sam] = (await call(PARENT, 'GET', '/api/rider/juniors')).json() as { id: string }[];
    await call(PARENT, 'POST', `/api/rider/juniors/${sam.id}/viewer`, { email: JUNIOR });
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query(`UPDATE junior_profiles SET name_key = 'sam example'`);
    await client.end();
    const second = await registerJunior(PARENT, 'Sam');
    expect(((await call(PARENT, 'GET', '/api/rider/juniors')).json() as { id: string }[]).map((j) => j.id)).toEqual([sam.id]);
    expect(((await call(JUNIOR, 'GET', '/api/rider/registrations')).json() as { id: string }[]).map((o) => o.id).sort()).toEqual([first, second].sort());
  });
});
