import { useEffect, useRef, useState } from 'react';
import { BIB_SORT_LABELS, MAX_BIB_BATCH_SIZE, bibBatchExclusion, changedBibAssignments, bibReassignmentSchema, type BibBatch, type BibPlan, type BibReassignment, type BibReassignmentPlan, type CheckInList } from '../shared/checkin';
import { BibReassignmentPreview } from './BibReassignmentPreview';
import { api, type ApiError } from './api';

export type BibBatchMode = 'unassigned' | 'reassign';
type Preview = { kind: 'unassigned'; batch: BibBatch; plan: BibPlan } | { kind: 'reassign'; batch: BibReassignment; plan: BibReassignmentPlan };

/** Number allocation and explicit reassignment share one selection and preview surface. */
export function BibBatchPanel({ eventId, dayId, mode, onChanged, onClose }: { eventId: string; dayId: string; mode: BibBatchMode; onChanged: () => void; onClose: () => void }) {
  const [data, setData] = useState<CheckInList | null>(null);
  const [raceId, setRaceId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [sort, setSort] = useState<NonNullable<BibBatch['sort']>>('name');
  const [choice, setChoice] = useState<'manual' | 'sequence'>('manual');
  const [reason, setReason] = useState('');
  const [acknowledgeCheckedIn, setAcknowledgeCheckedIn] = useState(false);
  const [newBibs, setNewBibs] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const active = useRef(true);
  const reassigning = mode === 'reassign';

  useEffect(() => {
    active.current = true;
    let ignore = false;
    api.checkInList(eventId, dayId, '').then((result) => {
      if (!ignore) setData(result);
    }).catch((err: ApiError) => { if (!ignore) setError(err.message); });
    return () => { ignore = true; active.current = false; };
  }, [eventId, dayId]);

  function invalidate() {
    setPreview(null);
    setError(null);
    setMessage('');
  }
  function clearSelection() {
    setSelected([]);
    setNewBibs({});
    invalidate();
  }
  async function refreshRiders() {
    const result = await api.checkInList(eventId, dayId, '');
    if (active.current) {
      setData(result);
      setSelected((ids) => ids.filter((id) => result.riders.some((r) => r.orderId === id && !bibBatchExclusion(r, mode))));
    }
  }

  async function allocate() {
    setBusy(true);
    setError(null);
    setMessage('');
    try {
      if (preview) {
        const result = preview.kind === 'unassigned'
          ? await api.applyBibs(eventId, preview.batch, preview.plan.fingerprint)
          : await api.applyReassignments(eventId, preview.batch, preview.plan.fingerprint);
        onChanged();
        if (!active.current) return;
        setPreview(null);
        setSelected([]);
        setNewBibs({});
        setMessage(`${result.applied} ${result.applied === 1 ? 'bib' : 'bibs'} ${reassigning ? 'changed; start-list revisions saved' : 'assigned'}. Readiness and check-in are unchanged.`);
        setData((current) => current && ({ ...current, riders: current.riders.map((r) => {
          const assignment = result.assignments.find((a) => a.orderId === r.orderId);
          return assignment ? { ...r, bib: assignment.bib } : r;
        }) }));
        try { await refreshRiders(); }
        catch { if (active.current) setError(`Numbers were ${reassigning ? 'changed' : 'assigned'}, but the rider list could not refresh. Close and reopen this panel to reload.`); }
      } else {
        const scope = { dayId, ...(raceId ? { raceId } : {}), ...(categoryId ? { categoryId } : {}) };
        if (reassigning) {
          const parsed = bibReassignmentSchema.safeParse(choice === 'manual'
            ? { ...scope, mode: choice, reason, acknowledgeCheckedIn, assignments: selected.map((orderId) => ({ orderId, bib: Number(newBibs[orderId] ?? '') })) }
            : { ...scope, mode: choice, reason, acknowledgeCheckedIn, orderIds: selected, sort });
          if (!parsed.success) { setError(`${parsed.error.issues[0].message} Check the reason and replacement numbers.`); return; }
          const plan = await api.previewReassignments(eventId, parsed.data);
          if (active.current) setPreview({ kind: 'reassign', batch: parsed.data, plan });
        } else {
          const batch: BibBatch = { ...scope, orderIds: selected, sort };
          const plan = await api.previewBibs(eventId, batch);
          if (active.current) setPreview({ kind: 'unassigned', batch, plan });
        }
      }
    } catch (err) {
      onChanged();
      if (active.current) {
        setPreview(null);
        setError((err as ApiError).message + ' Request a new preview before applying.');
        try { await refreshRiders(); }
        catch { if (active.current) setError((err as ApiError).message + ' The rider list could not refresh. Close and reopen this panel to reload.'); }
      }
    } finally { if (active.current) setBusy(false); }
  }

  const categories = data?.categories.filter((c) => !raceId || c.raceId === raceId) ?? [];
  const riders = data?.riders.filter((r) => r.entries.some((e) =>
    (!categoryId || e.categoryId === categoryId) && (!raceId || data.categories.some((c) => c.id === e.categoryId && c.raceId === raceId)))) ?? [];
  const selectable = riders.filter((r) => !bibBatchExclusion(r, mode) && !r.checkedInScope);
  const changeCount = preview?.kind === 'reassign' ? changedBibAssignments(preview.plan).length : preview?.plan.assignments.length ?? 0;
  const noun = reassigning ? 'changes' : 'assignments';

  return <section className="ci-bibs ci-batch" aria-label={reassigning ? 'Bulk bib reassignment' : 'Bulk bib assignment'} aria-busy={busy}>
    <div className="ci-batch__heading">
      <h2>{reassigning ? 'Reassign existing bibs' : 'Assign bibs in bulk'}</h2>
      <button type="button" className="btn btn--ghost btn--small" disabled={busy} onClick={onClose}>{reassigning ? 'Close reassignment' : 'Close assignment'}</button>
    </div>
    <p>{reassigning ? 'Choose existing assignments to change, including checked-in riders only when deliberately selected. Enter numbers yourself or resequence within configured ranges. Review every change before applying; history and check-in are preserved.' : 'Reserve numbers for confirmed riders before check-in. Existing bibs and checked-in riders stay unchanged. A number does not clear a rider or authorize bib handoff.'}</p>
    {!data && !error && <p role="status">Loading riders…</p>}
    {data && <>
      <fieldset disabled={busy} className="ci-batch__controls">
        <legend className="sr-only">Batch scope and order</legend>
        <label>Race<select className="input" value={raceId} onChange={(e) => { setRaceId(e.target.value); setCategoryId(''); clearSelection(); }}>
          <option value="">All races on this day</option>{data.races.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select></label>
        <label>Category<select className="input" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); clearSelection(); }}>
          <option value="">All categories in scope</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
        {reassigning && <label>Replacement numbers<select className="input" value={choice} onChange={(e) => { setChoice(e.target.value as typeof choice); invalidate(); }}>
          <option value="manual">Enter each new number</option><option value="sequence">Resequence selected riders</option>
        </select></label>}
        {(!reassigning || choice === 'sequence') && <label>Assign in order<select className="input" value={sort} onChange={(e) => { setSort(e.target.value as typeof sort); invalidate(); }}>
          {Object.entries(BIB_SORT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>}
      </fieldset>
      {reassigning && <label className="ci-batch__reason">Reason for bib changes<input className="input" disabled={busy} required value={reason} onChange={(e) => { setReason(e.target.value); invalidate(); }} /></label>}
      {reassigning && <label className="ci-batch__choice"><input type="checkbox" disabled={busy} checked={acknowledgeCheckedIn} onChange={(e) => { setAcknowledgeCheckedIn(e.target.checked); invalidate(); }} />I approve changing checked-in riders’ bibs. Select those riders individually.</label>}
      <p className="muted small">Ranges follow each rider’s earliest category with a range on this day, then the event/day range. Narrowing the selection does not override that range.</p>
      <div className="ci-bib__actions">
        <button type="button" className="btn btn--secondary btn--small" disabled={busy || !selectable.length || selectable.length > MAX_BIB_BATCH_SIZE} onClick={() => { setSelected(selectable.map((r) => r.orderId)); invalidate(); }}>Select all {reassigning ? 'assigned' : 'unassigned'} ({selectable.length})</button>
        <button type="button" className="btn btn--ghost btn--small" disabled={busy || !selected.length} onClick={clearSelection}>Clear selection</button>
        <span role="status">{selected.length} selected · maximum {MAX_BIB_BATCH_SIZE.toLocaleString('en-US')} per batch</span>
      </div>
      {!riders.length ? <p>No riders entered in this scope.</p> : <div className="table-wrap ci-batch__table" role="region" aria-label="Riders for bib assignment" tabIndex={0}>
        <table><thead><tr><th scope="col">Select rider</th><th scope="col">Categories</th><th scope="col">Current bib</th>{reassigning && choice === 'manual' && <th scope="col">New bib</th>}<th scope="col">Allocation status</th></tr></thead>
          <tbody>{riders.map((r) => {
            const exclusion = bibBatchExclusion(r, mode);
            return <tr key={r.orderId}>
              <th scope="row"><label className="ci-batch__choice"><input type="checkbox" disabled={busy || !!exclusion || (!selected.includes(r.orderId) && selected.length >= MAX_BIB_BATCH_SIZE)} checked={selected.includes(r.orderId)} onChange={(e) => { setSelected((ids) => e.target.checked ? [...ids, r.orderId] : ids.filter((id) => id !== r.orderId)); invalidate(); }} />{r.name}</label></th>
              <td>{r.entries.map((e) => e.categoryName).join(', ')}</td><td>{r.bib ?? 'Unassigned'}</td>
              {reassigning && choice === 'manual' && <td><input className="input ci-batch__number" inputMode="numeric" aria-label={`New bib for ${r.name}`} disabled={busy || !selected.includes(r.orderId)} value={newBibs[r.orderId] ?? ''} onChange={(e) => { setNewBibs((bibs) => ({ ...bibs, [r.orderId]: e.target.value.replace(/\D/g, '') })); invalidate(); }} /></td>}
              <td>{exclusion ?? (reassigning ? r.checkedInScope ? 'Checked in; explicit approval required' : 'Existing assignment' : r.result.ready ? 'Available for allocation' : 'Available; readiness blocked')}</td>
            </tr>;
          })}</tbody></table>
      </div>}
      {preview?.kind === 'reassign' && <BibReassignmentPreview plan={preview.plan} />}
      {preview?.kind === 'unassigned' && <div className="ci-batch__preview">
        <h3>Review proposed numbers</h3>
        <p>No numbers have been assigned yet. Apply saves the whole batch together; a conflict requires a fresh preview.</p>
        <div className="table-wrap" role="region" aria-label="Proposed bib assignments" tabIndex={0}>
          <table><thead><tr><th scope="col">Rider</th><th scope="col">Current bib</th><th scope="col">Proposed bib</th><th scope="col">Range</th></tr></thead>
            <tbody>{preview.plan.assignments.map((a) => <tr key={a.orderId}><th scope="row">{a.name}</th><td>Unassigned</td><td>{a.bib}</td><td>{a.range.first}–{a.range.last}</td></tr>)}</tbody>
          </table>
        </div>
      </div>}
      <div className="ci-bib__actions">
        <button type="button" className="btn btn--primary" disabled={busy || !selected.length || (!!preview && !changeCount)} onClick={() => void allocate()}>{busy ? 'Working…' : preview ? `Apply ${changeCount} bib ${changeCount === 1 ? reassigning ? 'change' : 'assignment' : noun}` : `Preview bib ${noun}`}</button>
        {preview && <button type="button" className="btn btn--secondary" disabled={busy} onClick={invalidate}>Discard preview</button>}
      </div>
    </>}
    {message && <p role="status" className="text-ok">{message}</p>}
    {error && <p role="alert" className="text-error">{error} {!data && 'Close and reopen this panel to retry loading riders.'}</p>}
  </section>;
}
