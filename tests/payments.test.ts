import Stripe from 'stripe';
import pg from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { paymentsFromEnv, publicAppUrl, stripePayments } from '../src/server/payments';
import { testApp, testDatabaseUrl } from './support/db';
import { openDb } from '../src/server/db';
import { createMailer, EmailUncertain, localEmail, type EmailSender } from '../src/server/email';
import { as, DEFAULT_TEST_ORGANIZER, fakeAuth } from './support/auth';
import type { EventConfig } from '../src/shared/schema';
import { publishReviewed } from './support/publish';

/*
 * Stripe hosted Checkout in test mode (ADR 0002, Phase 2). No network: the Stripe client's
 * session call or HTTP transport is stubbed, and webhooks are signed locally with the SDK's test-header helper,
 * so signature verification runs exactly as it would for a real Stripe notification.
 */

const WEBHOOK_SECRET = 'whsec_test_fictional_secret';
const RIDER = { firstName: 'Test', lastName: 'Rider', email: 'test.rider@example.test', team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Test Contact', phone: '555-555-0199' } };

type Order = { id: string; status: string; totalCents: number; paidWith: string | null; entries: { status: string }[] };

async function setup(opts: { holdMinutes?: number; client?: Stripe; email?: EmailSender; onSessionCreated?: (session: { id: string }) => Promise<void> } = {}) {
  let now = new Date('2027-03-01T18:00:00Z');
  const clock = { now: () => now, advance: (min: number) => (now = new Date(now.getTime() + min * 60_000)) };
  const client = opts.client ?? new Stripe('sk_test_fictional', { maxNetworkRetries: 0 });
  let n = 0;
  const create = vi.spyOn(client.checkout.sessions, 'create');
  if (!opts.client) create.mockImplementation((async (params: Stripe.Checkout.SessionCreateParams) => {
    n++;
    const session = { id: `cs_test_${n}`, url: `https://checkout.stripe.test/pay/${n}`, expires_at: params.expires_at!, amount_total: params.line_items![0].price_data!.unit_amount! } as Stripe.Checkout.Session;
    await opts.onSessionCreated?.(session);
    return session;
  }) as never);
  vi.spyOn(client.refunds, 'create').mockImplementation((async () => ({ id: 're_test_1', status: 'pending', failure_reason: null }) as unknown as Stripe.Refund) as never);
  const payments = stripePayments({ secretKey: 'sk_test_fictional', webhookSecret: WEBHOOK_SECRET, client });
  const databaseUrl = await testDatabaseUrl();
  const { app } = await testApp({ databaseUrl, now: () => now, holdMinutes: opts.holdMinutes ?? 10, payments, email: opts.email, appUrl: 'http://app.test' });
  const { eventId } = (await app.inject({ method: 'POST', url: '/api/demo' })).json() as { eventId: string };
  await publishReviewed(app, `/api/events/${eventId}`, { acknowledgeWarnings: true });
  const event = (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json() as { config: EventConfig };
  const code = (c: string) => event.config.categories.find((x) => x.timingCode === c)!.id;
  const waiver = { version: event.config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Test Rider', signerRole: 'rider' };
  let r = 0;
  const order = async (codes: string[]) =>
    (await app.inject({ method: 'POST', url: `/api/rider/events/${eventId}/orders`, payload: { clientRequestId: `req-${++r}-xxxxxxxx`, categoryIds: codes.map(code), rider: RIDER, waiver } })).json() as Order;
  const checkout = (orderId: string, headers: Record<string, string> = {}) => app.inject({ method: 'POST', url: `/api/orders/${orderId}/checkout-session`, headers });
  const get = async (orderId: string) => (await app.inject({ method: 'GET', url: `/api/orders/${orderId}` })).json() as Order;

  /** Signs one checkout.session.* event the same way Stripe does. */
  const sign = (id: string, type: string, session: Record<string, unknown>, secret = WEBHOOK_SECRET) => {
    const payload = JSON.stringify({ id, object: 'event', type, livemode: false, data: { object: { object: 'checkout.session', currency: 'usd', payment_status: 'paid', payment_intent: 'pi_test_1', ...session } } });
    const header = client.webhooks.generateTestHeaderString({ payload, secret });
    return { payload, header };
  };
  /** Sends a Stripe-signed checkout.session.* event. */
  const webhook = (id: string, type: string, session: Record<string, unknown>, secret = WEBHOOK_SECRET) => {
    const { payload, header } = sign(id, type, session, secret);
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
  return { app, clock, create, order, checkout, get, webhook, sign, paidSession, attempts, eventId, databaseUrl };
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
  it('releases a new Stripe test hold before checkout starts without a provider call', async () => {
    const { app, order, get, checkout, create, eventId } = await setup();
    const held = await order(['RR-M35-34']);
    const reference = 'req-1-xxxxxxxx';
    const lookup = await app.inject({ method: 'POST', url: `/api/events/${eventId}/reservation-status`, payload: { reference } });
    expect(lookup.json()).toMatchObject({ releaseEnabled: true, order: { status: 'held' } });
    const result = await app.inject({
      method: 'POST', url: `/api/events/${eventId}/reservation-release`, payload: { reference, riderRequested: true, reason: 'Fictional request' },
    });
    expect(result.statusCode).toBe(200);
    expect((await get(held.id)).status).toBe('cancelled');
    expect((await checkout(held.id)).statusCode).toBe(409);
    expect(create).not.toHaveBeenCalled();
  });

  it('blocks release from a simulated app while a Stripe test session is being created', async () => {
    const { databaseUrl, order, checkout, create, eventId } = await setup();
    const { app: simulated } = await testApp({ databaseUrl, now: () => new Date('2027-03-01T18:00:00Z') });
    let providerStarted!: () => void;
    let finishProvider!: () => void;
    const started = new Promise<void>((resolve) => { providerStarted = resolve; });
    const finish = new Promise<void>((resolve) => { finishProvider = resolve; });
    create.mockImplementationOnce((async (params: Stripe.Checkout.SessionCreateParams) => {
      providerStarted();
      await finish;
      return { id: 'cs_test_concurrent_release', url: 'https://checkout.stripe.test/concurrent', expires_at: params.expires_at! } as Stripe.Checkout.Session;
    }) as never);

    const hold = await order(['RR-M35-34']);
    const opening = checkout(hold.id);
    try {
      await Promise.race([started, opening.then(() => { throw new Error('Checkout ended before it called the stubbed provider.'); })]);
      const release = await simulated.inject({
        method: 'POST', url: `/api/events/${eventId}/reservation-release`,
        payload: { reference: 'req-1-xxxxxxxx', riderRequested: true, reason: 'Fictional request' },
      });
      expect(release.statusCode).toBe(409);
      expect(release.json().error).toContain('needs review');
    } finally { finishProvider(); }
    expect((await opening).statusCode).toBe(200);
  });

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
    const { order, checkout, webhook, paidSession, get, attempts, databaseUrl, clock } = await setup();
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
    const db = new pg.Client({ connectionString: databaseUrl });
    await db.connect();
    try {
      expect((await db.query(
        `SELECT kind, to_email, status, provider_message_id, body_text FROM email_messages WHERE order_id = $1`,
        [o.id],
      )).rows).toEqual([{
        kind: 'registration_confirmation',
        to_email: DEFAULT_TEST_ORGANIZER,
        status: 'recorded',
        provider_message_id: null,
        body_text: 'Your registration is confirmed. Sign in and open My registrations to see your order and receipt.',
      }]);
    } finally {
      await db.end();
    }
    const mailDb = openDb(databaseUrl);
    try {
      const send = vi.fn().mockResolvedValue('unexpected-send');
      await createMailer(mailDb, { mode: 'resend', from: 'test@example.test', send }, clock.now).dispatchNextConfirmation();
      expect(send).not.toHaveBeenCalled();
    } finally {
      await mailDb.close();
    }
  });

  it('dispatches a confirmation with a stable key and sender across an uncertain retry', async () => {
    const send = vi.fn().mockRejectedValueOnce(new EmailUncertain('Fictional timeout.')).mockResolvedValue('re_confirmation');
    const sender = { mode: 'resend' as const, from: 'first@example.test', send };
    const { order, checkout, webhook, paidSession, get, databaseUrl } = await setup({ email: sender });
    const o = await order(['RR-M35-34']);
    await checkout(o.id);
    await webhook('evt_confirmation_delivery', 'checkout.session.completed', paidSession(o));
    const db = openDb(databaseUrl);
    try {
      const message = await db.get<{ id: string; created_at: string }>(
        'SELECT id, created_at FROM email_messages WHERE order_id = $1', [o.id],
      );
      const now = () => new Date(message!.created_at);
      await createMailer(db, localEmail(), now).dispatchNextConfirmation();
      expect(send).not.toHaveBeenCalled();
      const mailer = createMailer(db, sender, now);
      await mailer.dispatchNextConfirmation();
      expect((await get(o.id)).status).toBe('confirmed');
      await mailer.dispatchNextConfirmation();
      expect(send).toHaveBeenCalledTimes(1);
      await db.run("UPDATE email_messages SET sending_until = now() - interval '1 second' WHERE id = $1", [message!.id]);
      const expired = createMailer(db, sender, () => new Date(now().getTime() + 24 * 60 * 60 * 1000));
      await expired.dispatchNextConfirmation();
      expect(send).toHaveBeenCalledTimes(1);
      await db.run(
        `INSERT INTO email_suppressions (id, organization_id, email, reason, email_id, created_at)
         SELECT 'test-stop', organization_id, to_email, 'bounced', id, created_at FROM email_messages WHERE id = $1`,
        [message!.id],
      );
      await mailer.dispatchNextConfirmation();
      expect(send).toHaveBeenCalledTimes(1);
      await db.run("DELETE FROM email_suppressions WHERE id = 'test-stop'");
      await db.run(
        `INSERT INTO email_delivery_events (id, email_id, kind, occurred_at) VALUES ('test-bounce', $1, 'bounced', $2)`,
        [message!.id, message!.created_at],
      );
      await mailer.dispatchNextConfirmation();
      expect(send).toHaveBeenCalledTimes(1);
      await db.run("DELETE FROM email_delivery_events WHERE id = 'test-bounce'");
      const restarted = createMailer(db, { ...sender, from: 'second@example.test' }, now);
      await Promise.all([restarted.dispatchNextConfirmation(), mailer.dispatchNextConfirmation()]);
      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[1]).toEqual(send.mock.calls[0]);
      expect(send.mock.calls[1][1]).toBe(message!.id);
      expect(send.mock.calls[1][0]).toMatchObject({ from: sender.from, to: DEFAULT_TEST_ORGANIZER });
      expect(await db.get('SELECT status, provider_message_id FROM email_messages WHERE id = $1', [message!.id]))
        .toEqual({ status: 'sent', provider_message_id: 're_confirmation' });
    } finally {
      await db.close();
    }
  });

  it('limits confirmation visibility and auditable retry to authorized event staff', async () => {
    const send = vi.fn().mockRejectedValueOnce(new EmailUncertain('Fictional timeout.')).mockResolvedValue('re_staff_retry');
    const sender = { mode: 'resend' as const, from: 'sender@example.test', send };
    const { app, clock, eventId, order, checkout, webhook, paidSession, databaseUrl } = await setup({ email: sender });
    const o = await order(['RR-M35-34']);
    await checkout(o.id);
    await webhook('evt_staff_retry', 'checkout.session.completed', paidSession(o));
    const url = `/api/events/${eventId}/orders/${o.id}/confirmation-delivery`;
    const db = openDb(databaseUrl);
    try {
      await createMailer(db, sender, clock.now).dispatchNextConfirmation();
      expect((await app.inject({ method: 'GET', url, headers: as('outsider@example.test') })).statusCode).toBe(404);
      expect((await app.inject({ method: 'POST', url: `${url}/retry`, headers: as('outsider@example.test') })).statusCode).toBe(404);
      expect((await app.inject({ method: 'GET', url })).json()).toEqual({
        confirmation: { status: 'uncertain', delivery: null, canRetry: false },
      });
      expect((await app.inject({ method: 'POST', url: `${url}/retry` })).statusCode).toBe(409);
      await db.run("UPDATE email_messages SET sending_until = now() - interval '1 second' WHERE order_id = $1", [o.id]);
      const status = await app.inject({ method: 'GET', url });
      expect(status.headers['cache-control']).toBe('no-store');
      expect(status.json()).toEqual({ confirmation: { status: 'uncertain', delivery: null, canRetry: true } });
      const retried = await app.inject({ method: 'POST', url: `${url}/retry` });
      expect(retried.json()).toEqual({ confirmation: { status: 'sent', delivery: null, canRetry: false } });
      expect((await app.inject({ method: 'POST', url: `${url}/retry` })).statusCode).toBe(409);
      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[0]).toEqual(send.mock.calls[1]);
      expect(await db.all(
        `SELECT a.email FROM confirmation_retry_requests r
         JOIN accounts a ON a.id = r.actor_account_id JOIN email_messages m ON m.id = r.email_id WHERE m.order_id = $1`,
        [o.id],
      )).toEqual([{ email: DEFAULT_TEST_ORGANIZER }]);
    } finally {
      await db.close();
    }
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
    const unknown = paidSession(o, 'cs_test_not_ours');
    expect((await webhook('evt_test_other', 'checkout.session.completed', unknown)).json()).toEqual({ result: 'unknown_session', duplicate: false });
    expect((await webhook('evt_test_other', 'checkout.session.completed', unknown)).json()).toEqual({ result: 'unknown_session', duplicate: true });
    expect((await get(o.id)).status).toBe('held');
  });

  it('leaves a session that names another order unknown when the same event is delivered again', async () => {
    const { order, checkout, webhook, paidSession, get } = await setup();
    const o = await order(['RR-M35-34']);
    await checkout(o.id);
    const mismatched = paidSession(o, 'cs_test_1', { metadata: { order_id: 'order_not_this' }, client_reference_id: 'order_not_this' });
    expect((await webhook('evt_test_mismatch', 'checkout.session.completed', mismatched)).json()).toEqual({ result: 'unknown_session', duplicate: false });
    expect((await webhook('evt_test_mismatch', 'checkout.session.completed', mismatched)).json()).toEqual({ result: 'unknown_session', duplicate: true });
    expect((await get(o.id)).status).toBe('held');
  });

  it('applies a paid notification that was saved before its session row existed', async () => {
    let deliver: ((sessionId: string) => Promise<void>) | undefined;
    const { order, checkout, webhook, paidSession, get, attempts, databaseUrl } = await setup({
      onSessionCreated: async (session) => { if (deliver) await deliver(session.id); },
    });
    const o = await order(['RR-M35-34']);
    let first: Awaited<ReturnType<typeof webhook>> | undefined;
    deliver = async (sessionId) => {
      first = await webhook('evt_test_early', 'checkout.session.completed', paidSession(o, sessionId));
    };
    expect((await checkout(o.id)).json()).toEqual({ kind: 'redirect', url: 'https://checkout.stripe.test/pay/1' });
    expect(first!.json()).toEqual({ result: 'unknown_session', duplicate: false });
    expect((await get(o.id)).status).toBe('confirmed');
    expect((await webhook('evt_test_early', 'checkout.session.completed', paidSession(o))).json()).toEqual({ result: 'confirmed', duplicate: true });
    expect(await attempts(o.id)).toEqual([{ provider: 'stripe_test', provider_ref: 'pi_test_1', amount_cents: o.totalCents, result_status: 'confirmed' }]);
    const saved = new pg.Client({ connectionString: databaseUrl });
    await saved.connect();
    try {
      expect((await saved.query(`SELECT result, order_id FROM provider_events WHERE id = 'evt_test_early'`)).rows).toEqual([{ result: 'confirmed', order_id: o.id }]);
    } finally {
      await saved.end();
    }
  });

  it('reports a resent payment notification as a duplicate when it overlaps recording the session', async () => {
    let deliver: ((sessionId: string) => Promise<void>) | undefined;
    const { app, order, checkout, webhook, sign, paidSession, get, attempts, eventId, databaseUrl } = await setup({
      onSessionCreated: async (session) => { if (deliver) await deliver(session.id); },
    });
    // A second app.inject does not enter the route while the checkout inject is still running.
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const o = await order(['RR-M35-34']);
    const side = new pg.Client({ connectionString: databaseUrl });
    await side.connect();
    let sessionId = '';
    let first: Awaited<ReturnType<typeof webhook>> | undefined;
    let holding: () => void = () => undefined;
    const lockHeld = new Promise<void>((resolve) => { holding = resolve; });
    deliver = async (id) => {
      sessionId = id;
      first = await webhook('evt_test_overlap', 'checkout.session.completed', paidSession(o, id));
      await side.query('BEGIN');
      await side.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`event:${eventId}`]);
      holding();
    };
    const checkoutDone = checkout(o.id);
    const count = async (sql: string) => Number((await side.query<{ n: string }>(sql)).rows[0].n);
    const waitFor = async (ready: () => Promise<boolean>, label: string) => {
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline) {
        if (await ready()) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const activity = await side.query(`SELECT pid, state, wait_event_type, left(query, 80) AS query, pg_blocking_pids(pid) AS blocked_by FROM pg_stat_activity WHERE datname = current_database()`);
      throw new Error(`timed out waiting for ${label}; activity=${JSON.stringify(activity.rows)}`);
    };
    let resend: Promise<{ result: string; duplicate: boolean }> | undefined;
    try {
      await lockHeld;
      await waitFor(
        async () => (await count(`SELECT count(*) AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid() AND pg_backend_pid() = ANY(pg_blocking_pids(pid))`)) >= 1,
        'recording to wait on the event lock',
      );
      const signed = sign('evt_test_overlap', 'checkout.session.completed', paidSession(o, sessionId));
      resend = fetch(`${address}/api/payments/stripe/webhook`, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8', 'stripe-signature': signed.header },
        body: signed.payload,
      }).then(async (response) => response.json() as Promise<{ result: string; duplicate: boolean }>);
      await waitFor(
        async () => (await count(`SELECT count(*) AS n FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid WHERE a.datname = current_database() AND l.locktype = 'advisory' AND NOT l.granted`)) >= 2,
        'the resend to wait on the session lock',
      );
      await side.query('COMMIT');
      expect((await checkoutDone).json()).toEqual({ kind: 'redirect', url: 'https://checkout.stripe.test/pay/1' });
      expect(first!.json()).toEqual({ result: 'unknown_session', duplicate: false });
      expect(await resend).toEqual({ result: 'confirmed', duplicate: true });
      expect((await get(o.id)).status).toBe('confirmed');
      expect(await attempts(o.id)).toEqual([{ provider: 'stripe_test', provider_ref: 'pi_test_1', amount_cents: o.totalCents, result_status: 'confirmed' }]);
    } finally {
      await side.query('ROLLBACK').catch(() => undefined);
      await side.end();
    }
  });

  it('leaves a saved notification unknown when it names another order or another currency', async () => {
    let deliver: ((sessionId: string) => Promise<void>) | undefined;
    const { order, checkout, webhook, paidSession, get, attempts } = await setup({
      onSessionCreated: async (session) => { if (deliver) await deliver(session.id); },
    });
    const o = await order(['RR-M35-34']);
    const other = await order(['RR-M35-34']);
    const missing = paidSession(o, 'cs_test_1', { metadata: { order_id: 'order_not_this' }, client_reference_id: 'order_not_this' });
    deliver = async (sessionId) => {
      const namedOther = paidSession(o, sessionId, { metadata: { order_id: other.id }, client_reference_id: other.id });
      expect((await webhook('evt_test_early_other', 'checkout.session.completed', namedOther)).json()).toEqual({ result: 'unknown_session', duplicate: false });
      expect((await webhook('evt_test_early_eur', 'checkout.session.completed', paidSession(o, sessionId, { currency: 'eur' }))).json()).toEqual({ result: 'unknown_session', duplicate: false });
      expect((await webhook('evt_test_early_missing', 'checkout.session.completed', { ...missing, id: sessionId })).json()).toEqual({ result: 'unknown_session', duplicate: false });
    };
    expect((await checkout(o.id)).json()).toEqual({ kind: 'redirect', url: 'https://checkout.stripe.test/pay/1' });
    expect((await get(o.id)).status).toBe('held');
    expect((await get(other.id)).status).toBe('held');
    expect(await attempts(o.id)).toEqual([]);
    expect(await attempts(other.id)).toEqual([]);
    expect((await webhook('evt_test_early_missing', 'checkout.session.completed', { ...missing, id: 'cs_test_1' })).json()).toEqual({ result: 'unknown_session', duplicate: true });
    expect((await webhook('evt_test_early_eur', 'checkout.session.completed', paidSession(o, 'cs_test_1', { currency: 'eur' }))).json()).toMatchObject({ result: 'needs_attention', duplicate: false });
  });

  it('sends a short payment saved before its session row to the organizer', async () => {
    let deliver: ((sessionId: string) => Promise<void>) | undefined;
    const { order, checkout, webhook, paidSession, get } = await setup({
      onSessionCreated: async (session) => { if (deliver) await deliver(session.id); },
    });
    const o = await order(['RR-M35-34']);
    deliver = async (sessionId) => {
      expect((await webhook('evt_test_early_short', 'checkout.session.completed', paidSession(o, sessionId, { amount_total: 100 }))).json()).toEqual({ result: 'unknown_session', duplicate: false });
    };
    expect((await checkout(o.id)).json()).toEqual({ kind: 'redirect', url: 'https://checkout.stripe.test/pay/1' });
    const after = await get(o.id);
    expect(after.status).toBe('needs_attention');
    expect(after.entries.every((e) => e.status === 'released')).toBe(true);
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

  it('saves a session that opens after the rider cancelled and does not send the rider to it', async () => {
    let cancel: (() => Promise<unknown>) | undefined;
    const { app, order, checkout, get, databaseUrl } = await setup({
      onSessionCreated: async () => { if (cancel) await cancel(); },
    });
    const o = await order(['RR-M35-34']);
    cancel = () => app.inject({ method: 'POST', url: `/api/orders/${o.id}/cancel` });
    const res = await checkout(o.id);
    expect(res.statusCode, res.body).toBe(409);
    expect(res.json()).toEqual({ error: 'Your hold has ended. Start a new registration to pay.' });
    const after = await get(o.id);
    expect(after.status).toBe('cancelled');
    expect(after.entries.every((e) => e.status === 'released')).toBe(true);
    const left = new pg.Client({ connectionString: databaseUrl });
    await left.connect();
    try {
      const sessions = await left.query(`SELECT status FROM payment_sessions WHERE order_id = $1`, [o.id]);
      expect(sessions.rowCount).toBe(1);
      expect(sessions.rows[0].status).toBe('open');
    } finally {
      await left.end();
    }
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

  it('records exactly one of two paid sessions that arrive together as a duplicate charge', async () => {
    const { order, checkout, webhook, paidSession, get, attempts } = await setup({ holdMinutes: 60 });
    const o = await order(['RR-M35-34']);
    await checkout(o.id);
    await webhook('evt_test_initial_expiry', 'checkout.session.expired', paidSession(o, 'cs_test_1', { payment_status: 'unpaid' }));
    expect((await checkout(o.id)).json()).toEqual({ kind: 'redirect', url: 'https://checkout.stripe.test/pay/2' });
    const [first, second] = await Promise.all([
      webhook('evt_test_first', 'checkout.session.completed', paidSession(o, 'cs_test_1', { payment_intent: 'pi_test_1' })),
      webhook('evt_test_second', 'checkout.session.completed', paidSession(o, 'cs_test_2', { payment_intent: 'pi_test_2' })),
    ]);
    expect([first.json().result, second.json().result].sort()).toEqual(['confirmed', 'duplicate_charge']);
    expect((await get(o.id)).status).toBe('confirmed');
    const paid = await attempts(o.id);
    expect(paid).toHaveLength(1);
    expect(paid[0]).toMatchObject({ provider: 'stripe_test', result_status: 'confirmed', amount_cents: o.totalCents });
  });

  it('classifies a paid notification from rows committed while it waited on the event lock', async () => {
    const { order, checkout, webhook, paidSession, get, eventId, databaseUrl } = await setup();
    const o = await order(['RR-M35-34']);
    await checkout(o.id);
    const side = new pg.Client({ connectionString: databaseUrl });
    await side.connect();
    let pending: ReturnType<typeof webhook> | undefined;
    try {
      await side.query('BEGIN');
      await side.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`event:${eventId}`]);
      pending = webhook('evt_test_waiting', 'checkout.session.completed', paidSession(o, 'cs_test_1'));
      let waiting = false;
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline) {
        const seen = await side.query(`SELECT 1 FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND pid <> pg_backend_pid() LIMIT 1`);
        if (seen.rowCount) {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(waiting).toBe(true);
      await side.query(
        `INSERT INTO provider_events (id, provider, type, session_id, order_id, outcome, result, received_at) VALUES ('evt_test_already_paid', 'stripe_test', 'checkout.session.completed', 'cs_test_other', $1, 'paid', 'confirmed', $2)`,
        [o.id, '2027-03-01T18:01:00Z'],
      );
      await side.query('COMMIT');
      expect((await pending).json()).toMatchObject({ result: 'duplicate_charge', duplicate: false });
      expect((await get(o.id)).status).toBe('held');
    } finally {
      await side.query('ROLLBACK').catch(() => undefined);
      await side.end();
    }
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
