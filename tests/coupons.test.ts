import { describe, expect, it } from 'vitest';
import { testApp, testDatabaseUrl } from './support/db';
import { parseCsv } from '../src/shared/csv';
import { couponInputSchema, couponUnavailableReason, type CouponTerms } from '../src/shared/coupons';
import { buildDemoEvent } from '../src/shared/demo';
import { quote } from '../src/shared/pricing';
import type { EventConfig } from '../src/shared/schema';

/* Basic coupons (product.md: Promotions): pricing precedence, windows, caps, and atomic redemption. */

const demo = () => buildDemoEvent().config;
const id = (c: EventConfig, code: string) => c.categories.find((x) => x.timingCode === code)!.id;
const pct = (code: string, percent: number, categoryIds: string[] = []): CouponTerms => ({ kind: 'percent', code, percent, categoryIds });
const fixed = (code: string, amountCents: number, categoryIds: string[] = []): CouponTerms => ({ kind: 'fixed', code, amountCents, categoryIds });

describe('coupon pricing (shared rule)', () => {
  it('takes a percentage off an undiscounted entry and labels the discount with the code', () => {
    const c = demo();
    const q = quote(c, [id(c, 'RR-M35-34')], '2027-03-01', pct('SAVE20', 20));
    expect(q.lines[0].discountCents).toBe(1000);
    expect(q.lines[0].discountReason).toBe('Coupon SAVE20');
    expect(q.coupon).toMatchObject({ discountCents: 1000, unappliedReason: null, appliedCategoryIds: [id(c, 'RR-M35-34')] });
    expect(q.totalCents).toBe(4000);
  });

  it('never stacks on a bundle: bundled entries keep only the bundle discount and the code explains why it saves nothing', () => {
    const c = demo();
    const q = quote(c, [id(c, 'RR-M35-34'), id(c, 'CR-M35-34')], '2027-03-01', pct('SAVE20', 20));
    expect(q.totalCents).toBe(7500);
    expect(q.lines.every((l) => l.discountReason === 'Weekend omnium entry')).toBe(true);
    expect(q.coupon?.discountCents).toBe(0);
    expect(q.coupon?.unappliedReason).toMatch(/at most one discount/);
  });

  it('applies only to the entry the additional-race discount left at full price', () => {
    const c = demo();
    const q = quote(c, [id(c, 'CR-45'), id(c, 'CR-M35-34')], '2027-03-01', pct('TEN', 10));
    expect(q.lines.map((l) => l.discountReason).sort()).toEqual(['Additional race', 'Coupon TEN']);
    const couponLine = q.lines.find((l) => l.discountReason === 'Coupon TEN')!;
    expect(couponLine.discountCents).toBe(Math.round(couponLine.priceCents / 10));
  });

  it('a fixed coupon is capped at the eligible entries, so no price goes negative', () => {
    const c = demo();
    const q = quote(c, [id(c, 'RR-M35-34')], '2027-03-01', fixed('BIG', 50_000));
    expect(q.lines[0].discountCents).toBe(5000);
    expect(q.totalCents).toBe(0);
  });

  it('rounds a percentage half up to the cent', () => {
    const c = demo();
    const cat = c.categories.find((x) => x.timingCode === 'RR-M35-34')!;
    cat.pricing = { ...cat.pricing, baseCents: 1050, priceChanges: [] };
    const q = quote(c, [cat.id], '2027-03-01', pct('FIVE', 5)); // 52.5 cents
    expect(q.lines[0].discountCents).toBe(53);
  });

  it('explains a code limited to categories that are not in the order', () => {
    const c = demo();
    const q = quote(c, [id(c, 'RR-M35-34')], '2027-03-01', pct('JR', 50, [id(c, 'CR-45')]));
    expect(q.coupon?.discountCents).toBe(0);
    expect(q.coupon?.unappliedReason).toMatch(/applies only to/);
    expect(q.totalCents).toBe(5000);
  });

  it('windows and caps: not yet, open, ended, exhausted, off', () => {
    const base = { code: 'X', active: true, validFrom: '2027-03-01T09:00', validUntil: '2027-03-10T00:00', maxRedemptions: 2, maxPerRider: null };
    expect(couponUnavailableReason(base, '2027-03-01T08:59', 0, 0)).toMatch(/starts working/);
    expect(couponUnavailableReason(base, '2027-03-01T09:00', 1, 0)).toBeNull();
    expect(couponUnavailableReason(base, '2027-03-10T00:00', 0, 0)).toMatch(/expired/);
    expect(couponUnavailableReason(base, '2027-03-02T00:00', 2, 0)).toMatch(/fully redeemed/);
    expect(couponUnavailableReason({ ...base, active: false }, '2027-03-02T00:00', 0, 0)).toMatch(/no longer available/);
    expect(couponUnavailableReason({ ...base, maxPerRider: 1 }, '2027-03-02T00:00', 1, 1)).toBe('X can be used once per rider, and this rider has already used it.');
    expect(couponUnavailableReason({ ...base, maxPerRider: 2 }, '2027-03-02T00:00', 1, 1)).toBeNull();
  });

  it('normalizes codes to upper case and rejects bad windows and percentages', () => {
    expect(couponInputSchema.parse({ kind: 'percent', code: ' spring-10 ', percent: 10, categoryIds: [], validFrom: null, validUntil: null, maxRedemptions: null, maxPerRider: null }).code).toBe('SPRING-10');
    expect(couponInputSchema.safeParse({ kind: 'fixed', code: 'ABC', amountCents: 500, categoryIds: [], validFrom: '2027-03-02T00:00', validUntil: '2027-03-01T00:00', maxRedemptions: null }).success).toBe(false);
    expect(couponInputSchema.safeParse({ kind: 'percent', code: 'ABC', percent: 120, categoryIds: [], validFrom: null, validUntil: null, maxRedemptions: null }).success).toBe(false);
  });
});

const RIDER = { firstName: 'Test', lastName: 'Rider', email: 'test.rider@example.test', team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Test Contact', phone: '555-555-0199' } };

type Order = { id: string; status: string; totalCents: number; couponCode: string | null; quote: { coupon?: { discountCents: number } | null }; entries: { discountCents: number; discountReason: string | null }[] };

async function setup() {
  let now = new Date('2027-03-01T18:00:00Z');
  const clock = { advance: (min: number) => (now = new Date(now.getTime() + min * 60_000)) };
  const url = await testDatabaseUrl();
  const { app } = await testApp({ databaseUrl: url, now: () => now, holdMinutes: 10 });
  const { eventId } = (await app.inject({ method: 'POST', url: '/api/demo' })).json() as { eventId: string };
  await app.inject({ method: 'POST', url: `/api/events/${eventId}/publish`, payload: { acknowledgeWarnings: true } });
  const event = (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json() as { config: EventConfig };
  const code = (c: string) => event.config.categories.find((x) => x.timingCode === c)!.id;
  const waiver = { version: event.config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Test Rider', signerRole: 'rider' };
  let n = 0;
  const order = (categoryIds: string[], couponCode: string | null, rider = RIDER) =>
    app.inject({
      method: 'POST',
      url: `/api/rider/events/${eventId}/orders`,
      payload: { clientRequestId: `cpn-${++n}-xxxxxxxx`, categoryIds, rider, waiver: { ...waiver, signatureName: `${rider.firstName} ${rider.lastName}` }, couponCode },
    });
  const pay = (orderId: string) => app.inject({ method: 'POST', url: `/api/orders/${orderId}/payment`, payload: { attemptId: `att-${Math.random().toString(36).slice(2)}`, outcome: 'success' } });
  const createCoupon = (body: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: `/api/events/${eventId}/coupons`, payload: { kind: 'percent', percent: 20, categoryIds: [], validFrom: null, validUntil: null, maxRedemptions: null, maxPerRider: null, ...body } });
  const check = (c: string) => app.inject({ method: 'POST', url: `/api/rider/events/${eventId}/coupons/check`, payload: { code: c } });
  const list = async () => (await app.inject({ method: 'GET', url: `/api/events/${eventId}/coupons` })).json() as { id: string; code: string; active: boolean; redemptions: { confirmed: number; reserved: number } }[];
  return { app, url, eventId, code, waiver, order, pay, createCoupon, check, list, clock };
}

describe('coupons API', () => {
  it('organizer creates codes; duplicates, unknown categories, and bad codes are refused', async () => {
    const s = await setup();
    const created = await s.createCoupon({ code: 'spring20' });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ code: 'SPRING20', kind: 'percent', percent: 20, active: true, redemptions: { confirmed: 0, reserved: 0 } });
    expect((await s.createCoupon({ code: 'SPRING20' })).statusCode).toBe(409);
    expect((await s.createCoupon({ code: 'OTHER', categoryIds: ['nope'] })).statusCode).toBe(422);
    expect((await s.createCoupon({ code: 'BAD CODE' })).statusCode).toBe(400);
  });

  it('riders check a code in any case; unknown, not-yet, and expired codes explain why', async () => {
    const s = await setup();
    await s.createCoupon({ code: 'NOW10', percent: 10 });
    await s.createCoupon({ code: 'LATER', validFrom: '2027-04-01T00:00' });
    await s.createCoupon({ code: 'PAST', validUntil: '2027-02-01T00:00' });
    const ok = await s.check('now10');
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ kind: 'percent', code: 'NOW10', percent: 10, categoryIds: [] });
    expect((await s.check('NOPE')).statusCode).toBe(404);
    expect((await s.check('LATER')).json().error).toMatch(/starts working/);
    expect((await s.check('PAST')).json().error).toMatch(/expired/);
  });

  it('checks a code against the published time zone, not an unpublished draft edit', async () => {
    const s = await setup(); // 2027-03-01 10:00 in Los Angeles, the published time zone
    await s.createCoupon({ code: 'NOON', validUntil: '2027-03-01T12:00' });
    const event = (await s.app.inject({ method: 'GET', url: `/api/events/${s.eventId}` })).json() as { config: EventConfig; revision: number };
    // A draft that moves the event to Kiritimati (already 2027-03-02 there) is not published.
    const config = { ...event.config, event: { ...event.config.event, timeZone: 'Pacific/Kiritimati' } };
    expect((await s.app.inject({ method: 'PUT', url: `/api/events/${s.eventId}/config`, payload: { revision: event.revision, config } })).statusCode).toBe(200);
    expect((await s.check('NOON')).statusCode).toBe(200);
    expect((await s.order([s.code('RR-M35-34')], 'NOON')).statusCode).toBe(201); // checkout agrees with the check
  });

  it('an order keeps the accepted discount; turning the code off later never reprices it; exports and ledger show it', async () => {
    const s = await setup();
    const coupon = (await s.createCoupon({ code: 'SAVE20' })).json() as { id: string };
    const held = await s.order([s.code('RR-M35-34')], 'save20');
    expect(held.statusCode).toBe(201);
    const o = held.json() as Order;
    expect(o.totalCents).toBe(4000);
    expect(o.couponCode).toBe('SAVE20');
    expect(o.entries[0]).toMatchObject({ discountCents: 1000, discountReason: 'Coupon SAVE20' });
    expect(((await s.pay(o.id)).json() as Order).status).toBe('confirmed');

    await s.app.inject({ method: 'POST', url: `/api/events/${s.eventId}/coupons/${coupon.id}/active`, payload: { active: false } });
    expect((await s.check('SAVE20')).json().error).toMatch(/no longer available/);
    const after = (await s.app.inject({ method: 'GET', url: `/api/orders/${o.id}` })).json() as Order;
    expect(after.totalCents).toBe(4000);
    expect(after.quote.coupon?.discountCents).toBe(1000);
    expect((await s.list())[0].redemptions).toEqual({ confirmed: 1, reserved: 0 });

    const [lh, ...lrows] = parseCsv((await s.app.inject({ method: 'GET', url: `/api/events/${s.eventId}/exports/ledger.csv` })).body);
    const lc = (n: string) => lh.indexOf(n);
    const discount = lrows.find((r) => r[lc('kind')] === 'discount')!;
    expect(discount[lc('description')]).toBe('Coupon SAVE20');
    expect(Number(discount[lc('amount')])).toBe(-10);
    const sum = lrows.filter((r) => ['entry', 'discount', 'fee'].includes(r[lc('kind')])).reduce((t, r) => t + Math.round(Number(r[lc('amount')]) * 100), 0);
    expect(sum).toBe(Math.round(Number(lrows.find((r) => r[lc('kind')] === 'order_total')![lc('amount')]) * 100));

    const [eh, row] = parseCsv((await s.app.inject({ method: 'GET', url: `/api/events/${s.eventId}/exports/entries.csv` })).body);
    expect(row[eh.indexOf('coupon_code')]).toBe('SAVE20');
    expect(row[eh.indexOf('discount')]).toBe('10');
    expect(row[eh.indexOf('discount_reason')]).toBe('Coupon SAVE20');
    expect(row[eh.indexOf('amount_paid')]).toBe('40');
  });

  it('an inapplicable code holds nothing and says why', async () => {
    const s = await setup();
    await s.createCoupon({ code: 'SAVE20' });
    const res = await s.order([s.code('RR-M35-34'), s.code('CR-M35-34')], 'SAVE20'); // the bundle already discounts both
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toMatch(/at most one discount.*Nothing was held/);
    expect((await s.list())[0].redemptions).toEqual({ confirmed: 0, reserved: 0 });
  });

  it('a hold reserves the last redemption; an expired or cancelled hold releases it', async () => {
    const s = await setup();
    await s.createCoupon({ code: 'ONE', maxRedemptions: 1 });
    const first = (await s.order([s.code('RR-M35-34')], 'ONE')).json() as Order;
    expect((await s.list())[0].redemptions).toEqual({ confirmed: 0, reserved: 1 });
    const blocked = await s.order([s.code('RR-D23')], 'ONE');
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error).toMatch(/fully redeemed.*remove the code.*Nothing was held/);
    expect((await s.check('ONE')).statusCode).toBe(409);

    s.clock.advance(11); // the first hold expires
    const second = (await s.order([s.code('RR-D23')], 'ONE')).json() as Order;
    expect(second.couponCode).toBe('ONE');
    await s.app.inject({ method: 'POST', url: `/api/orders/${second.id}/cancel` });
    expect((await s.list())[0].redemptions).toEqual({ confirmed: 0, reserved: 0 });

    // The first rider pays late while the code is free again: it confirms with the accepted discount.
    expect(((await s.pay(first.id)).json() as Order).status).toBe('confirmed');
    expect((await s.list())[0].redemptions).toEqual({ confirmed: 1, reserved: 0 });
  });

  it('a late payment does not confirm when another rider took the last redemption meanwhile', async () => {
    const s = await setup();
    await s.createCoupon({ code: 'ONE', maxRedemptions: 1 });
    const slow = (await s.order([s.code('RR-M35-34')], 'ONE')).json() as Order;
    s.clock.advance(11);
    const fast = (await s.order([s.code('RR-D23')], 'ONE')).json() as Order;
    expect(((await s.pay(fast.id)).json() as Order).status).toBe('confirmed');
    expect(((await s.pay(slow.id)).json() as Order).status).toBe('needs_attention');
    expect((await s.list())[0].redemptions).toEqual({ confirmed: 1, reserved: 0 });
  });

  it('a per-rider limit counts the same rider across orders, and two juniors from one family separately', async () => {
    const s = await setup();
    await s.createCoupon({ code: 'ONCE', maxPerRider: 1 });
    const first = (await s.order([s.code('RR-M35-34')], 'ONCE')).json() as Order;
    expect(first.couponCode).toBe('ONCE');
    // Same name and email in a second order: the same rider.
    const again = await s.order([s.code('RR-D23')], 'ONCE');
    expect(again.statusCode).toBe(409);
    expect(again.json().error).toMatch(/once per rider.*Nothing was held/);
    // Checking the code before details are entered cannot tell who the rider is, so it passes.
    expect((await s.check('ONCE')).statusCode).toBe(200);
    // A sibling on the same family email is a different rider.
    expect((await s.order([s.code('RR-D23')], 'ONCE', { ...RIDER, firstName: 'Sibling' })).statusCode).toBe(201);
    // Cancelling the first hold gives the rider their use back.
    await s.app.inject({ method: 'POST', url: `/api/orders/${first.id}/cancel` });
    expect((await s.order([s.code('RR-D23')], 'ONCE')).statusCode).toBe(201);
  });

  it('a late payment does not confirm when the same rider used up their limit meanwhile', async () => {
    const s = await setup();
    await s.createCoupon({ code: 'ONCE', maxPerRider: 1 });
    const slow = (await s.order([s.code('RR-M35-34')], 'ONCE')).json() as Order;
    s.clock.advance(11);
    const fast = (await s.order([s.code('RR-D23')], 'ONCE')).json() as Order;
    expect(((await s.pay(fast.id)).json() as Order).status).toBe('confirmed');
    expect(((await s.pay(slow.id)).json() as Order).status).toBe('needs_attention');
  });

  it('two riders racing for the last redemption on two connections: exactly one order gets it', async () => {
    const s = await setup();
    await s.createCoupon({ code: 'LAST', maxRedemptions: 1 });
    const { app: b } = await testApp({ databaseUrl: s.url, now: () => new Date('2027-03-01T18:00:00Z'), holdMinutes: 10 });
    const body = (clientRequestId: string, cat: string) => ({ clientRequestId, categoryIds: [s.code(cat)], rider: RIDER, waiver: s.waiver, couponCode: 'LAST' });
    const race = await Promise.all([
      s.app.inject({ method: 'POST', url: `/api/rider/events/${s.eventId}/orders`, payload: body('race-a-12345678', 'RR-M35-34') }),
      b.inject({ method: 'POST', url: `/api/rider/events/${s.eventId}/orders`, payload: body('race-b-12345678', 'RR-D23') }),
    ]);
    expect(race.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    expect((await s.list())[0].redemptions).toEqual({ confirmed: 0, reserved: 1 });
  });
});
