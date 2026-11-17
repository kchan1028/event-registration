import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { claimCalendarAge, profileClaimApprovalSchema } from '../src/shared/profileClaims';
import { profileClaimSettingsFromEnv, validateProfileClaimSettings } from '../src/server/profileClaims';
import { as, fakeAuth } from './support/auth';
import { testApp, testDatabaseUrl } from './support/db';

const ORGANIZER = 'organizer@claim.test';
const SUPPORT = 'support@claim.test';
const SUPPORT_ID = 'acc_fictional_claim_support';
const PARENT = 'parent@claim.test';
const SECOND = 'second@claim.test';
const RIDER = 'rider@claim.test';
const VIEWER = 'viewer@claim.test';

async function setup(minimumAge: number | undefined = 18) {
  const databaseUrl = await testDatabaseUrl();
  const client = new pg.Client({ connectionString: databaseUrl }); await client.connect();
  try { await client.query(`INSERT INTO accounts(id,provider_user_id,email,created_at) VALUES ($1,$2,$3,$4)`, [SUPPORT_ID, `test|${SUPPORT}`, SUPPORT, '2026-02-27T12:00:00Z']); }
  finally { await client.end(); }
  const now = new Date('2026-02-28T12:00:00Z');
  const { app } = await testApp({ databaseUrl, auth: fakeAuth(), now: () => now, profileClaims: { minimumAge, supportAccountIds: [SUPPORT_ID] } });
  const call = (who: string, method: 'GET' | 'POST', url: string, payload?: object) => app.inject({ method, url, headers: as(who), payload });
  const { eventId, organizationId } = (await call(ORGANIZER, 'POST', '/api/demo')).json();
  await call(ORGANIZER, 'POST', `/api/events/${eventId}/publish`, { acknowledgeWarnings: true });
  const { config } = (await call(ORGANIZER, 'GET', `/api/events/${eventId}`)).json();
  const body = { clientRequestId: 'fictional-claim-order', categoryIds: [config.categories.find((c: { timingCode: string }) => c.timingCode === 'RR-J1516').id], rider: { firstName: 'Claim', lastName: 'Fictional', email: '', team: '', racingAge: 16, licenseCategory: null, licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: { name: 'Parent Fictional', relationship: 'Parent', email: PARENT, phone: '' }, emergencyContact: { name: 'Fictional Contact', phone: '555-555-0199' } }, waiver: { version: config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Parent Fictional', signerRole: 'guardian' } };
  const created = await call(PARENT, 'POST', `/api/rider/events/${eventId}/orders`, body);
  expect(created.statusCode, created.body).toBe(201);
  const order = created.json();
  const [profile] = (await call(PARENT, 'GET', '/api/rider/juniors')).json();
  const account = (await call(RIDER, 'GET', '/api/me')).json().account;
  await call(VIEWER, 'GET', '/api/me');
  await call(PARENT, 'POST', `/api/rider/juniors/${profile.id}/viewer`, { email: VIEWER });
  const input = { clientRequestId: 'fictional-support-claim', riderAccountId: account.id, birthDate: '2008-02-29', timeZone: 'America/Los_Angeles', reviewReference: 'FICTIONAL-REVIEW-18', acknowledge: true };
  const approve = (who = SUPPORT, changes = {}) => call(who, 'POST', `/api/support/juniors/${profile.id}/claim`, { ...input, ...changes });
  return { app, call, approve, input, profile, order, body, eventId, organizationId, databaseUrl, now, account };
}

describe('claim calendar age and explicit configuration', () => {
  it.each([
    ['2026-03-01T07:59:59Z', 'America/Los_Angeles', '2008-02-29', 17, '2026-02-28'],
    ['2026-03-01T08:00:00Z', 'America/Los_Angeles', '2008-02-29', 18, '2026-03-01'],
    ['2026-02-28T15:00:00Z', 'Asia/Tokyo', '2008-02-29', 18, '2026-03-01'],
    ['2026-11-16T14:59:59Z', 'Asia/Tokyo', '2008-11-17', 17, '2026-11-16'],
    ['2026-11-16T15:00:00Z', 'Asia/Tokyo', '2008-11-17', 18, '2026-11-17'],
    ['2100-02-28T12:00:00Z', 'UTC', '2080-02-29', 19, '2100-02-28'],
  ])('uses the recorded zone and calendar birthday at %s', (instant, zone, birthDate, age, onDate) => {
    expect(claimCalendarAge(birthDate, zone, new Date(instant))).toEqual({ age, onDate });
  });
  it('has no default threshold or support grant and rejects an unapproved minimum', () => {
    expect(profileClaimSettingsFromEnv({})).toEqual({ minimumAge: undefined, supportAccountIds: [] });
    expect(profileClaimSettingsFromEnv({ PROFILE_CLAIM_MINIMUM_AGE: '18', PROFILE_CLAIM_SUPPORT_ACCOUNT_IDS: ` ${SUPPORT_ID} ` })).toEqual({ minimumAge: 18, supportAccountIds: [SUPPORT_ID] });
    expect(() => validateProfileClaimSettings({ minimumAge: 17, supportAccountIds: [SUPPORT_ID] })).toThrow('18');
    expect(() => validateProfileClaimSettings(profileClaimSettingsFromEnv({ PROFILE_CLAIM_MINIMUM_AGE: 'invalid' }))).toThrow('18');
  });
  it('refuses invalid DOB/zone, missing acknowledgement and identity-document fields', () => {
    const input = { clientRequestId: 'fictional-claim', riderAccountId: 'acc_fake', birthDate: '2008-02-29', timeZone: 'UTC', reviewReference: 'FICTIONAL-REVIEW', acknowledge: true };
    for (const change of [{ birthDate: '2008-02-30' }, { timeZone: '' }, { timeZone: 'Invalid/Zone' }, { acknowledge: false }, { identityDocument: 'do not retain copies' }]) expect(profileClaimApprovalSchema.safeParse({ ...input, ...change }).success).toBe(false);
  });
});

describe('support-approved profile claims', () => {
  it('preserves the rider-confirmed zone name rather than a runtime canonical alias for durable replay', async () => {
    const s = await setup(); s.now.setTime(new Date('2026-03-01T08:00:00Z').getTime());
    const first = await s.approve(SUPPORT, { timeZone: 'US/Pacific' });
    expect(first.statusCode).toBe(200);
    expect((await s.approve(SUPPORT, { timeZone: 'US/Pacific' })).json()).toEqual(first.json());
    expect((await s.approve()).statusCode).toBe(409);
    const db = new pg.Client({ connectionString: s.databaseUrl }); await db.connect();
    try { expect((await db.query(`SELECT time_zone FROM junior_profile_claims`)).rows[0].time_zone).toBe('US/Pacific'); }
    finally { await db.end(); }
  });
  it('refuses a missing signed-in rider, active guardian or self-approved claim without changing access', async () => {
    const s = await setup(); s.now.setTime(new Date('2026-03-01T08:00:00Z').getTime());
    const parent = (await s.call(PARENT, 'GET', '/api/me')).json().account;
    for (const riderAccountId of ['acc_fictional_missing', parent.id, SUPPORT_ID]) expect((await s.approve(SUPPORT, { riderAccountId })).statusCode).toBe(422);
    for (const change of [{ birthDate: '2008-02-30' }, { timeZone: 'Invalid/Zone' }, { acknowledge: false }, { identityDocument: 'no copies' }]) expect((await s.approve(SUPPORT, change)).statusCode).toBe(400);
    expect((await s.approve(SUPPORT, { birthDate: '2030-01-01' })).statusCode).toBe(422);
    expect((await s.call(PARENT, 'GET', `/api/orders/${s.order.id}`)).statusCode).toBe(200);
    expect((await s.call(RIDER, 'GET', `/api/orders/${s.order.id}`)).statusCode).toBe(404);
  });

  it('serializes invitation acceptance against a claim so no guardian grant survives', async () => {
    const s = await setup();
    const [invite] = (await s.call(PARENT, 'POST', `/api/rider/juniors/${s.profile.id}/guardian-invitations`, { email: SECOND })).json();
    s.now.setTime(new Date('2026-03-01T08:00:00Z').getTime());
    const [claim, acceptance] = await Promise.all([s.approve(), s.call(SECOND, 'POST', `/api/rider/guardian-invitations/${invite.id}/accept`, { acknowledge: true })]);
    expect(claim.statusCode).toBe(200); expect([200, 409]).toContain(acceptance.statusCode);
    expect((await s.call(SECOND, 'GET', `/api/orders/${s.order.id}`)).statusCode).toBe(404);
    expect((await s.call(RIDER, 'GET', `/api/orders/${s.order.id}`)).statusCode).toBe(200);
    const db = new pg.Client({ connectionString: s.databaseUrl }); await db.connect();
    try { expect((await db.query(`SELECT count(*)::int AS n FROM junior_guardians WHERE junior_profile_id=$1 AND revoked_at IS NULL`, [s.profile.id])).rows[0].n).toBe(0); }
    finally { await db.end(); }
  });
  it('fails closed for organizer/guardians/viewer/rider, absent minimum and the day before eligibility', async () => {
    const s = await setup();
    for (const who of [ORGANIZER, PARENT, RIDER, VIEWER, 'stranger@claim.test']) expect((await s.approve(who)).statusCode).toBe(403);
    expect((await s.app.inject({ method: 'POST', url: `/api/support/juniors/${s.profile.id}/claim`, payload: s.input })).statusCode).toBe(401);
    expect((await s.approve()).statusCode).toBe(422);
    expect((await s.call(PARENT, 'GET', `/api/orders/${s.order.id}`)).statusCode).toBe(200);
    const disabled = await setup(undefined);
    // The setup default is explicit18; create another app with the minimum deliberately absent.
    await disabled.app.close();
    const { app } = await testApp({ databaseUrl: disabled.databaseUrl, auth: fakeAuth(), profileClaims: { supportAccountIds: [SUPPORT_ID] } });
    expect((await app.inject({ method: 'POST', url: `/api/support/juniors/${disabled.profile.id}/claim`, headers: as(SUPPORT), payload: disabled.input })).statusCode).toBe(503);
  });

  it('atomically ends both guardians and viewer access while preserving purchase/payment/waiver and exact replay', async () => {
    const s = await setup();
    const invited = (await s.call(PARENT, 'POST', `/api/rider/juniors/${s.profile.id}/guardian-invitations`, { email: SECOND })).json();
    expect((await s.call(SECOND, 'POST', `/api/rider/guardian-invitations/${invited[0].id}/accept`, { acknowledge: true })).statusCode).toBe(200);
    expect((await s.call(PARENT, 'POST', `/api/orders/${s.order.id}/payment`, { attemptId: 'claim-paid-fictional', outcome: 'success' })).statusCode).toBe(200);
    const before = (await s.call(PARENT, 'GET', `/api/orders/${s.order.id}`)).json();
    expect((await s.call(VIEWER, 'GET', `/api/orders/${s.order.id}`)).statusCode).toBe(200);
    s.now.setTime(new Date('2026-03-01T08:00:00Z').getTime());
    const [one, two] = await Promise.all([s.approve(), s.approve()]);
    expect(one.statusCode, one.body).toBe(200); expect(two.json()).toEqual(one.json());
    expect((await s.approve(SUPPORT, { reviewReference: 'CHANGED-REFERENCE' })).statusCode).toBe(409);
    expect((await s.approve(SUPPORT, { clientRequestId: 'another-claim-request' })).statusCode).toBe(409);
    for (const who of [PARENT, SECOND, VIEWER]) expect((await s.call(who, 'GET', `/api/orders/${s.order.id}`)).statusCode).toBe(404);
    expect((await s.call(PARENT, 'POST', `/api/rider/events/${s.eventId}/orders`, s.body)).statusCode).toBe(404);
    expect((await s.call(SECOND, 'POST', `/api/rider/guardian-invitations/${invited[0].id}/accept`, { acknowledge: true })).json()).toEqual([]);
    expect((await s.call(RIDER, 'GET', `/api/orders/${s.order.id}`)).json()).toEqual(before);
    expect((await s.call(SUPPORT, 'GET', `/api/orders/${s.order.id}`)).statusCode).toBe(404);
    expect((await s.call(RIDER, 'POST', `/api/order-entries/${before.entries[0].id}/withdraw`, { reason: 'No organizer role' })).statusCode).toBe(404);
    const list = (await s.call(RIDER, 'GET', '/api/rider/registrations')).json();
    expect(list[0]).toMatchObject({ id: s.order.id, canManage: true, placedByYou: false });
    const db = new pg.Client({ connectionString: s.databaseUrl }); await db.connect();
    try {
      expect((await db.query(`SELECT count(*)::int AS n FROM junior_profile_claims`)).rows[0].n).toBe(1);
      expect((await db.query(`SELECT revoked_by,revoked_at FROM junior_guardians WHERE junior_profile_id=$1`, [s.profile.id])).rows).toHaveLength(2);
      expect((await db.query(`SELECT count(*)::int AS n FROM junior_guardians WHERE junior_profile_id=$1 AND revoked_at IS NULL`, [s.profile.id])).rows[0].n).toBe(0);
      expect((await db.query(`SELECT approved_by,birth_date::text,time_zone,review_reference,minimum_age FROM junior_profile_claims`)).rows[0]).toEqual({ approved_by: SUPPORT_ID, birth_date: '2008-02-29', time_zone: 'America/Los_Angeles', review_reference: 'FICTIONAL-REVIEW-18', minimum_age: 18 });
    } finally { await db.end(); }
  });

  it('rolls back claim/grants when a later viewer-clear write fails, then cancels pending invitations on retry', async () => {
    const s = await setup();
    const invited = (await s.call(PARENT, 'POST', `/api/rider/juniors/${s.profile.id}/guardian-invitations`, { email: SECOND })).json();
    s.now.setTime(new Date('2026-03-01T08:00:00Z').getTime());
    const db = new pg.Client({ connectionString: s.databaseUrl }); await db.connect();
    try {
      await db.query(`CREATE FUNCTION fail_claim_viewer() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fictional claim failure'; END $$; CREATE TRIGGER fail_claim_viewer BEFORE UPDATE OF viewer_email ON junior_profiles FOR EACH ROW EXECUTE FUNCTION fail_claim_viewer()`);
      expect((await s.approve()).statusCode).toBe(500);
      expect((await db.query(`SELECT count(*)::int AS n FROM junior_profile_claims`)).rows[0].n).toBe(0);
      expect((await s.call(PARENT, 'GET', `/api/orders/${s.order.id}`)).statusCode).toBe(200);
      expect((await s.call(RIDER, 'GET', `/api/orders/${s.order.id}`)).statusCode).toBe(404);
      expect((await s.call(PARENT, 'GET', `/api/rider/juniors/${s.profile.id}/guardian-invitations`)).json()[0].status).toBe('pending');
      await db.query(`DROP TRIGGER fail_claim_viewer ON junior_profiles; DROP FUNCTION fail_claim_viewer()`);
      expect((await s.approve()).statusCode).toBe(200);
      expect((await db.query(`SELECT cancellation_reason FROM junior_guardian_invitations WHERE id=$1`, [invited[0].id])).rows[0].cancellation_reason).toBe('profile_claimed');
      expect((await s.call(SECOND, 'POST', `/api/rider/guardian-invitations/${invited[0].id}/accept`, { acknowledge: true })).statusCode).toBe(409);
    } finally { await db.end(); }
  });
});

describe('post-claim junior checkout', () => {
  async function approvedSetup(second = false) {
    const s = await setup();
    if (second) {
      const [invite] = (await s.call(PARENT, 'POST', `/api/rider/juniors/${s.profile.id}/guardian-invitations`, { email: SECOND })).json();
      expect((await s.call(SECOND, 'POST', `/api/rider/guardian-invitations/${invite.id}/accept`, { acknowledge: true })).statusCode).toBe(200);
    }
    await s.call(PARENT, 'POST', `/api/orders/${s.order.id}/payment`, { attemptId: 'post-claim-paid', outcome: 'success' });
    s.now.setTime(new Date('2026-03-01T08:00:00Z').getTime());
    expect((await s.approve()).statusCode).toBe(200);
    return s;
  }
  const newBody = (s: Awaited<ReturnType<typeof setup>>, who: string, request: string, firstName = 'Claim') => ({
    ...s.body, clientRequestId: request,
    rider: { ...s.body.rider, firstName, guardian: { ...s.body.rider.guardian, email: who } },
  });

  it('blocks either former guardian before any order/profile/grant/hold is created, including normalized and legacy keys', async () => {
    const s = await approvedSetup(true);
    const before = (await s.call(RIDER, 'GET', `/api/orders/${s.order.id}`)).json();
    const db = new pg.Client({ connectionString: s.databaseUrl }); await db.connect();
    try {
      // Historical profile keys can predate tab-separated normalization; use current name fields.
      await db.query(`UPDATE junior_profiles SET name_key='claim fictional' WHERE id=$1`, [s.profile.id]);
      const counts = async () => (await db.query(`SELECT (SELECT count(*) FROM orders)::int AS orders,(SELECT count(*) FROM order_entries)::int AS entries,(SELECT count(*) FROM junior_profiles)::int AS profiles,(SELECT count(*) FROM junior_guardians)::int AS grants`)).rows[0];
      const original = await counts();
      for (const [i, who] of [PARENT, SECOND].entries()) {
        const res = await s.call(who, 'POST', `/api/rider/events/${s.eventId}/orders`, { ...newBody(s, who, `post-claim-denied-${i}`, '  CLÁIM  '), supportReviewed: true });
        expect(res.statusCode, res.body).toBe(409);
        expect(res.body).toContain('Support review is required');
        expect(res.body).not.toContain(s.account.id);
      }
      expect(await counts()).toEqual(original);
      expect((await s.call(PARENT, 'POST', `/api/rider/events/${s.eventId}/orders`, s.body)).statusCode).toBe(404);
      expect((await s.call(RIDER, 'GET', `/api/orders/${s.order.id}`)).json()).toEqual(before);
    } finally { await db.end(); }
  });

  it('does not impose a global name ban or prevent registering a different child', async () => {
    const s = await approvedSetup();
    for (const [who, name] of [['unrelated@claim.test', 'Claim'], [PARENT, 'Another']] as const) {
      const res = await s.call(who, 'POST', `/api/rider/events/${s.eventId}/orders`, newBody(s, who, `post-claim-allowed-${name}`, name));
      expect(res.statusCode, res.body).toBe(201);
      const [profile] = (await s.call(who, 'GET', '/api/rider/juniors')).json();
      expect(profile.id).not.toBe(s.profile.id);
      expect((await s.call(RIDER, 'GET', `/api/orders/${res.json().id}`)).statusCode).toBe(404);
    }
    expect((await s.call(PARENT, 'GET', `/api/orders/${s.order.id}`)).statusCode).toBe(404);
    expect((await s.call(RIDER, 'GET', `/api/orders/${s.order.id}`)).statusCode).toBe(200);
  });

  it('keeps the recorded claimed name blocked after a later profile correction', async () => {
    const s = await approvedSetup();
    const db = new pg.Client({ connectionString: s.databaseUrl }); await db.connect();
    try { await db.query(`UPDATE junior_profiles SET first_name='Corrected',last_name='Fictional',name_key='corrected\tfictional' WHERE id=$1`, [s.profile.id]); }
    finally { await db.end(); }
    const res = await s.call(PARENT, 'POST', `/api/rider/events/${s.eventId}/orders`, newBody(s, PARENT, 'post-claim-recorded-name'));
    expect(res.statusCode, res.body).toBe(409);
  });

  it('includes a guardian removed before the later profile claim', async () => {
    const s = await setup();
    const [invite] = (await s.call(PARENT, 'POST', `/api/rider/juniors/${s.profile.id}/guardian-invitations`, { email: SECOND })).json();
    await s.call(SECOND, 'POST', `/api/rider/guardian-invitations/${invite.id}/accept`, { acknowledge: true });
    const second = (await s.call(SECOND, 'GET', '/api/me')).json().account;
    const grant = (await s.call(PARENT, 'GET', `/api/rider/juniors/${s.profile.id}/guardians`)).json().find((g: { accountId: string }) => g.accountId === second.id);
    expect((await s.call(PARENT, 'POST', `/api/rider/juniors/${s.profile.id}/guardians/${grant.id}/remove`, { reason: 'Fictional earlier removal', acknowledge: true })).statusCode).toBe(200);
    s.now.setTime(new Date('2026-03-01T08:00:00Z').getTime());
    await s.approve();
    expect((await s.call(SECOND, 'POST', `/api/rider/events/${s.eventId}/orders`, newBody(s, SECOND, 'post-claim-old-guardian'))).statusCode).toBe(409);
  });

  it('follows a removed guardian through a later chain of same-family profile merges', async () => {
    const s = await setup();
    const [invite] = (await s.call(PARENT, 'POST', `/api/rider/juniors/${s.profile.id}/guardian-invitations`, { email: SECOND })).json();
    await s.call(SECOND, 'POST', `/api/rider/guardian-invitations/${invite.id}/accept`, { acknowledge: true });
    const second = (await s.call(SECOND, 'GET', '/api/me')).json().account;
    const grant = (await s.call(PARENT, 'GET', `/api/rider/juniors/${s.profile.id}/guardians`)).json().find((g: { accountId: string }) => g.accountId === second.id);
    await s.call(PARENT, 'POST', `/api/rider/juniors/${s.profile.id}/guardians/${grant.id}/remove`, { reason: 'Fictional prior removal', acknowledge: true });
    for (const name of ['MergedOne', 'MergedTwo']) {
      expect((await s.call(PARENT, 'POST', `/api/rider/events/${s.eventId}/orders`, newBody(s, PARENT, `post-claim-merge-${name}`, name))).statusCode).toBe(201);
      expect((await s.call(ORGANIZER, 'POST', `/api/orders/${s.order.id}/rider-corrections`, { changes: { firstName: name }, reason: 'Fictional canonical name correction' })).statusCode).toBe(200);
    }
    const [canonical] = (await s.call(PARENT, 'GET', '/api/rider/juniors')).json();
    expect(canonical.id).not.toBe(s.profile.id);
    s.now.setTime(new Date('2026-03-01T08:00:00Z').getTime());
    expect((await s.call(SUPPORT, 'POST', `/api/support/juniors/${canonical.id}/claim`, s.input)).statusCode).toBe(200);
    const blocked = await s.call(SECOND, 'POST', `/api/rider/events/${s.eventId}/orders`, newBody(s, SECOND, 'post-claim-merged-guardian', 'MergedTwo'));
    expect(blocked.statusCode, blocked.body).toBe(409);
  });

  it('serializes a new junior checkout against claim approval without leaving a replacement profile', async () => {
    const s = await setup(); s.now.setTime(new Date('2026-03-01T08:00:00Z').getTime());
    const [claim, checkout] = await Promise.all([s.approve(), s.call(PARENT, 'POST', `/api/rider/events/${s.eventId}/orders`, newBody(s, PARENT, 'post-claim-racing-order'))]);
    expect(claim.statusCode).toBe(200); expect([201, 409]).toContain(checkout.statusCode);
    if (checkout.statusCode === 201) {
      expect((await s.call(PARENT, 'GET', `/api/orders/${checkout.json().id}`)).statusCode).toBe(404);
      expect((await s.call(RIDER, 'GET', `/api/orders/${checkout.json().id}`)).statusCode).toBe(200);
    }
    const db = new pg.Client({ connectionString: s.databaseUrl }); await db.connect();
    try {
      expect((await db.query(`SELECT count(*)::int AS n FROM junior_profiles`)).rows[0].n).toBe(1);
      expect((await db.query(`SELECT count(*)::int AS n FROM junior_guardians WHERE revoked_at IS NULL`)).rows[0].n).toBe(0);
    } finally { await db.end(); }
  });

  it('keeps a checkout committed before the later claim under the transferred profile authority', async () => {
    const s = await setup(); s.now.setTime(new Date('2026-03-01T08:00:00Z').getTime());
    const created = await s.call(PARENT, 'POST', `/api/rider/events/${s.eventId}/orders`, newBody(s, PARENT, 'post-claim-checkout-first'));
    expect(created.statusCode).toBe(201);
    const before = created.json();
    expect((await s.approve()).statusCode).toBe(200);
    expect((await s.call(PARENT, 'GET', `/api/orders/${before.id}`)).statusCode).toBe(404);
    expect((await s.call(RIDER, 'GET', `/api/orders/${before.id}`)).json()).toEqual(before);
  });
});
