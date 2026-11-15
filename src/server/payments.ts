import Stripe from 'stripe';
import type { Db } from './db';
import type { Orders } from './orders';
import { HttpError } from './repo';

/**
 * Payment providers (ADR 0002). Two modes:
 * - `simulated`: no provider; the rider presses a labeled demo button (Phase 1 behavior).
 * - `stripe_test`: Stripe hosted Checkout in sandbox (test mode) only. Live keys are refused
 *   until the merchant and settlement model (ADR 0005) is accepted.
 * Card details never reach this server: the rider pays on Stripe's page.
 */

export type PaymentMode = 'simulated' | 'stripe_test';

export interface CheckoutRequest {
  orderId: string;
  amountCents: number;
  description: string;
  customerEmail: string | null;
  successUrl: string;
  cancelUrl: string;
  /** Same key, same session: a retried request never opens a second one. */
  idempotencyKey: string;
}

export interface CheckoutSession {
  id: string;
  url: string;
  /** ISO 8601. */
  expiresAt: string;
}

/** A verified provider notification, reduced to what fulfillment needs. */
export interface ProviderEvent {
  id: string;
  /** The provider's own event type, kept for the record. */
  type: string;
  /** paid: money arrived. pending: completed but a delayed method has not settled. failed: a delayed method failed. expired: the session closed unpaid. */
  outcome: 'paid' | 'pending' | 'failed' | 'expired' | 'ignored';
  sessionId: string | null;
  orderId: string | null;
  amountCents: number | null;
  currency: string | null;
  paymentRef: string | null;
}

export interface PaymentProvider {
  mode: PaymentMode;
  createCheckout(req: CheckoutRequest): Promise<CheckoutSession>;
  /** Verifies the signature on the raw body and returns the event. Throws 400 when it does not verify. */
  parseWebhook(rawBody: string, signature: string | undefined): ProviderEvent;
}

export const simulatedPayments: PaymentProvider = {
  mode: 'simulated',
  createCheckout() {
    throw new HttpError(409, 'Payments are simulated for this build. Use the simulated payment.');
  },
  parseWebhook() {
    throw new HttpError(404, 'No payment provider is connected.');
  },
};

/** Stripe Checkout requires a session to stay open at least 30 minutes; a late payment is handled by the order's hold rules. */
const SESSION_MINUTES = 30;

export function stripePayments(opts: { secretKey: string; webhookSecret: string; client?: Stripe; now?: () => Date }): PaymentProvider {
  if (!/^(sk|rk)_test_/.test(opts.secretKey)) throw new Error('STRIPE_SECRET_KEY must be a test-mode key (sk_test_ or rk_test_). Live keys are refused until ADR 0005 is accepted.');
  if (!opts.webhookSecret.startsWith('whsec_')) throw new Error('STRIPE_WEBHOOK_SECRET must be a webhook signing secret (whsec_...).');
  const stripe = opts.client ?? new Stripe(opts.secretKey, { maxNetworkRetries: 2 });
  const now = opts.now ?? (() => new Date());

  return {
    mode: 'stripe_test',
    async createCheckout(req) {
      const session = await stripe.checkout.sessions.create(
        {
          mode: 'payment',
          client_reference_id: req.orderId,
          metadata: { order_id: req.orderId },
          payment_intent_data: { metadata: { order_id: req.orderId } },
          customer_email: req.customerEmail ?? undefined,
          line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: req.amountCents, product_data: { name: req.description } } }],
          success_url: req.successUrl,
          cancel_url: req.cancelUrl,
          expires_at: Math.floor(now().getTime() / 1000) + SESSION_MINUTES * 60 + 60,
        },
        { idempotencyKey: req.idempotencyKey },
      );
      if (!session.url) throw new HttpError(502, 'Stripe did not return a payment page.');
      return { id: session.id, url: session.url, expiresAt: new Date(session.expires_at * 1000).toISOString() };
    },
    parseWebhook(rawBody, signature) {
      if (!signature) throw new HttpError(400, 'Missing Stripe signature.');
      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(rawBody, signature, opts.webhookSecret);
      } catch {
        throw new HttpError(400, 'Stripe signature did not verify.');
      }
      // A live-mode event never fulfills an order in this build.
      if (event.livemode) throw new HttpError(400, 'Live-mode events are not accepted.');
      return toProviderEvent(event);
    },
  };
}

function toProviderEvent(event: Stripe.Event): ProviderEvent {
  const base = { id: event.id, type: event.type, sessionId: null, orderId: null, amountCents: null, currency: null, paymentRef: null };
  if (!event.type.startsWith('checkout.session.')) return { ...base, outcome: 'ignored' };
  const s = event.data.object as Stripe.Checkout.Session;
  const fields = {
    sessionId: s.id,
    orderId: s.metadata?.order_id ?? s.client_reference_id ?? null,
    amountCents: s.amount_total ?? null,
    currency: s.currency ?? null,
    paymentRef: typeof s.payment_intent === 'string' ? s.payment_intent : (s.payment_intent?.id ?? null),
  };
  switch (event.type) {
    case 'checkout.session.completed':
      return { ...base, ...fields, outcome: s.payment_status === 'paid' ? 'paid' : 'pending' };
    case 'checkout.session.async_payment_succeeded':
      return { ...base, ...fields, outcome: 'paid' };
    case 'checkout.session.async_payment_failed':
      return { ...base, ...fields, outcome: 'failed' };
    case 'checkout.session.expired':
      return { ...base, ...fields, outcome: 'expired' };
    default:
      return { ...base, ...fields, outcome: 'ignored' };
  }
}

/** Stripe test mode when STRIPE_SECRET_KEY is set; otherwise simulated payments. */
export function paymentsFromEnv(env: Record<string, string | undefined> = process.env): PaymentProvider {
  const secretKey = env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) return simulatedPayments;
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET is not set. Stripe test mode needs the webhook signing secret; see docs/runbooks/local-setup.md.');
  return stripePayments({ secretKey, webhookSecret });
}

/** Where Stripe sends the rider back. Required in production; local development defaults to the Vite dev server. */
export function publicAppUrl(env: Record<string, string | undefined> = process.env): string {
  const url = env.PUBLIC_APP_URL?.trim();
  if (url) return url.replace(/\/+$/, '');
  if (env.NODE_ENV === 'production') throw new Error('PUBLIC_APP_URL is not set. Stripe needs it to send riders back after paying.');
  return 'http://127.0.0.1:5273';
}

/** Stripe's smallest USD charge. */
const MIN_CHARGE_CENTS = 50;

interface SessionRow {
  id: string;
  order_id: string;
  url: string;
  amount_cents: number;
  status: 'open' | 'completed' | 'expired';
  expires_at: string;
}

/**
 * Hosted checkout and webhook fulfillment on top of `orders.pay`, which already confirms
 * each attempt once, re-admits an expired hold all-or-nothing, and sends late money to the
 * organizer's exception queue.
 */
export function createPayments(db: Db, orders: Orders, provider: PaymentProvider, clock: () => Date, appUrl: string) {
  const nowIso = () => clock().toISOString();

  return {
    mode: provider.mode,

    /**
     * Opens (or reuses) the Stripe Checkout Session for a held order and returns where to send the rider.
     * A zero-total order is confirmed directly: there is nothing to charge.
     */
    async startCheckout(orderId: string): Promise<{ kind: 'redirect'; url: string } | { kind: 'confirmed' }> {
      if (provider.mode === 'simulated') throw new HttpError(409, 'Payments are simulated for this build. Use the simulated payment.');
      return db.transaction(async () => {
        // Per-order lock, not the event lock: the call to Stripe must not hold up other riders' checkouts.
        await db.lock(`checkout:${orderId}`);
        const order = await orders.getOrder(orderId);
        if (order.status === 'confirmed') throw new HttpError(409, 'This order is already paid.');
        if (order.status === 'needs_attention') throw new HttpError(409, 'This order is with the organizer. They will contact you.');
        if (order.status !== 'held' && order.status !== 'payment_failed') throw new HttpError(409, 'Your hold has ended. Start a new registration to pay.');
        if (order.totalCents === 0) {
          await orders.pay(orderId, `free-${orderId}`, 'success', { provider: provider.mode, ref: null, amountCents: 0 });
          return { kind: 'confirmed' as const };
        }
        if (order.totalCents < MIN_CHARGE_CENTS) throw new HttpError(409, 'Stripe cannot charge less than $0.50. Ask the organizer to adjust the price or coupon.');

        const open = await db.get<SessionRow>(
          `SELECT * FROM payment_sessions WHERE order_id = $1 AND status = 'open' AND expires_at > $2 ORDER BY created_at DESC LIMIT 1`,
          [orderId, new Date(clock().getTime() + 60_000).toISOString()],
        );
        if (open && open.amount_cents === order.totalCents) return { kind: 'redirect' as const, url: open.url };

        const count = await db.get<{ n: string }>(`SELECT count(*) AS n FROM payment_sessions WHERE order_id = $1`, [orderId]);
        const session = await provider.createCheckout({
          orderId,
          amountCents: order.totalCents,
          description: `${order.eventName}: order ${order.orderNumber}`,
          customerEmail: order.rider.email || order.rider.guardian?.email || null,
          successUrl: `${appUrl}/?checkout=returned#/orders/${orderId}`,
          cancelUrl: `${appUrl}/#/register/${order.eventId}`,
          idempotencyKey: `checkout-${orderId}-${Number(count?.n ?? 0) + 1}`,
        });
        await db.run(
          `INSERT INTO payment_sessions (id, order_id, provider, url, amount_cents, status, expires_at, created_at) VALUES ($1, $2, $3, $4, $5, 'open', $6, $7) ON CONFLICT (id) DO NOTHING`,
          [session.id, orderId, provider.mode, session.url, order.totalCents, session.expiresAt, nowIso()],
        );
        return { kind: 'redirect' as const, url: session.url };
      });
    },

    /**
     * Handles one signed provider notification exactly once by event ID. Only sessions this app
     * opened can fulfill an order, and only for the exact amount the order was priced at.
     * Returns what the event did (also stored in provider_events).
     */
    async handleWebhook(rawBody: string, signature: string | undefined): Promise<{ result: string; duplicate: boolean }> {
      const ev = provider.parseWebhook(rawBody, signature);
      return db.transaction(async () => {
        await db.lock(`provider-event:${ev.id}`);
        const seen = await db.get<{ result: string }>(`SELECT result FROM provider_events WHERE id = $1`, [ev.id]);
        if (seen) return { result: seen.result, duplicate: true };

        const session = ev.sessionId ? await db.get<SessionRow>(`SELECT * FROM payment_sessions WHERE id = $1`, [ev.sessionId]) : undefined;
        const orderId = session?.order_id ?? null;
        let result: string;

        if (ev.outcome === 'ignored') {
          result = 'ignored';
        } else if (!session || (ev.orderId && ev.orderId !== session.order_id)) {
          result = 'unknown_session';
        } else if (ev.outcome === 'expired') {
          await db.run(`UPDATE payment_sessions SET status = 'expired' WHERE id = $1 AND status = 'open'`, [session.id]);
          result = 'session_expired';
        } else if (ev.outcome === 'pending') {
          await db.run(`UPDATE payment_sessions SET status = 'completed' WHERE id = $1`, [session.id]);
          result = 'awaiting_payment';
        } else {
          await db.run(`UPDATE payment_sessions SET status = 'completed' WHERE id = $1`, [session.id]);
          const source = { provider: provider.mode, ref: ev.paymentRef, amountCents: ev.amountCents };
          if (ev.outcome === 'failed') {
            result = (await orders.pay(session.order_id, ev.id, 'failure', source)).status;
          } else {
            // A second paid session for the same order is money taken twice: record it for a refund, never a second entry.
            const otherPaid = await db.get<{ id: string }>(
              `SELECT id FROM provider_events WHERE order_id = $1 AND outcome = 'paid' AND session_id <> $2 LIMIT 1`,
              [session.order_id, session.id],
            );
            const order = await orders.getOrder(session.order_id);
            const exact = ev.currency === 'usd' && ev.amountCents === session.amount_cents && ev.amountCents === order.totalCents;
            if (otherPaid) result = 'duplicate_charge';
            else result = (await orders.pay(session.order_id, ev.id, exact ? 'success' : 'mismatch', source)).status;
          }
        }

        await db.run(
          `INSERT INTO provider_events (id, provider, type, session_id, order_id, outcome, result, received_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [ev.id, provider.mode, ev.type, ev.sessionId, orderId, ev.outcome, result, nowIso()],
        );
        return { result, duplicate: false };
      });
    },
  };
}

export type Payments = ReturnType<typeof createPayments>;
