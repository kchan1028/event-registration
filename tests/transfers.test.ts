import { describe, expect, it } from 'vitest';
import { testApp } from './support/db';
import { blankPath } from '../src/shared/factory';
import type { EventConfig } from '../src/shared/schema';

/* Organizer transfers and withdrawals (product.md acceptance: "Category change"). */

const RIDER = { firstName: 'Test', lastName: 'Rider', email: 'test.rider@example.test', team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Test Contact', phone: '555-555-0199' } };

type Change = { kind: string; amountPaidCents: number; newPriceCents: number | null; differenceCents: number | null; reason: string };
type Entry = { id: string; categoryId: string; status: string; amountPaidCents: number; changes: Change[] };
type Order = { id: string; status: string; totalCents: number; entries: Entry[] };

async function setup() {
  const now = new Date('2027-03-01T18:00:00Z');
  const { app } = await testApp({ now: () => now, holdMinutes: 10 });
  const { eventId } = (await app.inject({ method: 'POST', url: '/api/demo' })).json() as { eventId: string };
  await app.inject({ method: 'POST', url: `/api/events/${eventId}/publish`, payload: { acknowledgeWarnings: true } });
  const get = async () => (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json() as { config: EventConfig; revision: number; entries: { categoryId: string }[] };
  const ev = await get();
  const code = (c: string) => ev.config.categories.find((x) => x.timingCode === c)!.id;
  const waiver = { version: ev.config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Test Rider', signerRole: 'rider' };
  let n = 0;
  const buy = async (codes: string[]) => {
    const created = await app.inject({ method: 'POST', url: `/api/rider/events/${eventId}/orders`, payload: { clientRequestId: `req-${++n}-xxxxxxxx`, categoryIds: codes.map(code), rider: RIDER, waiver } });
    expect(created.statusCode).toBe(201);
    const o = created.json() as Order;
    const paid = await app.inject({ method: 'POST', url: `/api/orders/${o.id}/payment`, payload: { attemptId: `attempt-${n}-xxxx`, outcome: 'success' } });
    expect(paid.statusCode).toBe(200);
    return paid.json() as Order;
  };
  const transfer = (entryId: string, to: string, reason = 'Moved at rider request') => app.inject({ method: 'POST', url: `/api/order-entries/${entryId}/transfer`, payload: { toCategoryId: code(to), reason } });
  const withdraw = (entryId: string, reason = 'Injured, asked to withdraw') => app.inject({ method: 'POST', url: `/api/order-entries/${entryId}/withdraw`, payload: { reason } });
  const used = async (c: string) => (await get()).entries.filter((e) => e.categoryId === code(c)).length;
  return { app, eventId, get, code, buy, transfer, withdraw, used };
}

describe('organizer transfers', () => {
  it('compares transfers using the rider rate without changing the paid total', async () => {
    const s = await setup();
    const ev = await s.get();
    ev.config.registration.riderRates = [{ eligibility: blankPath(), categoryGenderClass: 'any', racePrices: [{ raceId: ev.config.races[0].id, cents: 3000, extraEntryCents: 1000 }], bundlePriceCents: 4000 }];
    expect((await s.app.inject({ method: 'PUT', url: `/api/events/${s.eventId}/config`, payload: { config: ev.config, revision: ev.revision } })).statusCode).toBe(200);
    expect((await s.app.inject({ method: 'POST', url: `/api/events/${s.eventId}/publish`, payload: { acknowledgeWarnings: true, acknowledgeImpact: true } })).statusCode).toBe(200);
    const order = await s.buy(['RR-M35-34']);
    const res = await s.transfer(order.entries[0].id, 'RR-D23');
    expect(res.statusCode).toBe(200);
    const moved = res.json() as Order;
    expect(moved.totalCents).toBe(order.totalCents);
    expect(moved.entries[0].changes[0]).toMatchObject({ newPriceCents: 3000, differenceCents: 0 });
  });

  it('moves a paid entry, keeps the price paid, logs the difference, and moves the place', async () => {
    const s = await setup();
    const order = await s.buy(['RR-M35-34']);
    expect(order.status).toBe('confirmed');
    const entry = order.entries[0];
    const [fromBefore, toBefore] = [await s.used('RR-M35-34'), await s.used('RR-D23')];

    const res = await s.transfer(entry.id, 'RR-D23', 'Prefers the domestic field');
    expect(res.statusCode).toBe(200);
    const after = res.json() as Order;
    const moved = after.entries[0];
    expect(moved.categoryId).toBe(s.code('RR-D23'));
    expect(after.totalCents).toBe(order.totalCents); // never repriced
    expect(moved.amountPaidCents).toBe(entry.amountPaidCents);
    expect(moved.changes).toHaveLength(1);
    expect(moved.changes[0]).toMatchObject({ kind: 'transfer', amountPaidCents: entry.amountPaidCents, reason: 'Prefers the domestic field' });
    expect(moved.changes[0].differenceCents).toBe((moved.changes[0].newPriceCents ?? 0) - entry.amountPaidCents);
    expect([await s.used('RR-M35-34'), await s.used('RR-D23')]).toEqual([fromBefore - 1, toBefore + 1]);
  });

  it('rechecks eligibility and refuses the same category or a missing reason', async () => {
    const s = await setup();
    const order = await s.buy(['RR-M35-34']);
    const ineligible = await s.transfer(order.entries[0].id, 'RR-45'); // Cat 3 is not Cat 4/5
    expect(ineligible.statusCode).toBe(422);
    expect((ineligible.json() as { error: string }).error).toContain('Not eligible');
    expect((await s.transfer(order.entries[0].id, 'RR-M35-34')).statusCode).toBe(422);
    expect((await s.app.inject({ method: 'POST', url: `/api/order-entries/${order.entries[0].id}/transfer`, payload: { toCategoryId: s.code('RR-D23'), reason: '' } })).statusCode).toBe(400);
  });

  it('refuses a full target category', async () => {
    const s = await setup();
    const order = await s.buy(['RR-M35-34']);
    await s.app.inject({ method: 'POST', url: `/api/events/${s.eventId}/test-entries`, payload: { categoryId: s.code('RR-D23'), count: 1 } });
    const ev = await s.get();
    const config = structuredClone(ev.config);
    const target = config.categories.find((c) => c.id === s.code('RR-D23'))!;
    target.cap = ev.entries.filter((e) => e.categoryId === target.id).length;
    expect((await s.app.inject({ method: 'PUT', url: `/api/events/${s.eventId}/config`, payload: { revision: ev.revision, config } })).statusCode).toBe(200);
    expect((await s.app.inject({ method: 'POST', url: `/api/events/${s.eventId}/publish`, payload: { acknowledgeWarnings: true, acknowledgeImpact: true } })).statusCode).toBe(200);
    const res = await s.transfer(order.entries[0].id, 'RR-D23');
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: string }).error).toContain('full');
  });
});

describe('organizer withdrawals', () => {
  it('withdraws one entry: place freed, price paid recorded, check-in drops it', async () => {
    const s = await setup();
    const order = await s.buy(['RR-M35-34', 'CR-M35-34']);
    const sat = order.entries.find((e) => e.categoryId === s.code('RR-M35-34'))!;
    const before = await s.used('RR-M35-34');

    const res = await s.withdraw(sat.id);
    expect(res.statusCode).toBe(200);
    const after = res.json() as Order;
    const w = after.entries.find((e) => e.id === sat.id)!;
    expect(w.status).toBe('withdrawn');
    expect(w.changes[0]).toMatchObject({ kind: 'withdraw', amountPaidCents: sat.amountPaidCents });
    expect(after.totalCents).toBe(order.totalCents);
    expect(after.entries.find((e) => e.id !== sat.id)!.status).toBe('confirmed');
    expect(await s.used('RR-M35-34')).toBe(before - 1);

    // Saturday check-in: a search still finds the rider, who has no entry that day any more.
    type CheckInList = { days: { id: string; label: string }[]; riders: { orderId: string; result: { ready: boolean; blockers: { key: string }[] } }[] };
    const list = (await s.app.inject({ method: 'GET', url: `/api/events/${s.eventId}/check-in?q=` })).json() as CheckInList;
    const saturday = list.days.find((d) => d.label === 'Saturday')!;
    const satList = (await s.app.inject({ method: 'GET', url: `/api/events/${s.eventId}/check-in?day=${saturday.id}&q=Test%20Rider` })).json() as CheckInList;
    const rider = satList.riders.find((r) => r.orderId === order.id)!;
    expect(rider.result.ready).toBe(false);
    expect(rider.result.blockers.map((b) => b.key)).toContain('no_entry');

    // A withdrawn entry cannot be withdrawn or transferred again.
    expect((await s.withdraw(sat.id)).statusCode).toBe(409);
    expect((await s.transfer(sat.id, 'RR-D23')).statusCode).toBe(409);
  });
});

describe('license review', () => {
  it('refuses a withdrawn entry in plain words and leaves it unreviewed', async () => {
    const s = await setup();
    const order = await s.buy(['RR-M35-34', 'CR-M35-34']);
    const [gone, kept] = order.entries;
    expect((await s.withdraw(gone.id)).statusCode).toBe(200);
    const review = (entryId: string) => s.app.inject({ method: 'POST', url: `/api/order-entries/${entryId}/license-review`, payload: { note: 'License card seen' } });
    const refused = await review(gone.id);
    expect(refused.statusCode).toBe(409);
    expect((refused.json() as { error: string }).error).toBe('This entry was withdrawn, so its license cannot be reviewed.');
    const ok = await review(kept.id);
    expect(ok.statusCode).toBe(200);
    const after = (ok.json() as { entries: { id: string; licenseReviewed: boolean }[] }).entries;
    expect(after.find((e) => e.id === gone.id)?.licenseReviewed).toBe(false);
    expect(after.find((e) => e.id === kept.id)?.licenseReviewed).toBe(true);
  });
});
