import { useEffect, useId, useRef, useState } from 'react';
import { z } from 'zod';
import { CANCELLATION_NOT_EXECUTED, cancellationExecutionSchema, type CancellationConfirmation, type CancellationExecution, type CancellationExecutionInput, type CancellationFinancialPreflight, type CancellationExecutionCheck } from '../../shared/cancellations';
import { newId } from '../../shared/factory';
import { formatDollars } from '../../shared/format';
import { api, type ApiError } from '../api';
import { formatDateTime } from '../format';
import { useLoad } from '../useLoad';
import { HistoricalScope } from './CancellationScope';

const count = (n: number, singular: string, plural = `${singular}s`) => `${n} ${n === 1 ? singular : plural}`;
const safeId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const recoverySchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('pending'), request: cancellationExecutionSchema.extend({ confirmationId: safeId }) }).strict(),
  z.object({ state: z.literal('recorded'), id: safeId, confirmationId: safeId }).strict(),
]);
type Recovery = z.infer<typeof recoverySchema>;
const blockers: Record<CancellationFinancialPreflight['blockers'][number]['code'], string> = {
  plan_changed: 'The impact changed. Record a fresh reviewed plan.', impact_unreviewable: 'Current event impact needs review.',
  unsettled_order: 'An order or hold is unsettled.', unsupported_policy: 'The accepted policy does not support automatic simulated cash return.',
  allocation_review: 'An accepted allocation needs review.', payment_reconciliation: 'Reconcile the payment before execution.',
  provider_payment: 'Provider payment activity requires separate reconciliation.', refund_history: 'Reconcile earlier refund history before execution.',
};
type Props = { eventId: string; accountId: string; plan: CancellationConfirmation | null; refreshKey: unknown; resetEpoch: number; onPendingChange: (pending: boolean) => void; onSaved: () => void };

/** Reads may recover saved evidence; only an explicit acknowledged action sends an execution request. */
export function CancellationExecutionControls({ eventId, accountId, plan, refreshKey, resetEpoch, onPendingChange, onSaved }: Props) {
  const storageKey = `cyclereg.cancellation-execution.${accountId}.${eventId}`;
  const [initial] = useState(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) return { value: null, warning: '', blocked: false };
      const parsed = recoverySchema.safeParse(JSON.parse(raw));
      return parsed.success ? { value: parsed.data, warning: '', blocked: false } : { value: null, warning: 'Saved execution recovery data is unreadable. Manual review is required before another execution.', blocked: true };
    } catch (e) {
      return e instanceof SyntaxError ? { value: null, warning: 'Saved execution recovery data is unreadable. Manual review is required before another execution.', blocked: true }
        : { value: null, warning: 'Browser storage is unavailable. Keep this page open until the execution result is resolved; refresh recovery is unavailable.', blocked: false };
    }
  });
  const [stored, setStored] = useState<Recovery | null>(initial.value);
  const storedRef = useRef(stored);
  const [warning, setWarning] = useState(initial.warning);
  const [record, setRecord] = useState<CancellationExecution | null>(null);
  const [checked, setChecked] = useState<CancellationExecutionCheck | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [validation, setValidation] = useState(false);
  const acknowledgementId = useId();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const generation = useRef(0);
  const [reload, setReload] = useState(0);
  const lookupBusy = useRef(false);
  const alive = useRef(true);
  const lastReset = useRef(resetEpoch);
  const recoveryRef = useRef<HTMLDivElement>(null);
  const outcomeRef = useRef<HTMLDivElement>(null);
  const planId = stored?.state === 'pending' ? stored.request.confirmationId : stored?.state === 'recorded' ? stored.confirmationId : plan?.id ?? null;
  const { data: fetchedPlan, error: planError } = useLoad(() => !planId ? Promise.resolve(null) : plan?.id === planId ? Promise.resolve(plan) : api.cancellationConfirmation(eventId, planId), [eventId, planId]);
  const displayedPlan = plan?.id === planId ? plan : fetchedPlan?.id === planId ? fetchedPlan : null;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { onPendingChange(initial.blocked || stored?.state === 'pending'); return () => onPendingChange(false); }, [stored?.state, onPendingChange, initial.blocked]);
  useEffect(() => { if (stored?.state === 'pending') recoveryRef.current?.focus(); }, [stored?.state]);
  useEffect(() => { if (record) outcomeRef.current?.focus(); }, [record]);
  const remember = (next: Recovery | null) => {
    storedRef.current = next; setStored(next); onPendingChange(initial.blocked || next?.state === 'pending');
    try { if (next) sessionStorage.setItem(storageKey, JSON.stringify(next)); else sessionStorage.removeItem(storageKey); }
    catch { setWarning('Browser storage could not be updated. Keep this page open until the original execution result is resolved; refresh recovery may be unavailable.'); }
  };
  const invalidateCheck = () => { generation.current++; busyRef.current = false; setBusy(false); setChecked(null); setAcknowledged(false); setValidation(false); };
  useEffect(() => {
    if (lastReset.current === resetEpoch) return;
    lastReset.current = resetEpoch;
    if (storedRef.current?.state === 'pending' || initial.blocked) return;
    invalidateCheck(); remember(null); setRecord(null); setError(null);
  }, [resetEpoch]);
  useEffect(() => { if (!storedRef.current) invalidateCheck(); }, [refreshKey, plan?.id]);
  const accept = (data: CancellationExecution, expectedPlan: string) => {
    if (data.eventId !== eventId || data.confirmationId !== expectedPlan) throw new Error('The execution record does not match the original plan. Manual review is required.');
    setRecord(data); remember({ state: 'recorded', id: data.id, confirmationId: data.confirmationId }); setError(null); onSaved();
  };
  const recordId = stored?.state === 'recorded' ? stored.id : null;
  useEffect(() => {
    if (!recordId || record?.id === recordId || !planId) return;
    let current = true; lookupBusy.current = true; setError(null);
    api.cancellationExecution(eventId, recordId).then((data) => { if (current) { lookupBusy.current = false; accept(data, planId); } })
      .catch((e: Error) => { if (current) { lookupBusy.current = false; setError(`Saved execution evidence could not be loaded. ${e.message}`); } });
    return () => { current = false; };
  }, [eventId, recordId, record?.id, planId, reload]);
  const check = async () => {
    if (!planId || busyRef.current || initial.blocked) return;
    const request = ++generation.current;
    busyRef.current = true; setBusy(true); setChecked(null); setAcknowledged(false); setValidation(false); setError(null);
    try {
      const existing = await api.checkCancellationExecution(eventId, planId);
      if (!alive.current || generation.current !== request) return;
      if (existing.execution) { accept(existing.execution, planId); return; }
      if (storedRef.current?.state === 'pending') { setError('No saved result is visible yet. The original request may still be running. Retry only the original execution request.'); return; }
      if (alive.current) setChecked(existing);
    } catch (e) { if (alive.current && generation.current === request) setError((e as Error).message); }
    finally { if (alive.current && generation.current === request) { busyRef.current = false; setBusy(false); } }
  };
  const send = async (request: CancellationExecutionInput) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(null);
    try {
      const result = await api.executeCancellation(eventId, request);
      if (alive.current) accept(result, request.confirmationId);
    } catch (e) {
      if (!alive.current) return;
      const failure = e as ApiError;
      if (z.object({ code: z.literal(CANCELLATION_NOT_EXECUTED) }).safeParse(failure.details).success) {
        remember(null); setChecked(null); setAcknowledged(false);
        setError(`This execution request did not run. ${failure.message} Check eligibility again or record a fresh reviewed plan.`);
      } else setError(`The original execution result is unresolved. ${failure.message} Retry only the original request or check its saved result.`);
    } finally { if (alive.current) { busyRef.current = false; setBusy(false); } }
  };
  const eligible = checked?.confirmationId === planId && checked.eligible;
  const submit = () => {
    if (!eligible || !planId || storedRef.current || busyRef.current || initial.blocked) return;
    const parsed = cancellationExecutionSchema.safeParse({ clientRequestId: newId('cancel-request'), confirmationId: planId, acknowledgeSimulatedCancellation: acknowledged });
    if (!parsed.success) { setValidation(true); document.getElementById(acknowledgementId)?.focus(); return; }
    remember({ state: 'pending', request: parsed.data }); void send(parsed.data);
  };
  if (!planId && !initial.blocked) return null;
  return <section className="plan-confirmation" aria-label="Simulated cancellation execution">
    <h4>Execute a simulated cancellation</h4>
    {warning && <p className="note" role={initial.blocked ? 'alert' : undefined}>{warning}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {displayedPlan ? <><HistoricalScope eventId={eventId} selection={displayedPlan.selection} version={displayedPlan.preview.currentPublishedVersion} /><p>Plan reason: {displayedPlan.reason}</p></> : planId && <p>Original plan reference: {planId}.{planError && ` Scope details could not be loaded: ${planError}`}</p>}
    {initial.blocked ? null : stored?.state === 'pending' ? <div ref={recoveryRef} tabIndex={-1} className="correction" aria-label="Resolve original execution request">
      <p role="status" aria-label="Execution status">{busy ? 'Resolving the original execution request…' : 'The original execution result needs resolution.'}</p>
      <p>It may already have completed. Its original plan and execution acknowledgement are kept for retry. Do not start another execution.</p>
      <button type="button" className="btn btn--secondary" aria-disabled={busy} onClick={() => void send(stored.request)}>Retry original execution request</button>
      <button type="button" className="btn btn--secondary" aria-disabled={busy} onClick={() => void check()}>Check saved execution result</button>
    </div> : stored?.state === 'recorded' ? record ? <div ref={outcomeRef} tabIndex={-1} className="correction" aria-label="Saved execution evidence">
      <p role="status" aria-label="Execution status"><strong>Simulated cancellation recorded.</strong></p>
      <p>{count(record.cancelledEntryIds.length, 'entry', 'entries')} cancelled; {count(record.removedWaitlistIds.length, 'waitlist record')} removed; {formatDollars(record.refunds.reduce((sum, r) => sum + r.amountCents, 0))} in simulated refunds.</p>
      <p>Recorded {formatDateTime(record.executedAt)} by {record.executedBy === accountId ? 'you' : 'another account'}. No real money moved and no messages were sent. Historical exports cannot be recalled.</p>
      <details><summary>Execution audit reference</summary><p>{record.id} · account {record.executedBy}</p></details>
      <button type="button" className="btn btn--secondary" onClick={onSaved}>Refresh registrations</button>
    </div> : <><p>{error ? 'Keep the saved reference for another lookup. Reviewing another plan clears only this tab’s completed reference; the server record remains.' : 'Loading saved execution evidence…'}</p><p className="small">Execution reference: {recordId}</p><button type="button" className="btn btn--secondary" aria-disabled={!error} onClick={() => { if (!error || lookupBusy.current) return; lookupBusy.current = true; setReload((n) => n + 1); }}>Retry execution evidence lookup</button></> : <>
      <p>Only simulated cash cancellation is supported. Execution closes the reviewed scope to new entries. It does not send messages or move real money.</p>
      <button type="button" className="btn btn--secondary" aria-disabled={busy} onClick={() => void check()}>{busy ? 'Checking execution eligibility…' : 'Check execution eligibility'}</button>
      {checked?.confirmationId === planId && <div className="correction" aria-label="Execution eligibility">
        <p>Assessed {formatDateTime(checked.assessedAt)}. This is a point-in-time check; the server checks again on execution.</p>
        {checked.reason && <p className="note">{checked.reason}</p>}
        {(checked.financial?.blockers.length ?? 0) > 0 && <ul>{checked.financial!.blockers.map((b, i) => <li key={i}>{blockers[b.code]}{b.orderId && <span className="small"> Order reference: {b.orderId}</span>}</li>)}</ul>}
        {eligible && displayedPlan && <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <p>{count(displayedPlan.preview.entries.length, 'active entry', 'active entries')} will be cancelled and {count(displayedPlan.preview.waitlist.length, 'active waitlist record')} removed. Simulated cash refunds: {formatDollars(checked.financial!.simulatedCashCents!)}. Whole-order fees are excluded; unaffected package entries keep their accepted prices.</p>
          <label className="check"><input id={acknowledgementId} type="checkbox" checked={acknowledged} aria-invalid={validation} aria-describedby={validation ? `${acknowledgementId}-error` : undefined} onChange={(e) => { setAcknowledged(e.target.checked); setValidation(false); }} />I understand this cancels the reviewed scope, closes it to new entries and records simulated refunds. No real money moves and no messages are sent.</label>
          {validation && <p id={`${acknowledgementId}-error`} className="error">Acknowledge the simulated cancellation before executing.</p>}
          <button type="submit" className="btn btn--secondary btn--danger">Execute simulated cancellation</button>
        </form>}
      </div>}
    </>}
  </section>;
}
