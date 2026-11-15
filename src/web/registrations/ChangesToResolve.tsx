import { useState } from 'react';
import { api, type ApiError, type ResolutionItem } from '../api';
import { useLoad } from '../useLoad';

const OUTCOME_LABEL: Record<ResolutionItem['status'], string> = { open: 'Open', kept: 'Kept as is', transferred: 'Transferred', withdrawn: 'Withdrawn' };

/**
 * Paid entries affected by a published change, one item each. The organizer records the outcome,
 * confirms the rider was told, and adds a note. Transfer or withdraw the entry on its order first.
 */
export function ChangesToResolve({ eventId, refreshKey }: { eventId: string; refreshKey: unknown }) {
  const { data: items, setData: setItems, error } = useLoad(() => api.resolutions(eventId), [eventId, refreshKey]);
  if (!items || items.length === 0) return error ? <p className="alert alert--error">{error}</p> : null;
  const open = items.filter((i) => i.status === 'open');
  const done = items.filter((i) => i.status !== 'open');
  return (
    <section className="settings__section" aria-labelledby="resolve-title">
      <h3 id="resolve-title">Changes to resolve{open.length > 0 ? ` (${open.length})` : ''}</h3>
      <p className="muted small">Paid entries affected by a published change. Paid entries keep their price and rules; record what you agreed with each rider. To transfer or withdraw, use the order below first.</p>
      {error && (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      )}
      {open.length === 0 && <p className="note note--ok">Every affected entry is resolved.</p>}
      <ul className="orders">
        {open.map((i) => (
          <ResolveRow key={i.id} eventId={eventId} item={i} onDone={(list) => setItems(list)} />
        ))}
      </ul>
      {done.length > 0 && (
        <details>
          <summary className="small">Resolved ({done.length})</summary>
          <ul className="small">
            {done.map((i) => (
              <li key={i.id}>
                {i.riderName} · {i.categoryName}: {OUTCOME_LABEL[i.status]} · rider told · {i.note}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function ResolveRow({ eventId, item, onDone }: { eventId: string; item: ResolutionItem; onDone: (list: ResolutionItem[]) => void }) {
  const [outcome, setOutcome] = useState<'kept' | 'transferred' | 'withdrawn'>(item.entryStatus === 'withdrawn' ? 'withdrawn' : 'kept');
  const [told, setTold] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    if (!told) return setErr('Confirm that the rider was told about the change.');
    if (note.trim().length < 3) return setErr('Write what was agreed with the rider.');
    setBusy(true);
    setErr(null);
    try {
      onDone(await api.resolveItem(eventId, item.id, { outcome, riderNotified: told, note }));
    } catch (e) {
      setErr((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  const fid = (k: string) => `res-${item.id}-${k}`;
  return (
    <li className="order">
      <div className="order__head">
        <p className="order__name">
          {item.riderName} <span className="muted">· {item.categoryName} · order {item.orderNumber}</span>
        </p>
        <span className="status status--needs_review">Open</span>
      </div>
      <ul className="small">
        {item.details.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
      <div className="review-form" role="group" aria-label={`Resolve change for ${item.riderName}, ${item.categoryName}`}>
        <label className="sr-only" htmlFor={fid('outcome')}>
          Outcome
        </label>
        <select id={fid('outcome')} className="input" value={outcome} onChange={(e) => setOutcome(e.target.value as typeof outcome)}>
          <option value="kept">Keep the entry as it is</option>
          <option value="transferred">Entry was transferred</option>
          <option value="withdrawn">Entry was withdrawn</option>
        </select>
        <input className="input" aria-label="What was agreed with the rider" placeholder="What was agreed, for example: rider is fine with the new start time" value={note} onChange={(e) => setNote(e.target.value)} />
        <label className="check">
          <input type="checkbox" checked={told} onChange={(e) => setTold(e.target.checked)} />
          Rider was told
        </label>
        <button className="btn btn--primary btn--small" disabled={busy} onClick={submit}>
          Record outcome
        </button>
        {err && (
          <span className="text-error small" role="alert">
            {err}
          </span>
        )}
      </div>
    </li>
  );
}
