import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { BibSettings } from '../shared/checkin';
import { formatTime } from '../shared/format';
import { api, ApiError, type CheckInList, type CheckInRider } from './api';
import { href } from './App';
import { Icon, ThemeToggle } from './ui';

/**
 * Race-day check-in. Built for a volunteer at a folding table: find the rider,
 * read one unmistakable ready/blocked result, issue the bib. No payment amounts,
 * emails, or emergency contacts appear here.
 */
export function CheckIn({ eventId }: { eventId: string }) {
  const [dayId, setDayId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [data, setData] = useState<CheckInList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showBibs, setShowBibs] = useState(false);
  const detailRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(
    (query: string, day: string | null) =>
      api
        .checkInList(eventId, day, query)
        .then((d) => {
          setData(d);
          setError(null);
        })
        .catch((e: ApiError) => setError(e.message)),
    [eventId],
  );

  useEffect(() => {
    const t = setTimeout(() => void load(q, dayId), q ? 150 : 0);
    return () => clearTimeout(t);
  }, [q, dayId, load]);

  const riders = data?.riders ?? [];
  const selected = riders.find((r) => r.orderId === selectedId) ?? null;
  const day = data?.days.find((d) => d.id === data.dayId);

  function select(r: CheckInRider) {
    setSelectedId(r.orderId);
    requestAnimationFrame(() => {
      if (window.matchMedia('(max-width: 860px)').matches) detailRef.current?.scrollIntoView({ block: 'start' });
      detailRef.current?.focus({ preventScroll: true });
    });
  }

  /**
   * A scanned or typed search that matches exactly one rider opens that rider.
   * Looks up the current text immediately: a scanner sends Enter before the
   * debounced search returns, so the list on screen may still be stale.
   */
  async function onSearchSubmit(e: FormEvent) {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    try {
      const fresh = await api.checkInList(eventId, dayId, query);
      setData(fresh);
      setError(null);
      if (fresh.riders.length === 1) select(fresh.riders[0]);
    } catch (err) {
      setError((err as ApiError).message);
    }
  }

  function replace(r: CheckInRider) {
    setData((d) => (d ? { ...d, riders: d.riders.map((x) => (x.orderId === r.orderId ? r : x)) } : d));
    void load(q, dayId);
  }

  function nextRider() {
    setSelectedId(null);
    setQ('');
    searchRef.current?.focus();
  }

  if (!data && error) {
    return (
      <div className="ci">
        <CheckInBar eventId={eventId} eventName="" />
        <p className="ci__error" role="alert">
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="ci">
      <CheckInBar eventId={eventId} eventName={data?.eventName ?? ''}>
        {data && data.days.length > 1 && (
          <div className="segmented ci__days" role="radiogroup" aria-label="Race day">
            {data.days.map((d) => (
              <label key={d.id} className={`segmented__opt ${d.id === data.dayId ? 'is-on' : ''}`}>
                <input
                  type="radio"
                  name="ci-day"
                  checked={d.id === data.dayId}
                  onChange={() => {
                    setDayId(d.id);
                    setSelectedId(null);
                  }}
                />
                {d.label}
              </label>
            ))}
          </div>
        )}
        <button type="button" className="btn btn--secondary btn--small" aria-expanded={showBibs} onClick={() => setShowBibs((v) => !v)}>
          Bib ranges
        </button>
      </CheckInBar>

      {data?.isDemo && (
        <p className="demo-banner">
          <strong>Example data.</strong> Fictional riders, simulated payments, and simulated license reviews. Nothing here is a real entry or a real license check.
        </p>
      )}

      {data && showBibs && <BibSettingsPanel data={data} onSaved={() => void load(q, dayId)} onClose={() => setShowBibs(false)} />}

      {data && (
        <>
          <dl className="ci__summary" aria-label={`${day?.label ?? 'Today'} at a glance`}>
            <div>
              <dt>Riders</dt>
              <dd>{data.summary.riders}</dd>
            </div>
            <div>
              <dt>Checked in</dt>
              <dd>{data.summary.checkedIn}</dd>
            </div>
            <div>
              <dt>Blocked</dt>
              <dd>{data.summary.blocked}</dd>
            </div>
            <div>
              <dt>Bibs issued</dt>
              <dd>{data.summary.bibsIssued}</dd>
            </div>
          </dl>

          {!rangeSet(data) && (
            <p className="ci__notice" role="status">
              <Icon name="warn" /> No bib range is set for {data.settings.scope === 'weekend' ? 'this event' : (day?.label ?? 'this day')}. Set one under <strong>Bib ranges</strong> before checking riders in.
            </p>
          )}

          <div className="ci__grid">
            <aside className="ci__list" aria-label="Find a rider">
              <form role="search" onSubmit={onSearchSubmit}>
                <label className="ci__search-label" htmlFor="ci-search">
                  Find a rider
                </label>
                <input
                  id="ci-search"
                  ref={searchRef}
                  className="input ci__search"
                  type="search"
                  autoComplete="off"
                  autoFocus
                  placeholder="Name, team, bib, or check-in code"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </form>
              <p className="ci__count" aria-live="polite">
                {q ? `${riders.length} ${riders.length === 1 ? 'match' : 'matches'}` : `${riders.length} riders on ${day?.label ?? 'this day'}`}
              </p>
              {riders.length === 0 ? (
                <EmptyList data={data} searching={!!q} onAdded={() => void load(q, dayId)} />
              ) : (
                <ul className="ci__results">
                  {riders.map((r) => (
                    <li key={r.orderId}>
                      <button type="button" className={`ci-row ${r.orderId === selectedId ? 'is-selected' : ''}`} aria-current={r.orderId === selectedId ? 'true' : undefined} onClick={() => select(r)}>
                        <span className="ci-row__name">{r.name}</span>
                        <span className="ci-row__meta">{[r.team, r.entries.map((e) => e.categoryName).join(', ')].filter(Boolean).join(' · ') || 'No entry today'}</span>
                        <RowStatus r={r} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </aside>

            <section className="ci__detail" ref={detailRef} tabIndex={-1} aria-label="Rider check-in">
              {selected ? (
                <RiderDetail key={selected.orderId + data.dayId} eventId={eventId} dayId={data.dayId} rider={selected} onChange={replace} onNext={nextRider} />
              ) : (
                <div className="ci__placeholder">
                  <p>Search for a rider or scan their check-in code.</p>
                  <p className="muted small">The result shows whether they are ready to race and which bib to hand over.</p>
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function rangeSet(d: CheckInList): boolean {
  const key = d.settings.scope === 'weekend' ? 'weekend' : d.dayId;
  return d.settings.ranges.some((r) => r.scope === key);
}

function CheckInBar({ eventId, eventName, children }: { eventId: string; eventName: string; children?: ReactNode }) {
  return (
    <header className="ci__bar">
      <a className="btn btn--ghost btn--small" href={href({ page: 'event', eventId, view: 'race', raceId: null })}>
        <Icon name="arrow-left" /> Builder
      </a>
      <div className="ci__title">
        <h1>Race-day check-in</h1>
        {eventName && <span className="ci__event">{eventName}</span>}
      </div>
      <div className="ci__bar-actions">
        {children}
        <ThemeToggle />
      </div>
    </header>
  );
}

function RowStatus({ r }: { r: CheckInRider }) {
  if (r.checkedInAt) {
    return (
      <span className="ci-chip ci-chip--done">
        <Icon name="check" size={14} /> In{r.bib !== null ? ` · ${r.bib}` : ''}
      </span>
    );
  }
  if (r.result.ready) {
    return (
      <span className="ci-chip ci-chip--ready">
        <Icon name="check" size={14} /> Ready
      </span>
    );
  }
  return (
    <span className="ci-chip ci-chip--blocked">
      <Icon name="error" size={14} /> Blocked
    </span>
  );
}

function RiderDetail({ eventId, dayId, rider, onChange, onNext }: { eventId: string; dayId: string; rider: CheckInRider; onChange: (r: CheckInRider) => void; onNext: () => void }) {
  const [bib, setBib] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [newBib, setNewBib] = useState('');
  const [reason, setReason] = useState('');

  async function checkIn(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onChange(await api.checkIn(eventId, rider.orderId, dayId, bib.trim() ? Number(bib) : null));
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  async function changeBib(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onChange(await api.changeBib(eventId, rider.orderId, dayId, Number(newBib), reason));
      setChanging(false);
      setNewBib('');
      setReason('');
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  const ready = rider.result.ready;
  const done = !!rider.checkedInAt && rider.bib !== null;

  return (
    <div className="ci-detail">
      <div className="ci-detail__who">
        <h2>{rider.name}</h2>
        <p className="muted">{[rider.team || 'No team', `racing age ${rider.racingAge}`].join(' · ')}</p>
      </div>

      <div className={`ci-result ${ready ? 'ci-result--ready' : 'ci-result--blocked'}`} role="status">
        <svg aria-hidden="true" viewBox="0 0 16 16" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d={ready ? 'm3.5 8.5 3 3 6-7' : 'M4 4l8 8M12 4l-8 8'} />
        </svg>
        <div>
          <p className="ci-result__head">{ready ? 'Ready to race' : 'Not ready'}</p>
          <p className="ci-result__sub">{ready ? (done ? 'Checked in. Hand over the bib below.' : 'Check them in and hand over a bib.') : 'Do not issue a bib. Send the rider to the registration desk.'}</p>
        </div>
      </div>

      {!ready && (
        <ul className="ci-blockers">
          {rider.result.blockers.map((b) => (
            <li key={b.key}>
              <strong>{b.label}</strong>
              <span>{b.action}</span>
            </li>
          ))}
        </ul>
      )}

      {rider.entries.length > 0 && (
        <div className="ci-section">
          <h3>Racing today</h3>
          <ul className="ci-entries">
            {rider.entries.map((e) => (
              <li key={e.id}>
                <span className="ci-entries__time">{formatTime(e.startTime)}</span>
                <span>
                  <strong>{e.categoryName}</strong>
                  <span className="muted small"> · {e.raceName}</span>
                </span>
                {e.code && <code className="ci-entries__code">{e.code}</code>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="ci-section">
        <h3>Requirements</h3>
        <ul className="ci-reqs">
          <li className={rider.payment === 'confirmed' ? 'is-done' : 'is-missing'}>
            <Icon name={rider.payment === 'confirmed' ? 'check' : 'error'} size={14} />
            {rider.payment === 'confirmed' ? 'Paid (simulated payment)' : 'Payment not complete'}
          </li>
          {rider.readiness.map((item) => (
            <li key={item.key} className={item.state === 'done' ? 'is-done' : item.state === 'needs_review' ? 'is-review' : 'is-missing'}>
              <Icon name={item.state === 'done' ? 'check' : item.state === 'needs_review' ? 'warn' : 'error'} size={14} />
              {item.label}
            </li>
          ))}
        </ul>
      </div>

      <div className="ci-section ci-bib">
        {done ? (
          <>
            <p className="ci-bib__label">Bib</p>
            <p className="ci-bib__number">{rider.bib}</p>
            <p className="muted small">Checked in at {new Date(rider.checkedInAt!).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. Checking in again keeps this bib.</p>
            <div className="ci-bib__actions">
              <button type="button" className="btn btn--primary" onClick={onNext}>
                Next rider
              </button>
              {!changing && (
                <button type="button" className="btn btn--secondary" onClick={() => setChanging(true)}>
                  Change bib
                </button>
              )}
            </div>
            {changing && (
              <form className="ci-bib__change" onSubmit={changeBib}>
                <label>
                  New bib
                  <input className="input" inputMode="numeric" pattern="[0-9]*" required value={newBib} onChange={(e) => setNewBib(e.target.value.replace(/\D/g, ''))} />
                </label>
                <label>
                  Reason
                  <input className="input" required minLength={3} placeholder="For example: bib damaged" value={reason} onChange={(e) => setReason(e.target.value)} />
                </label>
                <div className="ci-bib__actions">
                  <button type="submit" className="btn btn--primary" disabled={busy}>
                    Save new bib
                  </button>
                  <button type="button" className="btn btn--ghost" onClick={() => setChanging(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </>
        ) : ready ? (
          <form onSubmit={checkIn} className="ci-bib__issue">
            <label>
              Bib <span className="muted small">(leave empty for the next free bib)</span>
              <input className="input ci-bib__input" inputMode="numeric" pattern="[0-9]*" value={bib} onChange={(e) => setBib(e.target.value.replace(/\D/g, ''))} />
            </label>
            <button type="submit" className="btn btn--primary btn--large" disabled={busy}>
              {busy ? 'Checking in…' : bib ? `Check in with bib ${bib}` : 'Check in and issue next bib'}
            </button>
          </form>
        ) : null}
        {error && (
          <p className="text-error small" role="alert">
            {error}
          </p>
        )}
      </div>

      {rider.bibHistory.some((h) => h.releasedAt) && (
        <div className="ci-section">
          <h3>Bib history</h3>
          <ul className="ci-history">
            {rider.bibHistory.map((h) => (
              <li key={h.assignedAt}>
                <strong>{h.bib}</strong> {h.releasedAt ? `replaced: ${h.reason}` : 'current'}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function EmptyList({ data, searching, onAdded }: { data: CheckInList; searching: boolean; onAdded: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (searching) return <p className="ci__empty">No rider matches. Check the spelling, or try the team or check-in code.</p>;
  if (!data.published) return <p className="ci__empty">This event is not published yet. Publish it so riders can register, then check them in here.</p>;
  return (
    <div className="ci__empty">
      <p>No registered riders for this day yet.</p>
      {data.isDemo && (
        <>
          <button
            type="button"
            className="btn btn--secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api.addCheckInDemoRiders(data.eventId);
                onAdded();
              } catch (e) {
                setError((e as ApiError).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Add fictional demo riders
          </button>
          {error && (
            <p className="text-error small" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function BibSettingsPanel({ data, onSaved, onClose }: { data: CheckInList; onSaved: () => void; onClose: () => void }) {
  const [draft, setDraft] = useState<BibSettings>(data.settings);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const scopes = draft.scope === 'weekend' ? [{ id: 'weekend', label: 'Whole event' }] : data.days.map((d) => ({ id: d.id, label: d.label }));

  function setRange(scope: string, field: 'first' | 'last', value: string) {
    const n = Number(value.replace(/\D/g, ''));
    setSaved(false);
    setDraft((d) => {
      const existing = d.ranges.find((r) => r.scope === scope) ?? { scope, first: 0, last: 0 };
      const next = { ...existing, [field]: n || 0 };
      return { ...d, ranges: [...d.ranges.filter((r) => r.scope !== scope), next] };
    });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const valid = scopes.map((s) => s.id);
    const ranges = draft.ranges.filter((r) => valid.includes(r.scope) && r.first > 0 && r.last > 0);
    try {
      await api.saveBibSettings(data.eventId, { scope: draft.scope, ranges });
      setError(null);
      setSaved(true);
      onSaved();
    } catch (err) {
      setError((err as ApiError).message);
    }
  }

  return (
    <form className="ci-bibs" onSubmit={save} aria-label="Bib ranges">
      <fieldset>
        <legend>Bib numbers</legend>
        <div className="segmented" role="radiogroup" aria-label="Bib scope">
          {(['weekend', 'day'] as const).map((s) => (
            <label key={s} className={`segmented__opt ${draft.scope === s ? 'is-on' : ''}`}>
              <input type="radio" name="bib-scope" checked={draft.scope === s} onChange={() => setDraft((d) => ({ ...d, scope: s }))} />
              {s === 'weekend' ? 'One bib all weekend' : 'New bib each day'}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="ci-bibs__ranges">
        {scopes.map((s) => {
          const r = draft.ranges.find((x) => x.scope === s.id);
          return (
            <div key={s.id} className="ci-bibs__range">
              <span className="ci-bibs__scope">{s.label}</span>
              <label>
                First
                <input className="input" inputMode="numeric" value={r?.first || ''} onChange={(e) => setRange(s.id, 'first', e.target.value)} />
              </label>
              <label>
                Last
                <input className="input" inputMode="numeric" value={r?.last || ''} onChange={(e) => setRange(s.id, 'last', e.target.value)} />
              </label>
            </div>
          );
        })}
      </div>
      <p className="muted small">Bibs already issued keep their numbers. Two riders can never hold the same bib in the same range.</p>
      <div className="ci-bib__actions">
        <button type="submit" className="btn btn--primary btn--small">
          Save bib ranges
        </button>
        <button type="button" className="btn btn--ghost btn--small" onClick={onClose}>
          Close
        </button>
        {saved && (
          <span className="small text-ok" role="status">
            Saved
          </span>
        )}
      </div>
      {error && (
        <p className="text-error small" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
