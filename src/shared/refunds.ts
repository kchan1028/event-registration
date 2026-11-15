import { z } from 'zod';

/**
 * Refunds (product.md "Money and reporting": partial refunds against specific entries).
 * A refund returns money from one payment. It may name one entry, capped at what that entry
 * cost; without an entry it is capped by what is left of the payment (fees, a payment that
 * confirmed no place, or a duplicate charge). A refund never withdraws an entry.
 */

export type RefundStatus = 'requested' | 'pending' | 'succeeded' | 'failed' | 'canceled';

/** Statuses that hold money against the cap: asked for, on its way, or done. */
export const ACTIVE_REFUND_STATUSES: readonly RefundStatus[] = ['requested', 'pending', 'succeeded'];

export const REFUND_STATUS_LABEL: Record<RefundStatus, string> = {
  requested: 'Requested, not yet confirmed by Stripe',
  pending: 'On its way',
  succeeded: 'Refunded',
  failed: 'Failed',
  canceled: 'Canceled',
};

export const refundRequestSchema = z.object({
  /** The payment to refund. Null means the payment that confirmed (or tried to confirm) the order. */
  paymentRef: z.string().min(1).max(128).nullable().default(null),
  entryId: z.string().min(1).max(64).nullable().default(null),
  amountCents: z.number().int().positive('Enter an amount above zero.').max(10_000_000),
  reason: z.string().trim().min(3, 'Write why the money is being refunded.').max(300),
});
export type RefundRequest = z.infer<typeof refundRequestSchema>;

/**
 * Whether a refund may move from one status to another. Stripe can report events out of order,
 * so a final status is never undone by a late "pending", but a refund that succeeded can still
 * fail afterwards (some payment methods do).
 */
export function refundCanMove(from: RefundStatus, to: RefundStatus): boolean {
  if (from === to) return false;
  if (from === 'requested' || from === 'pending') return true;
  return from === 'succeeded' && to === 'failed';
}

/** What is left to refund once the active refunds are taken off. Never negative. */
export function refundableCents(paidCents: number, refunds: readonly { amountCents: number; status: RefundStatus }[]): number {
  const held = refunds.filter((r) => ACTIVE_REFUND_STATUSES.includes(r.status)).reduce((sum, r) => sum + r.amountCents, 0);
  return Math.max(0, paidCents - held);
}
