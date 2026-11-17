import { newId } from '../shared/factory';
import { formatCents } from '../shared/format';
import type { Quote } from '../shared/pricing';
import { refundableCents, refundCanMove, refundRequestSchema, type RefundStatus, type RefundRequest, type RefundRequestResult } from '../shared/refunds';
import type { Db } from './db';
import { paidLine } from './orders';
import type { PaymentProvider, ProviderEvent, ProviderRefund } from './payments';
import { HttpError } from './repo';

/**
 * Refunds (ADR 0002, Phase 2). Simulated payments refund at once with no money moved. Stripe
 * test-mode payments are refunded through Stripe: the refund row is saved first (reserving the
 * amount), then Stripe is called with the refund ID as idempotency key, so a retry after a
 * timeout reuses the same provider operation within the guarded retry window. Stripe's refund
 * events then move the status on.
 */

// Stripe API v1 keys are retained at least 24 hours. Stop an hour early so SDK/network
// retries cannot start close to that boundary; unresolved money then needs reconciliation.
const REFUND_RETRY_HOURS = 23;

interface RefundRow {
  id: string;
  request_json: RefundRequest | null;
  order_id: string;
  entry_id: string | null;
  provider: 'simulated' | 'stripe_test';
  payment_ref: string | null;
  amount_cents: number;
  reason: string;
  status: RefundStatus;
  provider_refund_id: string | null;
  failure_reason: string | null;
  created_at: string;
  requested_by_email?: string | null;
}

interface RefundablePayment {
  /** Stripe PaymentIntent ID; null for a simulated payment. */
  ref: string | null;
  provider: 'simulated' | 'stripe_test';
  /** order: the payment that confirmed the order, or reached it too late. duplicate: a second charge for the same order. */
  kind: 'order' | 'duplicate';
  amountCents: number;
  refundedCents: number;
  remainingCents: number;
}

export function createRefunds(db: Db, provider: PaymentProvider, clock: () => Date) {
  const nowIso = () => clock().toISOString();
  const rowsOf = (orderId: string) =>
    db.all<RefundRow>(
      `SELECT r.*, a.email AS requested_by_email FROM refunds r LEFT JOIN accounts a ON a.id = r.requested_by WHERE r.order_id = $1 ORDER BY r.created_at`,
      [orderId],
    );

  /** Every payment that brought money in for this order, with what is left to refund on each. */
  async function paymentsOf(orderId: string): Promise<RefundablePayment[]> {
    const order = await db.get<{ total_cents: number }>(`SELECT total_cents FROM orders WHERE id = $1`, [orderId]);
    if (!order) throw new HttpError(404, 'Order not found.');
    const attempts = await db.all<{ provider: RefundablePayment['provider']; provider_ref: string | null; amount_cents: number | null }>(
      `SELECT provider, provider_ref, amount_cents FROM payment_attempts
        WHERE order_id = $1 AND outcome IN ('success', 'mismatch') AND result_status IN ('confirmed', 'needs_attention') ORDER BY created_at`,
      [orderId],
    );
    const found: Omit<RefundablePayment, 'refundedCents' | 'remainingCents'>[] = [];
    for (const a of attempts) {
      // A repeated simulated notification is the same payment, not a second one.
      if (a.provider === 'simulated') {
        if (!found.some((p) => p.provider === 'simulated')) found.push({ ref: null, provider: 'simulated', kind: 'order', amountCents: order.total_cents });
      } else if (a.provider_ref && !found.some((p) => p.ref === a.provider_ref)) {
        found.push({ ref: a.provider_ref, provider: 'stripe_test', kind: 'order', amountCents: a.amount_cents ?? order.total_cents });
      }
    }
    const duplicates = await db.all<{ payment_ref: string; amount_cents: number | null }>(
      `SELECT payment_ref, amount_cents FROM provider_events WHERE order_id = $1 AND result = 'duplicate_charge' AND payment_ref IS NOT NULL ORDER BY received_at`,
      [orderId],
    );
    for (const d of duplicates) {
      if (!found.some((p) => p.ref === d.payment_ref)) found.push({ ref: d.payment_ref, provider: 'stripe_test', kind: 'duplicate', amountCents: d.amount_cents ?? 0 });
    }
    const refunds = await rowsOf(orderId);
    return found
      .filter((p) => p.amountCents > 0)
      .map((p) => {
        const own = refunds.filter((r) => r.payment_ref === p.ref && r.provider === p.provider).map((r) => ({ amountCents: r.amount_cents, status: r.status }));
        return {
          ...p,
          refundedCents: own.filter((r) => r.status === 'succeeded').reduce((s, r) => s + r.amountCents, 0),
          remainingCents: refundableCents(p.amountCents, own),
        };
      });
  }

  /** Records a status Stripe reported, unless it would undo a final one. Returns the status now stored. */
  async function apply(id: string, update: { providerId: string | null; status: RefundStatus; failureReason: string | null }): Promise<RefundStatus | null> {
    return db.transaction(async () => {
      await db.lock(`refund:${id}`);
      const cur = await db.get<{ status: RefundStatus }>(`SELECT status FROM refunds WHERE id = $1`, [id]);
      if (!cur) return null;
      const next = refundCanMove(cur.status, update.status) ? update.status : cur.status;
      await db.run(
        `UPDATE refunds SET status = $1, provider_refund_id = COALESCE(provider_refund_id, $2), failure_reason = COALESCE($3, failure_reason), updated_at = $4 WHERE id = $5`,
        [next, update.providerId, update.failureReason, nowIso(), id],
      );
      return next;
    });
  }

  /** Calls Stripe for a saved refund that Stripe has not confirmed yet. */
  async function send(id: string): Promise<void> {
    const r = await db.get<RefundRow>(`SELECT * FROM refunds WHERE id = $1`, [id]);
    if (!r || r.status !== 'requested' || !r.payment_ref) return;
    if (clock().getTime() - new Date(r.created_at).getTime() >= REFUND_RETRY_HOURS * 60 * 60 * 1000) {
      const message = `Refund retry window ended after ${REFUND_RETRY_HOURS} hours. Finance must reconcile this request with Stripe before any further reimbursement; do not create a replacement refund.`;
      await db.run(`UPDATE refunds SET failure_reason = $1, updated_at = $2 WHERE id = $3 AND status = 'requested'`, [message, nowIso(), id]);
      throw new HttpError(409, message);
    }
    let result: ProviderRefund;
    try {
      result = await provider.refund({ paymentRef: r.payment_ref, amountCents: r.amount_cents, refundId: r.id, orderId: r.order_id });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      const message = (err as Error).message?.slice(0, 300) || 'No answer from Stripe.';
      // Stripe refused the request itself (for example, the payment was already refunded in the Dashboard):
      // retrying cannot help, so the refund fails and its amount is freed. Timeouts and Stripe errors stay requested.
      if (status && status >= 400 && status < 500 && status !== 409 && status !== 429) {
        await apply(id, { providerId: null, status: 'failed', failureReason: message });
        throw new HttpError(409, `Stripe refused the refund: ${message}`);
      }
      await db.run(`UPDATE refunds SET failure_reason = $1, updated_at = $2 WHERE id = $3`, [message, nowIso(), id]);
      throw new HttpError(502, 'Stripe did not confirm the refund. It is saved as requested; try again.');
    }
    await apply(id, result);
  }

  return {
    /** Payments and refunds for the organizer's refund panel, with who asked for each refund. */
    async list(orderId: string) {
      const payments = await paymentsOf(orderId);
      const refunds = (await rowsOf(orderId)).map((r) => ({
        id: r.id,
        clientRequestId: r.request_json?.clientRequestId ?? null,
        entryId: r.entry_id,
        paymentRef: r.payment_ref,
        provider: r.provider,
        amountCents: r.amount_cents,
        reason: r.reason,
        status: r.status,
        failureReason: r.failure_reason,
        requestedBy: r.requested_by_email ?? null,
        createdAt: r.created_at,
      }));
      return { payments, refunds };
    },

    /** Saves a refund within its caps, then sends it to Stripe (or completes it, for a simulated payment). */
    async request(orderId: string, body: unknown, accountId: string): Promise<RefundRequestResult> {
      const input = refundRequestSchema.parse(body);
      const id = await db.transaction(async () => {
        await db.lock(`refunds:${orderId}`);
        const prior = await db.get<{ id: string; same_request: boolean }>(
          `SELECT id, request_json = $3::jsonb AS same_request FROM refunds WHERE order_id = $1 AND request_json->>'clientRequestId' = $2`,
          [orderId, input.clientRequestId, JSON.stringify(input)],
        );
        if (prior) {
          if (!prior.same_request) throw new HttpError(409, 'This refund request was already used with different details. Recover the original request before starting another.');
          return prior.id;
        }
        const order = await db.get<{ status: string; quote_json: Quote }>(`SELECT status, quote_json FROM orders WHERE id = $1`, [orderId]);
        if (!order) throw new HttpError(404, 'Order not found.');
        const payments = await paymentsOf(orderId);
        if (payments.length === 0) throw new HttpError(409, 'No payment has arrived for this order, so there is nothing to refund.');
        const pay = input.paymentRef === null ? (payments.find((p) => p.kind === 'order') ?? payments[0]) : payments.find((p) => p.ref === input.paymentRef);
        if (!pay) throw new HttpError(404, 'That payment is not part of this order.');
        if (pay.provider === 'stripe_test' && provider.mode !== 'stripe_test') throw new HttpError(409, 'This payment was taken through Stripe, which is not connected to this build.');
        if (input.amountCents > pay.remainingCents) throw new HttpError(409, `At most ${formatCents(pay.remainingCents)} of this payment can still be refunded.`);

        if (input.entryId) {
          if (pay.kind !== 'order' || order.status !== 'confirmed') throw new HttpError(409, 'Only the payment that confirmed this order can be refunded entry by entry.');
          const entry = await db.get<{ category_id: string; original_category_id: string | null }>(`SELECT category_id, original_category_id FROM order_entries WHERE id = $1 AND order_id = $2`, [input.entryId, orderId]);
          if (!entry) throw new HttpError(404, 'That entry is not part of this order.');
          const paid = paidLine(order.quote_json, entry)?.totalCents ?? 0;
          const used = await db.all<{ amount_cents: number; status: RefundStatus }>(`SELECT amount_cents, status FROM refunds WHERE entry_id = $1`, [input.entryId]);
          const left = refundableCents(paid, used.map((u) => ({ amountCents: u.amount_cents, status: u.status })));
          if (input.amountCents > left) throw new HttpError(409, `At most ${formatCents(left)} of this entry can still be refunded.`);
        }

        const refundId = newId('ref');
        const t = nowIso();
        await db.run(
          `INSERT INTO refunds (id, order_id, entry_id, provider, payment_ref, amount_cents, reason, status, requested_by, created_at, updated_at, request_json) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $11)`,
          [refundId, orderId, input.entryId, pay.provider, pay.ref, input.amountCents, input.reason, pay.provider === 'simulated' ? 'succeeded' : 'requested', accountId, t, JSON.stringify(input)],
        );
        return refundId;
      });
      await send(id);
      return { refundId: id };
    },

    /** Sends a requested refund to Stripe again, with the same idempotency key. */
    async retry(refundId: string): Promise<void> {
      const r = await db.get<{ status: RefundStatus }>(`SELECT status FROM refunds WHERE id = $1`, [refundId]);
      if (!r) throw new HttpError(404, 'Refund not found.');
      if (r.status !== 'requested') throw new HttpError(409, 'Only a refund Stripe has not confirmed yet can be sent again.');
      await send(refundId);
    },

    /** The order a refund belongs to (for permission checks). */
    async orderOf(refundId: string): Promise<string> {
      const r = await db.get<{ order_id: string }>(`SELECT order_id FROM refunds WHERE id = $1`, [refundId]);
      if (!r) throw new HttpError(404, 'Refund not found.');
      return r.order_id;
    },

    /** Applies a verified Stripe refund event. Refunds made outside CycleReg are recorded as unknown. */
    async onRefundEvent(ev: ProviderEvent & { refund: ProviderRefund }): Promise<{ result: string; orderId: string | null }> {
      const row =
        (await db.get<{ id: string; order_id: string }>(`SELECT id, order_id FROM refunds WHERE provider_refund_id = $1`, [ev.refund.providerId])) ??
        (ev.refund.refundId ? await db.get<{ id: string; order_id: string }>(`SELECT id, order_id FROM refunds WHERE id = $1`, [ev.refund.refundId]) : undefined);
      if (!row) return { result: 'unknown_refund', orderId: null };
      const status = await apply(row.id, ev.refund);
      return { result: `refund_${status}`, orderId: row.order_id };
    },
  };
}

export type Refunds = ReturnType<typeof createRefunds>;
