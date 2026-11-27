import { useEffect, useRef, useState } from 'react';
import { formatDollars } from '../shared/format';
import { api, ApiError, type WithdrawalPolicyPreview, type WithdrawalRequest } from './api';
import { ReasonForm } from './ui';

/** Plain sentence for what the accepted refund policy returns if this entry is withdrawn today. */
export function withdrawalPolicySentence(p: WithdrawalPolicyPreview): string {
  const paid = formatDollars(p.amountPaidCents);
  const e = p.entitlement;
  if (!e) return `You paid ${paid} for this entry. This order has no refund policy on record, so the organizer decides what, if anything, comes back.`;
  if (e.amountCents === 0) return `You paid ${paid} for this entry. Under this event's refund policy, withdrawing today returns nothing.`;
  const amount = `${formatDollars(e.amountCents)} (${e.percent}% of the ${paid} you paid; fees are not returned)`;
  if (e.returnAs === 'credit') return `Under this event's refund policy, withdrawing today returns ${amount} as credit toward a later event by this organizer.`;
  if (e.returnAs === 'rider_choice') return `Under this event's refund policy, withdrawing today returns ${amount} as a refund or credit, your choice.`;
  return `Under this event's refund policy, withdrawing today returns ${amount} as a refund.`;
}

type Status = { preview: WithdrawalPolicyPreview; openRequest: WithdrawalRequest | null };

/**
 * A rider asks the organizer to withdraw one paid entry. The organizer approves or declines; this sends no refund.
 * Renders nothing for someone who cannot manage the order (for example, a junior viewing their own registration).
 */
export function WithdrawalRequestControl({ entryId, categoryName }: { entryId: string; categoryName: string }) {
  const [state, setState] = useState<Status | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const formHost = useRef<HTMLDivElement>(null);
  const waiting = useRef<HTMLParagraphElement>(null);
  const [focusWaiting, setFocusWaiting] = useState(false);

  useEffect(() => {
    let active = true;
    api.withdrawalStatus(entryId)
      .then((s) => { if (active) setState(s); })
      .catch((e: ApiError) => { if (active && e.status !== 403 && e.status !== 404 && e.status !== 409) setLoadError(e.message); });
    return () => { active = false; };
  }, [entryId]);

  useEffect(() => {
    if (open) formHost.current?.querySelector<HTMLInputElement>('input')?.focus();
  }, [open]);
  useEffect(() => {
    if (focusWaiting) { waiting.current?.focus(); setFocusWaiting(false); }
  }, [focusWaiting]);

  if (loadError) return <p className="small text-error">Withdrawal options could not load. Refresh this page to try again.</p>;
  if (!state) return null;
  // The current preview names the category for a new request; the page's copy can be stale if the organizer moved the entry.
  // A sent request keeps the category the rider asked about.
  const category = state.preview.categoryName || categoryName;
  if (state.openRequest) {
    return (
      <p ref={waiting} tabIndex={-1} className="note small" role="status">
        You asked to withdraw from {state.openRequest.policy.categoryName}. The organizer has not decided yet, and this entry still races until they do.
      </p>
    );
  }
  if (!open) {
    return (
      <button type="button" className="btn btn--ghost btn--small" aria-label={`Ask to withdraw from ${category}`} onClick={() => setOpen(true)}>
        Ask to withdraw
      </button>
    );
  }
  const shown = state.preview.entitlement;
  return (
    <div ref={formHost}>
      <ReasonForm
        variant="block"
        label={`Ask to withdraw from ${category}`}
        intro={<><strong>{category}.</strong> {withdrawalPolicySentence(state.preview)} The organizer reviews your request; nothing changes until they approve it.</>}
        reasonLabel="Why do you want to withdraw?"
        submitLabel="Send request"
        busyLabel="Sending…"
        missing="Write why you want to withdraw."
        onSubmit={async (reason) => {
          try {
            const openRequest = await api.requestWithdrawal(entryId, {
              clientRequestId: requestId,
              reason,
              expectedCategoryId: state.preview.categoryId,
              expectedReturnAs: shown?.returnAs ?? null,
              expectedAmountCents: shown?.amountCents ?? null,
            });
            setState({ preview: state.preview, openRequest });
            setFocusWaiting(true);
          } catch (e) {
            // The category or policy step changed since the rider looked: show the current preview and let them decide again.
            if (e instanceof ApiError && e.status === 409) {
              const fresh = await api.withdrawalStatus(entryId).catch(() => null);
              if (fresh) { setState(fresh); setRequestId(crypto.randomUUID()); }
            }
            throw e;
          }
        }}
        onCancel={() => { setOpen(false); setRequestId(crypto.randomUUID()); }}
      />
    </div>
  );
}
