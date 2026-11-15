import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/server/app';
import { pairKey, suggestMatches, type IdentityOrder } from '../src/shared/riderIdentity';
import type { EventConfig } from '../src/shared/schema';

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
  const { app } = buildApp({ dbPath: ':memory:', now: () => new Date(start + tick++ * 1000), holdMinutes: 10 });
  const { eventId } = (await app.inject({ method: 'POST', url: '/api/demo' })).json() as { eventId: string };
  await app.inject({ method: 'POST', url: `/api/events/${eventId}/publish`, payload: { acknowledgeWarnings: true } });
  await app.inject({ method: 'PUT', url: `/api/events/${eventId}/bib-settings`, payload: { scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 199 }] } });
  const ev = (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json() as { config: EventConfig };
  const code = (c: string) => ev.config.categories.find((x) => x.timingCode === c)!.id;
  const waiver = { version: ev.config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Pat Demo', signerRole: 'rider' };
  let n = 0;
  const buy = async (c: string) => {
    const created = await app.inject({ method: 'POST', url: `/api/public/events/${eventId}/orders`, payload: { clientRequestId: `ident-${++n}-xxxxxx`, categoryIds: [code(c)], rider: RIDER, waiver } });
    expect(created.statusCode).toBe(201);
    const id = (created.json() as { id: string }).id;
    const paid = await app.inject({ method: 'POST', url: `/api/orders/${id}/payment`, payload: { attemptId: `attempt-${n}-xxxx`, outcome: 'success' } });
    expect(paid.statusCode).toBe(200);
    // Clear the license so the rider is ready at check-in.
    for (const e of (paid.json() as { entries: { id: string }[] }).entries) {
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
  return { app, eventId, buy, overview, post, checkInList, days, checkIn };
}

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
