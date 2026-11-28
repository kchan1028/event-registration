import { useEffect, useRef, useState } from 'react';
import { formatDollars } from '../shared/format';
import { api, ApiError, type TransferOption, type WithdrawalPolicyPreview, type WithdrawalRequest } from './api';
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
  const [mode, setMode] = useState<'none' | 'withdraw' | 'move'>('none');
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
    if (mode !== 'none') formHost.current?.querySelector<HTMLInputElement>('input')?.focus();
  }, [mode]);
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
        {state.openRequest.kind === 'transfer'
          ? <>You asked to move this entry to {state.openRequest.policy.transfer ? moveTargetLabel(state.openRequest.policy.transfer) : 'another category'}. The organizer has not decided yet, and this entry stays where it is until they do.</>
          : <>You asked to withdraw from {state.openRequest.policy.categoryName}. The organizer has not decided yet, and this entry still races until they do.</>}
      </p>
    );
  }
  const sent = (openRequest: WithdrawalRequest) => { setState({ preview: state.preview, openRequest }); setFocusWaiting(true); };
  if (mode === 'none') {
    return (
      <span className="order__entry-actions">
        <button type="button" className="btn btn--ghost btn--small" aria-label={`Ask to withdraw from ${category}`} onClick={() => setMode('withdraw')}>
          Ask to withdraw
        </button>
        <button type="button" className="btn btn--ghost btn--small" aria-label={`Ask to move from ${category} to another category`} onClick={() => setMode('move')}>
          Ask to move
        </button>
      </span>
    );
  }
  if (mode === 'move') {
    return (
      <div ref={formHost}>
        <MoveForm entryId={entryId} category={category} onSent={sent} onCancel={() => setMode('none')} />
      </div>
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
            sent(openRequest);
          } catch (e) {
            // The category or policy step changed since the rider looked: show the current preview and let them decide again.
            if (e instanceof ApiError && e.status === 409) {
              const fresh = await api.withdrawalStatus(entryId).catch(() => null);
              if (fresh) { setState(fresh); setRequestId(crypto.randomUUID()); }
            }
            throw e;
          }
        }}
        onCancel={() => { setMode('none'); setRequestId(crypto.randomUUID()); }}
      />
    </div>
  );
}

/** "RR-M35-34 Masters 35+ Cat 3/4 (Saturday road race)": categories in different races can share a name. Older requests have the name only. */
export function moveTargetLabel(t: { categoryName: string; code?: string; raceName?: string }): string {
  return `${t.code ? `${t.code} ` : ''}${t.categoryName}${t.raceName ? ` (${t.raceName})` : ''}`;
}

/** How a category's price today compares with what the rider paid. Nothing is charged here. */
export function moveCostSentence(o: TransferOption): string {
  const price = formatDollars(o.newPriceCents);
  if (o.differenceCents > 0) return `${price} today, ${formatDollars(o.differenceCents)} more than you paid`;
  if (o.differenceCents < 0) return `${price} today, ${formatDollars(-o.differenceCents)} less than you paid`;
  return `${price} today, the same as you paid`;
}

/** The rider picks one category the entry can move to now and says why. The organizer decides. */
function MoveForm({ entryId, category, onSent, onCancel }: { entryId: string; category: string; onSent: (r: WithdrawalRequest) => void; onCancel: () => void }) {
  const [data, setData] = useState<{ from: WithdrawalPolicyPreview; options: TransferOption[] } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [choice, setChoice] = useState('');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const choices = useRef<HTMLFieldSetElement>(null);
  // Focus the first choice once the options arrive, so keyboard users land in the form.
  const loaded = data !== null;
  useEffect(() => { if (loaded) choices.current?.querySelector<HTMLInputElement>('input')?.focus(); }, [loaded]);
  const load = async () => {
    try {
      setData(await api.transferOptions(entryId));
      setLoadError(null);
    } catch (e) {
      setLoadError((e as ApiError).message);
    }
  };
  useEffect(() => { void load(); }, [entryId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loadError) return <p className="small text-error" role="alert">Move options could not load. {loadError}</p>;
  if (!data) return <p className="small muted" role="status">Loading the categories you can move to…</p>;
  if (data.options.length === 0) {
    return (
      <p className="note small" role="status">
        No other category can take this entry right now. Ask the registration desk if you need a change.{' '}
        <button type="button" className="btn btn--ghost btn--small" onClick={onCancel}>Close</button>
      </p>
    );
  }
  const name = data.from.categoryName || category;
  return (
    <ReasonForm
      variant="block"
      label={`Ask to move from ${name} to another category`}
      intro={<><strong>{name}.</strong> These categories can take this entry now. Any price difference is settled with the organizer; nothing is charged or refunded here. Nothing changes until the organizer approves.</>}
      reasonLabel="Why do you want to move?"
      submitLabel="Send request"
      busyLabel="Sending…"
      validate={(reason) => (!choice ? 'Choose the category to move to.' : reason.length < 3 ? 'Write why you want to move.' : null)}
      onSubmit={async (reason) => {
        const option = data.options.find((o) => o.categoryId === choice)!;
        try {
          onSent(await api.requestTransfer(entryId, { clientRequestId: requestId, reason, toCategoryId: choice, expectedCategoryId: data.from.categoryId, expectedNewPriceCents: option.newPriceCents }));
        } catch (e) {
          // A price or the entry's category changed since the rider looked: show the current choices and let them decide again.
          if (e instanceof ApiError && e.status === 409) { await load(); setRequestId(crypto.randomUUID()); }
          throw e;
        }
      }}
      onCancel={onCancel}
    >
      <fieldset className="field" ref={choices}>
        <legend>Move to</legend>
        {data.options.map((o) => (
          <label key={o.categoryId} className="check">
            <input type="radio" name={`move-${entryId}`} value={o.categoryId} checked={choice === o.categoryId} onChange={() => setChoice(o.categoryId)} />
            <span>{moveTargetLabel(o)}: {moveCostSentence(o)}</span>
          </label>
        ))}
      </fieldset>
    </ReasonForm>
  );
}
