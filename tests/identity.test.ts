import { describe, expect, it } from 'vitest';
import { as } from './support/auth';
import { testApp } from './support/db';
import { pairKey, suggestMatches, type IdentityOrder } from '../src/shared/riderIdentity';
import type { EventConfig } from '../src/shared/schema';
import { publishReviewed } from './support/publish';

/* Rider identity across orders: suggested matches, organizer-confirmed links. */

const o = (id: string, over: Partial<IdentityOrder> = {}): IdentityOrder => ({ id, createdAt: `2027-03-01T18:00:0${id.slice(-1)}Z`, firstName: 'Pat', lastName: 'Demo', email: 'pat@example.test', licenseNumber: '', ...over });

describe('same-rider suggestions', () => {
  it('suggests a pair with the same license number even when emails differ', () => {
    const s = suggestMatches([o('o1', { licenseNumber: 'demo-123' }), o('o2', { licenseNumber: 'DEMO 123', email: 'other@example.test' }), o('o3', { firstName: 'Sam' })], (id) => id, new Set());
    expect(s).toEqual([{ a: 'o1', b: 'o2', reasons: ['Same license number'] }]);
  });

  it('matches name and email case-insensitively, and never on name alone', () => {
    const s = suggestMatches([o('o1'), o('o2', { firstName: 'PAT', email: 'Pat@Example.test' }), o('o3', { email: 'different@example.test' })], (id) => id, new Set());
    expect(s.map((x) => [x.a, x.b])).toEqual([['o1', 'o2']]);
  });

  it('matches names with and without accents', () => {
    const s = suggestMatches([o('o1', { firstName: 'José' }), o('o2', { firstName: 'Jose' })], (id) => id, new Set());
    expect(s).toEqual([{ a: 'o1', b: 'o2', reasons: ['Same name and email'] }]);
  });

  it('skips pairs already linked or dismissed', () => {
    const orders = [o('o1'), o('o2'), o('o3')];
    const s = suggestMatches(orders, (id) => (id === 'o2' ? 'o1' : id), new Set([pairKey('o3', 'o1')]));
    expect(s.map((x) => [x.a, x.b])).toEqual([['o2', 'o3']]);
  });
});

type Card = { orderId: string; name: string; entries: unknown[]; bib: number | null; checkedInAt: string | null };

const RIDER = { firstName: 'Pat', lastName: 'Demo', email: 'pat.demo@example.test', team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual', licenseNumber: 'DEMO-900', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Demo Contact', phone: '555-555-0199' } };

async function setup() {
  const start = new Date('2027-03-01T18:00:00Z').getTime();
  let tick = 0;
  const { app } = await testApp({ now: () => new Date(start + tick++ * 1000), holdMinutes: 10 });
  const { eventId, organizationId } = (await app.inject({ method: 'POST', url: '/api/demo' })).json<{ eventId: string; organizationId: string }>();
  await publishReviewed(app, `/api/events/${eventId}`, { acknowledgeWarnings: true });
  await app.inject({ method: 'PUT', url: `/api/events/${eventId}/bib-settings`, payload: { scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 199 }] } });
  const ev = (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json() as { config: EventConfig };
  const code = (c: string) => ev.config.categories.find((x) => x.timingCode === c)!.id;
  const waiver = { version: ev.config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Pat Demo', signerRole: 'rider' };
  let n = 0;
  const buy = async (c: string, headers = {}, rider = RIDER, selfRegistrationConfirmed?: true) => {
    const created = await app.inject({ method: 'POST', url: `/api/rider/events/${eventId}/orders`, headers, payload: { clientRequestId: `ident-${++n}-xxxxxx`, categoryIds: [code(c)], rider, selfRegistrationConfirmed, waiver: { ...waiver, signatureName: `${rider.firstName} ${rider.lastName}` } } });
    expect(created.statusCode).toBe(201);
    const id = (created.json() as { id: string }).id;
    const paid = await app.inject({ method: 'POST', url: `/api/orders/${id}/payment`, headers, payload: { attemptId: `attempt-${n}-xxxx`, outcome: 'success' } });
    expect(paid.statusCode).toBe(200);
    // Clear the license so the rider is ready at check-in.
    for (const e of (paid.json() as { entries: { id: string; dayId: string }[] }).entries) {
      expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/check-in/${id}/walk-up`, payload: { dayId: e.dayId, entryId: e.id } })).statusCode).toBe(200);
      expect((await app.inject({ method: 'POST', url: `/api/order-entries/${e.id}/license-review`, payload: { note: 'License card seen' } })).statusCode).toBe(200);
    }
    return id;
  };
  type Overview = { suggestions: { a: string; b: string; reasons: string[] }[]; groups: { key: string; orders: { orderId: string }[] }[] };
  const overview = async () => (await app.inject({ method: 'GET', url: `/api/events/${eventId}/rider-identity` })).json() as Overview;
  const post = (path: string, payload: Record<string, unknown>) => app.inject({ method: 'POST', url: `/api/events/${eventId}/rider-identity/${path}`, payload });
  const days = ev.config.days.map((d) => d.id);
  const checkInList = async (day: string, q = 'Pat') => (await app.inject({ method: 'GET', url: `/api/events/${eventId}/check-in?${new URLSearchParams({ day, q })}` })).json() as { riders: Card[] };
  const checkIn = (orderId: string, day: string) => app.inject({ method: 'POST', url: `/api/events/${eventId}/check-in/${orderId}`, payload: { dayId: day, bib: null } });
  return { app, eventId, organizationId, buy, overview, post, checkInList, days, checkIn };
}

describe('participant identity API', () => {
  it('groups confirmed adult self-registrations by account and keeps other orders event-local', async () => {
    const { app, eventId, buy, post, checkInList, days } = await setup();
    const rider = as('rider@participants.test');
    const other = as('other-rider@participants.test');
    const first = await buy('RR-M35-34', rider, RIDER, true);
    const second = await buy('CR-M35-34', rider, RIDER, true);
    const proxy = await buy('RR-M35-34', rider);
    const otherAccount = await buy('CR-M35-34', other, RIDER, true);

    const groups = async () => {
      const response = await app.inject({ url: `/api/events/${eventId}/participant-groups` });
      expect(response.statusCode, response.body).toBe(200);
      return response.json();
    };
    const expected = [{ orderIds: [first, second] }, { orderIds: [proxy] }, { orderIds: [otherAccount] }];
    expect(await groups()).toEqual(expected);
    expect((await checkInList(days[0])).riders).toHaveLength(4);

    expect((await post('link', { orderIds: [first, proxy] })).statusCode).toBe(200);
    expect((await post('link', { orderIds: [first, otherAccount] })).statusCode).toBe(200);
    expect(await groups()).toEqual(expected);
    expect((await checkInList(days[0])).riders).toHaveLength(2);
  });

  it('uses explicit rider links and keeps different riders on one account separate', async () => {
    const { app, eventId, organizationId, buy } = await setup();
    const rider = as('rider@participants.test');
    const sameContact = as('separate-account@participants.test');
    const first = await buy('RR-M35-34', rider);
    const second = await buy('CR-M35-34', rider);
    const independent = await buy('CR-M35-34', sameContact);
    const anotherRider = await buy('RR-M35-34', rider, { ...RIDER, firstName: 'Another' });
    expect((await app.inject({
      method: 'POST',
      url: `/api/events/${eventId}/rider-identity/link`,
      payload: { orderIds: [first, second] },
    })).statusCode).toBe(200);
    const url = `/api/events/${eventId}/participant-groups`;
    const response = await app.inject({ url });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toEqual([
      { orderIds: [first, second] }, { orderIds: [independent] }, { orderIds: [anotherRider] },
    ]);
    const history = await app.inject({ url: `/api/events/${eventId}/orders/${first}/participant-history` });
    expect(history.statusCode, history.body).toBe(200);
    expect(history.json()).toEqual({ orderIds: [second, first] });
    const separateEvent = await app.inject({
      method: 'POST',
      url: `/api/organizations/${organizationId}/events`,
      payload: { name: 'Another fictional event', template: 'road_race', startDate: '2027-03-07', timeZone: 'America/Los_Angeles' },
    });
    expect(separateEvent.statusCode, separateEvent.body).toBe(201);
    const separateGroups = await app.inject({ url: `/api/events/${separateEvent.json().id}/participant-groups` });
    expect(separateGroups.statusCode).toBe(200);
    expect(separateGroups.json()).toEqual([]);
    expect((await app.inject({ url, headers: rider })).statusCode).toBe(404);
    for (const [role, statusCode] of [['registration_manager', 200], ['finance', 403]] as const) {
      const email = `${role}@participants.test`;
      expect((await app.inject({ method: 'POST', url: `/api/organizations/${organizationId}/members`, payload: { role, email } })).statusCode).toBe(200);
      expect((await app.inject({ url, headers: as(email) })).statusCode).toBe(statusCode);
    }
  });
});

describe('rider identity API', () => {
  it('suggests two orders for one rider, links them on request, and treats them as one rider', async () => {
    const s = await setup();
    const sat = await s.buy('RR-M35-34');
    const sun = await s.buy('CR-M35-34');
    const before = await s.overview();
    expect(before.suggestions).toHaveLength(1);
    expect(before.suggestions[0]).toMatchObject({ a: sat, b: sun });
    expect(before.suggestions[0].reasons).toEqual(expect.arrayContaining(['Same license number', 'Same name and email']));

    // Before linking: a search finds two riders.
    expect((await s.checkInList(s.days[0])).riders).toHaveLength(2);

    expect((await s.post('link', { orderIds: [sun, sat] })).statusCode).toBe(200);
    const after = await s.overview();
    expect(after.suggestions).toEqual([]);
    expect(after.groups).toHaveLength(1);
    expect(after.groups[0].key).toBe(sat);
    expect(after.groups[0].orders.map((x) => x.orderId).sort()).toEqual([sat, sun].sort());

    // One rider card, under the earliest order.
    const satCards = (await s.checkInList(s.days[0])).riders;
    expect(satCards).toHaveLength(1);
    expect(satCards[0].orderId).toBe(sat);
    // Checking in through the later order's ID uses the rider key: one weekend bib on both days.
    const satCheck = (await s.checkIn(sun, s.days[0])).json() as Card;
    expect(satCheck.orderId).toBe(sat);
    expect(satCheck.bib).not.toBeNull();
    const sunCheck = (await s.checkIn(sat, s.days[1])).json() as Card;
    expect(sunCheck.bib).toBe(satCheck.bib);

    // Start lists carry one rider ID for both entries.
    const sl = (await s.app.inject({ method: 'GET', url: `/api/events/${s.eventId}/start-lists` })).json() as { races: { rows: { riderId: string; firstName: string }[] }[] };
    const ids = new Set(sl.races.flatMap((r) => r.rows.filter((x) => x.firstName === 'Pat').map((x) => x.riderId)));
    expect([...ids]).toEqual([sat]);
  });

  it('refuses to link when both orders already have a bib or check-in, and remembers "not the same rider"', async () => {
    const s = await setup();
    const a = await s.buy('RR-M35-34');
    const b = await s.buy('CR-M35-34');
    expect((await s.checkIn(a, s.days[0])).statusCode).toBe(200);
    expect((await s.checkIn(b, s.days[1])).statusCode).toBe(200);
    const refused = await s.post('link', { orderIds: [a, b] });
    expect(refused.statusCode).toBe(409);
    expect((refused.json() as { error: string }).error).toContain('Undo one check-in');

    expect((await s.post('dismiss', { orderIds: [a, b] })).statusCode).toBe(200);
    expect((await s.overview()).suggestions).toEqual([]);
  });

  it('unlinks a rider back into separate orders', async () => {
    const s = await setup();
    const a = await s.buy('RR-M35-34');
    const b = await s.buy('CR-M35-34');
    await s.post('link', { orderIds: [a, b] });
    expect((await s.post('unlink', { orderId: b })).statusCode).toBe(200);
    const o = await s.overview();
    expect(o.groups).toEqual([]);
    expect(o.suggestions).toHaveLength(1); // suggested again, since it was never dismissed
  });
});

describe('linked riders and shared limits', () => {
  it('counts two linked orders in one start group as one rider toward its field limit', async () => {
    const { app } = await testApp({ now: () => new Date('2027-03-01T18:00:00Z'), holdMinutes: 10 });
    const { eventId } = (await app.inject({ method: 'POST', url: '/api/demo' })).json() as { eventId: string };
    const ev = (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json() as { config: EventConfig; revision: number };
    // Collegiate men A and Domestic men Cat 2/3 start together; give that start group room for two riders.
    const [collegiate, domestic] = ['RR-CMA', 'RR-D23'].map((c) => ev.config.categories.find((x) => x.timingCode === c)!);
    expect(collegiate.startGroupId).toBe(domestic.startGroupId);
    const config = { ...ev.config, startGroups: ev.config.startGroups.map((g) => (g.id === domestic.startGroupId ? { ...g, fieldLimit: 2 } : g)) };
    expect((await app.inject({ method: 'PUT', url: `/api/events/${eventId}/config`, payload: { revision: ev.revision, config } })).statusCode).toBe(200);
    expect((await publishReviewed(app, `/api/events/${eventId}`, { acknowledgeWarnings: true })).statusCode).toBe(200);

    let n = 0;
    const order = (categoryId: string, rider: Record<string, unknown>) =>
      app.inject({
        method: 'POST',
        url: `/api/rider/events/${eventId}/orders`,
        payload: { clientRequestId: `shared-${++n}-xxxxxx`, categoryIds: [categoryId], rider, waiver: { version: ev.config.registration.waiverVersion, read: true, agreed: true, signatureName: `${rider.firstName} ${rider.lastName}`, signerRole: 'rider' } },
      });
    const remaining = async () => ((await app.inject({ method: 'GET', url: `/api/public/events/${eventId}` })).json() as { remaining: Record<string, number | null> }).remaining[domestic.id];
    const pat = { ...RIDER, racingAge: 21, collegiateDivision: 'A' };
    const lee = { ...RIDER, firstName: 'Lee', email: 'lee.demo@example.test', licenseNumber: 'DEMO-901' };
    const sam = { ...RIDER, firstName: 'Sam', email: 'sam.demo@example.test', licenseNumber: 'DEMO-902' };

    // Pat enters both categories on two orders: two unlinked orders take both places.
    const a = await order(collegiate.id, pat);
    const b = await order(domestic.id, pat);
    expect([a.statusCode, b.statusCode]).toEqual([201, 201]);
    expect(await remaining()).toBe(0);
    const full = await order(domestic.id, lee);
    expect(full.statusCode).toBe(409);
    expect((full.json() as { error: string }).error).toMatch(/is full .*2 of 2/);

    // Linked, the two orders are one rider, so one place is free again. Only one more rider fits.
    const ids = [a, b].map((r) => (r.json() as { id: string }).id);
    expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/rider-identity/link`, payload: { orderIds: ids } })).statusCode).toBe(200);
    expect(await remaining()).toBe(1);
    expect((await order(domestic.id, lee)).statusCode).toBe(201);
    expect((await order(domestic.id, sam)).statusCode).toBe(409);
  });
});
