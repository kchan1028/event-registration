import Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';
import { openDb } from '../src/server/db';
import { refundNoticeText, type EmailSender } from '../src/server/email';
import { stripePayments } from '../src/server/payments';
import { formatDollars } from '../src/shared/format';
import { formatOrderNumber } from '../src/shared/lookup';
import { refundableCents, refundCanMove } from '../src/shared/refunds';
import { can } from '../src/shared/roles';
import { REFUND_TEMPLATES } from '../src/shared/refundPolicy';
import type { EventConfig } from '../src/shared/schema';
import { as, DEFAULT_TEST_ORGANIZER } from './support/auth';
import { testApp, testDatabaseUrl } from './support/db';
import { publishReviewed } from './support/publish';

/* Refunds (product.md "Money and reporting"; ADR 0002). Stripe calls are stubbed; webhooks are signed locally. */

const WEBHOOK_SECRET = 'whsec_test_fictional_secret';
const RIDER = { firstName: 'Test', lastName: 'Rider', email: 'test.rider@example.test', team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Test Contact', phone: '555-555-0199' } };

type Order = { id: string; status: string; totalCents: number; entries: { id: string; status: string }[]; refunds: { id: string; entryId: string | null; amountCents: number; status: string }[] };
type RefundList = { payments: { ref: string | null; kind: string; remainingCents: number }[]; refunds: { id: string; status: string; failureReason: string | null }[] };

async function setup(opts: { stripe?: boolean; email?: EmailSender } = {}) {
  const now = new Date('2027-03-01T18:00:00Z');
  const client = new Stripe('sk_test_fictional', { maxNetworkRetries: 0 });
  vi.spyOn(client.checkout.sessions, 'create').mockImplementation((async (p: Stripe.Checkout.SessionCreateParams) => ({ id: 'cs_test_1', url: 'https://checkout.stripe.test/pay/1', expires_at: p.expires_at! }) as Stripe.Checkout.Session) as never);
  let n = 0;
  const refundCall = vi.spyOn(client.refunds, 'create').mockImplementation((async () => ({ id: `re_test_${++n}`, status: 'pending', failure_reason: null }) as unknown as Stripe.Refund) as never);
  const payments = opts.stripe ? stripePayments({ secretKey: 'sk_test_fictional', webhookSecret: WEBHOOK_SECRET, client }) : undefined;
  const databaseUrl = await testDatabaseUrl();
  const { app } = await testApp({ databaseUrl, now: () => now, payments, email: opts.email, appUrl: 'http://app.test' });
  const { eventId } = (await app.inject({ method: 'POST', url: '/api/demo' })).json() as { eventId: string };
  await publishReviewed(app, `/api/events/${eventId}`, { acknowledgeWarnings: true });
  const event = (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json() as { config: EventConfig; organizationId: string };
  const code = (c: string) => event.config.categories.find((x) => x.timingCode === c)!.id;
  const waiver = { version: event.config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Test Rider', signerRole: 'rider' };
  const order = async (codes: string[]) =>
    (await app.inject({ method: 'POST', url: `/api/rider/events/${eventId}/orders`, payload: { clientRequestId: `req-${codes.join('-')}-xxxxxxxx`, categoryIds: codes.map(code), rider: RIDER, waiver } })).json() as Order;
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
  const refund = (orderId: string, body: Record<string, unknown>, headers: Record<string, string> = {}) => app.inject({ method: 'POST', url: `/api/orders/${orderId}/refunds`, payload: { clientRequestId: crypto.randomUUID(), ...body }, headers });
  const list = async (orderId: string) => (await app.inject({ method: 'GET', url: `/api/orders/${orderId}/refunds` })).json() as RefundList;
  return { app, order, payStripe, paySimulated, refund, list, refundCall, webhook, now, eventId, organizationId: event.organizationId, databaseUrl };
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

describe('whole-order policy preview', () => {
  it('uses the paid bundle allocation and frozen policy without changing entries, evidence or money', async () => {
    const s = await setup();
    const o = await s.order(['RR-M35-34', 'CR-M35-34']);
    await s.paySimulated(o.id);
    const get = async () => (await s.app.inject({ method: 'GET', url: `/api/orders/${o.id}` })).json();
    const before = await get();
    const event = (await s.app.inject({ method: 'GET', url: `/api/events/${before.eventId}` })).json();
    event.config.registration.refundRules = REFUND_TEMPLATES.credit_only.rules;
    expect((await s.app.inject({ method: 'PUT', url: `/api/events/${before.eventId}/config`, payload: { revision: event.revision, config: event.config } })).statusCode).toBe(200);
    expect((await publishReviewed(s.app, `/api/events/${before.eventId}`, { acknowledgeWarnings: true })).statusCode).toBe(200);
    for (const reason of ['withdrawal', 'organizer_cancellation']) {
      const res = await s.app.inject({ method: 'GET', url: `/api/orders/${o.id}/refund-policy-preview?reason=${reason}` });
      expect(res.statusCode).toBe(200);
      const p = res.json();
      expect(p).toMatchObject({ publishedVersion: before.publishedVersion, scope: 'whole_order', reason, entitlement: { returnAs: 'cash', percent: 100 }, reviewReasons: [] });
      expect(p.entryCents).toBe(before.quote.entriesTotalCents);
      expect(p.suggestedCashCents).toBe(before.quote.entriesTotalCents);
      expect(p.excludedFeesCents).toBe(before.totalCents - before.quote.entriesTotalCents);
    }
    expect(await get()).toEqual(before);
    expect((await s.list(o.id)).refunds).toEqual([]);
    expect(s.refundCall).not.toHaveBeenCalled();
  });

  it('requires reconciliation for an unpaid order or an existing refund', async () => {
    const s = await setup(); const o = await s.order(['RR-M35-34']);
    const preview = async () => (await s.app.inject({ method: 'GET', url: `/api/orders/${o.id}/refund-policy-preview?reason=withdrawal` })).json();
    expect((await preview()).suggestedCashCents).toBeNull();
    await s.paySimulated(o.id);
    expect((await preview()).suggestedCashCents).toBeGreaterThan(0);
    expect((await s.refund(o.id, { amountCents: 100, reason: 'Fictional partial refund' })).statusCode).toBe(200);
    expect(await preview()).toMatchObject({ suggestedCashCents: null, reviewReasons: expect.arrayContaining([expect.stringContaining('Existing refunds')]) });
  });

  it('requires review after one entry is withdrawn even though the paid order stays confirmed', async () => {
    const s = await setup(); const o = await s.order(['RR-M35-34', 'CR-M35-34']); await s.paySimulated(o.id);
    const withdrawn = await s.app.inject({ method: 'POST', url: `/api/order-entries/${o.entries[0].id}/withdraw`, payload: { reason: 'Fictional earlier withdrawal' } });
    expect(withdrawn.statusCode).toBe(200);
    const before = (await s.app.inject({ method: 'GET', url: `/api/orders/${o.id}` })).json();
    expect(before.status).toBe('confirmed');
    expect(before.entries.map((e: { status: string }) => e.status).sort()).toEqual(['confirmed', 'withdrawn']);
    for (const reason of ['withdrawal', 'organizer_cancellation']) {
      const res = await s.app.inject({ method: 'GET', url: `/api/orders/${o.id}/refund-policy-preview?reason=${reason}` });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ suggestedCashCents: null, reviewReasons: expect.arrayContaining([expect.stringContaining('inactive entries')]) });
    }
    expect((await s.app.inject({ method: 'GET', url: `/api/orders/${o.id}` })).json()).toEqual(before);
    expect((await s.list(o.id)).refunds).toEqual([]);
  });

  it.each(['credit', 'rider_choice', null] as const)('does not suggest cash for cancellation policy %s', async (mode) => {
    const s = await setup();
    const eventId = s.eventId;
    const event = (await s.app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json();
    event.config.registration.refundRules = mode === null ? null : { ...REFUND_TEMPLATES.tiered.rules, organizerCancellation: mode };
    expect((await s.app.inject({ method: 'PUT', url: `/api/events/${eventId}/config`, payload: { revision: event.revision, config: event.config } })).statusCode).toBe(200);
    await publishReviewed(s.app, `/api/events/${eventId}`, { acknowledgeWarnings: true });
    const o = await s.order(['RR-M35-34']); await s.paySimulated(o.id);
    const res = await s.app.inject({ method: 'GET', url: `/api/orders/${o.id}/refund-policy-preview?reason=organizer_cancellation` });
    expect(res.statusCode).toBe(200);
    expect(res.json().suggestedCashCents).toBeNull();
    expect(res.json().entitlement?.returnAs ?? null).toBe(mode);
    expect(res.json().reviewReasons).not.toEqual([]);
  });

  it('uses the accepted event time zone for the inclusive deadline', async () => {
    const s = await setup(); const o = await s.order(['RR-M35-34']); await s.paySimulated(o.id);
    const before = (await s.app.inject({ method: 'GET', url: `/api/orders/${o.id}` })).json();
    const event = (await s.app.inject({ method: 'GET', url: `/api/events/${before.eventId}` })).json();
    expect(event.config.event.timeZone).toBe('America/Los_Angeles');
    const firstDay = event.config.days.map((d: { date: string }) => d.date).sort()[0];
    const deadline = new Date(`${firstDay}T00:00:00Z`); deadline.setUTCDate(deadline.getUTCDate() - event.config.registration.refundRules.tiers[0].daysBefore);
    // The UTC date has advanced, but the accepted event is still on its deadline until 07:00Z (PDT).
    deadline.setUTCDate(deadline.getUTCDate() + 1); deadline.setUTCHours(6, 59, 59);
    s.now.setTime(deadline.getTime());
    const preview = async () => (await s.app.inject({ method: 'GET', url: `/api/orders/${o.id}/refund-policy-preview?reason=withdrawal` })).json();
    expect((await preview()).entitlement.percent).toBe(100);
    s.now.setTime(deadline.getTime() + 1000);
    expect((await preview()).entitlement.percent).toBe(0);
  });

  it('permits finance but denies other roles and another household; requires explicit scenario', async () => {
    const s = await setup(); const o = await s.order(['RR-M35-34']); await s.paySimulated(o.id);
    for (const [email, role, status] of [['finance@preview.test', 'finance', 200], ['manager@preview.test', 'registration_manager', 403]] as const) {
      await s.app.inject({ method: 'POST', url: `/api/organizations/${s.organizationId}/members`, payload: { email, role } });
      const res = await s.app.inject({ method: 'GET', url: `/api/orders/${o.id}/refund-policy-preview?reason=withdrawal`, headers: as(email) });
      expect(res.statusCode).toBe(status);
    }
    expect((await s.app.inject({ method: 'GET', url: `/api/orders/${o.id}/refund-policy-preview?reason=withdrawal`, headers: as('outsider@preview.test') })).statusCode).toBe(404);
    expect((await s.app.inject({ method: 'GET', url: `/api/orders/${o.id}/refund-policy-preview` })).statusCode).toBe(400);
    expect((await s.app.inject({ method: 'GET', url: `/api/orders/${o.id}/refund-policy-preview?reason=withdrawal`, headers: { authorization: 'Bearer invalid' } })).statusCode).toBe(401);
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

  it.each(['pending', 'requested'] as const)('reconciles a signed Stripe failure for a %s refund and recovers the original request', async (status) => {
    const { order, payStripe, refund, refundCall, webhook, list } = await setup({ stripe: true });
    const o = await order(['RR-M35-34']);
    expect((await payStripe(o)).statusCode).toBe(200);
    const body = { clientRequestId: 'signed-refund-failure', amountCents: 100, reason: 'Fictional refund failure' };
    // A lost provider response leaves no Stripe refund ID locally. The notification then matches by metadata.
    if (status === 'requested') refundCall.mockRejectedValueOnce(new Error('Fictional provider timeout'));
    const initial = await refund(o.id, body);
    expect(initial.statusCode).toBe(status === 'requested' ? 502 : 200);
    const before = await list(o.id);
    expect(before.refunds).toEqual([expect.objectContaining({ status })]);
    expect(before.payments).toEqual([expect.objectContaining({ remainingCents: o.totalCents - body.amountCents })]);
    const [{ id }] = before.refunds;

    const failure = {
      object: 'refund',
      id: 're_test_1',
      amount: body.amountCents,
      currency: 'usd',
      status: 'failed',
      failure_reason: 'expired_or_canceled_card',
      payment_intent: 'pi_test_1',
      metadata: { order_id: o.id, refund_id: id },
    };
    const sendFailure = () => webhook('evt_signed_refund_failed', 'refund.failed', failure);
    const first = await sendFailure();
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ result: 'refund_failed', duplicate: false });
    const repeated = await sendFailure();
    expect(repeated.statusCode).toBe(200);
    expect(repeated.json()).toEqual({ result: 'refund_failed', duplicate: true });

    const replay = await refund(o.id, body);
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toMatchObject({
      refundId: id, status: 'confirmed', totalCents: o.totalCents,
      entries: [{ id: o.entries[0].id, status: 'confirmed' }],
      refunds: [{ id, status: 'failed' }],
    });
    const saved = await list(o.id);
    expect(saved.refunds).toEqual([expect.objectContaining({ id, status: 'failed', failureReason: failure.failure_reason })]);
    expect(saved.payments).toEqual([expect.objectContaining({ remainingCents: o.totalCents, refundedCents: 0 })]);
    expect(refundCall).toHaveBeenCalledTimes(1);
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

  it('records one notice when a refund succeeds and none before Stripe confirms it', async () => {
    const sender: EmailSender = { mode: 'resend', from: 'sender@example.test', async send() { return 're_unused'; } };
    const simulated = await setup({ email: sender });
    const db = openDb(simulated.databaseUrl);
    try {
      const o = await simulated.order(['RR-M35-34']);
      await simulated.paySimulated(o.id);
      const body = { clientRequestId: 'refund-notice-once', entryId: o.entries[0].id, amountCents: 2000, reason: 'Withdrew before the deadline' };
      expect((await simulated.refund(o.id, body)).statusCode).toBe(200);
      const notice = await db.get<{ status: string; from_email: string | null; subject: string; body_text: string; order_id: string | null; to_email: string }>(
        `SELECT status, from_email, subject, body_text, order_id, to_email FROM email_messages WHERE kind = 'refund_notice'`,
      );
      expect(notice).toEqual({
        status: 'recorded',
        from_email: 'sender@example.test',
        subject: 'Your refund',
        body_text: refundNoticeText(formatOrderNumber(o.id, true), formatDollars(2000), true),
        order_id: null,
        to_email: DEFAULT_TEST_ORGANIZER,
      });
      expect(notice!.body_text).not.toContain('Withdrew');
      expect((await simulated.refund(o.id, body)).statusCode).toBe(200);
      expect(await db.all(`SELECT refund_id FROM email_messages WHERE kind = 'refund_notice'`)).toHaveLength(1);

      const stripe = await setup({ stripe: true });
      const stripeDb = openDb(stripe.databaseUrl);
      try {
        const paid = await stripe.order(['RR-M35-34']);
        await stripe.payStripe(paid);
        const requested = await stripe.refund(paid.id, { amountCents: 2500, reason: 'Half refund' });
        expect(requested.statusCode).toBe(200);
        const refundId = ((await stripe.list(paid.id)).refunds[0]).id;
        expect(await stripeDb.all(`SELECT id FROM email_messages WHERE kind = 'refund_notice'`)).toEqual([]);
        const ok = await stripe.webhook('evt_refund_notice', 'refund.updated', { object: 'refund', id: 're_test_1', amount: 2500, currency: 'usd', status: 'succeeded', metadata: { refund_id: refundId } });
        expect(ok.json()).toMatchObject({ result: 'refund_succeeded' });
        expect(await stripeDb.get<{ body_text: string; from_email: string | null }>(
          `SELECT body_text, from_email FROM email_messages WHERE kind = 'refund_notice' AND refund_id = $1`,
          [refundId],
        )).toEqual({
          body_text: refundNoticeText(formatOrderNumber(paid.id, true), formatDollars(2500), true),
          from_email: null,
        });
        await stripe.webhook('evt_refund_notice_again', 'refund.updated', { object: 'refund', id: 're_test_1', amount: 2500, currency: 'usd', status: 'succeeded', metadata: { refund_id: refundId } });
        expect(await stripeDb.all(`SELECT id FROM email_messages WHERE kind = 'refund_notice'`)).toHaveLength(1);
        stripe.refundCall.mockRejectedValueOnce(Object.assign(new Error('Fictional refusal'), { statusCode: 400 }));
        expect((await stripe.refund(paid.id, { amountCents: 100, reason: 'Refused refund' })).statusCode).toBe(409);
        expect(await stripeDb.all(`SELECT id FROM email_messages WHERE kind = 'refund_notice'`)).toHaveLength(1);
      } finally {
        await stripeDb.close();
      }
    } finally {
      await db.close();
    }
  });
});


describe('refund request recovery', () => {
  it('requires a request key, replays a lost response, and rejects changed payloads without another refund', async () => {
    const { app, order, paySimulated, refund, list } = await setup();
    const o = await order(['RR-M35-34']); await paySimulated(o.id);
    expect((await app.inject({ method: 'POST', url: `/api/orders/${o.id}/refunds`, payload: { amountCents: 100, reason: 'Missing request key' } })).statusCode).toBe(400);
    const body = { clientRequestId: 'refund-lost-response', amountCents: 100, entryId: o.entries[0].id, reason: 'Fictional partial refund' };
    expect((await refund(o.id, body)).statusCode).toBe(200); // response deliberately discarded
    const replay = await refund(o.id, body);
    expect(replay.statusCode).toBe(200);
    expect(replay.json().refunds).toHaveLength(1);
    for (const change of [{ amountCents: 101 }, { reason: 'Different reason' }, { entryId: null }, { paymentRef: 'other-payment' }])
      expect((await refund(o.id, { ...body, ...change })).statusCode).toBe(409);
    expect((await list(o.id)).refunds).toHaveLength(1);
    expect((await refund(o.id, { ...body, clientRequestId: 'refund-legitimate-second' })).statusCode).toBe(200);
    expect((await list(o.id)).refunds).toHaveLength(2);
    expect((await refund(o.id, body, as('stranger@example.test'))).statusCode).toBe(404);
  });

  it('serializes simultaneous creation of the same request across pooled transactions', async () => {
    const { app, order, paySimulated, list } = await setup();
    const o = await order(['RR-M35-34']); await paySimulated(o.id);
    // Same app has separate pooled transactions; both requests compete for the order lock.
    const payload = { clientRequestId: 'refund-concurrent-create', amountCents: 100, reason: 'Fictional concurrent refund' };
    const results = await Promise.all([1,2].map(() => app.inject({ method: 'POST', url: `/api/orders/${o.id}/refunds`, payload })));
    expect(results.map((r) => r.statusCode)).toEqual([200,200]);
    expect((await list(o.id)).refunds).toHaveLength(1);
  });

  it('replays a partial Stripe request after an uncertain result using the original provider key', async () => {
    const { order, payStripe, refund, refundCall, list } = await setup({ stripe: true });
    const o = await order(['RR-M35-34']); await payStripe(o);
    const body = { clientRequestId: 'refund-provider-uncertain', amountCents: 100, reason: 'Fictional timeout recovery' };
    refundCall.mockRejectedValueOnce(new Error('Request timed out'));
    expect((await refund(o.id, body)).statusCode).toBe(502);
    expect((await refund(o.id, body)).statusCode).toBe(200);
    expect((await refund(o.id, body)).statusCode).toBe(200);
    const saved = await list(o.id);
    expect(saved.refunds).toHaveLength(1);
    expect(refundCall).toHaveBeenCalledTimes(2);
    expect(refundCall.mock.calls.map((c) => (c[1] as Stripe.RequestOptions).idempotencyKey)).toEqual([`refund-${saved.refunds[0].id}`, `refund-${saved.refunds[0].id}`]);
  });
});


it('stops unresolved Stripe retries before key retention expires, preserving the reserve and late webhook recovery', async () => {
  const { app, order, payStripe, refund, list, refundCall, webhook, now } = await setup({ stripe: true });
  const o = await order(['RR-M35-34']); await payStripe(o);
  const body = { clientRequestId: 'refund-old-uncertain', amountCents: 100, reason: 'Fictional old uncertain refund' };
  refundCall.mockRejectedValue(new Error('Unknown provider response'));
  expect((await refund(o.id, body)).statusCode).toBe(502);
  now.setTime(now.getTime() + (23 * 60 - 1) * 60_000);
  expect((await refund(o.id, body)).statusCode).toBe(502);
  now.setTime(now.getTime() + 60_000);
  const id = (await list(o.id)).refunds[0].id;
  expect((await refund(o.id, body)).statusCode).toBe(409);
  expect((await app.inject({ method: 'POST', url: `/api/refunds/${id}/retry` })).statusCode).toBe(409);
  expect(refundCall).toHaveBeenCalledTimes(2);
  expect((await list(o.id)).refunds).toMatchObject([{ id, status: 'requested', failureReason: expect.stringContaining('reconcile') }]);
  const result = await webhook('evt_old_refund_recovery', 'refund.updated', { object: 'refund', id: 're_old_recovered', amount: 100, currency: 'usd', status: 'succeeded', metadata: { refund_id: id } });
  expect(result.json()).toMatchObject({ result: 'refund_succeeded' });
  expect((await list(o.id)).refunds).toMatchObject([{ id, status: 'succeeded' }]);
});


it('allows a different finance actor to replay without changing the original requester, and denies registration managers', async () => {
  const s = await setup(); const o = await s.order(['RR-M35-34']); await s.paySimulated(o.id);
  const body = { clientRequestId: 'refund-authorized-replay', amountCents: 100, reason: 'Fictional original finance request' };
  expect((await s.refund(o.id,body)).statusCode).toBe(200);
  for (const [email,role] of [['finance@refund.test','finance'],['manager@refund.test','registration_manager']]) {
    expect((await s.app.inject({ method: 'POST',url: `/api/organizations/${s.organizationId}/members`,payload: { email,role } })).statusCode).toBe(200);
    expect((await s.app.inject({ method: 'GET',url: '/api/me',headers: as(email) })).statusCode).toBe(200);
  }
  expect((await s.refund(o.id,body,as('finance@refund.test'))).statusCode).toBe(200);
  expect((await s.refund(o.id,body,as('manager@refund.test'))).statusCode).toBe(403);
  const saved = (await s.app.inject({ method: 'GET',url: `/api/orders/${o.id}/refunds`,headers: as('finance@refund.test') })).json();
  expect(saved.refunds).toHaveLength(1);
  expect(saved.refunds[0]).toMatchObject({ amountCents: 100,requestedBy: DEFAULT_TEST_ORGANIZER });
});


it('identifies the saved failed refund on a replay without calling the provider again', async () => {
  const s = await setup({ stripe: true }); const o = await s.order(['RR-M35-34']); await s.payStripe(o);
  const body = { clientRequestId: 'refund-refused-response-lost',amountCents: 100,reason: 'Fictional provider refusal' };
  s.refundCall.mockRejectedValueOnce(Object.assign(new Error('Fictional refusal'),{ statusCode: 400 }));
  expect((await s.refund(o.id,body)).statusCode).toBe(409);
  const replay = await s.refund(o.id,body);
  expect(replay.statusCode).toBe(200);
  const result = replay.json();
  expect(result.refunds).toMatchObject([{ id: result.refundId,status: 'failed',amountCents: 100 }]);
  expect(s.refundCall).toHaveBeenCalledTimes(1);
});
