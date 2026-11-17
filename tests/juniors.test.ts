import pg from 'pg';
import { describe, expect, it } from 'vitest';
import type { GuardianInvitation } from '../src/shared/juniors';
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

async function setup(now?: () => Date) {
  const databaseUrl = await testDatabaseUrl();
  const { app } = await testApp({ auth: fakeAuth(), databaseUrl, now });
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
  it('records one initial guardian grant per profile without sharing access or duplicating it on reuse', async () => {
    const { call, registerJunior, databaseUrl } = await setup();
    await registerJunior(PARENT, 'Sam');
    await registerJunior(PARENT, 'Sam');
    await registerJunior(OTHER_PARENT, 'Sam');
    const parent = (await call(PARENT, 'GET', '/api/me')).json().account;
    const other = (await call(OTHER_PARENT, 'GET', '/api/me')).json().account;
    const [profile] = (await call(PARENT, 'GET', '/api/rider/juniors')).json();
    const [otherProfile] = (await call(OTHER_PARENT, 'GET', '/api/rider/juniors')).json();
    expect(profile.id).not.toBe(otherProfile.id);
    const client = new pg.Client({ connectionString: databaseUrl }); await client.connect();
    try {
      const grants = (await client.query(`SELECT junior_profile_id,account_id,granted_by,granted_at=p.created_at AS original_time,revoked_at FROM junior_guardians g JOIN junior_profiles p ON p.id=g.junior_profile_id ORDER BY account_id`)).rows;
      expect(grants).toEqual([
        { junior_profile_id: profile.id, account_id: parent.id, granted_by: parent.id, original_time: true, revoked_at: null },
        { junior_profile_id: otherProfile.id, account_id: other.id, granted_by: other.id, original_time: true, revoked_at: null },
      ].sort((a, b) => a.account_id.localeCompare(b.account_id)));
    } finally { await client.end(); }
  });

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


describe('guardian invitation records without access grants', () => {
  it('normalizes a pending invitation, preserves replay identity and grants no account access or email', async () => {
    let time = new Date('2027-01-01T12:00:00Z');
    const { call, registerJunior, databaseUrl } = await setup(() => time);
    const order = await registerJunior(PARENT, 'Sam');
    const [sam] = (await call(PARENT, 'GET', '/api/rider/juniors')).json();
    const parent = (await call(PARENT, 'GET', '/api/me')).json().account;
    await call(OTHER_PARENT, 'GET', '/api/me');
    const url = `/api/rider/juniors/${sam.id}/guardian-invitations`;
    const first = await call(PARENT, 'POST', url, { email: `  ${OTHER_PARENT.toUpperCase()}  ` });
    expect(first.statusCode, first.body).toBe(200);
    const [invite] = first.json() as GuardianInvitation[];
    expect(invite).toMatchObject({ email: OTHER_PARENT, invitedBy: parent.id, status: 'pending', createdAt: time.toISOString(), expiresAt: '2027-01-15T12:00:00.000Z', cancelledAt: null, cancelledBy: null, cancellationReason: null });
    time = new Date('2027-01-01T13:00:00Z');
    const repeated = await Promise.all([call(PARENT, 'POST', url, { email: OTHER_PARENT }), call(PARENT, 'POST', url, { email: OTHER_PARENT })]);
    for (const response of repeated) expect(response.json()).toEqual([invite]);
    expect((await call(OTHER_PARENT, 'GET', `/api/orders/${order}`)).statusCode).toBe(404);
    expect((await call(OTHER_PARENT, 'POST', `/api/orders/${order}/cancel`)).statusCode).toBe(404);
    expect((await call(OTHER_PARENT, 'POST', `/api/orders/${order}/payment`, { attemptId: 'invited-parent-payment', outcome: 'success' })).statusCode).toBe(404);
    expect((await call(OTHER_PARENT, 'GET', '/api/rider/registrations')).json()).toEqual([]);
    const client = new pg.Client({ connectionString: databaseUrl }); await client.connect();
    try {
      expect((await client.query(`SELECT id FROM junior_guardians`)).rowCount).toBe(1);
      expect((await client.query(`SELECT id FROM email_messages`)).rowCount).toBe(0);
    } finally { await client.end(); }
  });

  it('serializes replacements, keeps cancellation history and does not let an old cancellation close the new invitation', async () => {
    let time = new Date('2027-01-01T12:00:00Z');
    const { call, registerJunior } = await setup(() => time);
    await registerJunior(PARENT, 'Sam');
    const [sam] = (await call(PARENT, 'GET', '/api/rider/juniors')).json();
    const parent = (await call(PARENT, 'GET', '/api/me')).json().account;
    const url = `/api/rider/juniors/${sam.id}/guardian-invitations`;
    const [first] = (await call(PARENT, 'POST', url, { email: OTHER_PARENT })).json() as GuardianInvitation[];
    time = new Date('2027-01-02T12:00:00Z');
    const responses = await Promise.all(['one@invited.test', 'two@invited.test'].map((email) => call(PARENT, 'POST', url, { email })));
    for (const response of responses) expect(response.statusCode, response.body).toBe(200);
    let history = (await call(PARENT, 'GET', url)).json() as GuardianInvitation[];
    expect(history).toHaveLength(3);
    expect(history.filter((i) => i.status === 'pending')).toHaveLength(1);
    expect(history.find((i) => i.id === first.id)).toMatchObject({ status: 'cancelled', cancelledBy: parent.id, cancelledAt: time.toISOString(), cancellationReason: 'replaced' });
    await call(PARENT, 'POST', `${url}/${first.id}/cancel`);
    history = (await call(PARENT, 'GET', url)).json();
    const current = history.find((i) => i.status === 'pending')!;
    const cancelled = await call(PARENT, 'POST', `${url}/${current.id}/cancel`);
    expect(cancelled.statusCode).toBe(200);
    const snapshot = cancelled.json();
    time = new Date('2027-01-03T12:00:00Z');
    expect((await call(PARENT, 'POST', `${url}/${current.id}/cancel`)).json()).toEqual(snapshot);
    expect((await call(PARENT, 'GET', url)).json().filter((i: GuardianInvitation) => i.status === 'pending')).toEqual([]);
  });

  it('expires at the exact deadline and requires a new record rather than rewriting the original period', async () => {
    let time = new Date('2027-01-01T12:00:00Z');
    const { call, registerJunior } = await setup(() => time);
    await registerJunior(PARENT, 'Sam');
    const [sam] = (await call(PARENT, 'GET', '/api/rider/juniors')).json();
    const url = `/api/rider/juniors/${sam.id}/guardian-invitations`;
    const [original] = (await call(PARENT, 'POST', url, { email: OTHER_PARENT })).json() as GuardianInvitation[];
    time = new Date(original.expiresAt);
    expect((await call(PARENT, 'GET', url)).json()).toEqual([{ ...original, status: 'expired' }]);
    const renewed = (await call(PARENT, 'POST', url, { email: OTHER_PARENT })).json() as GuardianInvitation[];
    expect(renewed).toHaveLength(2);
    expect(renewed.find((i) => i.status === 'pending')!.id).not.toBe(original.id);
    expect(renewed.find((i) => i.id === original.id)).toMatchObject({ createdAt: original.createdAt, expiresAt: original.expiresAt, status: 'cancelled', cancellationReason: 'replaced' });
  });

  it('isolates household invitation history from other guardians, junior viewers and organizers', async () => {
    const { call, registerJunior } = await setup();
    await registerJunior(PARENT, 'Sam');
    await registerJunior(OTHER_PARENT, 'Alex');
    const [sam] = (await call(PARENT, 'GET', '/api/rider/juniors')).json();
    const [alex] = (await call(OTHER_PARENT, 'GET', '/api/rider/juniors')).json();
    await call(PARENT, 'POST', `/api/rider/juniors/${sam.id}/viewer`, { email: JUNIOR });
    const url = `/api/rider/juniors/${sam.id}/guardian-invitations`;
    const [invite] = (await call(PARENT, 'POST', url, { email: 'invited@fictional.test' })).json();
    for (const who of [OTHER_PARENT, JUNIOR, ORGANIZER]) {
      expect((await call(who, 'GET', url)).statusCode).toBe(404);
      expect((await call(who, 'POST', url, { email: 'intruder@fictional.test' })).statusCode).toBe(404);
      expect((await call(who, 'POST', `${url}/${invite.id}/cancel`)).statusCode).toBe(404);
    }
    expect((await call(OTHER_PARENT, 'POST', `/api/rider/juniors/${alex.id}/guardian-invitations/${invite.id}/cancel`)).statusCode).toBe(404);
    expect((await call(PARENT, 'GET', url)).json()).toEqual([invite]);
  });

  it('rejects invalid, self and junior-viewer addresses without replacing a valid invitation', async () => {
    const { call, registerJunior } = await setup();
    await registerJunior(PARENT, 'Sam');
    const [sam] = (await call(PARENT, 'GET', '/api/rider/juniors')).json();
    await call(PARENT, 'POST', `/api/rider/juniors/${sam.id}/viewer`, { email: JUNIOR });
    const url = `/api/rider/juniors/${sam.id}/guardian-invitations`;
    const snapshot = (await call(PARENT, 'POST', url, { email: OTHER_PARENT })).json();
    for (const email of ['invalid', '', `${'x'.repeat(250)}@fictional.test`]) expect((await call(PARENT, 'POST', url, { email })).statusCode).toBe(400);
    for (const email of [PARENT.toUpperCase(), JUNIOR.toUpperCase()]) expect((await call(PARENT, 'POST', url, { email })).statusCode).toBe(422);
    expect((await call(PARENT, 'GET', url)).json()).toEqual(snapshot);
  });

  it('cancels source-profile invitations on a name merge while retaining history and the target invitation', async () => {
    const { call, registerJunior, databaseUrl } = await setup();
    const typoOrder = await registerJunior(PARENT, 'Sma');
    await registerJunior(PARENT, 'Sam');
    const profiles = (await call(PARENT, 'GET', '/api/rider/juniors')).json() as { id: string; firstName: string }[];
    const source = profiles.find((p) => p.firstName === 'Sma')!;
    const target = profiles.find((p) => p.firstName === 'Sam')!;
    const url = (id: string) => `/api/rider/juniors/${id}/guardian-invitations`;
    const [old] = (await call(PARENT, 'POST', url(source.id), { email: 'source@invited.test' })).json();
    const [current] = (await call(PARENT, 'POST', url(target.id), { email: 'target@invited.test' })).json();
    const corrected = await call(ORGANIZER, 'POST', `/api/orders/${typoOrder}/rider-corrections`, { changes: { firstName: 'Sam' }, reason: 'Correct fictional name' });
    expect(corrected.statusCode, corrected.body).toBe(200);
    const actor = (await call(ORGANIZER, 'GET', '/api/me')).json().account;
    const history = (await call(PARENT, 'GET', url(target.id))).json() as GuardianInvitation[];
    expect(history).toHaveLength(2);
    expect(history.find((i) => i.id === old.id)).toMatchObject({ status: 'cancelled', cancellationReason: 'profile_merged', cancelledBy: actor.id, invitedBy: old.invitedBy, createdAt: old.createdAt });
    expect(history.find((i) => i.id === current.id)).toEqual(current);
    expect((await call(PARENT, 'GET', url(source.id))).statusCode).toBe(404);
    const client = new pg.Client({ connectionString: databaseUrl }); await client.connect();
    try {
      expect((await client.query(`SELECT junior_profile_id FROM junior_guardians`)).rows).toEqual([{ junior_profile_id: target.id }]);
    } finally { await client.end(); }
  });
});
