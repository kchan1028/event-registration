import { useEffect, useRef, useState } from 'react';
import type { CancellationConfirmationPreview, CancellationSelection } from '../../shared/cancellations';
import type { EventConfig } from '../../shared/schema';
import { formatDollars } from '../../shared/format';
import { api, type ApiError, type OrderView, type PublicEvent } from '../api';
import { formatDateTime } from '../format';
import { PlanConfirmation } from './PlanConfirmation';
import { Field } from '../ui';

const count = (n: number, singular: string, plural = `${singular}s`) => `${n} ${n === 1 ? singular : plural}`;

export function CancellationPreview({ eventId, revision, publishedVersion, orders, onExecutionSaved }: { eventId: string; revision: number; publishedVersion: number | null; orders: OrderView[] | null; onExecutionSaved: () => void }) {
  const [catalog, setCatalog] = useState<PublicEvent | null>(null);
  const [selection, setSelection] = useState<CancellationSelection>({ scope: 'event' });
  const [result, setResult] = useState<{ confirmation: CancellationConfirmationPreview; config: EventConfig } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationPending, setConfirmationPending] = useState(false);
  const previewButton = useRef<HTMLButtonElement>(null);
  const generation = useRef(0);
  const pending = useRef(false);
  const clear = () => { generation.current++; pending.current = false; setBusy(false); setResult(null); setError(null); };
  useEffect(() => {
    clear(); setCatalog(null); setSelection({ scope: 'event' });
    const current = generation.current;
    api.publicEvent(eventId).then((data) => { if (current === generation.current) setCatalog(data); })
      .catch((e: ApiError) => { if (current === generation.current) setError(e.message); });
    return () => { generation.current++; };
  }, [eventId, revision, publishedVersion, orders]);
  const load = async () => {
    if (pending.current || confirmationPending) return;
    pending.current = true; const current = ++generation.current;
    setBusy(true); setResult(null); setError(null);
    try {
      const fresh = await api.publicEvent(eventId);
      if (current !== generation.current) return;
      setCatalog(fresh);
      if ((selection.scope === 'race' && !fresh.config.races.some((r) => r.id === selection.raceId)) || (selection.scope === 'day' && !fresh.config.days.some((d) => d.id === selection.dayId))) {
        setSelection({ scope: 'event' });
        throw new Error('The selected race or day is no longer published. Scope was reset to Entire event.');
      }
      const confirmation = await api.cancellationConfirmationPreview(eventId, selection);
      if (current !== generation.current) return;
      if (confirmation.preview.currentPublishedVersion !== fresh.publishedVersion) throw new Error('The published schedule changed while loading.');
      setResult({ confirmation, config: fresh.config });
    } catch (e) { if (current === generation.current) setError((e as Error).message); }
    finally { if (current === generation.current) { pending.current = false; setBusy(false); } }
  };
  const change = (next: CancellationSelection) => { clear(); setSelection(next); };
  const orderName = (id: string) => orders?.find((o) => o.id === id)?.orderNumber ?? id;
  const category = (id: string) => result?.config.categories.find((c) => c.id === id)?.name ?? 'Category no longer published';
  const data = result?.confirmation.preview;
  return <section className="settings__section cancellation-preview" aria-label="Cancellation preview">
    <h3>Cancellation preview</h3>
    <p>Inspect an event, race or day before planning a cancellation. You can record a reviewed plan after loading its impact. Loading a preview or recording a plan changes no entries, places, payments or messages. The separate simulation step can execute an eligible plan.</p>
    <div className="form-row">
      <Field label="Cancellation scope">{(id) => <select id={id} className="input" value={selection.scope} disabled={confirmationPending} onChange={(e) => change(e.target.value === 'race' ? { scope: 'race', raceId: catalog?.config.races[0]?.id ?? '' } : e.target.value === 'day' ? { scope: 'day', dayId: catalog?.config.days[0]?.id ?? '' } : { scope: 'event' })}>
        <option value="event">Entire event</option><option value="race" disabled={!catalog?.config.races.length}>One race</option><option value="day" disabled={!catalog?.config.days.length}>One day</option>
      </select>}</Field>
      {selection.scope === 'race' && <Field label="Published race">{(id) => <select id={id} className="input" value={selection.raceId} disabled={confirmationPending} onChange={(e) => change({ scope: 'race', raceId: e.target.value })}>{catalog?.config.races.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>}</Field>}
      {selection.scope === 'day' && <Field label="Published day">{(id) => <select id={id} className="input" value={selection.dayId} disabled={confirmationPending} onChange={(e) => change({ scope: 'day', dayId: e.target.value })}>{catalog?.config.days.map((d) => <option key={d.id} value={d.id}>{d.label} ({d.date})</option>)}</select>}</Field>}
    </div>
    {confirmationPending && <p className="note">Resolve the original plan or execution request below before starting another review. Its original scope is shown in the recovery details.</p>}
    <button ref={previewButton} type="button" className="btn btn--secondary" aria-disabled={busy || confirmationPending} onClick={() => void load()}>{busy ? 'Loading cancellation preview…' : 'Preview cancellation impact'}</button>
    {error && <p className="alert alert--error" role="alert">Could not load the cancellation preview: {error} Try Preview cancellation impact again.</p>}
    <p className="small" role="status" aria-label="Cancellation impact status" aria-atomic="true">{busy ? 'Loading current published cancellation impact…' : data ? `Preview loaded: ${count(data.entries.length, 'live entry', 'live entries')}, ${count(data.waitlist.length, 'active waitlist record')}.${data.financial.requiresFinancialReconciliation ? ' Financial reconciliation required.' : ''}` : ''}</p>
    {data && <>
      <p className="small">Published version {data.currentPublishedVersion} · Assessed {formatDateTime(data.generatedAt)} · Point-in-time snapshot; reload before making decisions.</p>
      <p><strong>{data.unaffectedLiveEntryIds.length} unaffected live {data.unaffectedLiveEntryIds.length === 1 ? 'entry remains' : 'entries remain'} in the affected orders.</strong> Accepted prices and package allocations stay unchanged.</p>
      {data.entries.length === 0 && data.waitlist.length === 0 && <p>No live entries or active waitlist records are affected. Capacity may still include test reservations.</p>}
      <details><summary>Affected entries ({data.entries.length})</summary><ul>{data.entries.map((e) => <li key={e.id}>{orderName(e.orderId)} · {category(e.categoryId)} · entry {e.entryStatus}; order {e.orderStatus}</li>)}</ul></details>
      <details><summary>Waitlists ({data.waitlist.length})</summary><ul>{data.waitlist.map((w) => <li key={w.id}>{category(w.categoryId)} · {w.status}</li>)}</ul></details>
      <h4>Hypothetical capacity</h4>
      <p className="small">Assumes removal of all selected reservations, including test entries and live offers. These are distinct-rider counts, not places available for resale.</p>
      {data.capacity.length ? <div className="table-wrap" tabIndex={0} role="region" aria-label="Hypothetical capacity limits"><table><thead><tr><th scope="col">Limit</th><th scope="col">Used now</th><th scope="col">Would remain</th><th scope="col">Would release</th></tr></thead><tbody>{data.capacity.map((l) => <tr key={`${l.kind}:${l.id}`}><th scope="row">{l.name} ({l.kind.replace('_', ' ')})</th><td>{l.used}</td><td>{l.hypotheticalUsedAfter}</td><td>{l.hypotheticalReleasedPlaces}</td></tr>)}</tbody></table></div> : <p>No configured capacity limits apply.</p>}
      <h4>Financial review required</h4>
      <p>Original paid entry allocations: {formatDollars(data.financial.acceptedEntryAllocationCents)}. Excluded whole-order fees: {formatDollars(data.financial.orders.reduce((sum, o) => sum + o.excludedWholeOrderFeesCents, 0))}.</p>
      <p className="small">Paid allocations cover confirmed entries on confirmed orders. Holds and unsettled payments need separate review. Policy amounts below are before prior refunds or external credits; they are not a refundable balance.</p>
      <details><summary>Accepted paid policies ({data.financial.entries.length})</summary><ul>{data.financial.entries.map((e) => <li key={e.entryId}>{orderName(e.orderId)} · {category(e.currentCategoryId)} · accepted version {e.acceptedVersion} · paid allocation {formatDollars(e.acceptedEntryCents)}.{e.policy && <> Policy: {formatDollars(e.policy.amountCents)} {e.policy.returnAs === 'cash' ? 'cash' : e.policy.returnAs === 'credit' ? 'credit' : 'rider’s choice of cash or credit'}.</>}{e.reviewReasons.length > 0 && <ul>{e.reviewReasons.map((r) => <li key={r}>{r}</li>)}</ul>}</li>)}</ul></details>
      <h4>Saved start lists and communications</h4>
      <p>{count(data.startListSnapshots.length, 'saved start-list snapshot')} {data.startListSnapshots.length === 1 ? 'is' : 'are'} affected. Saved files remain unchanged; previous exports cannot be recalled.</p>
      <p>Audience records: {count(data.communicationAudience.orderIds.length, 'order')} and {count(data.communicationAudience.waitlistEntryIds.length, 'additional waitlist record')}. These are not a count of unique recipients. Message wording and delivery are not available.</p>
      <details><summary>Preview limits and next steps</summary><ul>{data.limitations.map((text) => <li key={text}>{text}</li>)}</ul><p>This preview executes nothing. A recorded plan and a separate acknowledged simulation step are required. A future action requires a fresh preview and financial reconciliation.</p></details>
    </>}
    <PlanConfirmation refreshKey={orders} onExecutionSaved={onExecutionSaved} eventId={eventId} prepared={result} onPendingChange={setConfirmationPending} onResetPreview={() => { clear(); previewButton.current?.focus(); }} />
  </section>;
}
