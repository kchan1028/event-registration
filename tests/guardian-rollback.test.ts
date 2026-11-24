import pg from 'pg';
import { expect, it } from 'vitest';
import type { EventConfig } from '../src/shared/schema';
import { as, fakeAuth } from './support/auth';
import { testApp, testDatabaseUrl } from './support/db';
import { publishReviewed } from './support/publish';

const owner = 'owner@rollback.test';
const parent = 'parent@rollback.test';
const second = 'second@rollback.test';

async function setup() {
  const databaseUrl = await testDatabaseUrl();
  const { app } = await testApp({ auth: fakeAuth(), databaseUrl });
  const call = (who: string, method: 'GET' | 'POST', url: string, payload?: object) => app.inject({ method, url, headers: as(who), payload });
  const { eventId } = (await call(owner, 'POST', '/api/demo')).json();
  expect((await publishReviewed(app, `/api/events/${eventId}`, { acknowledgeWarnings: true }, as(owner))).statusCode).toBe(200);
  const { config } = (await call(owner, 'GET', `/api/events/${eventId}`)).json() as { config: EventConfig };
  const register = () => call(parent, 'POST', `/api/rider/events/${eventId}/orders`, {
    clientRequestId: 'guardian-rollback-order', categoryIds: [config.categories.find((c) => c.timingCode === 'RR-J1516')!.id],
    rider: { firstName: 'Sam', lastName: 'Fictional', email: '', team: '', racingAge: 16, licenseCategory: null, licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: { name: 'Pat Fictional', relationship: 'Parent', email: parent, phone: '' }, emergencyContact: { name: 'Pat Fictional', phone: '555-555-0199' } },
    waiver: { version: config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Pat Fictional', signerRole: 'guardian' },
  });
  const client = new pg.Client({ connectionString: databaseUrl }); await client.connect();
  return { call, register, client };
}

it('rolls back the profile and order when its initial guardian grant cannot be written, then retries once', async () => {
  const { call, register, client } = await setup();
  try {
    await client.query(`CREATE FUNCTION reject_initial_grant() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fictional injected grant failure'; END $$;
      CREATE TRIGGER reject_initial_grant BEFORE INSERT ON junior_guardians FOR EACH ROW EXECUTE FUNCTION reject_initial_grant()`);
    expect((await register()).statusCode).toBe(500);
    for (const table of ['junior_profiles', 'junior_guardians', 'orders', 'order_entries']) {
      expect((await client.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n).toBe(0);
    }
    expect((await call(parent, 'GET', '/api/rider/registrations')).json()).toEqual([]);
    await client.query('DROP TRIGGER reject_initial_grant ON junior_guardians');
    const recovered = await register(); expect(recovered.statusCode, recovered.body).toBe(201);
    const replay = await register(); expect(replay.statusCode, replay.body).toBe(201);
    expect(replay.json().id).toBe(recovered.json().id);
    expect((await client.query('SELECT count(*)::int AS n FROM junior_guardians')).rows[0].n).toBe(1);
  } finally { await client.end(); }
});

it('rolls back a new guardian grant when acceptance evidence fails, preserving the open invitation and purchase', async () => {
  const { call, register, client } = await setup();
  try {
    const created = await register(); expect(created.statusCode).toBe(201);
    const original = created.json();
    const [junior] = (await call(parent, 'GET', '/api/rider/juniors')).json();
    const url = `/api/rider/juniors/${junior.id}/guardian-invitations`;
    const [invitation] = (await call(parent, 'POST', url, { email: second })).json();
    await client.query(`CREATE FUNCTION reject_acceptance() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fictional injected acceptance failure'; END $$;
      CREATE TRIGGER reject_acceptance BEFORE UPDATE ON junior_guardian_invitations FOR EACH ROW WHEN (NEW.accepted_at IS NOT NULL) EXECUTE FUNCTION reject_acceptance()`);
    const accept = () => call(second, 'POST', `/api/rider/guardian-invitations/${invitation.id}/accept`, { acknowledge: true });
    expect((await accept()).statusCode).toBe(500);
    const unchanged = (await call(parent, 'GET', `/api/orders/${original.id}`)).json();
    expect(unchanged.waiverEvidence).toEqual(original.waiverEvidence);
    expect(unchanged.waiver).toEqual(original.waiver);
    expect(unchanged.quote).toEqual(original.quote);
    expect((await client.query('SELECT count(*)::int AS n FROM junior_guardians WHERE revoked_at IS NULL')).rows[0].n).toBe(1);
    expect((await call(parent, 'GET', url)).json()).toEqual([invitation]);
    expect((await call(second, 'GET', `/api/orders/${original.id}`)).statusCode).toBe(404);
    await client.query('DROP TRIGGER reject_acceptance ON junior_guardian_invitations');
    expect((await accept()).statusCode).toBe(200);
    expect((await accept()).statusCode).toBe(200);
    expect((await client.query('SELECT count(*)::int AS n FROM junior_guardians WHERE revoked_at IS NULL')).rows[0].n).toBe(2);
    const shared = (await call(second, 'GET', `/api/orders/${original.id}`)).json();
    expect(shared.waiverEvidence).toEqual(original.waiverEvidence);
    expect(shared.waiver).toEqual(original.waiver);
    expect(shared.quote).toEqual(original.quote);
  } finally { await client.end(); }
});

it('rolls back cancellation when an invitation replacement cannot be inserted', async () => {
  const { call, register, client } = await setup();
  try {
    const created = await register(); expect(created.statusCode).toBe(201);
    const original = created.json();
    const [junior] = (await call(parent, 'GET', '/api/rider/juniors')).json();
    const url = `/api/rider/juniors/${junior.id}/guardian-invitations`;
    const [invitation] = (await call(parent, 'POST', url, { email: second })).json();
    await client.query(`CREATE FUNCTION reject_replacement() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fictional injected replacement failure'; END $$;
      CREATE TRIGGER reject_replacement BEFORE INSERT ON junior_guardian_invitations FOR EACH ROW EXECUTE FUNCTION reject_replacement()`);
    expect((await call(parent, 'POST', url, { email: 'replacement@rollback.test' })).statusCode).toBe(500);
    const unchanged = (await call(parent, 'GET', `/api/orders/${original.id}`)).json();
    expect(unchanged.waiverEvidence).toEqual(original.waiverEvidence);
    expect(unchanged.waiver).toEqual(original.waiver);
    expect(unchanged.quote).toEqual(original.quote);
    expect((await call(parent, 'GET', url)).json()).toEqual([invitation]);
    expect((await client.query('SELECT count(*)::int AS n FROM junior_guardians')).rows[0].n).toBe(1);
    await client.query('DROP TRIGGER reject_replacement ON junior_guardian_invitations');
    const replaced = await call(parent, 'POST', url, { email: 'replacement@rollback.test' });
    expect(replaced.statusCode).toBe(200);
    expect(replaced.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: invitation.id, status: 'cancelled', cancellationReason: 'replaced', expiresAt: invitation.expiresAt }),
      expect.objectContaining({ email: 'replacement@rollback.test', status: 'pending' }),
    ]));
  } finally { await client.end(); }
});
