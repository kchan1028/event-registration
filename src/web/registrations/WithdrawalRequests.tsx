import { useState } from 'react';
import { formatDollars } from '../../shared/format';
import { api, type ApiError, type WithdrawalPolicyPreview, type WithdrawalRequest } from '../api';
import { formatDateTime } from '../format';
import { ReasonForm } from '../ui';
import { useLoad } from '../useLoad';

/** What the accepted policy said the rider would get back when they asked, in the organizer's words. */
export function policyAtRequest(p: WithdrawalPolicyPreview): string {
  const paid = formatDollars(p.amountPaidCents);
  const e = p.entitlement;
  if (!e) return `Paid ${paid}. No refund policy on record for this order.`;
  if (e.amountCents === 0) return `Paid ${paid}. The policy returned nothing on ${p.onDate}.`;
  const as = e.returnAs === 'cash' ? 'a refund' : e.returnAs === 'credit' ? 'credit' : 'a refund or credit, the rider’s choice';
  return `Paid ${paid}. On ${p.onDate} the policy returned ${formatDollars(e.amountCents)} (${e.percent}%) as ${as}.`;
}

/**
 * Riders' requests to withdraw a paid entry. Approving runs the usual withdrawal; it never refunds,
 * so any refund the policy allows is sent separately from the order's refunds.
 */
export function WithdrawalRequests({ eventId, refreshKey, onChanged }: { eventId: string; refreshKey: unknown; onChanged: () => unknown }) {
  const { data: items, setData: setItems, error, reload } = useLoad(() => api.withdrawalRequests(eventId), [eventId, refreshKey]);
  if (!items || items.length === 0) return error ? <p className="alert alert--error">{error}</p> : null;
  const open = items.filter((i) => i.status === 'open');
  const done = items.filter((i) => i.status !== 'open');
  const decided = async (updated: WithdrawalRequest) => {
    setItems((list) => list?.map((i) => (i.id === updated.id ? updated : i)) ?? list);
    await reload();
    await onChanged();
  };
  return (
    <section className="settings__section" aria-labelledby="withdrawal-requests-title">
      <h3 id="withdrawal-requests-title">Withdrawal requests{open.length > 0 ? ` (${open.length})` : ''}</h3>
      <p className="muted small">Riders who asked to withdraw a paid entry. Approving withdraws the entry and frees the place; it does not refund. Send any refund from the order’s refunds.</p>
      {open.length === 0 && <p className="note note--ok">No requests are waiting.</p>}
      <ul className="orders">
        {open.map((i) => <RequestRow key={i.id} eventId={eventId} item={i} onDecided={decided} />)}
      </ul>
      {done.length > 0 && (
        <details>
          <summary className="small">Decided ({done.length})</summary>
          <ul className="small">
            {done.map((i) => (
              <li key={i.id}>
                {i.riderName} · {i.policy.categoryName}: {i.status === 'approved' ? 'Withdrawn' : `Declined: ${i.decisionReason}`}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function RequestRow({ eventId, item, onDecided }: { eventId: string; item: WithdrawalRequest; onDecided: (r: WithdrawalRequest) => Promise<void> }) {
  const [mode, setMode] = useState<'none' | 'approve' | 'decline'>('none');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const who = `${item.riderName}, ${item.policy.categoryName}`;
  const approve = async () => {
    setBusy(true);
    setErr(null);
    try {
      await onDecided(await api.approveWithdrawalRequest(eventId, item.id));
    } catch (e) {
      setErr((e as ApiError).message);
      setBusy(false);
    }
  };
  return (
    <li className="order">
      <div className="order__head">
        <p className="order__name">
          {item.riderName} <span className="muted">· {item.policy.categoryName} · asked <time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time></span>
        </p>
        <span className="status status--needs_review">Waiting</span>
      </div>
      <p className="small">Reason: {item.reason}</p>
      <p className="small muted">{policyAtRequest(item.policy)}</p>
      {mode === 'none' && (
        <span className="order__entry-actions">
          <button type="button" className="btn btn--secondary btn--small" aria-label={`Approve withdrawal for ${who}`} onClick={() => setMode('approve')}>Approve</button>
          <button type="button" className="btn btn--ghost btn--small" aria-label={`Decline withdrawal for ${who}`} onClick={() => setMode('decline')}>Decline</button>
        </span>
      )}
      {mode === 'approve' && (
        <div className="review-form" role="group" aria-label={`Confirm withdrawal for ${who}`}>
          <span className="small">This withdraws the entry now. No refund is sent.</span>
          <button type="button" className="btn btn--primary btn--small" disabled={busy} onClick={() => void approve()}>{busy ? 'Withdrawing…' : 'Withdraw entry'}</button>
          {/* Once sent, the server may still withdraw the entry, so the approval cannot be cancelled from here. */}
          <button type="button" className="btn btn--ghost btn--small" disabled={busy} onClick={() => { setMode('none'); setErr(null); }}>Cancel</button>
          {err && <span className="text-error small" role="alert">{err}</span>}
        </div>
      )}
      {mode === 'decline' && (
        <ReasonForm
          variant="inline"
          label={`Decline withdrawal for ${who}`}
          reasonLabel="Why the entry stays"
          placeholder="Reason, for example: withdrawals closed after the start list was sent"
          submitLabel="Decline request"
          missing="Write why the entry stays."
          onSubmit={async (reason) => onDecided(await api.declineWithdrawalRequest(eventId, item.id, reason))}
          onCancel={() => setMode('none')}
        />
      )}
    </li>
  );
}
