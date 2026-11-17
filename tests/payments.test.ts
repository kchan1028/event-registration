import Stripe from 'stripe';
import pg from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { paymentsFromEnv, publicAppUrl, stripePayments } from '../src/server/payments';
import { testApp, testDatabaseUrl } from './support/db';
import { as, fakeAuth } from './support/auth';
import type { EventConfig } from '../src/shared/schema';

/*
 * Stripe hosted Checkout in test mode (ADR 0002, Phase 2). No network: the Stripe client's
 * session call or HTTP transport is stubbed, and webhooks are signed locally with the SDK's test-header helper,
 * so signature verification runs exactly as it would for a real Stripe notification.
 */

const WEBHOOK_SECRET = 'whsec_test_fictional_secret';
const RIDER = { firstName: 'Test', lastName: 'Rider', email: 'test.rider@example.test', team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Test Contact', phone: '555-555-0199' } };

type Order = { id: string; status: string; totalCents: number; paidWith: string | null; entries: { status: string }[] };

async function setup(opts: { holdMinutes?: number; client?: Stripe } = {}) {
  let now = new Date('2027-03-01T18:00:00Z');
  const clock = { advance: (min: number) => (now = new Date(now.getTime() + min * 60_000)) };
  const client = opts.client ?? new Stripe('sk_test_fictional', { maxNetworkRetries: 0 });
  let n = 0;
  const create = vi.spyOn(client.checkout.sessions, 'create');
  if (!opts.client) create.mockImplementation((async (params: Stripe.Checkout.SessionCreateParams) => {
    n++;
    return { id: `cs_test_${n}`, url: `https://checkout.stripe.test/pay/${n}`, expires_at: params.expires_at!, amount_total: params.line_items![0].price_data!.unit_amount! } as Stripe.Checkout.Session;
  }) as never);
  vi.spyOn(client.refunds, 'create').mockImplementation((async () => ({ id: 're_test_1', status: 'pending', failure_reason: null }) as unknown as Stripe.Refund) as never);
  const payments = stripePayments({ secretKey: 'sk_test_fictional', webhookSecret: WEBHOOK_SECRET, client });
  const databaseUrl = await testDatabaseUrl();
  const { app } = await testApp({ databaseUrl, now: () => now, holdMinutes: opts.holdMinutes ?? 10, payments, appUrl: 'http://app.test' });
  const { eventId } = (await app.inject({ method: 'POST', url: '/api/demo' })).json() as { eventId: string };
  await app.inject({ method: 'POST', url: `/api/events/${eventId}/publish`, payload: { acknowledgeWarnings: true } });
  const event = (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json() as { config: EventConfig };
  const code = (c: string) => event.config.categories.find((x) => x.timingCode === c)!.id;
  const waiver = { version: event.config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Test Rider', signerRole: 'rider' };
  let r = 0;
  const order = async (codes: string[]) =>
    (await app.inject({ method: 'POST', url: `/api/rider/events/${eventId}/orders`, payload: { clientRequestId: `req-${++r}-xxxxxxxx`, categoryIds: codes.map(code), rider: RIDER, waiver } })).json() as Order;
  const checkout = (orderId: string, headers: Record<string, string> = {}) => app.inject({ method: 'POST', url: `/api/orders/${orderId}/checkout-session`, headers });
  const get = async (orderId: string) => (await app.inject({ method: 'GET', url: `/api/orders/${orderId}` })).json() as Order;

  /** Sends a Stripe-signed checkout.session.* event. */
  const webhook = (id: string, type: string, session: Record<string, unknown>, secret = WEBHOOK_SECRET) => {
    const payload = JSON.stringify({ id, object: 'event', type, livemode: false, data: { object: { object: 'checkout.session', currency: 'usd', payment_status: 'paid', payment_intent: 'pi_test_1', ...session } } });
    const header = client.webhooks.generateTestHeaderString({ payload, secret });
    return app.inject({ method: 'POST', url: '/api/payments/stripe/webhook', headers: { 'content-type': 'application/json; charset=utf-8', 'stripe-signature': header }, payload });
  };
  /** A paid session event for an order, as Stripe would send it. */
  const paidSession = (o: Order, sessionId = 'cs_test_1', extra: Record<string, unknown> = {}) => ({ id: sessionId, amount_total: o.totalCents, metadata: { order_id: o.id }, client_reference_id: o.id, ...extra });
  const attempts = async (orderId: string) => {
    const c = new pg.Client({ connectionString: databaseUrl });
    await c.connect();
    try {
      return (await c.query(`SELECT provider, provider_ref, amount_cents, result_status FROM payment_attempts WHERE order_id = $1 ORDER BY created_at`, [orderId])).rows;
    } finally {
      await c.end();
    }
  };
  return { app, clock, create, order, checkout, get, webhook, paidSession, attempts, eventId, databaseUrl };
}

describe('payment configuration', () => {
  it('uses simulated payments without a Stripe key, and refuses live keys or a missing webhook secret', () => {
    expect(paymentsFromEnv({}).mode).toBe('simulated');
    expect(paymentsFromEnv({ STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_x' }).mode).toBe('stripe_test');
    expect(() => paymentsFromEnv({ STRIPE_SECRET_KEY: 'sk_live_x', STRIPE_WEBHOOK_SECRET: 'whsec_x' })).toThrow(/test-mode key/);
    expect(() => paymentsFromEnv({ STRIPE_SECRET_KEY: 'rk_live_x', STRIPE_WEBHOOK_SECRET: 'whsec_x' })).toThrow(/test-mode key/);
    expect(() => paymentsFromEnv({ STRIPE_SECRET_KEY: 'sk_test_x' })).toThrow(/STRIPE_WEBHOOK_SECRET/);
  });

  it('needs PUBLIC_APP_URL in production', () => {
    expect(() => publicAppUrl({ NODE_ENV: 'production' })).toThrow(/PUBLIC_APP_URL/);
    expect(publicAppUrl({ NODE_ENV: 'production', PUBLIC_APP_URL: 'https://example.test/' })).toBe('https://example.test');
  });
});

describe('Stripe hosted Checkout (test mode)', () => {
  it('opens one session per held order for the exact total and reuses it', async () => {
    const { order, checkout, create, eventId } = await setup();
    const o = await order(['RR-M35-34', 'CR-M35-34']);
    const first = await checkout(o.id);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ kind: 'redirect', url: 'https://checkout.stripe.test/pay/1' });
    expect((await checkout(o.id)).json()).toEqual(first.json());
    expect(create).toHaveBeenCalledTimes(1);
    const [params, options] = create.mock.calls[0] as [Stripe.Checkout.SessionCreateParams, Stripe.RequestOptions];
    expect(params.line_items![0].price_data!.unit_amount).toBe(7500);
    expect(params.client_reference_id).toBe(o.id);
    expect(params.metadata).toEqual({ order_id: o.id });
    expect(params.success_url).toBe(`http://app.test/?checkout=returned#/orders/${o.id}`);
    expect(params.cancel_url).toBe(`http://app.test/#/register/${eventId}`);
    expect(options.idempotencyKey).toBe(`checkout-${o.id}-1`);
    expect(params.expires_at).toBe(Date.parse('2027-03-01T18:41:00Z') / 1000);
  });

  it('recovers concurrent Checkout requests through SDK retries with one recorded session', async () => {
    let releaseFirst!: () => void;
    const conflictSeen = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const keys: (string | null)[] = [];
    const bodies: string[] = [];
    let completed = false;
    const session = { id: 'cs_test_concurrent', url: 'https://checkout.stripe.test/pay/concurrent', expires_at: Date.parse('2027-03-01T18:41:00Z') / 1000 };
    const transport = vi.fn(async (_url: unknown, init?: RequestInit) => {
      keys.push(new Headers(init?.headers).get('idempotency-key'));
      bodies.push(String(init?.body));
      if (keys.length === 1) {
        await conflictSeen;
        completed = true;
      } else if (!completed) {
        releaseFirst();
        return new Response(JSON.stringify({ error: { type: 'invalid_request_error', code: 'idempotency_key_in_use', message: 'Another request is using this key.' } }), { status: 409 });
      }
      return new Response(JSON.stringify(session));
    });
    const client = new Stripe('sk_test_fictional', { maxNetworkRetries: 2, httpClient: Stripe.createFetchHttpClient(transport) });
    const { order, checkout, databaseUrl, get } = await setup({ client });
    const o = await order(['RR-M35-34']);
    const [a, b] = await Promise.all([checkout(o.id), checkout(o.id)]);
    expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
    expect(a.json()).toEqual({ kind: 'redirect', url: session.url });
    expect(b.json()).toEqual(a.json());
    expect(keys).toHaveLength(3); // two concurrent attempts plus the SDK's conflict retry
    expect(new Set(keys)).toEqual(new Set([`checkout-${o.id}-1`]));
    expect(new Set(bodies).size).toBe(1);
    const db = new pg.Client({ connectionString: databaseUrl });
    await db.connect();
    try {
      expect((await db.query('SELECT id FROM payment_sessions WHERE order_id = $1', [o.id])).rows).toEqual([{ id: session.id }]);
    } finally {
      await db.end();
    }
    expect((await get(o.id)).entries).toHaveLength(1);
    expect((await get(o.id)).status).toBe('held');
  });

  it('returns a retryable result after SDK conflict retries run out and reuses the original key', async () => {
    const keys: (string | null)[] = [];
    const bodies: string[] = [];
    let busy = true;
    const session = { id: 'cs_test_after_conflict', url: 'https://checkout.stripe.test/pay/recovered', expires_at: Date.parse('2027-03-01T18:41:00Z') / 1000 };
    const transport = vi.fn(async (_url: unknown, init?: RequestInit) => {
      keys.push(new Headers(init?.headers).get('idempotency-key'));
      bodies.push(String(init?.body));
      return busy
        ? new Response(JSON.stringify({ error: { type: 'invalid_request_error', code: 'idempotency_key_in_use', message: 'Another request is using this key.' } }), { status: 409 })
        : new Response(JSON.stringify(session));
    });
    const client = new Stripe('sk_test_fictional', { maxNetworkRetries: 2, httpClient: Stripe.createFetchHttpClient(transport) });
    const { order, checkout, get, clock } = await setup({ client });
    const o = await order(['RR-M35-34']);
    const waiting = await checkout(o.id);
    expect(waiting.statusCode).toBe(503);
    expect(waiting.json().error).toBe('Your payment page is still being prepared. Try again in a moment using this order.');
    expect(keys).toHaveLength(3); // the configured retry budget is bounded
    expect((await get(o.id)).status).toBe('held');
    clock.advance(1); // a later retry must not change expiry under the same provider key
    busy = false;
    expect((await checkout(o.id)).json()).toEqual({ kind: 'redirect', url: session.url });
    expect(keys).toHaveLength(4);
    expect(new Set(keys)).toEqual(new Set([`checkout-${o.id}-1`]));
    expect(new Set(bodies).size).toBe(1);
    expect((await checkout(o.id)).json()).toEqual({ kind: 'redirect', url: session.url });
    expect(keys).toHaveLength(4); // the saved session is reused without another provider call
  });

  it('turns off the simulated payment button and tells the rider page which mode is on', async () => {
    const { app, order, eventId } = await setup();
    const o = await order(['RR-M35-34']);
    const res = await app.inject({ method: 'POST', url: `/api/orders/${o.id}/payment`, payload: { attemptId: 'att-12345678', outcome: 'success' } });
    expect(res.statusCode).toBe(409);
    expect(((await app.inject({ method: 'GET', url: `/api/public/events/${eventId}` })).json() as { paymentMode: string }).paymentMode).toBe('stripe_test');
  });

  it('only the rider who placed the order can open its payment page', async () => {
    const { order, checkout } = await setup();
    const o = await order(['RR-M35-34']);
    expect((await checkout(o.id, as('someone.else@example.test'))).statusCode).toBeGreaterThanOrEqual(403);
  });

  it('refuses a new session once the hold has ended', async () => {
    const { order, checkout, clock } = await setup();
    const o = await order(['RR-M35-34']);
    clock.advance(11);
    expect((await checkout(o.id)).statusCode).toBe(409);
  });

  it('confirms on a signed paid notification exactly once, even when Stripe repeats it', async () => {
    const { order, checkout, webhook, paidSession, get, attempts } = await setup();
    const o = await order(['RR-M35-34']);
    await checkout(o.id);
    const a = await webhook('evt_test_paid', 'checkout.session.completed', paidSession(o));
    expect(a.statusCode).toBe(200);
    expect(a.json()).toEqual({ result: 'confirmed', duplicate: false });
    expect((await webhook('evt_test_paid', 'checkout.session.completed', paidSession(o))).json()).toEqual({ result: 'confirmed', duplicate: true });
    const after = await get(o.id);
    expect(after.status).toBe('confirmed');
    expect(after.paidWith).toBe('stripe_test');
    expect(await attempts(o.id)).toEqual([{ provider: 'stripe_test', provider_ref: 'pi_test_1', amount_cents: 5000, result_status: 'confirmed' }]);
  });

  it('rejects a bad signature without needing sign-in, and changes nothing', async () => {
    const { order, checkout, webhook, paidSession, get } = await setup();
    const o = await order(['RR-M35-34']);
    await checkout(o.id);
    expect((await webhook('evt_test_forged', 'checkout.session.completed', paidSession(o), 'whsec_wrong')).statusCode).toBe(400);
    expect((await get(o.id)).status).toBe('held');

    // The webhook is public: Stripe never signs in. It must answer 400, not 401, to an unsigned caller.
    const strict = await testApp({ auth: fakeAuth(), payments: stripePayments({ secretKey: 'sk_test_x', webhookSecret: WEBHOOK_SECRET }), appUrl: 'http://app.test' });
    const res = await strict.app.inject({ method: 'POST', url: '/api/payments/stripe/webhook', headers: { 'content-type': 'application/json' }, payload: '{}' });
    expect(res.statusCode).toBe(400);
  });

  it('sends money that does not match the order total to the organizer instead of confirming', async () => {
    const { order, checkout, webhook, paidSession, get } = await setup();
    const o = await order(['RR-M35-34']);
    await checkout(o.id);
    expect((await webhook('evt_test_short', 'checkout.session.completed', paidSession(o, 'cs_test_1', { amount_total: 100 }))).json()).toMatchObject({ result: 'needs_attention' });
    const after = await get(o.id);
    expect(after.status).toBe('needs_attention');
    expect(after.entries.every((e) => e.status === 'released')).toBe(true);
  });

  it('ignores a session this app did not open', async () => {
    const { order, checkout, webhook, paidSession, get } = await setup();
    const o = await order(['RR-M35-34']);
    await checkout(o.id);
    expect((await webhook('evt_test_other', 'checkout.session.completed', paidSession(o, 'cs_test_not_ours'))).json()).toMatchObject({ result: 'unknown_session' });
    expect((await get(o.id)).status).toBe('held');
  });

  it('waits for a delayed payment, then confirms; a late failure after success changes nothing', async () => {
    const { order, checkout, webhook, paidSession, get } = await setup();
    const o = await order(['RR-M35-34']);
    await checkout(o.id);
    expect((await webhook('evt_test_pending', 'checkout.session.completed', paidSession(o, 'cs_test_1', { payment_status: 'unpaid' }))).json()).toMatchObject({ result: 'awaiting_payment' });
    expect((await get(o.id)).status).toBe('held');
    expect((await webhook('evt_test_settled', 'checkout.session.async_payment_succeeded', paidSession(o))).json()).toMatchObject({ result: 'confirmed' });
    expect((await webhook('evt_test_late_fail', 'checkout.session.async_payment_failed', paidSession(o))).json()).toMatchObject({ result: 'confirmed' });
    expect((await get(o.id)).status).toBe('confirmed');
  });

  it('a failed delayed payment keeps the hold so the rider can try again', async () => {
    const { order, checkout, webhook, paidSession, get } = await setup();
    const o = await order(['RR-M35-34']);
    await checkout(o.id);
    expect((await webhook('evt_test_failed', 'checkout.session.async_payment_failed', paidSession(o))).json()).toMatchObject({ result: 'payment_failed' });
    expect((await get(o.id)).status).toBe('payment_failed');
  });

  it('money after the rider cancelled goes to the organizer, never a silent re-entry', async () => {
    const { app, order, checkout, webhook, paidSession, get } = await setup();
    const o = await order(['RR-M35-34']);
    await checkout(o.id);
    await app.inject({ method: 'POST', url: `/api/orders/${o.id}/cancel` });
    expect((await webhook('evt_test_after_cancel', 'checkout.session.completed', paidSession(o))).json()).toMatchObject({ result: 'needs_attention' });
    expect((await get(o.id)).status).toBe('needs_attention');
  });

  it('payment after the hold ended confirms only while the places are still free', async () => {
    const { order, checkout, webhook, paidSession, get, clock } = await setup();
    const o = await order(['RR-M35-34']);
    await checkout(o.id);
    clock.advance(40); // one minute before the provider deadline, 30 minutes after the capacity hold
    expect((await webhook('evt_test_late', 'checkout.session.completed', paidSession(o))).json()).toMatchObject({ result: 'confirmed' });
    expect((await get(o.id)).status).toBe('confirmed');
  });

  it('records a second paid session for the same order as a duplicate charge, not a second entry', async () => {
    const { order, checkout, webhook, paidSession, get } = await setup({ holdMinutes: 60 });
    const o = await order(['RR-M35-34']);
    await checkout(o.id);
    await webhook('evt_test_initial_expiry', 'checkout.session.expired', paidSession(o, 'cs_test_1', { payment_status: 'unpaid' })); // provider expiration can precede a delayed success event
    expect((await checkout(o.id)).json()).toEqual({ kind: 'redirect', url: 'https://checkout.stripe.test/pay/2' });
    expect((await webhook('evt_test_first', 'checkout.session.completed', paidSession(o, 'cs_test_1'))).json()).toMatchObject({ result: 'confirmed' });
    expect((await webhook('evt_test_second', 'checkout.session.completed', paidSession(o, 'cs_test_2'))).json()).toMatchObject({ result: 'duplicate_charge' });
    expect((await get(o.id)).status).toBe('confirmed');
  });

  it('marks a refund of the duplicate charge, so it is not read as a refund of the order', async () => {
    const { app, order, checkout, webhook, paidSession, get } = await setup({ holdMinutes: 60 });
    const o = await order(['RR-M35-34']);
    await checkout(o.id);
    await webhook('evt_test_initial_expiry', 'checkout.session.expired', paidSession(o, 'cs_test_1', { payment_status: 'unpaid' }));
    await checkout(o.id);
    await webhook('evt_test_first', 'checkout.session.completed', paidSession(o, 'cs_test_1'));
    await webhook('evt_test_second', 'checkout.session.completed', paidSession(o, 'cs_test_2', { payment_intent: 'pi_test_2' }));
    const refunded = await app.inject({ method: 'POST', url: `/api/orders/${o.id}/refunds`, payload: { clientRequestId: 'refund-local-payments-test-ts', amountCents: o.totalCents, reason: 'Charged twice', paymentRef: 'pi_test_2' } });
    expect(refunded.statusCode).toBe(200);
    expect(((await get(o.id)) as unknown as { refunds: { duplicateCharge: boolean }[] }).refunds).toMatchObject([{ duplicateCharge: true }]);
  });

  it('an expired session is recorded and leaves the order alone', async () => {
    const { order, checkout, webhook, paidSession, get } = await setup();
    const o = await order(['RR-M35-34']);
    await checkout(o.id);
    expect((await webhook('evt_test_expired', 'checkout.session.expired', paidSession(o, 'cs_test_1', { payment_status: 'unpaid' }))).json()).toMatchObject({ result: 'session_expired' });
    expect((await get(o.id)).status).toBe('held');
  });
});
