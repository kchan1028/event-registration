import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/server/app';
import type { EventConfig } from '../src/shared/schema';

type Order = {
  id: string;
  status: string;
  totalCents: number;
  checkInCode: string | null;
  entries: { id: string; categoryId: string; status: string; readiness: { key: string; state: string }[] }[];
};

const RIDER = { firstName: 'Test', lastName: 'Rider', email: 'test.rider@example.test', team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: null };

async function setup(opts: { publish?: boolean } = {}) {
  let now = new Date('2027-03-01T18:00:00Z');
  const clock = { advance: (min: number) => (now = new Date(now.getTime() + min * 60_000)) };
  const { app } = buildApp({ dbPath: ':memory:', now: () => now, holdMinutes: 10 });
  const { eventId } = (await app.inject({ method: 'POST', url: '/api/demo' })).json() as { eventId: string };
  if (opts.publish !== false) await app.inject({ method: 'POST', url: `/api/events/${eventId}/publish`, payload: { acknowledgeWarnings: true } });
  const event = (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json() as { config: EventConfig; revision: number; entries: unknown[] };
  const code = (c: string) => event.config.categories.find((x) => x.timingCode === c)!.id;
  const waiver = { version: event.config.registration.waiverVersion, riderAccepted: true, guardianAccepted: false };
  let n = 0;
  const order = (categoryIds: string[], extra: Record<string, unknown> = {}) =>
    app.inject({ method: 'POST', url: `/api/public/events/${eventId}/orders`, payload: { clientRequestId: `req-${++n}-xxxxxxxx`, categoryIds, rider: RIDER, waiver, ...extra } });
  const pay = (orderId: string, outcome: 'success' | 'failure', attemptId = `att-${Math.random().toString(36).slice(2)}`) =>
    app.inject({ method: 'POST', url: `/api/orders/${orderId}/payment`, payload: { attemptId, outcome } });
  const entriesCount = async () => ((await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json() as { entries: unknown[] }).entries.length;
  return { app, eventId, event, code, waiver, order, pay, clock, entriesCount };
}

describe('rider checkout: holds and simulated payment', () => {
  it('requires a published version', async () => {
    const { order, code } = await setup({ publish: false });
    const res = await order([code('RR-M35-34')]);
    expect(res.statusCode).toBe(409);
  });

  it('holds both days in one order with the bundle price (Buy both days)', async () => {
    const { order, code } = await setup();
    const res = await order([code('RR-M35-34'), code('CR-M35-34')]);
    expect(res.statusCode).toBe(201);
    const o = res.json() as Order;
    expect(o.status).toBe('held');
    expect(o.totalCents).toBe(7500);
    expect(o.entries).toHaveLength(2);
    expect(o.checkInCode).toBeNull();
  });

  it('a repeated request with the same client request ID returns the same order', async () => {
    const { app, eventId, code, waiver, entriesCount } = await setup();
    const before = await entriesCount();
    const body = { clientRequestId: 'same-request-123', categoryIds: [code('RR-M35-34')], rider: RIDER, waiver };
    const a = (await app.inject({ method: 'POST', url: `/api/public/events/${eventId}/orders`, payload: body })).json() as Order;
    const b = (await app.inject({ method: 'POST', url: `/api/public/events/${eventId}/orders`, payload: body })).json() as Order;
    expect(b.id).toBe(a.id);
    expect(await entriesCount()).toBe(before + 1);
  });

  it('refuses ineligible entries, missing guardians, and a stale waiver', async () => {
    const { order, code, waiver } = await setup();
    expect((await order([code('RR-P12')])).statusCode).toBe(422); // Cat 3 is not P/1/2
    const junior = { ...RIDER, racingAge: 16, licenseCategory: null };
    expect((await order([code('RR-J1516')], { rider: junior })).statusCode).toBe(422);
    expect((await order([code('RR-J1516')], { rider: { ...junior, guardian: { name: 'Test Parent', relationship: 'Parent' } }, waiver: { ...waiver, guardianAccepted: true } })).statusCode).toBe(201);
    expect((await order([code('RR-M35-34')], { waiver: { ...waiver, version: 'old' } })).statusCode).toBe(409);
  });

  it('confirms on payment once, even when the notification repeats (Payment retry)', async () => {
    const { order, pay, code, entriesCount } = await setup();
    const o = (await order([code('RR-M35-34')])).json() as Order;
    const first = (await pay(o.id, 'success', 'attempt-aaaaaaaa')).json() as Order;
    expect(first.status).toBe('confirmed');
    expect(first.checkInCode).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    const count = await entriesCount();
    const again = (await pay(o.id, 'success', 'attempt-aaaaaaaa')).json() as Order;
    const other = (await pay(o.id, 'success', 'attempt-bbbbbbbb')).json() as Order;
    expect(again.checkInCode).toBe(first.checkInCode);
    expect(other.checkInCode).toBe(first.checkInCode);
    expect(await entriesCount()).toBe(count);
  });

  it('a declined payment keeps the hold; a retry can still succeed', async () => {
    const { order, pay, code } = await setup();
    const o = (await order([code('RR-M35-34')])).json() as Order;
    expect(((await pay(o.id, 'failure')).json() as Order).status).toBe('payment_failed');
    expect(((await pay(o.id, 'success')).json() as Order).status).toBe('confirmed');
  });

  it('held places count toward shared limits, and a bundle is held all or nothing', async () => {
    const { app, eventId, order, code, entriesCount } = await setup();
    // Masters 50+ has 35 entries; fill the combined pool of 60 to 59.
    await app.inject({ method: 'POST', url: `/api/events/${eventId}/test-entries`, payload: { categoryId: code('RR-M60'), count: 24 } });
    const rider60 = { ...RIDER, racingAge: 61, licenseCategory: '3' };
    expect((await order([code('RR-M60')], { rider: rider60 })).statusCode).toBe(201); // takes the 60th place
    const before = await entriesCount();
    const res = await order([code('CR-M35-34'), code('RR-M60')], { rider: rider60 });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/Nothing was held/);
    expect(await entriesCount()).toBe(before);
  });

  it('expired holds release places; a late payment confirms only if every place is still free', async () => {
    const { app, eventId, order, pay, code, clock } = await setup();
    await app.inject({ method: 'POST', url: `/api/events/${eventId}/test-entries`, payload: { categoryId: code('RR-M60'), count: 24 } }); // 59 of 60
    const rider60 = { ...RIDER, racingAge: 61 };
    const slow = (await order([code('RR-M60')], { rider: rider60 })).json() as Order; // holds the last place
    expect((await order([code('RR-M60')], { rider: rider60 })).statusCode).toBe(409);

    clock.advance(11);
    expect(((await app.inject({ method: 'GET', url: `/api/orders/${slow.id}` })).json() as Order).status).toBe('expired');
    const fast = (await order([code('RR-M60')], { rider: rider60 })).json() as Order;
    expect(((await pay(fast.id, 'success')).json() as Order).status).toBe('confirmed');

    const late = (await pay(slow.id, 'success')).json() as Order;
    expect(late.status).toBe('needs_attention');
    expect(late.checkInCode).toBeNull();
  });

  it('a late payment after expiry confirms when the places are still free', async () => {
    const { order, pay, code, clock } = await setup();
    const o = (await order([code('RR-M35-34')])).json() as Order;
    clock.advance(30);
    expect(((await pay(o.id, 'success')).json() as Order).status).toBe('confirmed');
  });

  it('a payment that arrives after the rider cancelled goes to the exception queue instead of re-entering them', async () => {
    const { app, order, pay, code } = await setup();
    const o = (await order([code('RR-M35-34')])).json() as Order;
    await app.inject({ method: 'POST', url: `/api/orders/${o.id}/cancel` });
    expect(((await pay(o.id, 'success')).json() as Order).status).toBe('needs_attention');
  });

  it('cancelling releases the hold', async () => {
    const { app, order, code, entriesCount } = await setup();
    const before = await entriesCount();
    const o = (await order([code('RR-M35-34')])).json() as Order;
    expect(await entriesCount()).toBe(before + 1);
    await app.inject({ method: 'POST', url: `/api/orders/${o.id}/cancel` });
    expect(await entriesCount()).toBe(before);
  });

  it('paying does not clear a rider: license review stays pending until the organizer records it', async () => {
    const { app, eventId, order, pay, code } = await setup();
    const o = (await order([code('RR-M35-34')])).json() as Order;
    const paid = (await pay(o.id, 'success')).json() as Order;
    expect(paid.entries[0].readiness.find((r) => r.key === 'license')!.state).toBe('needs_review');
    expect((await app.inject({ method: 'POST', url: `/api/order-entries/${paid.entries[0].id}/license-review`, payload: { note: '' } })).statusCode).toBe(400);
    const reviewed = (await app.inject({ method: 'POST', url: `/api/order-entries/${paid.entries[0].id}/license-review`, payload: { note: 'License card seen' } })).json() as Order;
    expect(reviewed.entries[0].readiness.find((r) => r.key === 'license')!.state).toBe('done');
    const list = (await app.inject({ method: 'GET', url: `/api/events/${eventId}/orders` })).json() as Order[];
    expect(list).toHaveLength(1);
  });

  it('a category with a confirmed registration cannot be deleted from the draft', async () => {
    const { app, eventId, order, pay, code } = await setup();
    const o = (await order([code('RR-M35-34')])).json() as Order;
    await pay(o.id, 'success');
    const ev = (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json() as { config: EventConfig; revision: number };
    const config = structuredClone(ev.config);
    config.categories = config.categories.filter((c) => c.timingCode !== 'RR-M35-34');
    const res = await app.inject({ method: 'PUT', url: `/api/events/${eventId}/config`, payload: { revision: ev.revision, config } });
    expect(res.statusCode).toBe(409);
  });
});
