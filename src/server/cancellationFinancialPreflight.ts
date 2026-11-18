import type { CancellationFinancialPreflight } from '../shared/cancellations';
import type { createCancellationConfirmations } from './cancellationConfirmations';
import type { Db } from './db';
import { eventLock, HttpError } from './repo';

/** A standalone result authorizes nothing; the executor must obtain fresh checks inside its transaction. */
export function createCancellationFinancialPreflight(db: Db, confirmations: ReturnType<typeof createCancellationConfirmations>, clock: () => Date) {
  return {
    async assess(eventId: string, confirmationId: string): Promise<CancellationFinancialPreflight> {
      return db.transaction(async () => {
        await db.lock(eventLock(eventId));
        const plan = await confirmations.get(eventId, confirmationId);
        const blockers: CancellationFinancialPreflight['blockers'] = [];
        const result: CancellationFinancialPreflight = { confirmationId, eventId, assessedAt: clock().toISOString(), status: 'blocked', executionAvailable: false, blockers, entries: [], simulatedCashCents: null };
        let current;
        try { current = await confirmations.preview(eventId, plan.selection); }
        catch (error) {
          if (!(error instanceof HttpError) || ![404, 409, 422].includes(error.status)) throw error;
          blockers.push({ code: 'impact_unreviewable' }); return result;
        }
        if (current.fingerprint !== plan.previewFingerprint) blockers.push({ code: 'plan_changed' });
        const orderIds = [...new Set(current.preview.entries.map((e) => e.orderId))].sort();
        // Refund requests use these locks, not the event lock. Keep a stable order across an event.
        for (const id of orderIds) await db.lock(`refunds:${id}`);
        for (const entry of current.preview.financial.entries) {
          const cash = entry.policy?.returnAs === 'cash' ? entry.policy.amountCents : null;
          result.entries.push({ entryId: entry.entryId, orderId: entry.orderId, acceptedEntryCents: entry.acceptedEntryCents, nominalCashCents: cash });
          if (cash === null) blockers.push({ code: 'unsupported_policy', orderId: entry.orderId, entryId: entry.entryId });
          // Placement changes are an explicit review requirement, not permission to silently reinterpret a purchase.
          if (entry.reviewReasons.length) blockers.push({ code: 'allocation_review', orderId: entry.orderId, entryId: entry.entryId });
        }
        for (const orderId of orderIds) {
          const order = await db.get<{ status: string; total_cents: number }>('SELECT status,total_cents FROM orders WHERE id=$1 AND event_id=$2', [orderId, eventId]);
          if (!order || order.status !== 'confirmed' || current.preview.entries.some((e) => e.orderId === orderId && e.entryStatus !== 'confirmed')) blockers.push({ code: 'unsettled_order', orderId });
          const attempts = await db.all<{ provider: string; outcome: string; result_status: string; amount_cents: number | null; provider_ref: string | null }>('SELECT provider,outcome,result_status,amount_cents,provider_ref FROM payment_attempts WHERE order_id=$1', [orderId]);
          const providerEvidence = attempts.some((p) => p.provider !== 'simulated' || p.provider_ref !== null)
            || !!await db.get('SELECT 1 FROM payment_sessions WHERE order_id=$1 LIMIT 1', [orderId])
            || !!await db.get('SELECT 1 FROM provider_events WHERE order_id=$1 LIMIT 1', [orderId]);
          if (providerEvidence) blockers.push({ code: 'provider_payment', orderId });
          // Simulation records a null amount for the order total; repeated notifications are one payment.
          const settled = attempts.filter((p) => p.outcome === 'success' && p.result_status === 'confirmed');
          if (!order || !settled.length || settled.some((p) => p.amount_cents !== null && p.amount_cents !== order.total_cents)
            || attempts.some((p) => p.outcome === 'mismatch' || p.result_status === 'needs_attention')) blockers.push({ code: 'payment_reconciliation', orderId });
          // Failed refunds also need explicit reconciliation; this endpoint does not allocate prior returns.
          if (await db.get('SELECT 1 FROM refunds WHERE order_id=$1 LIMIT 1', [orderId])) blockers.push({ code: 'refund_history', orderId });
          const nominal = result.entries.filter((e) => e.orderId === orderId).reduce((sum, e) => sum + (e.nominalCashCents ?? 0), 0);
          if (order && nominal > order.total_cents && !blockers.some((b) => b.code === 'payment_reconciliation' && b.orderId === orderId)) blockers.push({ code: 'payment_reconciliation', orderId });
        }
        if (!blockers.length) { result.status = 'financially_eligible_for_simulation'; result.simulatedCashCents = result.entries.reduce((sum, e) => sum + e.nominalCashCents!, 0); }
        return result;
      });
    },
  };
}
