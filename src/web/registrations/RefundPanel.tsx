import { useEffect, useRef, useState } from 'react';
import { newId } from '../../shared/factory';
import { useSession } from '../auth';
import { formatCents } from '../../shared/format';
import { REFUND_STATUS_LABEL, refundableCents, refundRequestSchema, type RefundRequest } from '../../shared/refunds';
import { api, type ApiError, type OrderView, type OrganizerRefundView, type RefundablePaymentView } from '../api';
import { formatDateTime } from '../format';
import { Field, moneyText, parseMoney, ReasonForm } from '../ui';

/**
 * Refunds for one order. A refund returns money from one payment, optionally for one entry; it never
 * withdraws the entry (use Withdraw for that). Owner and finance roles can refund; others see the history.
 */
export function RefundPanel({ order, canRefund, onChange }: { order: OrderView; canRefund: boolean; onChange: (o: OrderView) => void }) {
  const session = useSession();
  const storageKey = `cyclereg.refund.${session.email?.toLowerCase()}.${order.id}`;
  const [pending, setPending] = useState<RefundRequest | null>(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      const parsed = raw ? refundRequestSchema.safeParse(JSON.parse(raw)) : null;
      return parsed?.success ? parsed.data : null;
    } catch { return null; }
  });
  const pendingRef = useRef(pending);
  const initialPending = useRef(pending);
  const wasRecovering = useRef(pending !== null);
  const workflowRef = useRef<HTMLDivElement>(null);
  const [outcomeId, setOutcomeId] = useState<string | null>(null);
  const outcome = order.refunds.find((r) => r.id === outcomeId);
  const [requestInFlight, setRequestInFlight] = useState(false);
  const recoveryRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (pending && pending !== initialPending.current) recoveryRef.current?.focus();
    if (!pending && wasRecovering.current) workflowRef.current?.querySelector<HTMLElement>('input,select,button')?.focus();
    wasRecovering.current = pending !== null;
  }, [pending]);
  const [detail, setDetail] = useState<{ payments: RefundablePaymentView[]; refunds: OrganizerRefundView[] } | null>(null);
  const [open, setOpen] = useState(false);
  const [paymentRef, setPaymentRef] = useState<string>('');
  const [entryId, setEntryId] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const name = `${order.rider.firstName} ${order.rider.lastName}`;
  const refundKey = order.refunds.map((r) => `${r.id}:${r.status}`).join(',');

  useEffect(() => {
    if (!open && !pending && order.refunds.length === 0) return;
    api.refunds(order.id).then(setDetail).catch((e: ApiError) => setErr(e.message));
  }, [order.id, open, refundKey, order.refunds.length, pending]);

  const payment = detail?.payments.find((p) => (p.ref ?? '') === paymentRef) ?? detail?.payments.find((p) => p.kind === 'order') ?? detail?.payments[0];
  const entries = order.status === 'confirmed' && payment?.kind === 'order' ? order.entries : [];
  /** What is left to refund on one entry: what it cost, less the refunds already made against it. */
  const entryLeft = (id: string) =>
    refundableCents(
      order.entries.find((x) => x.id === id)?.amountPaidCents ?? 0,
      order.refunds.filter((r) => r.entryId === id),
    );
  const maxCents = entryId ? Math.min(entryLeft(entryId), payment?.remainingCents ?? 0) : (payment?.remainingCents ?? 0);
  const entryLabel = (id: string | null) => {
    const e = id ? order.entries.find((x) => x.id === id) : null;
    return e ? `${e.code} ${e.categoryName}` : 'Order';
  };

  const close = () => {
    setOutcomeId(null);
    setOpen(false);
    setErr(null);
    setAmount('');
    setEntryId('');
  };
  /** The request as the shared rule reads it, or the first problem in words. */
  const request = (reason: string): { body?: ReturnType<typeof refundRequestSchema.parse>; problem?: string } => {
    const cents = parseMoney(amount);
    if (cents === null || cents <= 0) return { problem: 'Enter an amount above zero, like 25.00.' };
    if (cents > maxCents) return { problem: `At most ${formatCents(maxCents)} can be refunded here.` };
    const parsed = refundRequestSchema.safeParse({ clientRequestId: newId('refund-request'), paymentRef: payment?.ref ?? null, entryId: entryId || null, amountCents: cents, reason });
    return parsed.success ? { body: parsed.data } : { problem: parsed.error.issues[0].message };
  };
  const remember = (body: RefundRequest | null) => {
    pendingRef.current = body;
    setPending(body);
    try {
      if (body) sessionStorage.setItem(storageKey, JSON.stringify(body));
      else sessionStorage.removeItem(storageKey);
    } catch { /* The in-memory request still protects retries in this page. */ }
  };
  const recover = async (body: RefundRequest) => {
    const current = await api.refunds(order.id);
    setDetail(current);
    const saved = current.refunds.find((r) => r.clientRequestId === body.clientRequestId);
    if (!saved) return false;
    onChange(await api.order(order.id));
    remember(null);
    close();
    setOutcomeId(saved.id);
    return true;
  };
  const send = async (body: RefundRequest) => {
    recoveryRef.current?.focus();
    setOutcomeId(null);
    setRequestInFlight(true);
    setBusy(true);
    setErr(null);
    try {
      const next = await api.requestRefund(order.id, body);
      onChange(next);
      remember(null);
      close();
      setOutcomeId(next.refundId);
    } catch (e) {
      const error = e as ApiError;
      try {
        if (await recover(body)) {
          if (error.status === 409 || error.status === 502) setErr(error.message);
          return;
        }
        // A completed refusal with no saved row permits correction. An interrupted response does not.
        if ([400,404,409].includes(error.status)) {
          remember(null);
          setOpen(true);
        }
      } catch { /* Keep the original request while its saved state is unknown. */ }
      setErr(error.message);
    } finally { setBusy(false); setRequestInFlight(false); }
  };
  const submit = async (reason: string) => {
    if (pendingRef.current) return;
    const { body } = request(reason);
    if (!body) return;
    remember(body);
    await send(body);
  };
  const checkStatus = async () => {
    if (!pending) return;
    recoveryRef.current?.focus();
    setBusy(true);
    setErr(null);
    try {
      if (!await recover(pending)) setErr('No saved refund found yet. Retry the original request to resolve it safely.');
    } catch (e) { setErr((e as ApiError).message); }
    finally { setBusy(false); }
  };
  const retry = async (id: string) => {
    setBusy(true);
    setErr(null);
    try {
      onChange(await api.retryRefund(id));
    } catch (e2) {
      setErr((e2 as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {pending && <section ref={recoveryRef} tabIndex={-1} className="correction" aria-label={`Recover refund for ${name}`}>
        <h4>{requestInFlight ? 'Submitting refund' : 'Check the previous refund'}</h4>
        <p className="small" role={requestInFlight ? 'status' : undefined}>{requestInFlight ? 'Submitting this refund. Wait for its result before starting another.' : 'Its response is unconfirmed. Check its status or retry this same request before starting another refund.'}</p>
        <p className="small muted">This request stays in this tab when browser storage is available. If storage is blocked, keep this page open until the result is resolved.</p>
        <p className="small"><strong>{formatCents(pending.amountCents)}</strong> · {entryLabel(pending.entryId)} · Reason: {pending.reason}</p>
        {canRefund ? <div className="row-actions">
          <button className="btn btn--ghost btn--small" disabled={busy} onClick={() => void checkStatus()}>Check refund status</button>
          <button className="btn btn--primary btn--small" disabled={busy} onClick={() => void send(pending)}>Retry original refund</button>
        </div> : <p className="small">Your account cannot refund this order. Ask an owner or finance teammate to review the saved refund history before any further reimbursement.</p>}
      </section>}
      <div ref={workflowRef} hidden={pending !== null}>
      {open && detail ? (
        <ReasonForm
          variant="block"
          label={`Refund ${name}`}
          intro={`${payment?.provider === 'stripe_test' ? 'The money goes back to the rider’s card through Stripe (test mode: no real money moves).' : 'Simulated payment: the refund is recorded and no money moves.'} A refund does not withdraw an entry; use Withdraw for that.`}
          reasonLabel="Reason for the refund (required)"
          hint="For example: rider withdrew before the deadline."
          submitLabel="Refund"
          busyLabel="Refunding…"
          validate={(reason) => request(reason).problem ?? null}
          disabled={maxCents === 0}
          onSubmit={submit}
          onCancel={close}
        >
          <div className="form-row">
            {detail.payments.length > 1 && (
              <Field label="Payment">
                {(id) => (
                  <select id={id} className="input" value={payment?.ref ?? ''} onChange={(e) => { setPaymentRef(e.target.value); setEntryId(''); }}>
                    {detail.payments.map((p) => (
                      <option key={p.ref ?? 'simulated'} value={p.ref ?? ''}>
                        {p.kind === 'duplicate' ? 'Duplicate charge' : 'Order payment'} · {formatCents(p.amountCents)} · {formatCents(p.remainingCents)} left
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            )}
            {entries.length > 0 && (
              <Field label="For">
                {(id) => (
                  <select id={id} className="input" value={entryId} onChange={(e) => { setEntryId(e.target.value); setAmount(e.target.value ? moneyText(Math.min(entryLeft(e.target.value), payment?.remainingCents ?? 0)) : ''); }}>
                    <option value="">The order (not one entry)</option>
                    {entries.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.code} {e.categoryName} · {formatCents(entryLeft(e.id))} left
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            )}
            <Field label="Amount (USD)" hint={`Up to ${formatCents(maxCents)}`}>
              {(id, d) => <input id={id} aria-describedby={d} className="input num" inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} />}
            </Field>
          </div>
        </ReasonForm>
      ) : (
        canRefund && (
          <p className="row-actions">
            <button className="btn btn--ghost btn--small" aria-label={`Refund ${name}`} onClick={() => { setOutcomeId(null); setOpen(true); }}>
              Refund
            </button>
          </p>
        )
      )}
      </div>
      {outcome && <p className="small" role="status">Last refund request: <strong>{REFUND_STATUS_LABEL[outcome.status]}</strong> · {formatCents(outcome.amountCents)}</p>}
      {err && (
        <p className="text-error small" role="alert">
          {err}
        </p>
      )}
      {detail && detail.refunds.length > 0 && (
        <ul className="order__entries" aria-label={`Refunds for ${name}`}>
          {detail.refunds.map((r) => (
            <li key={r.id} className="order__entry order__change">
              <span className="small">
                <strong>
                  {REFUND_STATUS_LABEL[r.status]}: <span className="num">{formatCents(r.amountCents)}</span>
                </strong>{' '}
                · {entryLabel(r.entryId)} · {formatDateTime(r.createdAt)}
                {r.requestedBy ? ` · by ${r.requestedBy}` : ''} · Reason: {r.reason}
                {r.failureReason && ` · ${r.status === 'failed' ? 'Stripe said' : 'Last error'}: ${r.failureReason}`}
              </span>
              {r.status === 'requested' && canRefund && (
                <button className="btn btn--ghost btn--small" disabled={busy || pending !== null} onClick={() => retry(r.id)}>
                  Send again
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
