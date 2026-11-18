import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { z } from 'zod';
import { CANCELLATION_PLAN_NOT_RECORDED, cancellationConfirmationSchema, type CancellationConfirmation, type CancellationConfirmationInput, type CancellationConfirmationPreview } from '../../shared/cancellations';
import { newId } from '../../shared/factory';
import type { EventConfig } from '../../shared/schema';
import { api, type ApiError } from '../api';
import { useSession } from '../auth';
import { formatDateTime } from '../format';
import { Field } from '../ui';
import { HistoricalScope } from './CancellationScope';
import { CancellationExecutionControls } from './CancellationExecutionControls';
import { useLoad } from '../useLoad';

type Props = { eventId: string; prepared: { confirmation: CancellationConfirmationPreview; config: EventConfig } | null; onPendingChange: (pending: boolean) => void; onResetPreview: () => void; refreshKey: unknown; onExecutionSaved: () => void };
const recoverySchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('pending'), request: cancellationConfirmationSchema, previewVersion: z.number().int().positive() }).strict(),
  z.object({ state: z.literal('recorded'), id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) }).strict(),
]);
type Recovery = z.infer<typeof recoverySchema>;

/** Account identity comes from the server; recovery never sends a request automatically. */
export function PlanConfirmation(props: Props) {
  const session = useSession();
  return <section className="plan-confirmation" aria-label="Reviewed plan confirmation">
    <h4>Record a reviewed plan</h4>
    <ForSession key={`${props.eventId}:${session.email ?? ''}`} {...props} />
  </section>;
}

function ForSession(props: Props) {
  const { data, error, reload } = useLoad(() => api.currentAccount(), [props.eventId]);
  if (!data) return <>{error ? <><p className="error" role="alert">Could not verify the confirmation account: {error}</p><button type="button" className="btn btn--secondary" onClick={reload}>Retry account lookup</button></> : <p>Loading confirmation account…</p>}</>;
  return <ForAccount key={`${props.eventId}:${data.account.id}`} {...props} accountId={data.account.id} />;
}


function ForAccount({ eventId, accountId, prepared, onPendingChange, onResetPreview, refreshKey, onExecutionSaved }: Props & { accountId: string }) {
  const storageKey = `cyclereg.plan-confirmation.${accountId}.${eventId}`;
  const [initial] = useState(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) return { value: null, warning: '', blocked: false };
      const parsed = recoverySchema.safeParse(JSON.parse(raw));
      return parsed.success ? { value: parsed.data, warning: '', blocked: false } : { value: null, warning: 'Saved recovery data could not be read. Manual review of the earlier request is needed before recording another plan.', blocked: true };
    } catch (e) {
      if (e instanceof SyntaxError) return { value: null, warning: 'Saved recovery data could not be read. Manual review of the earlier request is needed before recording another plan.', blocked: true };
      return { value: null, warning: 'Browser storage is unavailable. Keep this page open until the original request is resolved; refresh recovery is not available.', blocked: false };
    }
  });
  const [executionPending, setExecutionPending] = useState(false);
  const executionPendingRef = useRef(false);
  const [executionReset, setExecutionReset] = useState(0);
  const executionPendingChanged = useCallback((value: boolean) => { executionPendingRef.current = value; setExecutionPending(value); }, []);
  const [stored, setStored] = useState<Recovery | null>(initial.value);
  const storedRef = useRef(stored);
  const [warning, setWarning] = useState(initial.warning);
  const [reason, setReason] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const lookupBusy = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<{ reason?: string; acknowledgement?: string }>({});
  const acknowledgementId = useId();
  const [record, setRecord] = useState<CancellationConfirmation | null>(null);
  const [reload, setReload] = useState(0);
  const alive = useRef(true);
  const recoveryRef = useRef<HTMLDivElement>(null);
  const outcomeRef = useRef<HTMLDivElement>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { onPendingChange(stored?.state === 'pending' || executionPending); return () => onPendingChange(false); }, [stored, executionPending, onPendingChange]);
  useEffect(() => {
    if (storedRef.current || !prepared) return;
    setReason(''); setAcknowledged(false); setError(null); setValidation({});
  }, [prepared?.confirmation.fingerprint]);
  useEffect(() => { if (stored?.state === 'pending') recoveryRef.current?.focus(); }, [stored]);
  useEffect(() => { if (record) outcomeRef.current?.focus(); }, [record]);
  const recordId = stored?.state === 'recorded' ? stored.id : null;
  useEffect(() => {
    if (!recordId || record?.id === recordId) return;
    let current = true; lookupBusy.current = true; setError(null);
    api.cancellationConfirmation(eventId, recordId).then((data) => { if (current) { lookupBusy.current = false; setRecord(data); } })
      .catch((e: ApiError) => { if (current) { lookupBusy.current = false; setError(e.message); } });
    return () => { current = false; };
  }, [eventId, recordId, record?.id, reload]);
  const remember = (next: Recovery | null) => {
    storedRef.current = next; setStored(next);
    try { if (next) sessionStorage.setItem(storageKey, JSON.stringify(next)); else sessionStorage.removeItem(storageKey); }
    catch { setWarning('Browser storage could not be updated. Keep this page open until the original request is resolved; refresh recovery may be unavailable.'); }
  };
  const send = async (request: CancellationConfirmationInput) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(null);
    try {
      const data = await api.confirmCancellationPlan(eventId, request);
      if (!alive.current) return;
      setRecord(data); remember({ state: 'recorded', id: data.id });
    } catch (e) {
      if (!alive.current) return;
      const failure = e as ApiError;
      if (z.object({ code: z.literal(CANCELLATION_PLAN_NOT_RECORDED) }).safeParse(failure.details).success) {
        remember(null); setAcknowledged(false); onResetPreview();
        setError(`The plan was not recorded. ${failure.message}`);
      } else setError(`The original result is unresolved. ${failure.message} Retry the original request; do not start another confirmation.`);
    } finally { if (alive.current) { busyRef.current = false; setBusy(false); } }
  };
  const submit = () => {
    if (!prepared || storedRef.current || busyRef.current || initial.blocked || executionPendingRef.current) return;
    const parsed = cancellationConfirmationSchema.safeParse({ clientRequestId: newId('plan-request'), selection: prepared.confirmation.preview.selection, previewFingerprint: prepared.confirmation.fingerprint, reason, acknowledgePlanOnly: acknowledged });
    if (!parsed.success) {
      const reason = parsed.error.issues.find((issue) => issue.path[0] === 'reason')?.message;
      const acknowledgement = parsed.error.issues.some((issue) => issue.path[0] === 'acknowledgePlanOnly') ? 'Acknowledge that this records a plan only.' : undefined;
      setValidation({ reason, acknowledgement }); setError([reason, acknowledgement].filter(Boolean).join(' ') || parsed.error.issues[0].message); return;
    }
    setValidation({});
    remember({ state: 'pending', request: parsed.data, previewVersion: prepared.confirmation.preview.currentPublishedVersion });
    void send(parsed.data);
  };
  const reviewAnother = () => { if (executionPendingRef.current) return; setExecutionReset((n) => n + 1); remember(null); setRecord(null); setReason(''); setAcknowledged(false); setError(null); setValidation({}); onResetPreview(); };
  return <>
    {warning && <p className="note">{warning}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {stored?.state === 'pending' ? <div ref={recoveryRef} tabIndex={-1} className="correction" aria-label="Resolve original plan request">
      <p role="status" aria-label="Plan confirmation status">{busy ? 'Recording the reviewed plan…' : 'The original plan request needs resolution.'}</p>
      <HistoricalScope eventId={eventId} selection={stored.request.selection} version={stored.previewVersion} />
      <p>Original reason: {stored.request.reason}</p>
      <p className="small">Retries keep the original request and acknowledgement. Confirming this plan does not cancel entries or return money. Recovery stays in this tab when browser storage is available.</p>
      <button type="button" className="btn btn--secondary" aria-disabled={busy} onClick={() => void send(stored.request)}>Retry original plan confirmation</button>
    </div> : stored?.state === 'recorded' ? record ? <div ref={outcomeRef} tabIndex={-1} className="correction" aria-label="Recorded plan evidence">
      <p role="status" aria-label="Plan confirmation status"><strong>Reviewed plan recorded. Recording a plan does not execute cancellation.</strong></p>
      <HistoricalScope eventId={eventId} selection={record.selection} version={record.preview.currentPublishedVersion} />
      <p>Recorded {formatDateTime(record.confirmedAt)} by {record.confirmedBy === accountId ? 'you' : 'another account'}.</p>
      <details><summary>Account audit reference</summary><p>{record.confirmedBy}</p></details>
      <p>Reason: {record.reason}</p>
      <p className="small">Confirmation reference: {record.id}. This is historical review evidence. Recording this evidence changed no entries, capacity, payments or messages. The separate execution step below checks current eligibility.</p>
      <button type="button" className="btn btn--secondary" aria-disabled={executionPending} onClick={reviewAnother}>Review another plan</button>
    </div> : <><p>{error ? 'Saved plan evidence could not be loaded.' : 'Loading saved plan evidence…'}</p>{error && <><p className="small">Saved reference: {recordId}. A separate review creates a new plan record; it does not resolve or replace this historical reference.</p><button type="button" className="btn btn--secondary" aria-disabled={executionPending} onClick={reviewAnother}>Start a separate review</button></>}<button type="button" className="btn btn--secondary" aria-disabled={!error} onClick={() => { if (!error || lookupBusy.current) return; lookupBusy.current = true; setReload((n) => n + 1); }}>Retry saved record lookup</button></> : initial.blocked ? null : executionPending ? <p>Resolve the original execution request below before recording another plan.</p> : prepared ? <form className="correction" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <p>Record that you reviewed the displayed scope and impact. Simulated execution requires a separate step and acknowledgement.</p>
      <Field label="Reason for the reviewed plan">{(id) => <><textarea id={id} className="input" rows={3} required value={reason} aria-invalid={!!validation.reason} aria-describedby={validation.reason ? `${id}-error` : undefined} onChange={(e) => { setReason(e.target.value); setError(null); setValidation((v) => ({ ...v, reason: undefined })); }} />{validation.reason && <p id={`${id}-error`} className="error">{validation.reason}</p>}</>}</Field>
      <label className="check"><input id={acknowledgementId} type="checkbox" checked={acknowledged} aria-invalid={!!validation.acknowledgement} aria-describedby={validation.acknowledgement ? `${acknowledgementId}-error` : undefined} onChange={(e) => { setAcknowledged(e.target.checked); setError(null); setValidation((v) => ({ ...v, acknowledgement: undefined })); }} />I understand this records the reviewed plan only. It does not cancel entries, return money or send messages.</label>
      {validation.acknowledgement && <p id={`${acknowledgementId}-error`} className="error">{validation.acknowledgement}</p>}
      <button type="submit" className="btn btn--secondary">Record plan confirmation</button>
    </form> : <p className="small">Load and review a current cancellation preview before recording a plan.</p>}
    <CancellationExecutionControls eventId={eventId} accountId={accountId} plan={record} refreshKey={refreshKey} resetEpoch={executionReset} onPendingChange={executionPendingChanged} onSaved={onExecutionSaved} />
  </>;
}
