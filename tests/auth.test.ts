import { readFileSync } from 'node:fs';
import type { FastifyRequest } from 'fastify';
import pg from 'pg';
import { describe, expect, it, vi } from 'vitest';
import type { AuthProvider } from '../src/server/auth';
import { authProviderFromEnv } from '../src/server/auth';
import { openDb } from '../src/server/db';
import { EmailNotSent, EmailRefusal, EmailUncertain, RESEND_IDEMPOTENCY_WINDOW_MS, createMailer, emailFromEnv, type EmailSender } from '../src/server/email';
import type { EventConfig } from '../src/shared/schema';
import { INVITATION_DAYS } from '../src/shared/roles';
import { as, fakeAuth } from './support/auth';
import { testApp, testDatabaseUrl } from './support/db';

// Sign-in and organizer roles (ADR 0003 Phase 2, product.md "Sign-in and account security").
// Sessions are faked: `as(email)` signs a request in as a fictional .test address.

const OWNER = 'owner@valley.test';
const OTHER_OWNER = 'owner@hills.test';
const RIDER_EMAIL = 'rider@example.test';
const RIDER = { firstName: 'Test', lastName: 'Rider', email: RIDER_EMAIL, team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Test Contact', phone: '555-555-0199' } };

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

/** Two clubs: Valley (with a published demo event and one rider order) and Hills (empty). */
async function twoClubs(databaseUrl?: string) {
  const { app } = await testApp({ auth: fakeAuth(), databaseUrl });
  const call = (email: string, method: Method, url: string, payload?: unknown) =>
    app.inject({ method, url, headers: as(email), ...(payload === undefined ? {} : { payload: payload as object }) });

  const demo = (await call(OWNER, 'POST', '/api/demo')).json() as { organizationId: string; eventId: string };
  await call(OWNER, 'POST', `/api/events/${demo.eventId}/publish`, { acknowledgeWarnings: true });
  const event = (await call(OWNER, 'GET', `/api/events/${demo.eventId}`)).json() as { config: EventConfig; revision: number };
  const categoryId = event.config.categories.find((c) => c.timingCode === 'RR-M35-34')!.id;
  const waiver = { version: event.config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Test Rider', signerRole: 'rider' };
  const placed = await call(RIDER_EMAIL, 'POST', `/api/rider/events/${demo.eventId}/orders`, { clientRequestId: 'rider-request-0001', categoryIds: [categoryId], rider: RIDER, waiver });
  expect(placed.statusCode).toBe(201);
  const order = placed.json() as { id: string; entries: { id: string }[] };
  const hills = (await call(OTHER_OWNER, 'POST', '/api/organizations', { name: 'Hills Velo' })).json() as { id: string };
  return { app, call, valley: demo.organizationId, eventId: demo.eventId, event, categoryId, waiver, order, hills: hills.id };
}

describe('sign-in is required', () => {
  it('refuses every API route without a session, except health and the public event pages', async () => {
    const { app, eventId } = await twoClubs();
    const source = readFileSync(new URL('../src/server/app.ts', import.meta.url), 'utf8');
    const routes = [...source.matchAll(/app\.(get|post|put|delete)\('(\/api\/[^']+)'(, isPublic)?/g)].map((m) => ({
      method: m[1].toUpperCase() as Method,
      url: m[2].replace(':id', eventId).replace(/:[a-zA-Z]+/g, 'x'),
      isPublic: !!m[3],
    }));
    expect(routes.length).toBeGreaterThan(40);
    expect(routes.filter((r) => r.isPublic).map((r) => `${r.method} ${r.url}`)).toEqual(['GET /api/health', 'GET /api/public/events', `GET /api/public/events/${eventId}`]);
    for (const r of routes.filter((x) => !x.isPublic)) {
      const payload = r.method === 'GET' ? undefined : {};
      const res = await app.inject({ method: r.method, url: r.url, payload });
      expect(res.statusCode, `${r.method} ${r.url}`).toBe(401);
      // A token the provider does not accept is the same as none.
      const forged = await app.inject({ method: r.method, url: r.url, headers: { authorization: 'Bearer test:someone@example.com' }, payload });
      expect(forged.statusCode, `${r.method} ${r.url} with a forged token`).toBe(401);
    }
  });

  it('keeps the public event list and rider event page open', async () => {
    const { app, eventId } = await twoClubs();
    expect((await app.inject({ method: 'GET', url: '/api/public/events' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/api/public/events/${eventId}` })).statusCode).toBe(200);
  });

  it('creates one account per person on first sign-in and reports its memberships', async () => {
    const { call, valley } = await twoClubs();
    const me = (await call(OWNER, 'GET', '/api/me')).json() as { account: { email: string }; memberships: { organizationId: string; roles: string[] }[] };
    expect(me.account.email).toBe(OWNER);
    expect(me.memberships).toEqual([expect.objectContaining({ organizationId: valley, roles: ['owner'] })]);
    const rider = (await call(RIDER_EMAIL, 'GET', '/api/me')).json() as { memberships: unknown[] };
    expect(rider.memberships).toEqual([]);
  });

  it('refuses a second sign-in identity that claims an email already in use', async () => {
    let providerUserId = 'user_one';
    const auth: AuthProvider = { verify: async () => ({ providerUserId, email: 'shared@example.test' }), email: async () => 'shared@example.test' };
    const { app } = await testApp({ auth });
    expect((await app.inject({ method: 'GET', url: '/api/me' })).statusCode).toBe(200);
    providerUserId = 'user_two';
    expect((await app.inject({ method: 'GET', url: '/api/me' })).statusCode).toBe(409);
  });
});

describe('organizations are isolated from each other', () => {
  it('lists only the organizations the caller belongs to', async () => {
    const { call, valley, hills } = await twoClubs();
    const ids = (email: string) => call(email, 'GET', '/api/organizations').then((r) => (r.json() as { id: string }[]).map((o) => o.id));
    expect(await ids(OWNER)).toEqual([valley]);
    expect(await ids(OTHER_OWNER)).toEqual([hills]);
    expect(await ids(RIDER_EMAIL)).toEqual([]);
  });

  it("refuses another club's owner on every organizer route of the event, without revealing it exists", async () => {
    const { call, eventId, event, categoryId, order, valley } = await twoClubs();
    const entryId = order.entries[0].id;
    const attempts: [string, Method, string, unknown?][] = [
      ['view event', 'GET', `/api/events/${eventId}`],
      ['edit draft', 'PUT', `/api/events/${eventId}/config`, { revision: event.revision, config: event.config }],
      ['publish', 'POST', `/api/events/${eventId}/publish`, { acknowledgeWarnings: true }],
      ['add test entries', 'POST', `/api/events/${eventId}/test-entries`, { categoryId, count: 1 }],
      ['orders', 'GET', `/api/events/${eventId}/orders`],
      ['one order', 'GET', `/api/orders/${order.id}`],
      ['transfer', 'POST', `/api/order-entries/${entryId}/transfer`, { toCategoryId: categoryId, reason: 'Moving the rider' }],
      ['withdraw', 'POST', `/api/order-entries/${entryId}/withdraw`, { reason: 'Rider withdrew' }],
      ['license review', 'POST', `/api/order-entries/${entryId}/license-review`, { note: 'Checked the card' }],
      ['check-in list', 'GET', `/api/events/${eventId}/check-in`],
      ['check in', 'POST', `/api/events/${eventId}/check-in/${order.id}`, { dayId: event.config.days[0].id }],
      ['bib settings', 'PUT', `/api/events/${eventId}/bib-settings`, {}],
      ['start lists', 'GET', `/api/events/${eventId}/start-lists`],
      ['entries export', 'GET', `/api/events/${eventId}/exports/entries.csv`],
      ['ledger export', 'GET', `/api/events/${eventId}/exports/ledger.csv`],
      ['waitlist', 'GET', `/api/events/${eventId}/waitlist`],
      ['rider identity', 'GET', `/api/events/${eventId}/rider-identity`],
      ['resolutions', 'GET', `/api/events/${eventId}/resolutions`],
      ['change impact', 'GET', `/api/events/${eventId}/impact`],
      ['coupons', 'GET', `/api/events/${eventId}/coupons`],
      ['correct rider details', 'POST', `/api/orders/${order.id}/rider-corrections`, { changes: { firstName: 'Taken' }, reason: 'Takeover attempt' }],
      ['create coupon', 'POST', `/api/events/${eventId}/coupons`, { code: 'TAKEOVER', kind: 'percent', percent: 100 }],
      ['new event in their org', 'POST', `/api/organizations/${valley}/events`, { name: 'Takeover', template: 'weekend', startDate: '2027-04-24', timeZone: 'America/Los_Angeles' }],
      ['members', 'GET', `/api/organizations/${valley}/members`],
      ['grant themselves a role', 'POST', `/api/organizations/${valley}/members`, { email: OTHER_OWNER, role: 'owner' }],
    ];
    for (const [label, method, url, payload] of attempts) {
      const res = await call(OTHER_OWNER, method, url, payload);
      expect(res.statusCode, label).toBe(404);
    }
    // Nothing changed for the real owner.
    const members = (await call(OWNER, 'GET', `/api/organizations/${valley}/members`)).json() as { members: { email: string }[] };
    expect(members.members.map((m) => m.email)).toEqual([OWNER]);
  });
});

describe('organizer roles', () => {
  async function withRoles() {
    const ctx = await twoClubs();
    const team = {
      registration_manager: 'manager@valley.test',
      check_in_volunteer: 'volunteer@valley.test',
      timer_export: 'timer@valley.test',
      finance: 'treasurer@valley.test',
    } as const;
    for (const [role, email] of Object.entries(team)) {
      const res = await ctx.call(OWNER, 'POST', `/api/organizations/${ctx.valley}/members`, { email, role });
      expect(res.statusCode).toBe(200);
    }
    return { ...ctx, team };
  }

  it('gives each role only its own tools', async () => {
    const { call, eventId, event, valley, team } = await withRoles();
    const routes: Record<string, [Method, string, unknown?]> = {
      edit: ['PUT', `/api/events/${eventId}/config`, { revision: event.revision, config: event.config }],
      orders: ['GET', `/api/events/${eventId}/orders`],
      checkIn: ['GET', `/api/events/${eventId}/check-in`],
      bibPreview: ['POST', `/api/events/${eventId}/bibs/preview`, {}],
      startLists: ['GET', `/api/events/${eventId}/start-lists`],
      entriesCsv: ['GET', `/api/events/${eventId}/exports/entries.csv`],
      ledgerCsv: ['GET', `/api/events/${eventId}/exports/ledger.csv`],
      members: ['GET', `/api/organizations/${valley}/members`],
    };
    const expected: Record<string, Record<string, number>> = {
      [team.registration_manager]: { edit: 200, orders: 200, checkIn: 200, bibPreview: 400, startLists: 200, entriesCsv: 200, ledgerCsv: 403, members: 403 },
      [team.check_in_volunteer]: { edit: 403, orders: 403, checkIn: 200, bibPreview: 403, startLists: 403, entriesCsv: 403, ledgerCsv: 403, members: 403 },
      [team.timer_export]: { edit: 403, orders: 403, checkIn: 403, bibPreview: 403, startLists: 200, entriesCsv: 200, ledgerCsv: 403, members: 403 },
      [team.finance]: { edit: 403, orders: 200, checkIn: 403, bibPreview: 403, startLists: 403, entriesCsv: 403, ledgerCsv: 200, members: 403 },
    };
    for (const [email, outcomes] of Object.entries(expected)) {
      // Every role can open the event itself.
      expect((await call(email, 'GET', `/api/events/${eventId}`)).statusCode, `${email} view`).toBe(200);
      for (const [name, status] of Object.entries(outcomes)) {
        const [method, url, payload] = routes[name];
        expect((await call(email, method, url, payload)).statusCode, `${email} ${name}`).toBe(status);
      }
    }
  });

  it('shows the event summary to roles that see registrations, and the money only to ledger roles', async () => {
    const { call, eventId, team } = await withRoles();
    const summary = (email: string) => call(email, 'GET', `/api/events/${eventId}/summary`);
    expect((await summary(team.check_in_volunteer)).statusCode).toBe(403);
    expect((await summary(team.timer_export)).statusCode).toBe(403);
    expect((await summary(OTHER_OWNER)).statusCode).toBe(404);
    const manager = (await summary(team.registration_manager)).json() as { riders: number; money: unknown };
    expect(manager).toMatchObject({ riders: 0, money: null });
    expect(((await summary(team.finance)).json() as { money: unknown }).money).toMatchObject({ receivedCents: 0 });
  });

  it('lets only registration managers and owners correct rider details, never the rider', async () => {
    const { call, order, team } = await withRoles();
    const correct = (email: string) => call(email, 'POST', `/api/orders/${order.id}/rider-corrections`, { changes: { team: 'Corrected Team' }, reason: 'Rider asked by email' });
    expect((await correct(team.finance)).statusCode).toBe(403);
    expect((await correct(team.check_in_volunteer)).statusCode).toBe(403);
    expect((await correct(RIDER_EMAIL)).statusCode).toBe(404);
    expect((await correct(team.registration_manager)).statusCode).toBe(200);
  });

  it("returns the caller's roles with the event so the screens can hide other tools", async () => {
    const { call, eventId, team } = await withRoles();
    expect(((await call(team.check_in_volunteer, 'GET', `/api/events/${eventId}`)).json() as { roles: string[] }).roles).toEqual(['check_in_volunteer']);
  });

  it('turns an invitation into a role when that person first signs in, and lets the owner remove it', async () => {
    const { call, valley, eventId } = await twoClubs();
    const newcomer = 'newcomer@valley.test';
    const invited = (await call(OWNER, 'POST', `/api/organizations/${valley}/members`, { email: newcomer, role: 'check_in_volunteer' })).json() as {
      invitations: { email: string; role: string; expiresAt: string }[];
    };
    expect(invited.invitations).toEqual([{ email: newcomer, role: 'check_in_volunteer', expiresAt: expect.any(String), lastEmail: { status: 'recorded', at: expect.any(String) } }]);
    expect((await call(newcomer, 'GET', `/api/events/${eventId}/check-in`)).statusCode).toBe(200);
    const members = (await call(OWNER, 'GET', `/api/organizations/${valley}/members`)).json() as { members: { email: string }[]; invitations: unknown[] };
    expect(members.members.map((m) => m.email)).toContain(newcomer);
    expect(members.invitations).toEqual([]);
    expect((await call(OWNER, 'POST', `/api/organizations/${valley}/members/remove`, { email: newcomer, role: 'check_in_volunteer' })).statusCode).toBe(200);
    expect((await call(newcomer, 'GET', `/api/events/${eventId}/check-in`)).statusCode).toBe(404);
  });

  it('expires an invitation after INVITATION_DAYS, and adding it again renews it', async () => {
    const DAY = 86_400_000;
    let now = new Date('2027-03-01T18:00:00Z');
    const { app } = await testApp({ auth: fakeAuth(), now: () => now });
    const call = (email: string, method: Method, url: string, payload?: object) => app.inject({ method, url, headers: as(email), payload });
    const org = (await call(OWNER, 'POST', '/api/organizations', { name: 'Valley Velo' })).json() as { id: string };
    const late = 'late@valley.test';
    const renewed = 'renewed@valley.test';
    const invite = (email: string) => call(OWNER, 'POST', `/api/organizations/${org.id}/members`, { email, role: 'finance' });
    await invite(late);
    await invite(renewed);
    now = new Date(now.getTime() + 13 * DAY);
    const list = (await invite(renewed)).json() as { invitations: unknown[] };
    expect(list.invitations).toEqual([
      { email: late, role: 'finance', expiresAt: new Date(Date.parse('2027-03-01T18:00:00Z') + INVITATION_DAYS * DAY).toISOString(), lastEmail: { status: 'recorded', at: '2027-03-01T18:00:00.000Z' } },
      { email: renewed, role: 'finance', expiresAt: new Date(now.getTime() + INVITATION_DAYS * DAY).toISOString(), lastEmail: { status: 'recorded', at: now.toISOString() } },
    ]);
    now = new Date(now.getTime() + 2 * DAY);
    // Signing in after the invitation expired gives no role; the renewed one still works.
    expect(((await call(late, 'GET', '/api/me')).json() as { memberships: unknown[] }).memberships).toEqual([]);
    expect((await call(late, 'GET', '/api/rider/expired-invitations')).json()).toEqual([
      { id: expect.any(String), organizationName: 'Valley Velo', role: 'finance', at: now.toISOString() },
    ]);
    expect((await call(OWNER, 'GET', '/api/rider/expired-invitations')).json()).toEqual([]);
    expect((await call(late, 'GET', `/api/organizations/${org.id}/members`)).statusCode).toBe(404);
    expect(((await call(renewed, 'GET', '/api/me')).json() as { memberships: { roles: string[] }[] }).memberships).toEqual([expect.objectContaining({ organizationId: org.id, roles: ['finance'] })]);
    const after = (await call(OWNER, 'GET', `/api/organizations/${org.id}/members`)).json() as { invitations: unknown[]; history: { action: string; email: string; by: string | null }[] };
    expect(after.invitations).toEqual([]);
    expect(after.history.slice(0, 5).map(({ action, email, by }) => ({ action, email, by }))).toEqual([
      { action: 'invitation_accepted', email: renewed, by: renewed },
      { action: 'invitation_expired', email: late, by: late },
      { action: 'invitation_renewed', email: renewed, by: OWNER },
      { action: 'invited', email: renewed, by: OWNER },
      { action: 'invited', email: late, by: OWNER },
    ]);
    // The late person now has an account, so adding them again gives the role straight away.
    await invite(late);
    expect(((await call(late, 'GET', '/api/me')).json() as { memberships: { roles: string[] }[] }).memberships).toEqual([expect.objectContaining({ roles: ['finance'] })]);
    expect((await call(late, 'GET', '/api/rider/expired-invitations')).json()).toEqual([]);
  });

  it('emails an invitation through the configured sender, records failures, and never emails for a seed script', async () => {
    const sent: { to: string; subject: string; text: string }[] = [];
    let fail = false;
    const email: EmailSender = {
      mode: 'resend',
      async send(m) {
        if (fail) throw new EmailRefusal('Resend returned HTTP 403.');
        sent.push(m);
        return `msg-${sent.length}`;
      },
    };
    const { app, access } = await testApp({ auth: fakeAuth(), email, appUrl: 'https://beta.example.test' });
    const call = (who: string, method: Method, url: string, payload?: object) => app.inject({ method, url, headers: as(who), payload });
    const org = (await call(OWNER, 'POST', '/api/organizations', { name: 'Valley Velo' })).json() as { id: string };
    const invite = (who: string) => call(OWNER, 'POST', `/api/organizations/${org.id}/members`, { email: who, role: 'finance' });
    const status = async (who: string) =>
      ((await call(OWNER, 'GET', `/api/organizations/${org.id}/members`)).json() as { invitations: { email: string; lastEmail: { status: string } | null }[] }).invitations.find((i) => i.email === who)?.lastEmail?.status;

    await invite('treasurer@valley.test');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: 'treasurer@valley.test', subject: 'You are invited to Valley Velo on CycleReg' });
    expect(sent[0].text).toContain(`${OWNER} added you to Valley Velo as Finance.`);
    expect(sent[0].text).toContain('sign in at https://beta.example.test with this email address (treasurer@valley.test)');
    expect(await status('treasurer@valley.test')).toBe('sent');

    // A refused send keeps the invitation and shows the failure; resending tries again.
    fail = true;
    await invite('timer@valley.test');
    expect(await status('timer@valley.test')).toBe('failed');
    fail = false;
    await invite('timer@valley.test');
    expect(await status('timer@valley.test')).toBe('sent');
    expect(sent.map((m) => m.to)).toEqual(['treasurer@valley.test', 'timer@valley.test']);

    // Seed scripts add people without a signed-in actor: no email.
    await access.addMember(org.id, 'seeded@valley.test', 'owner', null);
    expect(sent).toHaveLength(2);
    expect(await status('seeded@valley.test')).toBeUndefined();
  });

  it('keeps a lost Resend acceptance uncertain, recovers the saved message, and does not extend the invitation', async () => {
    let now = new Date('2027-04-01T12:00:00.000Z');
    const calls: { key: string | null; body: string }[] = [];
    let mode: 'drop' | 'accept' | 'raw' = 'drop';
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const headers = new Headers(init.headers);
      calls.push({ key: headers.get('Idempotency-Key'), body: String(init.body) });
      if (mode === 'drop') throw Object.assign(new Error('socket hang up while reading a private provider body'), { name: 'TimeoutError' });
      if (mode === 'raw') throw new Error('provider body token=secret-value');
      return Response.json({ id: 'msg_recovered', details: 'provider-only' });
    }));
    const databaseUrl = await testDatabaseUrl();
    const { app } = await testApp({
      databaseUrl,
      auth: fakeAuth(),
      now: () => now,
      appUrl: 'https://beta.example.test',
      email: emailFromEnv({
        EMAIL_MODE: 'resend',
        EMAIL_FROM: 'CycleReg <beta@example.test>',
        RESEND_API_KEY: 'fake-test-key',
        EMAIL_TEST_RECIPIENTS: 'treasurer@valley.test,timer@valley.test',
      }),
    });
    const call = (method: Method, url: string, payload?: object) => app.inject({ method, url, headers: as(OWNER), payload });
    const org = (await call('POST', '/api/organizations', { name: 'Valley Velo' })).json() as { id: string };
    const invite = (email: string) => call('POST', `/api/organizations/${org.id}/members`, { email, role: 'finance' });
    const listed = async () => (await call('GET', `/api/organizations/${org.id}/members`)).json() as {
      invitations: { email: string; expiresAt: string; lastEmail: { status: string } | null }[];
      history: { action: string; email: string }[];
    };
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      const first = await invite('treasurer@valley.test');
      expect(first.statusCode).toBe(200);
      const opened = await listed();
      const expiresAt = opened.invitations[0].expiresAt;
      expect(opened.invitations).toEqual([{ email: 'treasurer@valley.test', role: 'finance', expiresAt, lastEmail: { status: 'uncertain', at: now.toISOString() } }]);
      expect(opened.history.filter((row) => row.email === 'treasurer@valley.test').map((row) => row.action)).toEqual(['invited']);
      let stored = await client.query<{ status: string; provider_message_id: string | null; error: string | null }>(`SELECT status, provider_message_id, error FROM email_messages ORDER BY created_at, seq`);
      expect(stored.rows).toEqual([{ status: 'uncertain', provider_message_id: null, error: 'Send outcome unknown after a timeout.' }]);
      expect(JSON.stringify(stored.rows)).not.toContain('private');

      mode = 'accept';
      const recovered = await invite('treasurer@valley.test');
      expect(recovered.statusCode).toBe(200);
      const retried = await listed();
      expect(retried.invitations).toEqual([{ email: 'treasurer@valley.test', role: 'finance', expiresAt, lastEmail: { status: 'sent', at: now.toISOString() } }]);
      expect(retried.history.filter((row) => row.email === 'treasurer@valley.test').map((row) => row.action)).toEqual(['invited']);
      expect(calls.map((item) => item.key)).toEqual([calls[0].key, calls[0].key]);
      expect(calls[1].body).toBe(calls[0].body);
      stored = await client.query(`SELECT status, provider_message_id, error FROM email_messages ORDER BY created_at, seq`);
      expect(stored.rows).toEqual([{ status: 'sent', provider_message_id: 'msg_recovered', error: null }]);
      expect(JSON.stringify(stored.rows)).not.toContain('provider-only');

      now = new Date(now.getTime() + 3_600_000);
      const renewed = await invite('treasurer@valley.test');
      expect(renewed.statusCode).toBe(200);
      const extended = await listed();
      expect(extended.invitations[0].expiresAt).not.toBe(expiresAt);
      expect(extended.history[0]).toMatchObject({ action: 'invitation_renewed', email: 'treasurer@valley.test' });
      expect(calls).toHaveLength(3);
      expect(calls[2].key).not.toBe(calls[0].key);

      mode = 'raw';
      const hidden = await invite('timer@valley.test');
      expect(hidden.statusCode).toBe(200);
      expect((await listed()).invitations.find((row) => row.email === 'timer@valley.test')?.lastEmail?.status).toBe('uncertain');
      const raw = await client.query<{ error: string }>(`SELECT error FROM email_messages WHERE to_email = 'timer@valley.test'`);
      expect(raw.rows).toEqual([{ error: 'Send outcome unknown after a network failure.' }]);
      expect(raw.rows[0].error).not.toContain('secret');

      const timerExpires = (await listed()).invitations.find((row) => row.email === 'timer@valley.test')?.expiresAt;
      mode = 'drop';
      now = new Date(now.getTime() + RESEND_IDEMPOTENCY_WINDOW_MS);
      const late = await invite('timer@valley.test');
      expect(late.statusCode).toBe(409);
      expect(late.json()).toEqual({ error: 'The earlier invitation email might have been sent. It was not sent again, and the invitation was not extended.' });
      expect(calls).toHaveLength(4);
      const afterLate = await listed();
      expect(afterLate.invitations.find((row) => row.email === 'timer@valley.test')).toMatchObject({ expiresAt: timerExpires, lastEmail: { status: 'uncertain' } });
      expect(afterLate.history.filter((row) => row.action === 'invitation_renewed').map(({ action, email }) => ({ action, email }))).toEqual([{ action: 'invitation_renewed', email: 'treasurer@valley.test' }]);
      expect((await client.query(`SELECT count(*)::int AS n FROM email_messages WHERE to_email = 'timer@valley.test'`)).rows).toEqual([{ n: 1 }]);
    } finally {
      await client.end();
      vi.unstubAllGlobals();
    }
  });

  it('reserves one invitation attempt when two invites overlap', async () => {
    const databaseUrl = await testDatabaseUrl();
    const calls: string[] = [];
    let releaseSend: () => void = () => undefined;
    const sendGate = new Promise<void>((resolve) => {
      releaseSend = resolve;
    });
    let holdSend = true;
    const email: EmailSender = {
      mode: 'resend',
      async send(_message, idempotencyKey) {
        calls.push(idempotencyKey);
        if (holdSend) await sendGate;
        return `msg-${calls.length}`;
      },
    };
    const { app } = await testApp({ databaseUrl, auth: fakeAuth(), email, appUrl: 'https://beta.example.test' });
    const call = (method: Method, url: string, payload?: object) => app.inject({ method, url, headers: as(OWNER), payload });
    const org = (await call('POST', '/api/organizations', { name: 'Valley Velo' })).json() as { id: string };
    const members = `/api/organizations/${org.id}/members`;
    const invite = () => call('POST', members, { email: 'treasurer@valley.test', role: 'finance' });
    const blocker = new pg.Client({ connectionString: databaseUrl });
    await blocker.connect();
    const requests: ReturnType<typeof invite>[] = [];
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`org-members:${org.id}`]);
      const waiting = async (count: number) => {
        await expect.poll(async () => {
          const { rows } = await blocker.query<{ count: number }>(
            `SELECT count(*)::int AS count
               FROM pg_locks held JOIN pg_locks waiting USING (database, classid, objid, objsubid)
              WHERE held.pid = pg_backend_pid() AND held.locktype = 'advisory' AND held.granted
                AND waiting.locktype = 'advisory' AND NOT waiting.granted`,
          );
          return rows[0].count;
        }, { timeout: 5000 }).toBe(count);
      };
      requests.push(invite());
      await waiting(1);
      requests.push(invite());
      await waiting(2);
      await blocker.query('ROLLBACK');
      const waitingOnAttempt = async (count: number) => {
        await expect.poll(async () => {
          const { rows } = await blocker.query<{ count: number }>(`SELECT count(*)::int AS count FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`);
          return rows[0].count;
        }, { timeout: 5000 }).toBe(count);
      };
      await expect.poll(() => calls.length, { timeout: 5000 }).toBe(1);
      await waitingOnAttempt(1);
      requests.push(invite());
      await waitingOnAttempt(2);
      expect(calls).toHaveLength(1);
      expect((await blocker.query(`SELECT status FROM email_messages`)).rows).toEqual([{ status: 'uncertain' }]);
      holdSend = false;
      releaseSend();
      const responses = await Promise.all(requests);
      expect(responses.map((response) => response.statusCode)).toEqual([200, 200, 200]);
      const listed = (await call('GET', members)).json() as { history: { action: string }[] };
      expect(listed.history.filter((row) => row.action === 'invited')).toHaveLength(1);
      expect(listed.history.some((row) => row.action === 'invitation_renewed')).toBe(false);
      expect(calls).toHaveLength(1);
      expect((await blocker.query(`SELECT id, status FROM email_messages`)).rows).toEqual([{ id: calls[0], status: 'sent' }]);
    } finally {
      releaseSend();
      await Promise.allSettled(requests);
      await blocker.end();
    }
  }, 15_000);

  it('marks a held invitation failed only after its one send finishes, then a later invite can succeed', async () => {
    const databaseUrl = await testDatabaseUrl();
    const calls: string[] = [];
    let releaseSend: () => void = () => undefined;
    const sendGate = new Promise<void>((resolve) => {
      releaseSend = resolve;
    });
    let holdSend = true;
    let refuse = true;
    const email: EmailSender = {
      mode: 'resend',
      async send(_message, idempotencyKey) {
        calls.push(idempotencyKey);
        if (holdSend) await sendGate;
        if (refuse) throw new EmailRefusal('Resend returned HTTP 403.');
        return 'msg-accepted';
      },
    };
    const { app } = await testApp({ databaseUrl, auth: fakeAuth(), email, appUrl: 'https://beta.example.test' });
    const call = (method: Method, url: string, payload?: object) => app.inject({ method, url, headers: as(OWNER), payload });
    const org = (await call('POST', '/api/organizations', { name: 'Valley Velo' })).json() as { id: string };
    const members = `/api/organizations/${org.id}/members`;
    const invite = () => call('POST', members, { email: 'treasurer@valley.test', role: 'finance' });
    const blocker = new pg.Client({ connectionString: databaseUrl });
    await blocker.connect();
    const requests: ReturnType<typeof invite>[] = [];
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`org-members:${org.id}`]);
      const orgWaiters = async (count: number) => {
        await expect.poll(async () => {
          const { rows } = await blocker.query<{ count: number }>(
            `SELECT count(*)::int AS count
               FROM pg_locks held JOIN pg_locks waiting USING (database, classid, objid, objsubid)
              WHERE held.pid = pg_backend_pid() AND held.locktype = 'advisory' AND held.granted
                AND waiting.locktype = 'advisory' AND NOT waiting.granted`,
          );
          return rows[0].count;
        }, { timeout: 5000 }).toBe(count);
      };
      requests.push(invite());
      await orgWaiters(1);
      requests.push(invite());
      await orgWaiters(2);
      await blocker.query('ROLLBACK');
      const attemptWaiters = async (count: number) => {
        await expect.poll(async () => (await blocker.query<{ count: number }>(`SELECT count(*)::int AS count FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`)).rows[0].count, { timeout: 5000 }).toBe(count);
      };
      await expect.poll(() => calls.length, { timeout: 5000 }).toBe(1);
      await attemptWaiters(1);
      requests.push(invite());
      await attemptWaiters(2);
      expect((await blocker.query(`SELECT count(*)::int AS n FROM email_messages`)).rows).toEqual([{ n: 1 }]);
      holdSend = false;
      releaseSend();
      const responses = await Promise.all(requests);
      expect(responses.map((response) => response.statusCode)).toEqual([200, 200, 200]);
      expect(calls).toHaveLength(1);
      expect((await blocker.query(`SELECT id, status, provider_message_id FROM email_messages`)).rows).toEqual([{ id: calls[0], status: 'failed', provider_message_id: null }]);

      refuse = false;
      const again = await invite();
      expect(again.statusCode).toBe(200);
      expect(calls).toHaveLength(2);
      expect(calls[1]).not.toBe(calls[0]);
      expect((await blocker.query(`SELECT id, status, provider_message_id FROM email_messages ORDER BY seq`)).rows).toEqual([
        { id: calls[0], status: 'failed', provider_message_id: null },
        { id: calls[1], status: 'sent', provider_message_id: 'msg-accepted' },
      ]);
    } finally {
      releaseSend();
      await Promise.allSettled(requests);
      await blocker.end();
    }
  }, 15_000);

  it('keeps an earlier uncertain send when a later refusal belongs to the original request', async () => {
    const databaseUrl = await testDatabaseUrl();
    const db = openDb(databaseUrl);
    const now = new Date('2027-04-04T12:00:00.000Z');
    let refuse = false;
    const seenDuringSend: { status: string; started: boolean }[] = [];
    const email: EmailSender = {
      mode: 'resend',
      async send(_message, idempotencyKey) {
        const visible = await db.get<{ status: string; started: boolean }>(
          `SELECT status, started_at IS NOT NULL AS started FROM email_messages WHERE id = $1`,
          [idempotencyKey],
        );
        seenDuringSend.push(visible!);
        if (refuse) throw new EmailRefusal('Resend returned HTTP 403.');
        throw new EmailUncertain('Send outcome unknown after a timeout.');
      },
    };
    const mailer = createMailer(db, email, () => now);
    try {
      await db.migrate();
      await db.run(`INSERT INTO organizations (id, name, created_at) VALUES ('org_attempt_order', 'Valley Velo', $1)`, [now.toISOString()]);
      const retryFirst = await mailer.reserve('organizer_invitation', 'org_attempt_order:treasurer@valley.test:finance', 'org_attempt_order', {
        to: 'treasurer@valley.test',
        subject: 'Invitation',
        text: 'Sign in to CycleReg.',
      });
      expect(await mailer.dispatch(retryFirst, false)).toBe('uncertain');
      refuse = true;
      expect(await mailer.dispatch(retryFirst, true)).toBe('uncertain');
      expect(seenDuringSend).toEqual([
        { status: 'uncertain', started: true },
        { status: 'uncertain', started: true },
      ]);
      expect(await db.get(`SELECT status, provider_message_id, error, started_at IS NOT NULL AS started FROM email_messages WHERE id = $1`, [retryFirst])).toEqual({
        status: 'uncertain',
        provider_message_id: null,
        error: 'Resend returned HTTP 403.',
        started: true,
      });

      const firstOnly = await mailer.reserve('organizer_invitation', 'org_attempt_order:timer@valley.test:finance', 'org_attempt_order', {
        to: 'timer@valley.test',
        subject: 'Invitation',
        text: 'Sign in to CycleReg.',
      });
      expect(await mailer.dispatch(firstOnly, true)).toBe('failed');
      expect(await db.get(`SELECT status, provider_message_id, started_at IS NOT NULL AS started FROM email_messages WHERE id = $1`, [firstOnly])).toEqual({
        status: 'failed',
        provider_message_id: null,
        started: true,
      });
    } finally {
      await db.close();
    }
  });

  it('keeps the connection pool usable while many sends and repeats wait on a slow provider', async () => {
    const db = openDb(await testDatabaseUrl());
    const now = new Date('2027-04-04T12:00:00.000Z');
    let releaseSend = () => {};
    const slow = new Promise<void>((resolve) => (releaseSend = resolve));
    const calls: string[] = [];
    const email: EmailSender = {
      mode: 'resend',
      async send(_message, idempotencyKey) {
        calls.push(idempotencyKey);
        await slow;
        return `msg-${idempotencyKey}`;
      },
    };
    const mailer = createMailer(db, email, () => now);
    let sends: Promise<unknown>[] = [];
    try {
      await db.run(`INSERT INTO organizations (id, name, created_at) VALUES ('org_pool', 'Valley Velo', $1)`, [now.toISOString()]);
      const ids: string[] = [];
      for (let i = 0; i < 12; i++) {
        ids.push(await mailer.reserve('organizer_invitation', `org_pool:${i}`, 'org_pool', { to: `member${i}@valley.test`, subject: 'Invitation', text: 'Sign in to CycleReg.' }));
      }
      // More callers than the pool has connections, both across attempts and on one attempt.
      sends = [...ids, ...Array<string>(12).fill(ids[0])].map((id) => mailer.dispatch(id, true));
      const settled = Promise.allSettled(sends);
      await new Promise((resolve) => setTimeout(resolve, 300));
      const unrelated = await Promise.race([db.get('SELECT 1 AS ok'), new Promise((resolve) => setTimeout(() => resolve('no connection free'), 2_000))]);
      expect(unrelated).toEqual({ ok: 1 });
      releaseSend();
      expect(await settled).toEqual(sends.map(() => ({ status: 'fulfilled', value: 'sent' })));
      expect([...calls].sort()).toEqual([...ids].sort());
    } finally {
      releaseSend();
      await Promise.allSettled(sends);
      await db.close();
    }
  }, 30_000);

  it('survives losing the locked connection during a send and retries the same attempt', async () => {
    const databaseUrl = await testDatabaseUrl();
    const db = openDb(databaseUrl);
    const other = new pg.Client({ connectionString: databaseUrl });
    const now = new Date('2027-04-04T12:00:00.000Z');
    const calls: string[] = [];
    const email: EmailSender = {
      mode: 'resend',
      async send(_message, idempotencyKey) {
        calls.push(idempotencyKey);
        if (calls.length === 1) {
          await other.query(`SELECT pg_terminate_backend(pid) FROM pg_locks WHERE locktype = 'advisory' AND granted AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`);
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        return 'msg-accepted';
      },
    };
    const mailer = createMailer(db, email, () => now);
    try {
      await other.connect();
      await db.run(`INSERT INTO organizations (id, name, created_at) VALUES ('org_drop', 'Valley Velo', $1)`, [now.toISOString()]);
      const id = await mailer.reserve('organizer_invitation', 'org_drop:timer', 'org_drop', { to: 'timer@valley.test', subject: 'Invitation', text: 'Sign in to CycleReg.' });
      await expect(mailer.dispatch(id, true)).rejects.toThrow();
      expect(await db.get(`SELECT status, started_at IS NOT NULL AS started FROM email_messages WHERE id = $1`, [id])).toEqual({ status: 'uncertain', started: true });
      expect(await mailer.dispatch(id, false)).toBe('sent');
      expect(calls).toEqual([id, id]);
    } finally {
      await other.end();
      await db.close();
    }
  });

  it('does not reuse a canceled attempt when a seed re-adds it at the same timestamp', async () => {
    const now = new Date('2027-04-03T12:00:00.000Z');
    const email: EmailSender = {
      mode: 'resend',
      async send() {
        throw new EmailUncertain('Send outcome unknown after a timeout.');
      },
    };
    const databaseUrl = await testDatabaseUrl();
    const { app, access } = await testApp({ databaseUrl, auth: fakeAuth(), email, now: () => now, appUrl: 'https://beta.example.test' });
    const call = (method: Method, url: string, payload?: object) => app.inject({ method, url, headers: as(OWNER), payload });
    const org = (await call('POST', '/api/organizations', { name: 'Valley Velo' })).json() as { id: string };
    const members = `/api/organizations/${org.id}/members`;
    const invite = () => call('POST', members, { email: 'treasurer@valley.test', role: 'finance' });
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      expect((await invite()).statusCode).toBe(200);
      const first = (await client.query<{ id: string }>(`SELECT id FROM email_messages`)).rows[0].id;
      const cancelled = await call('POST', `${members}/remove`, { email: 'treasurer@valley.test', role: 'finance' });
      expect(cancelled.statusCode).toBe(200);
      const seeded = await access.addMember(org.id, 'treasurer@valley.test', 'finance', null);
      expect(seeded.invitations).toEqual([expect.objectContaining({ email: 'treasurer@valley.test', lastEmail: null })]);
      expect((await invite()).statusCode).toBe(200);
      const rows = await client.query<{ id: string; status: string; email_attempt_id: string | null }>(
        `SELECT e.id, e.status, i.email_attempt_id
           FROM email_messages e
           LEFT JOIN organization_invitations i ON i.email_attempt_id = e.id
          ORDER BY e.seq`,
      );
      expect(rows.rows).toEqual([
        { id: first, status: 'uncertain', email_attempt_id: null },
        { id: rows.rows[1].id, status: 'uncertain', email_attempt_id: rows.rows[1].id },
      ]);
      expect(rows.rows[1].id).not.toBe(first);
    } finally {
      await client.end();
    }
  });

  it('starts a new invitation after cancel, and a refused retry stays uncertain', async () => {
    let now = new Date('2027-04-02T12:00:00.000Z');
    const calls: { key: string | null; to: string }[] = [];
    let outcome: 'timeout' | 'refuse' | 'accept' = 'timeout';
    let blocked = false;
    let leak = false;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const headers = new Headers(init.headers);
      const body = JSON.parse(String(init.body)) as { to: string[] };
      calls.push({ key: headers.get('Idempotency-Key'), to: body.to[0] });
      if (outcome === 'timeout') throw Object.assign(new Error('private socket detail'), { name: 'TimeoutError' });
      if (outcome === 'refuse') return new Response('private refusal', { status: 403 });
      return Response.json({ id: 'msg_ok' });
    }));
    const databaseUrl = await testDatabaseUrl();
    const sender = emailFromEnv({
      EMAIL_MODE: 'resend',
      EMAIL_FROM: 'CycleReg <beta@example.test>',
      RESEND_API_KEY: 'fake-test-key',
      EMAIL_TEST_RECIPIENTS: 'treasurer@valley.test,timer@valley.test',
    });
    const email: EmailSender = {
      mode: 'resend',
      async send(message, idempotencyKey) {
        if (leak) throw new Error('provider body token=secret-value');
        if (blocked) throw new EmailNotSent('Recipient is outside the configured email test list.');
        return sender.send(message, idempotencyKey);
      },
    };
    const { app } = await testApp({ databaseUrl, auth: fakeAuth(), now: () => now, appUrl: 'https://beta.example.test', email });
    const call = (method: Method, url: string, payload?: object) => app.inject({ method, url, headers: as(OWNER), payload });
    const org = (await call('POST', '/api/organizations', { name: 'Valley Velo' })).json() as { id: string };
    const members = `/api/organizations/${org.id}/members`;
    const invite = (emailAddress: string) => call('POST', members, { email: emailAddress, role: 'finance' });
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      expect((await invite('treasurer@valley.test')).statusCode).toBe(200);
      const cancelled = await call('POST', `${members}/remove`, { email: 'treasurer@valley.test', role: 'finance' });
      expect(cancelled.statusCode).toBe(200);
      expect((cancelled.json() as { invitations: unknown[] }).invitations).toEqual([]);
      const again = await invite('treasurer@valley.test');
      expect(again.statusCode).toBe(200);
      expect(calls.map((item) => item.key)).toEqual([calls[0].key, calls[1].key]);
      expect(calls[0].key).not.toBe(calls[1].key);
      const rows = await client.query<{ status: string; error: string }>(`SELECT status, error FROM email_messages ORDER BY seq`);
      expect(rows.rows).toEqual([
        { status: 'uncertain', error: 'Send outcome unknown after a timeout.' },
        { status: 'uncertain', error: 'Send outcome unknown after a timeout.' },
      ]);
      expect(JSON.stringify(rows.rows)).not.toContain('private');
      const created = await client.query<{ invitation_at: string; email_at: string }>(
        `SELECT i.created_at AS invitation_at, e.created_at AS email_at
           FROM organization_invitations i JOIN email_messages e ON e.ref = i.organization_id || ':' || i.email || ':' || i.role
          WHERE e.seq = (SELECT max(seq) FROM email_messages)`,
      );
      expect(created.rows).toHaveLength(1);

      outcome = 'refuse';
      const refused = await invite('treasurer@valley.test');
      expect(refused.statusCode).toBe(200);
      expect((refused.json() as { history: { action: string; email: string }[] }).history.filter((row) => row.email === 'treasurer@valley.test').map((row) => row.action)).toEqual(['invited', 'invitation_cancelled', 'invited']);
      let stored = await client.query<{ status: string; error: string }>(`SELECT status, error FROM email_messages ORDER BY seq`);
      expect(stored.rows[1]).toEqual({ status: 'uncertain', error: 'Resend returned HTTP 403.' });
      expect(calls).toHaveLength(3);
      expect(calls[2].key).toBe(calls[1].key);

      blocked = true;
      const blockedRetry = await invite('treasurer@valley.test');
      expect(blockedRetry.statusCode).toBe(200);
      stored = await client.query(`SELECT status, error FROM email_messages ORDER BY seq`);
      expect(stored.rows[1]).toEqual({ status: 'uncertain', error: 'Recipient is outside the configured email test list.' });
      expect(calls).toHaveLength(3);

      blocked = false;
      outcome = 'accept';
      now = new Date(now.getTime() + 60_000);
      const recovered = await invite('treasurer@valley.test');
      expect(recovered.statusCode).toBe(200);
      stored = await client.query(`SELECT status, provider_message_id FROM email_messages ORDER BY seq`);
      expect(stored.rows[1]).toEqual({ status: 'sent', provider_message_id: 'msg_ok' });
      expect((recovered.json() as { history: { action: string }[] }).history.some((row) => row.action === 'invitation_renewed')).toBe(false);

      leak = true;
      const hidden = await invite('timer@valley.test');
      expect(hidden.statusCode).toBe(200);
      const leaked = await client.query<{ status: string; error: string }>(`SELECT status, error FROM email_messages WHERE to_email = 'timer@valley.test'`);
      expect(leaked.rows).toEqual([{ status: 'uncertain', error: 'Send outcome unknown.' }]);
      expect(leaked.rows[0].error).not.toContain('secret');
    } finally {
      await client.end();
      vi.unstubAllGlobals();
    }
  });

  it('never removes the last owner', async () => {
    const { call, valley } = await twoClubs();
    const res = await call(OWNER, 'POST', `/api/organizations/${valley}/members/remove`, { email: OWNER, role: 'owner' });
    expect(res.statusCode).toBe(409);
  });

  it('records every role change with who made it, newest first', async () => {
    const { call, valley } = await twoClubs();
    const newcomer = 'newcomer@valley.test';
    const manager = 'manager@valley.test';
    await call(manager, 'GET', '/api/me');
    await call(OWNER, 'POST', `/api/organizations/${valley}/members`, { email: manager, role: 'registration_manager' });
    await call(OWNER, 'POST', `/api/organizations/${valley}/members`, { email: newcomer, role: 'finance' });
    await call(OWNER, 'POST', `/api/organizations/${valley}/members`, { email: newcomer, role: 'check_in_volunteer' });
    await call(OWNER, 'POST', `/api/organizations/${valley}/members/remove`, { email: newcomer, role: 'finance' });
    await call(newcomer, 'GET', '/api/me');
    await call(OWNER, 'POST', `/api/organizations/${valley}/members/remove`, { email: manager, role: 'registration_manager' });
    // Adding a role someone already holds records nothing.
    await call(OWNER, 'POST', `/api/organizations/${valley}/members`, { email: newcomer, role: 'check_in_volunteer' });
    const { history } = (await call(OWNER, 'GET', `/api/organizations/${valley}/members`)).json() as { history: { action: string; email: string; role: string; by: string | null }[] };
    expect(history.slice(0, 6).map(({ action, email, role, by }) => ({ action, email, role, by }))).toEqual([
      { action: 'removed', email: manager, role: 'registration_manager', by: OWNER },
      { action: 'invitation_accepted', email: newcomer, role: 'check_in_volunteer', by: newcomer },
      { action: 'invitation_cancelled', email: newcomer, role: 'finance', by: OWNER },
      { action: 'invited', email: newcomer, role: 'check_in_volunteer', by: OWNER },
      { action: 'invited', email: newcomer, role: 'finance', by: OWNER },
      { action: 'granted', email: manager, role: 'registration_manager', by: OWNER },
    ]);
    // Organizations are isolated: Hills sees none of Valley's history.
    expect((await call(OTHER_OWNER, 'GET', `/api/organizations/${valley}/members`)).statusCode).toBe(404);
  });

  it('hands ownership to a signed-in teammate in one recorded step', async () => {
    const { call, valley, eventId } = await twoClubs();
    const successor = 'successor@valley.test';
    const transfer = (by: string, email: string) => call(by, 'POST', `/api/organizations/${valley}/ownership-transfer`, { email });
    // Someone who has never signed in cannot take ownership.
    expect((await transfer(OWNER, successor)).statusCode).toBe(422);
    await call(successor, 'GET', '/api/me');
    const membersUrl = `/api/organizations/${valley}/members`;
    const formerMember = { email: RIDER_EMAIL, role: 'check_in_volunteer' };
    expect((await call(OWNER, 'POST', membersUrl, formerMember)).statusCode).toBe(200);
    expect((await call(OWNER, 'POST', `${membersUrl}/remove`, formerMember)).statusCode).toBe(200);
    const before = (await call(OWNER, 'GET', membersUrl)).json();
    // Signing in, having a different organization's role, or having a removed role is insufficient.
    for (const outsider of [successor, OTHER_OWNER, formerMember.email]) {
      const refusal = await transfer(OWNER, outsider);
      expect(refusal.statusCode).toBe(422);
      expect(refusal.json()).toMatchObject({ error: 'Add this person to your team before handing over ownership.' });
    }
    const afterRefusals = await call(OWNER, 'GET', membersUrl);
    expect(afterRefusals.statusCode).toBe(200);
    expect(afterRefusals.json()).toEqual(before);

    expect((await call(OWNER, 'POST', membersUrl, { email: successor, role: 'finance' })).statusCode).toBe(200);
    await call(OWNER, 'POST', `/api/organizations/${valley}/members`, { email: OWNER, role: 'registration_manager' });
    // Only an owner can hand over, and not to themselves.
    expect((await transfer(successor, successor)).statusCode).toBe(403);
    expect((await transfer(OWNER, OWNER)).statusCode).toBe(422);

    const res = await transfer(OWNER, successor);
    expect(res.statusCode).toBe(200);
    const list = res.json() as { members: { email: string; role: string }[]; history: { action: string; email: string; by: string }[] };
    expect(list.members.filter((m) => m.role === 'owner').map((m) => m.email)).toEqual([successor]);
    expect(list.history[0]).toMatchObject({ action: 'ownership_transferred', email: successor, by: OWNER });
    // The old owner keeps their other role but loses owner tools; the successor gains them.
    expect((await call(OWNER, 'GET', `/api/organizations/${valley}/members`)).statusCode).toBe(403);
    expect((await call(OWNER, 'GET', `/api/events/${eventId}/orders`)).statusCode).toBe(200);
    expect((await call(successor, 'GET', `/api/organizations/${valley}/members`)).statusCode).toBe(200);
    // The old owner cannot hand over again; another club's owner cannot see the organization.
    expect((await transfer(OWNER, successor)).statusCode).toBe(403);
    expect((await call(OTHER_OWNER, 'POST', `/api/organizations/${valley}/ownership-transfer`, { email: OTHER_OWNER })).statusCode).toBe(404);
  });

  it.each([
    { first: 'removal', transferStatus: 422, finalOwner: OWNER },
    { first: 'transfer', transferStatus: 200, finalOwner: RIDER_EMAIL },
  ])('serializes ownership transfer and role removal with $first first', async ({ first, transferStatus, finalOwner }) => {
    const databaseUrl = await testDatabaseUrl();
    const { call, valley } = await twoClubs(databaseUrl);
    const membersUrl = `/api/organizations/${valley}/members`;
    const predecessorRole = { email: RIDER_EMAIL, role: 'finance' };
    expect((await call(OWNER, 'POST', membersUrl, predecessorRole)).statusCode).toBe(200);
    // The second owner can remove the role in either ordering.
    expect((await call(OWNER, 'POST', membersUrl, { email: OTHER_OWNER, role: 'owner' })).statusCode).toBe(200);
    const remove = () => call(OTHER_OWNER, 'POST', `${membersUrl}/remove`, predecessorRole);
    const transfer = () => call(OWNER, 'POST', `/api/organizations/${valley}/ownership-transfer`, { email: RIDER_EMAIL });

    const blocker = new pg.Client({ connectionString: databaseUrl });
    await blocker.connect();
    const requests: ReturnType<typeof call>[] = [];
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`org-members:${valley}`]);
      const waitForQueue = async (count: number) => {
        await expect.poll(async () => {
          const { rows } = await blocker.query<{ count: number }>(
            `SELECT count(*)::int AS count
               FROM pg_locks held JOIN pg_locks waiting USING (database, classid, objid, objsubid)
              WHERE held.pid = pg_backend_pid() AND held.locktype = 'advisory' AND held.granted
                AND waiting.locktype = 'advisory' AND NOT waiting.granted`,
          );
          return rows[0].count;
        }, { timeout: 5000, message: 'Requests waiting for the organization membership lock' }).toBe(count);
      };
      const [firstRequest, secondRequest] = first === 'removal' ? [remove, transfer] : [transfer, remove];
      requests.push(firstRequest());
      await waitForQueue(1);
      requests.push(secondRequest());
      await waitForQueue(2);
    } finally {
      try {
        await blocker.query('ROLLBACK');
        await Promise.allSettled(requests);
      } finally {
        await blocker.end();
      }
    }

    const [firstResponse, secondResponse] = await Promise.all(requests);
    const [removed, transferred] = first === 'removal' ? [firstResponse, secondResponse] : [secondResponse, firstResponse];
    expect(removed.statusCode, removed.body).toBe(200);
    expect(transferred.statusCode, transferred.body).toBe(transferStatus);
    if (first === 'removal') {
      expect(transferred.json()).toMatchObject({ error: 'Add this person to your team before handing over ownership.' });
    }
    const final = await call(OTHER_OWNER, 'GET', membersUrl);
    expect(final.statusCode, final.body).toBe(200);
    const { members, history } = final.json<{ members: { email: string; role: string }[]; history: { action: string; email: string; by: string }[] }>();
    expect(members.filter((member) => member.role === 'owner').map((member) => member.email).sort())
      .toEqual([OTHER_OWNER, finalOwner].sort());
    expect(members).not.toContainEqual(expect.objectContaining(predecessorRole));
    expect(history.filter((change) => change.action === 'ownership_transferred')).toEqual(first === 'transfer'
      ? [expect.objectContaining({ email: RIDER_EMAIL, by: OWNER })]
      : []);
  }, 15_000);

  it('refuses an unknown role', async () => {
    const { call, valley } = await twoClubs();
    expect((await call(OWNER, 'POST', `/api/organizations/${valley}/members`, { email: 'x@valley.test', role: 'admin' })).statusCode).toBe(400);
  });
});

describe('rider routes', () => {
  it('live under /api/rider and need sign-in; the old /api/public paths for them are gone', async () => {
    const { app, call, eventId, categoryId, waiver } = await twoClubs();
    const rider = 'second.rider@example.test';
    const body = { clientRequestId: 'rider-request-0002', categoryIds: [categoryId], rider: { ...RIDER, email: rider }, waiver };
    for (const [method, path, payload] of [
      ['POST', `events/${eventId}/orders`, body],
      ['POST', `events/${eventId}/coupons/check`, { code: 'NOPE' }],
      ['POST', `events/${eventId}/waitlist`, { categoryId }],
      ['GET', 'offers/not-a-real-offer-token', undefined],
    ] as const) {
      expect((await app.inject({ method, url: `/api/rider/${path}`, ...(payload ? { payload } : {}) })).statusCode, `${method} ${path} signed out`).toBe(401);
      expect((await call(rider, method, `/api/rider/${path}`, payload)).statusCode, `${method} ${path} signed in`).not.toBe(401);
      expect((await call(rider, method, `/api/public/${path}`, payload)).statusCode, `old ${method} ${path}`).toBe(404);
    }
    expect((await call(rider, 'POST', `/api/rider/events/${eventId}/orders`, body)).statusCode).toBe(201);
  });
});

describe('riders see only their own orders', () => {
  it('lets the rider read and pay their order, and nobody else', async () => {
    const { call, order } = await twoClubs();
    const stranger = 'stranger@example.test';
    expect((await call(RIDER_EMAIL, 'GET', `/api/orders/${order.id}`)).statusCode).toBe(200);
    expect((await call(stranger, 'GET', `/api/orders/${order.id}`)).statusCode).toBe(404);
    expect((await call(stranger, 'POST', `/api/orders/${order.id}/payment`, { attemptId: 'attempt-0001', outcome: 'success' })).statusCode).toBe(404);
    expect((await call(stranger, 'POST', `/api/orders/${order.id}/cancel`)).statusCode).toBe(404);
    // The organizer can read it but not pay for or cancel the rider's order.
    expect((await call(OWNER, 'GET', `/api/orders/${order.id}`)).statusCode).toBe(200);
    // 403, not 404: the organizer can already see the order, so nothing is hidden by pretending it is missing.
    expect((await call(OWNER, 'POST', `/api/orders/${order.id}/payment`, { attemptId: 'attempt-0002', outcome: 'success' })).statusCode).toBe(403);
    expect((await call(OWNER, 'POST', `/api/orders/${order.id}/cancel`)).statusCode).toBe(403);
    expect((await call(RIDER_EMAIL, 'POST', `/api/orders/${order.id}/payment`, { attemptId: 'attempt-0003', outcome: 'success' })).statusCode).toBe(200);
  });

  it("does not hand back another account's order for a reused checkout request ID", async () => {
    const { call, eventId, categoryId, waiver } = await twoClubs();
    const res = await call('stranger@example.test', 'POST', `/api/rider/events/${eventId}/orders`, { clientRequestId: 'rider-request-0001', categoryIds: [categoryId], rider: RIDER, waiver });
    expect(res.statusCode).toBe(409);
  });

  it('gives a rider no organizer access', async () => {
    const { call, eventId } = await twoClubs();
    expect((await call(RIDER_EMAIL, 'GET', `/api/events/${eventId}`)).statusCode).toBe(404);
    expect((await call(RIDER_EMAIL, 'GET', `/api/events/${eventId}/orders`)).statusCode).toBe(404);
  });
});

describe('choosing the sign-in provider', () => {
  const testToken = { headers: { authorization: 'Bearer test:dev@example.test' } } as FastifyRequest;

  it('uses Clerk when its secret key is set, and the local test provider otherwise on this computer', async () => {
    expect(await authProviderFromEnv({ CLERK_SECRET_KEY: 'sk_test_fictional' }).verify(testToken)).toBeNull();
    expect(await authProviderFromEnv({}).verify(testToken)).toEqual({ providerUserId: 'test|dev@example.test', email: 'dev@example.test' });
    expect(await authProviderFromEnv({ AUTH_MODE: 'test', CLERK_SECRET_KEY: 'sk_test_fictional' }).verify(testToken)).not.toBeNull();
  });

  it('requires Clerk in production or on a network address', () => {
    expect(() => authProviderFromEnv({ NODE_ENV: 'production' })).toThrow(/CLERK_SECRET_KEY/);
    expect(() => authProviderFromEnv({ HOST: '0.0.0.0' })).toThrow(/CLERK_SECRET_KEY/);
    expect(() => authProviderFromEnv({ AUTH_MODE: 'test', NODE_ENV: 'production' })).toThrow(/local only/);
    expect(() => authProviderFromEnv({ AUTH_MODE: 'test', HOST: '0.0.0.0', CLERK_SECRET_KEY: 'sk_test_fictional' })).toThrow(/local only/);
  });
});
