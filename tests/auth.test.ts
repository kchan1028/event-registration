import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { AuthProvider } from '../src/server/auth';
import { authProviderFromEnv } from '../src/server/auth';
import type { EventConfig } from '../src/shared/schema';
import { as, fakeAuth } from './support/auth';
import { testApp } from './support/db';

// Sign-in and organizer roles (ADR 0003 Phase 2, product.md "Sign-in and account security").
// Sessions are faked: `as(email)` signs a request in as a fictional .test address.

const OWNER = 'owner@valley.test';
const OTHER_OWNER = 'owner@hills.test';
const RIDER_EMAIL = 'rider@example.test';
const RIDER = { firstName: 'Test', lastName: 'Rider', email: RIDER_EMAIL, team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Test Contact', phone: '555-555-0199' } };

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

/** Two clubs: Valley (with a published demo event and one rider order) and Hills (empty). */
async function twoClubs() {
  const { app } = await testApp({ auth: fakeAuth() });
  const call = (email: string, method: Method, url: string, payload?: unknown) =>
    app.inject({ method, url, headers: as(email), ...(payload === undefined ? {} : { payload: payload as object }) });

  const demo = (await call(OWNER, 'POST', '/api/demo')).json() as { organizationId: string; eventId: string };
  await call(OWNER, 'POST', `/api/events/${demo.eventId}/publish`, { acknowledgeWarnings: true });
  const event = (await call(OWNER, 'GET', `/api/events/${demo.eventId}`)).json() as { config: EventConfig; revision: number };
  const categoryId = event.config.categories.find((c) => c.timingCode === 'RR-M35-34')!.id;
  const waiver = { version: event.config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Test Rider', signerRole: 'rider' };
  const placed = await call(RIDER_EMAIL, 'POST', `/api/public/events/${demo.eventId}/orders`, { clientRequestId: 'rider-request-0001', categoryIds: [categoryId], rider: RIDER, waiver });
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
      startLists: ['GET', `/api/events/${eventId}/start-lists`],
      entriesCsv: ['GET', `/api/events/${eventId}/exports/entries.csv`],
      ledgerCsv: ['GET', `/api/events/${eventId}/exports/ledger.csv`],
      members: ['GET', `/api/organizations/${valley}/members`],
    };
    const expected: Record<string, Record<string, number>> = {
      [team.registration_manager]: { edit: 200, orders: 200, checkIn: 200, startLists: 200, entriesCsv: 200, ledgerCsv: 403, members: 403 },
      [team.check_in_volunteer]: { edit: 403, orders: 403, checkIn: 200, startLists: 403, entriesCsv: 403, ledgerCsv: 403, members: 403 },
      [team.timer_export]: { edit: 403, orders: 403, checkIn: 403, startLists: 200, entriesCsv: 200, ledgerCsv: 403, members: 403 },
      [team.finance]: { edit: 403, orders: 200, checkIn: 403, startLists: 403, entriesCsv: 403, ledgerCsv: 200, members: 403 },
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

  it("returns the caller's roles with the event so the screens can hide other tools", async () => {
    const { call, eventId, team } = await withRoles();
    expect(((await call(team.check_in_volunteer, 'GET', `/api/events/${eventId}`)).json() as { roles: string[] }).roles).toEqual(['check_in_volunteer']);
  });

  it('turns an invitation into a role when that person first signs in, and lets the owner remove it', async () => {
    const { call, valley, eventId } = await twoClubs();
    const newcomer = 'newcomer@valley.test';
    const invited = (await call(OWNER, 'POST', `/api/organizations/${valley}/members`, { email: newcomer, role: 'check_in_volunteer' })).json() as {
      invitations: { email: string; role: string }[];
    };
    expect(invited.invitations).toEqual([{ email: newcomer, role: 'check_in_volunteer' }]);
    expect((await call(newcomer, 'GET', `/api/events/${eventId}/check-in`)).statusCode).toBe(200);
    const members = (await call(OWNER, 'GET', `/api/organizations/${valley}/members`)).json() as { members: { email: string }[]; invitations: unknown[] };
    expect(members.members.map((m) => m.email)).toContain(newcomer);
    expect(members.invitations).toEqual([]);
    expect((await call(OWNER, 'POST', `/api/organizations/${valley}/members/remove`, { email: newcomer, role: 'check_in_volunteer' })).statusCode).toBe(200);
    expect((await call(newcomer, 'GET', `/api/events/${eventId}/check-in`)).statusCode).toBe(404);
  });

  it('never removes the last owner', async () => {
    const { call, valley } = await twoClubs();
    const res = await call(OWNER, 'POST', `/api/organizations/${valley}/members/remove`, { email: OWNER, role: 'owner' });
    expect(res.statusCode).toBe(409);
  });

  it('refuses an unknown role', async () => {
    const { call, valley } = await twoClubs();
    expect((await call(OWNER, 'POST', `/api/organizations/${valley}/members`, { email: 'x@valley.test', role: 'admin' })).statusCode).toBe(400);
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
    expect((await call(OWNER, 'POST', `/api/orders/${order.id}/payment`, { attemptId: 'attempt-0002', outcome: 'success' })).statusCode).toBe(404);
    expect((await call(RIDER_EMAIL, 'POST', `/api/orders/${order.id}/payment`, { attemptId: 'attempt-0003', outcome: 'success' })).statusCode).toBe(200);
  });

  it("does not hand back another account's order for a reused checkout request ID", async () => {
    const { call, eventId, categoryId, waiver } = await twoClubs();
    const res = await call('stranger@example.test', 'POST', `/api/public/events/${eventId}/orders`, { clientRequestId: 'rider-request-0001', categoryIds: [categoryId], rider: RIDER, waiver });
    expect(res.statusCode).toBe(409);
  });

  it('gives a rider no organizer access', async () => {
    const { call, eventId } = await twoClubs();
    expect((await call(RIDER_EMAIL, 'GET', `/api/events/${eventId}`)).statusCode).toBe(404);
    expect((await call(RIDER_EMAIL, 'GET', `/api/events/${eventId}/orders`)).statusCode).toBe(404);
  });
});

describe('choosing the sign-in provider', () => {
  it('needs a Clerk secret key unless the local test provider is chosen', () => {
    expect(() => authProviderFromEnv({})).toThrow(/CLERK_SECRET_KEY/);
    expect(() => authProviderFromEnv({ CLERK_SECRET_KEY: 'sk_test_fictional' })).not.toThrow();
    expect(() => authProviderFromEnv({ AUTH_MODE: 'test' })).not.toThrow();
  });

  it('refuses the test provider in production or on a network address', () => {
    expect(() => authProviderFromEnv({ AUTH_MODE: 'test', NODE_ENV: 'production' })).toThrow(/local browser tests only/);
    expect(() => authProviderFromEnv({ AUTH_MODE: 'test', HOST: '0.0.0.0' })).toThrow(/local browser tests only/);
  });
});
