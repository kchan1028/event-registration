import Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';
import { stripePayments } from '../src/server/payments';
import { refundableCents, refundCanMove } from '../src/shared/refunds';
import { can } from '../src/shared/roles';
import type { EventConfig } from '../src/shared/schema';
import { as } from './support/auth';
import { testApp, testDatabaseUrl } from './support/db';

/* Refunds (product.md "Money and reporting"; ADR 0002). Stripe calls are stubbed; webhooks are signed locally. */

const WEBHOOK_SECRET = 'whsec_test_fictional_secret';
const RIDER = { firstName: 'Test', lastName: 'Rider', email: 'test.rider@example.test', team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Test Contact', phone: '555-555-0199' } };

type Order = { id: string; status: string; totalCents: number; entries: { id: string; status: string }[]; refunds: { id: string; entryId: string | null; amountCents: number; status: string }[] };
type RefundList = { payments: { ref: string | null; kind: string; remainingCents: number }[]; refunds: { id: string; status: string; failureReason: string | null }[] };

async function setup(opts: { stripe?: boolean } = {}) {
  const now = new Date('2027-03-01T18:00:00Z');
  const client = new Stripe('sk_test_fictional', { maxNetworkRetries: 0 });
  vi.spyOn(client.checkout.sessions, 'create').mockImplementation((async (p: Stripe.Checkout.SessionCreateParams) => ({ id: 'cs_test_1', url: 'https://checkout.stripe.test/pay/1', expires_at: p.expires_at! }) as Stripe.Checkout.Session) as never);
  let n = 0;
  const refundCall = vi.spyOn(client.refunds, 'create').mockImplementation((async () => ({ id: `re_test_${++n}`, status: 'pending', failure_reason: null }) as unknown as Stripe.Refund) as never);
  const payments = opts.stripe ? stripePayments({ secretKey: 'sk_test_fictional', webhookSecret: WEBHOOK_SECRET, client, now: () => now }) : undefined;
  const { app } = await testApp({ databaseUrl: await testDatabaseUrl(), now: () => now, payments, appUrl: 'http://app.test' });
  const { eventId } = (await app.inject({ method: 'POST', url: '/api/demo' })).json() as { eventId: string };
  await app.inject({ method: 'POST', url: `/api/events/${eventId}/publish`, payload: { acknowledgeWarnings: true } });
  const event = (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json() as { config: EventConfig };
  const code = (c: string) => event.config.categories.find((x) => x.timingCode === c)!.id;
  const waiver = { version: event.config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Test Rider', signerRole: 'rider' };
  const order = async (codes: string[]) =>
    (await app.inject({ method: 'POST', url: `/api/public/events/${eventId}/orders`, payload: { clientRequestId: `req-${codes.join('-')}-xxxxxxxx`, categoryIds: codes.map(code), rider: RIDER, waiver } })).json() as Order;
  const webhook = (id: string, type: string, object: Record<string, unknown>) => {
    const payload = JSON.stringify({ id, object: 'event', type, livemode: false, data: { object } });
    const header = client.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    return app.inject({ method: 'POST', url: '/api/payments/stripe/webhook', headers: { 'content-type': 'application/json', 'stripe-signature': header }, payload });
  };
  const payStripe = async (o: Order) => {
    await app.inject({ method: 'POST', url: `/api/orders/${o.id}/checkout-session` });
    return webhook(`evt_paid_${o.id}`, 'checkout.session.completed', { object: 'checkout.session', id: 'cs_test_1', amount_total: o.totalCents, currency: 'usd', payment_status: 'paid', payment_intent: 'pi_test_1', metadata: { order_id: o.id } });
  };
  const paySimulated = (id: string) => app.inject({ method: 'POST', url: `/api/orders/${id}/payment`, payload: { attemptId: `att-${id}-ok`, outcome: 'success' } });
  const refund = (orderId: string, body: Record<string, unknown>, headers: Record<string, string> = {}) => app.inject({ method: 'POST', url: `/api/orders/${orderId}/refunds`, payload: body, headers });
  const list = async (orderId: string) => (await app.inject({ method: 'GET', url: `/api/orders/${orderId}/refunds` })).json() as RefundList;
  return { app, order, payStripe, paySimulated, refund, list, refundCall, webhook };
}

describe('refund rules (shared)', () => {
  it('never undoes a final status, but a success can still fail', () => {
    expect(refundCanMove('pending', 'succeeded')).toBe(true);
    expect(refundCanMove('succeeded', 'pending')).toBe(false);
    expect(refundCanMove('succeeded', 'failed')).toBe(true);
  });
  it('only active refunds hold money against the cap', () => {
    expect(refundableCents(5000, [{ amountCents: 1000, status: 'succeeded' }, { amountCents: 500, status: 'requested' }, { amountCents: 2000, status: 'failed' }])).toBe(3500);
  });
  it('owners and finance may refund; registration managers may not', () => {
    expect(can(['finance'], 'payments.refund')).toBe(true);
    expect(can(['registration_manager'], 'payments.refund')).toBe(false);
  });
});

describe('refunds', () => {
  it('simulated: refunds part of an entry, keeps the entry, and caps at the entry price', async () => {
    const { order, paySimulated, refund } = await setup();
    const o = await order(['RR-M35-34']);
    await paySimulated(o.id);
    const res = await refund(o.id, { entryId: o.entries[0].id, amountCents: 2000, reason: 'Withdrew before the deadline' });
    expect(res.statusCode).toBe(200);
    const after = res.json() as Order;
    expect(after.refunds[0]).toMatchObject({ amountCents: 2000, status: 'succeeded' });
    expect(after.entries[0].status).toBe('confirmed');
    expect((await refund(o.id, { entryId: o.entries[0].id, amountCents: 3001, reason: 'Too much' })).statusCode).toBe(409);
  });

  it('refuses unpaid orders and people outside the organization', async () => {
    const { order, paySimulated, refund } = await setup();
    const held = await order(['RR-M35-34']);
    expect((await refund(held.id, { amountCents: 100, reason: 'Nothing paid' })).statusCode).toBe(409);
    const paid = await order(['CR-M35-34']);
    await paySimulated(paid.id);
    expect((await refund(paid.id, { amountCents: 100, reason: 'Not mine' }, as('stranger@example.test'))).statusCode).toBeGreaterThanOrEqual(403);
  });

  it('Stripe: sends with the refund ID as idempotency key and follows refund events', async () => {
    const { order, payStripe, refund, refundCall, webhook } = await setup({ stripe: true });
    const o = await order(['RR-M35-34']);
    await payStripe(o);
    const r = ((await refund(o.id, { amountCents: 2500, reason: 'Half refund' })).json() as Order).refunds[0];
    expect(r.status).toBe('pending');
    expect((refundCall.mock.calls[0][1] as Stripe.RequestOptions).idempotencyKey).toBe(`refund-${r.id}`);
    const ok = await webhook('evt_re_ok', 'refund.updated', { object: 'refund', id: 're_test_1', amount: 2500, currency: 'usd', status: 'succeeded', metadata: { refund_id: r.id } });
    expect(ok.json()).toMatchObject({ result: 'refund_succeeded' });
    const late = await webhook('evt_re_late', 'refund.created', { object: 'refund', id: 're_test_1', amount: 2500, currency: 'usd', status: 'pending', metadata: { refund_id: r.id } });
    expect(late.json()).toMatchObject({ result: 'refund_succeeded' });
  });

  it('Stripe: a timeout keeps the refund requested and reserved; retry reuses the key', async () => {
    const { app, order, payStripe, refund, refundCall, list } = await setup({ stripe: true });
    const o = await order(['RR-M35-34']);
    await payStripe(o);
    refundCall.mockRejectedValueOnce(new Error('Request timed out'));
    expect((await refund(o.id, { amountCents: 5000, reason: 'Full refund' })).statusCode).toBe(502);
    const l = await list(o.id);
    expect(l.refunds[0]).toMatchObject({ status: 'requested', failureReason: 'Request timed out' });
    expect((await refund(o.id, { amountCents: 1, reason: 'Again' })).statusCode).toBe(409);
    expect((await app.inject({ method: 'POST', url: `/api/refunds/${l.refunds[0].id}/retry` })).statusCode).toBe(200);
    expect(refundCall.mock.calls.map((c) => (c[1] as Stripe.RequestOptions).idempotencyKey)).toEqual([`refund-${l.refunds[0].id}`, `refund-${l.refunds[0].id}`]);
  });
});
