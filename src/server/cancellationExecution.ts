import { newId } from '../shared/factory';
import { cancellationScopesOverlap, type CancellationExecution, type CancellationExecutionInput } from '../shared/cancellations';
import type { createCancellationConfirmations } from './cancellationConfirmations';
import type { createCancellationFinancialPreflight } from './cancellationFinancialPreflight';
import { requireCancellationOpen } from './cancellationClosure';
import type { Db } from './db';
import type { createRefunds } from './refunds';
import { eventLock, HttpError, type Repo } from './repo';

export function createCancellationExecution(db: Db, repo: Repo, confirmations: ReturnType<typeof createCancellationConfirmations>, preflight: ReturnType<typeof createCancellationFinancialPreflight>, refunds: ReturnType<typeof createRefunds>, simulated: boolean, clock: () => Date) {
  return {
    async execute(eventId: string, actorId: string, input: CancellationExecutionInput): Promise<CancellationExecution> {
      return db.transaction(async () => {
        await db.lock(eventLock(eventId));
        const prior = await db.get<{ request_json: CancellationExecutionInput; result_json: CancellationExecution }>('SELECT request_json,result_json FROM cancellation_executions WHERE event_id=$1 AND client_request_id=$2', [eventId, input.clientRequestId]);
        if (prior) {
          if (prior.request_json.confirmationId !== input.confirmationId) throw new HttpError(409, 'This cancellation request was used for a different plan. Recover the original request.');
          return prior.result_json;
        }
        if (!simulated) throw new HttpError(409, 'Cancellation execution is available only with simulated payments.');
        const plan = await confirmations.get(eventId, input.confirmationId);
        if (await db.get('SELECT 1 FROM cancellation_executions WHERE confirmation_id=$1', [plan.id])) throw new HttpError(409, 'This plan was already executed. Recover its original cancellation request.');
        const assessment = await preflight.assess(eventId, plan.id);
        if (assessment.status !== 'financially_eligible_for_simulation') throw new HttpError(409, 'Cancellation is blocked. Review a fresh plan and reconcile its financial state.', { blockers: assessment.blockers });
        const preview = plan.preview;
        const { config } = await repo.getPublished(eventId);
        const previous = await db.all<{ selection_json: typeof plan.selection; race_ids: string[] }>('SELECT selection_json,race_ids FROM cancellation_executions WHERE event_id=$1', [eventId]);
        if (previous.some((p) => cancellationScopesOverlap({ selection: p.selection_json, raceIds: p.race_ids }, { selection: plan.selection, raceIds: preview.raceIds }, config))) throw new HttpError(409, 'This scope overlaps a previous cancellation. Review the remaining uncancelled races separately.');
        await requireCancellationOpen(db, eventId, config, preview.categoryIds);
        if (await db.get('SELECT 1 FROM test_entries WHERE event_id=$1 AND category_id=ANY($2) LIMIT 1', [eventId, preview.categoryIds])) throw new HttpError(409, 'Remove the selected test entries before executing cancellation.');
        const now = clock().toISOString();
        const result: CancellationExecution = { id: newId('cancel'), eventId, confirmationId: plan.id, executedBy: actorId, executedAt: now, status: 'simulated_cancellation_executed', selection: plan.selection, cancelledEntryIds: preview.entries.map((e) => e.id), removedWaitlistIds: preview.waitlist.map((w) => w.id), refunds: [], communicationAudience: preview.communicationAudience, startListSnapshotIds: preview.startListSnapshots.map((s) => s.id) };
        // Reuse refund caps and request identity; simulation cannot call the provider or move money.
        for (const entry of assessment.entries) {
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
