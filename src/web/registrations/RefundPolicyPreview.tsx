import { useEffect, useRef, useState } from 'react';
import type { RefundPolicyPreview as Preview } from '../../shared/refundPolicy';
import { formatDollars } from '../../shared/format';
import { api, type ApiError } from '../api';
import { Field } from '../ui';

/** Informational only: the organizer still chooses the refund amount and scope explicitly. */
export function RefundPolicyPreview({ orderId, refundKey }: { orderId: string; refundKey: string }) {
  const [reason, setReason] = useState<Preview['reason']>('withdrawal');
  const [result, setResult] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    generation.current++; setResult(null); setError(null); setBusy(false);
    return () => { generation.current++; };
  }, [orderId, refundKey]);
  const load = async () => {
    const current = ++generation.current;
    setBusy(true); setError(null); setResult(null);
    try {
      const preview = await api.refundPolicyPreview(orderId, reason);
      if (current === generation.current) setResult(preview);
    } catch (e) { if (current === generation.current) setError((e as ApiError).message); }
    finally { if (current === generation.current) setBusy(false); }
  };
  return <section className="refund-policy-preview" aria-label="Whole-order refund policy">
    <h4>Whole-order refund policy</h4>
    <p className="small">Check the rules accepted at purchase before entering an amount. This covers the entire order, excluding fees.</p>
    <div className="form-row">
      <Field label="Policy scenario">{(id) => <select id={id} className="input" value={reason} disabled={busy} onChange={(e) => { setReason(e.target.value as Preview['reason']); setResult(null); setError(null); }}>
        <option value="withdrawal">Rider withdrawal</option>
        <option value="organizer_cancellation">Organizer cancellation</option>
      </select>}</Field>
    </div>
    <p className="row-actions"><button type="button" className="btn btn--ghost btn--small" aria-disabled={busy} onClick={() => { if (!busy) void load(); }}>{busy ? 'Checking policy…' : 'Preview whole-order policy'}</button></p>
    {error && <p className="error" role="alert">Could not load the policy preview: {error} Try Preview whole-order policy again.</p>}
    {busy && <p className="small" role="status">Checking the accepted policy…</p>}
    {result && <div className="small" role="status">
      <p>Accepted version {result.publishedVersion} · Assessed {result.onDate} ({result.timeZone})</p>
      <p>Paid entries: {formatDollars(result.entryCents)}. Excluded fees: {formatDollars(result.excludedFeesCents)}.</p>
      {result.entitlement && <p>Before prior refunds or external credits: {result.entitlement.percent}% of entries, {formatDollars(result.entitlement.amountCents)} {result.entitlement.returnAs === 'cash' ? 'as cash' : result.entitlement.returnAs === 'credit' ? 'as credit' : 'as the rider’s choice of cash or credit'}.</p>}
      {result.reviewReasons.length ? <><p><strong>Review required; no cash amount suggested.</strong></p><ul>{result.reviewReasons.map((r) => <li key={r}>{r}</li>)}</ul></> : <p><strong>Policy cash amount: {formatDollars(result.suggestedCashCents ?? 0)}</strong></p>}
      <p>This preview does not reserve or return money, issue credit, withdraw an entry or cancel a race. Recheck the ledger before submitting a refund.</p>
    </div>}
  </section>;
}
