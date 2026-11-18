import { newId } from '../shared/factory';
import { CANCELLATION_NOT_EXECUTED, cancellationScopesOverlap, type CancellationConfirmation, type CancellationFinancialPreflight, type CancellationExecution, type CancellationExecutionInput, type CancellationExecutionCheck } from '../shared/cancellations';
import type { createCancellationConfirmations } from './cancellationConfirmations';
import type { createCancellationFinancialPreflight } from './cancellationFinancialPreflight';
import { requireCancellationOpen } from './cancellationClosure';
import type { Db } from './db';
import type { createRefunds } from './refunds';
import { eventLock, HttpError, type Repo } from './repo';

type Prepared = { plan: CancellationConfirmation; execution: CancellationExecution | null; financial: CancellationFinancialPreflight | null; reason: string | null };

export function createCancellationExecution(db: Db, repo: Repo, confirmations: ReturnType<typeof createCancellationConfirmations>, preflight: ReturnType<typeof createCancellationFinancialPreflight>, refunds: ReturnType<typeof createRefunds>, simulated: boolean, clock: () => Date) {
  /** Caller holds the event lock; preflight retains sorted refund-request locks. No writes occur here. */
  async function prepare(eventId: string, confirmationId: string): Promise<Prepared> {
    const plan = await confirmations.get(eventId, confirmationId);
    const saved = await db.get<{ result_json: CancellationExecution }>('SELECT result_json FROM cancellation_executions WHERE event_id=$1 AND confirmation_id=$2', [eventId, confirmationId]);
    if (saved) return { plan, execution: saved.result_json, financial: null, reason: 'This plan was already executed. Recover its saved execution evidence.' };
    if (!simulated) return { plan, execution: null, financial: null, reason: 'Cancellation execution is available only with simulated payments.' };
    const financial = await preflight.assess(eventId, plan.id);
    const result: Prepared = { plan, execution: null, financial, reason: null };
    if (financial.status !== 'financially_eligible_for_simulation') return { ...result, reason: 'Cancellation is blocked. Review a fresh plan and reconcile its financial state.' };
    const { config } = await repo.getPublished(eventId);
    const previous = await db.all<{ selection_json: typeof plan.selection; race_ids: string[] }>('SELECT selection_json,race_ids FROM cancellation_executions WHERE event_id=$1', [eventId]);
    if (previous.some((p) => cancellationScopesOverlap({ selection: p.selection_json, raceIds: p.race_ids }, { selection: plan.selection, raceIds: plan.preview.raceIds }, config))) return { ...result, reason: 'This scope overlaps a previous cancellation. Review the remaining uncancelled races separately.' };
    try { await requireCancellationOpen(db, eventId, config, plan.preview.categoryIds); }
    catch (error) { if (error instanceof HttpError && error.status === 409) return { ...result, reason: error.message }; throw error; }
    if (await db.get('SELECT 1 FROM test_entries WHERE event_id=$1 AND category_id=ANY($2) LIMIT 1', [eventId, plan.preview.categoryIds])) return { ...result, reason: 'Remove the selected test entries before executing cancellation.' };
    return result;
  }
  return {
    async check(eventId: string, confirmationId: string): Promise<CancellationExecutionCheck> {
      return db.transaction(async () => {
        await db.lock(eventLock(eventId));
        const prepared = await prepare(eventId, confirmationId);
        return { eventId, confirmationId, assessedAt: clock().toISOString(), execution: prepared.execution, financial: prepared.financial, eligible: !prepared.reason && !!prepared.financial, reason: prepared.reason };
      });
    },
    async execute(eventId: string, actorId: string, input: CancellationExecutionInput): Promise<CancellationExecution> {
      return db.transaction(async () => {
        await db.lock(eventLock(eventId));
        const prior = await db.get<{ request_json: CancellationExecutionInput; result_json: CancellationExecution }>('SELECT request_json,result_json FROM cancellation_executions WHERE event_id=$1 AND client_request_id=$2', [eventId, input.clientRequestId]);
        if (prior) {
          if (prior.request_json.confirmationId !== input.confirmationId) throw new HttpError(409, 'This cancellation request was used for a different plan. Recover the original request.');
          return prior.result_json;
        }
        let prepared: Prepared;
        try {
          prepared = await prepare(eventId, input.confirmationId);
          if (prepared.reason || !prepared.financial) throw new HttpError(409, prepared.reason ?? 'Financial reconciliation is required.', { blockers: prepared.financial?.blockers ?? [] });
        } catch (error) {
          // Only known read-only preconditions after a negative identity lookup prove this request did not execute.
          if (error instanceof HttpError && [404, 409, 422].includes(error.status)) {
            const details = error.details && typeof error.details === 'object' && !Array.isArray(error.details) ? error.details : {};
            throw new HttpError(error.status, error.message, { ...details, code: CANCELLATION_NOT_EXECUTED });
          }
          throw error;
        }
        const { plan, financial: assessment } = prepared;
        const preview = plan.preview;
        const now = clock().toISOString();
        const result: CancellationExecution = { id: newId('cancel'), eventId, confirmationId: plan.id, executedBy: actorId, executedAt: now, status: 'simulated_cancellation_executed', selection: plan.selection, cancelledEntryIds: preview.entries.map((e) => e.id), removedWaitlistIds: preview.waitlist.map((w) => w.id), refunds: [], communicationAudience: preview.communicationAudience, startListSnapshotIds: preview.startListSnapshots.map((s) => s.id) };
        // Reuse refund caps and request identity; simulation cannot call the provider or move money.
        for (const entry of assessment!.entries) {
          if (!entry.nominalCashCents) continue;
          const returned = await refunds.request(entry.orderId, { clientRequestId: `${result.id}:${entry.entryId}`, entryId: entry.entryId, paymentRef: null, amountCents: entry.nominalCashCents, reason: `Organizer cancellation ${result.id}` }, actorId);
          result.refunds.push({ entryId: entry.entryId, refundId: returned.refundId, amountCents: entry.nominalCashCents });
        }
        await db.run("UPDATE order_entries SET status='cancelled',cancelled_at=$1 WHERE event_id=$2 AND id=ANY($3)", [now, eventId, result.cancelledEntryIds]);
        await db.run("UPDATE waitlist_entries SET status='removed',updated_at=$1 WHERE event_id=$2 AND id=ANY($3)", [now, eventId, result.removedWaitlistIds]);
        await db.run('INSERT INTO cancellation_executions(id,event_id,confirmation_id,client_request_id,request_json,executed_by,executed_at,selection_json,race_ids,category_ids,result_json) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [result.id, eventId, plan.id, input.clientRequestId, JSON.stringify(input), actorId, now, JSON.stringify(plan.selection), JSON.stringify(preview.raceIds), JSON.stringify(preview.categoryIds), JSON.stringify(result)]);
        return result;
      });
    },
    async get(eventId: string, executionId: string): Promise<CancellationExecution> {
      const row = await db.get<{ result_json: CancellationExecution }>('SELECT result_json FROM cancellation_executions WHERE event_id=$1 AND id=$2', [eventId, executionId]);
      if (!row) throw new HttpError(404, 'Cancellation execution not found.');
      return row.result_json;
    },
  };
}
