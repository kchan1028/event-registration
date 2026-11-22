import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { BIB_SCOPES, rangeFor, canCheckInWithBib, changedBibAssignments, type BibChange, type BibReassignmentPlan, type BibSettings, type CheckInReadinessConflict } from '../shared/checkin';
import { formatTime } from '../shared/format';
import { api, ApiError, type CheckInList, type CheckInRider } from './api';
import { EmergencyContactLookup } from './EmergencyContact';
import { can } from '../shared/roles';
import { WalkUpRegistration } from './WalkUpRegistration';
import { AutomaticBibs } from './AutomaticBibs';
import { BibReassignmentPreview } from './BibReassignmentPreview';
import { BibBatchPanel, type BibBatchMode } from './BibBatchPanel';
import { href } from './App';
import { Icon, ThemeToggle } from './ui';

type CheckInRecovery = 'pending' | Pick<CheckInRider, 'bib' | 'checkedInAt'>;

function recoveryKey(eventId: string, dayId: string, orderId: string) {
  return JSON.stringify([eventId, dayId, orderId]);
}

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
  const [recovery, setRecovery] = useState(() => new Map<string, CheckInRecovery>());
  const [lookupError, setLookupError] = useState<string | null>(null);
  const lookupVersion = useRef(0);
  const [batchMode, setBatchMode] = useState<BibBatchMode | null>(null);
  const [showBibs, setShowBibs] = useState(false);
  const [showRegistration, setShowRegistration] = useState(false);
  const [scanning, setScanning] = useState(false);
  const detailRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  /** When the volunteer started looking for the current rider (first keystroke or scan into an empty search). */
  const startedAt = useRef<number | null>(null);
  const takeDuration = () => {
    const start = startedAt.current;
    startedAt.current = null;
    return start === null ? null : Math.round(performance.now() - start);
  };

  const load = useCallback(
    (query: string, day: string | null) => {
      const version = lookupVersion.current;
      return api
        .checkInList(eventId, day, query)
        .then((d) => {
          if (version !== lookupVersion.current) return;
          setData(d);
          setError(null);
        })
        .catch((e: ApiError) => {
          if (version === lookupVersion.current) setError(e.message);
        });
    },
    [eventId],
  );

  useEffect(() => {
    const t = setTimeout(() => void load(q, dayId), q ? 150 : 0);
    return () => clearTimeout(t);
  }, [q, dayId, load]);

  const refreshCurrentList = useRef(() => {});
  refreshCurrentList.current = () => { void load(q, dayId); };

  const riders = data?.riders ?? [];
  const selected = riders.find((r) => r.orderId === selectedId) ?? null;
  const day = data?.days.find((d) => d.id === data.dayId);
  const selectedRecoveryKey = selected && data ? recoveryKey(eventId, data.dayId, selected.orderId) : null;

  function updateRecovery(key: string, state: CheckInRecovery | undefined) {
    setRecovery((current) => {
      if (current.get(key) === state) return current;
      const next = new Map(current);
      if (state) next.set(key, state);
      else next.delete(key);
      return next;
    });
  }

  function clearVerification() {
    if (selectedRecoveryKey && typeof recovery.get(selectedRecoveryKey) === 'object') {
      updateRecovery(selectedRecoveryKey, undefined);
    }
  }

  function select(r: CheckInRider) {
    if (r.orderId !== selectedId) clearVerification();
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
    await lookup(q);
  }

  /** Look up typed, scanned, or camera-read text and open the rider when exactly one matches. */
  async function lookup(text: string) {
    const query = text.trim();
    if (!query) return;
    const version = ++lookupVersion.current;
    setLookupError(null);
    try {
      const fresh = await api.checkInList(eventId, dayId, query);
      if (version !== lookupVersion.current) return;
      // Discard background reads that started before this explicit result arrived.
      lookupVersion.current++;
      setData(fresh);
      setError(null);
      if (fresh.riders.length === 1) {
        const rider = fresh.riders[0];
        const key = recoveryKey(eventId, fresh.dayId, rider.orderId);
        if (recovery.get(key) === 'pending') {
          updateRecovery(key, { bib: rider.bib, checkedInAt: rider.checkedInAt });
        }
        select(rider);
      }
    } catch (err) {
      if (version === lookupVersion.current) setLookupError((err as ApiError).message);
    }
  }

  function replace(r: CheckInRider, savedDayId: string) {
    clearVerification();
    setData((current) => {
      if (current?.dayId !== savedDayId) return current;
      return { ...current, riders: current.riders.map((rider) => (rider.orderId === r.orderId ? r : rider)) };
    });
    refreshCurrentList.current();
  }

  function nextRider() {
    clearVerification();
    lookupVersion.current++;
    setLookupError(null);
    setSelectedId(null);
    startedAt.current = null;
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
                    lookupVersion.current++;
                    setLookupError(null);
                    clearVerification();
                    setDayId(d.id);
                    setSelectedId(null);
                  }}
                />
                {d.label}
              </label>
            ))}
          </div>
        )}
        {data && can(data.roles, 'checkin.settings') && <button type="button" className="btn btn--secondary btn--small" aria-expanded={batchMode === 'unassigned'} onClick={() => setBatchMode((v) => v === 'unassigned' ? null : 'unassigned')}>Assign bibs</button>}
        {data && can(data.roles, 'checkin.settings') && <button type="button" className="btn btn--secondary btn--small" aria-expanded={batchMode === 'reassign'} onClick={() => setBatchMode((v) => v === 'reassign' ? null : 'reassign')}>Reassign bibs</button>}
        {data && can(data.roles, 'checkin.settings') && <button type="button" className="btn btn--secondary btn--small" aria-expanded={showBibs} onClick={() => setShowBibs((v) => !v)}>
          Bib ranges
        </button>}
        {data && <button type="button" className="btn btn--secondary btn--small" aria-expanded={showRegistration} onClick={() => setShowRegistration((open) => !open)}>Register a walk-up</button>}
        <a className="btn btn--secondary btn--small" href={href({ page: 'roster', eventId })}>
          Fallback roster
        </a>
      </CheckInBar>

      {data?.isDemo && (
        <p className="demo-banner">
          <strong>Example data.</strong> Fictional riders, test payments, and simulated license reviews. Nothing here is a real entry or a real license check.
        </p>
      )}

      {data && showRegistration && <WalkUpRegistration eventId={eventId} dayId={data.dayId} published={data.published} />}

      {data && batchMode && can(data.roles, 'checkin.settings') && <BibBatchPanel key={eventId + data.dayId + batchMode} eventId={eventId} dayId={data.dayId} mode={batchMode} onChanged={() => refreshCurrentList.current()} onClose={() => setBatchMode(null)} />}

      {data && showBibs && can(data.roles, 'checkin.settings') && <>
        <BibSettingsPanel data={data} onSaved={() => void load(q, dayId)} onClose={() => setShowBibs(false)} />
        <AutomaticBibs key={eventId} eventId={eventId} />
      </>}

      {data && (
        <>
          <dl className="stat-grid" aria-label={`${day?.label ?? 'Today'} at a glance`}>
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
              <dt>Bibs assigned</dt>
              <dd>{data.summary.bibsAssigned}</dd>
            </div>
            <div>
              <dt>Median check-in</dt>
              <dd>{data.summary.timing.medianSeconds === null ? 'Not timed yet' : `${data.summary.timing.medianSeconds} s`}</dd>
              {data.summary.timing.timed > 0 && (
                <span className="ci__timing">
                  95th percentile {data.summary.timing.p95Seconds} s · {data.summary.timing.timed} timed
                </span>
              )}
            </div>
          </dl>

          {!rangeFor(data.settings, data.dayId) && (
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
                  onChange={(e) => {
                    if (!q && e.target.value && startedAt.current === null) startedAt.current = performance.now();
                    if (!e.target.value) startedAt.current = null;
                    lookupVersion.current++;
                    setLookupError(null);
                    setQ(e.target.value);
                  }}
                />
              </form>
              {lookupError && <p className="text-error small" role="alert">{lookupError}</p>}
              <button
                type="button"
                className="btn btn--secondary btn--small ci__scan-btn"
                aria-expanded={scanning}
                onClick={() => {
                  if (!scanning && startedAt.current === null) startedAt.current = performance.now();
                  setScanning((v) => !v);
                }}
              >
                {scanning ? 'Stop camera' : 'Scan with camera'}
              </button>
              {scanning && (
                <CameraScan
                  onCode={(code) => {
                    setScanning(false);
                    setQ(code);
                    void lookup(code);
                  }}
                  onClose={() => setScanning(false)}
                />
              )}
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
                        <RowStatus r={r} needsLookup={recovery.get(recoveryKey(eventId, data.dayId, r.orderId)) === 'pending'} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </aside>

            <section className="ci__detail" ref={detailRef} tabIndex={-1} aria-label="Rider check-in">
              {selected && selectedRecoveryKey ? (
                <RiderDetail key={selectedRecoveryKey} eventId={eventId} dayId={data.dayId} rider={selected}
                  recovery={recovery.get(selectedRecoveryKey)} onRecovery={(state) => updateRecovery(selectedRecoveryKey, state)}
                  onChange={(rider) => replace(rider, data.dayId)} onNext={nextRider} takeDuration={takeDuration} />
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

function RowStatus({ r, needsLookup }: { r: CheckInRider; needsLookup: boolean }) {
  if (needsLookup) {
    return <span className="ci-chip ci-chip--blocked"><Icon name="warn" size={14} /> Verify check-in</span>;
  }
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

function RiderDetail({ eventId, dayId, rider, recovery, onRecovery, onChange, onNext, takeDuration }: { eventId: string; dayId: string; rider: CheckInRider; recovery: CheckInRecovery | undefined; onRecovery: (state: CheckInRecovery | undefined) => void; onChange: (r: CheckInRider) => void; onNext: () => void; takeDuration: () => number | null }) {
  const [bib, setBib] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [newBib, setNewBib] = useState('');
  const [reason, setReason] = useState('');
  const [acknowledgeCheckedIn, setAcknowledgeCheckedIn] = useState(false);
  const [bibPreview, setBibPreview] = useState<{ input: BibChange; plan: BibReassignmentPlan } | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [undoReason, setUndoReason] = useState('');

  const resultRef = useRef<HTMLDivElement>(null);
  const issuedBibId = useId();
  const focusNextAfterCheckIn = useRef(false);
  const checkInFocusEvents = useRef<AbortController | null>(null);
  useEffect(() => () => checkInFocusEvents.current?.abort(), []);
  const focusNextRider = useCallback((button: HTMLButtonElement | null) => {
    if (button && focusNextAfterCheckIn.current) {
      focusNextAfterCheckIn.current = false;
      button.focus();
    }
  }, []);

  async function markWalkUp(entryId: string) {
    setBusy(true);
    setError(null);
    try {
      onChange(await api.markWalkUp(eventId, rider.orderId, dayId, entryId));
      resultRef.current?.focus();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  async function undo(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onChange(await api.undoCheckIn(eventId, rider.orderId, dayId, undoReason));
      setUndoing(false);
      setUndoReason('');
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  async function checkIn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (recovery === 'pending') return;
    const form = e.currentTarget;
    const focusEvents = new AbortController();
    checkInFocusEvents.current = focusEvents;
    let pointedAway = false;
    const markPointerDeparture = (event: PointerEvent) => {
      if (event.target instanceof Node && !form.contains(event.target)) pointedAway = true;
    };
    document.addEventListener('pointerdown', markPointerDeparture, { capture: true, signal: focusEvents.signal });
    const shouldFollowResult = () => {
      // Disabling the submit button can move focus to the body without a user gesture.
      const active = document.activeElement;
      return !pointedAway && (form.contains(active) || active === document.body);
    };
    setBusy(true);
    setError(null);
    onRecovery(undefined);
    try {
      const result = await api.checkIn(eventId, rider.orderId, dayId, rider.bib !== null ? null : bib.trim() ? Number(bib) : null, takeDuration());
      if (result?.orderId === rider.orderId && typeof result.bib === 'number' && typeof result.checkedInAt === 'string') {
        focusNextAfterCheckIn.current = shouldFollowResult();
        onChange(result);
      } else {
        onRecovery('pending');
      }
    } catch (err) {
      if (err instanceof ApiError && (err.status === 0 || err.status >= 500)) {
        onRecovery('pending');
      } else {
        const conflict = err instanceof ApiError && err.status === 409 ? err.details as Partial<CheckInReadinessConflict> | undefined : undefined;
        if (conflict?.code === 'check_in_not_ready' && conflict.dayId === dayId && conflict.rider?.orderId === rider.orderId && conflict.rider.result?.ready === false) {
          onChange(conflict.rider);
          requestAnimationFrame(() => {
            if (shouldFollowResult()) resultRef.current?.focus();
          });
        } else {
          setError((err as ApiError).message);
        }
      }
    } finally {
      focusEvents.abort();
      if (checkInFocusEvents.current === focusEvents) checkInFocusEvents.current = null;
      setBusy(false);
    }
  }

  async function changeBib(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (bibPreview) {
        onChange(await api.changeBib(eventId, rider.orderId, bibPreview.input, bibPreview.plan.fingerprint));
        setChanging(false);
        setNewBib('');
        setReason('');
        setAcknowledgeCheckedIn(false);
        setBibPreview(null);
      } else {
        const input = { dayId, bib: Number(newBib), reason, acknowledgeCheckedIn };
        setBibPreview({ input, plan: await api.previewBibChange(eventId, rider.orderId, input) });
      }
    } catch (err) {
      setBibPreview(null);
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  const ready = rider.result.ready;
  const hasBib = canCheckInWithBib(rider);
  const done = !!rider.checkedInAt && rider.bib !== null;
  const verified = typeof recovery === 'object' && recovery.bib === rider.bib && recovery.checkedInAt === rider.checkedInAt;
  let guidance = 'Do not issue a bib. Send the rider to the registration desk.';
  if (ready) {
    if (done) guidance = 'Checked in. Hand over the bib below.';
    else if (hasBib) guidance = 'Check them in and hand over a bib.';
    else guidance = 'No preassigned bib. Refer advance entries to the registration lead for allocation.';
  }
  if (recovery === 'pending') guidance = 'Search for this rider’s check-in code or narrow the search to one match before handing over a bib or retrying check-in.';

  return (
    <div className="ci-detail">
      <div className="ci-detail__who">
        <h2>{rider.name}</h2>
        <p className="muted">{[rider.team || 'No team', `racing age ${rider.racingAge}`].join(' · ')}</p>
        <EmergencyContactLookup key={rider.orderId} eventId={eventId} riderName={rider.name} orderId={rider.orderId} />
      </div>

      <div className={`ci-result ${ready ? 'ci-result--ready' : 'ci-result--blocked'}`} role="status" ref={resultRef} tabIndex={-1}>
        <svg aria-hidden="true" viewBox="0 0 16 16" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d={ready ? 'm3.5 8.5 3 3 6-7' : 'M4 4l8 8M12 4l-8 8'} />
        </svg>
        <div>
          <p className="ci-result__head">{ready ? 'Ready to race' : 'Not ready'}</p>
          <p className="ci-result__sub">{guidance}</p>
          {verified && <p className="ci-result__sub">
            {done ? `Lookup confirmed check-in with bib ${rider.bib}.` : 'Lookup confirmed check-in was not recorded.'}
          </p>}
        </div>
      </div>

      {recovery === 'pending' && (
        <p className="text-error small" role="alert">Check-in could not be confirmed.</p>
      )}

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
                <div>
                  <strong>{e.categoryName}</strong>
                  <span className="muted small"> · {e.raceName}</span>
                  {e.walkUp && <span className="muted small"> · Walk-up</span>}
                  {!e.walkUp && rider.payment === 'confirmed' && rider.bib === null && (
                    <div className="ci-entries__walk-up">
                      <button type="button" className="btn btn--secondary" disabled={busy || recovery === 'pending'}
                        aria-label={`Mark as walk-up: ${e.categoryName}, ${e.raceName}`} onClick={() => void markWalkUp(e.id)}>
                        Mark as walk-up
                      </button>
                    </div>
                  )}
                </div>
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
            {rider.payment === 'confirmed' ? 'Paid' : 'Payment not complete'}
          </li>
          {rider.readiness.map((item) => (
            <li key={item.key} className={item.state === 'done' ? 'is-done' : item.state === 'needs_review' ? 'is-review' : 'is-missing'}>
              <Icon name={item.state === 'done' ? 'check' : item.state === 'needs_review' ? 'warn' : 'error'} size={14} />
              {item.label}
            </li>
          ))}
        </ul>
      </div>

      {recovery !== 'pending' && <div className="ci-section ci-bib">
        {!done && rider.bib !== null && <>
          <p className="ci-bib__label">Assigned bib (before check-in)</p>
          <p className="ci-bib__number">{rider.bib}</p>
          <p className="muted small">This number is reserved. Hand it over only after readiness is cleared and check-in is recorded.</p>
          {!changing && <button type="button" className="btn btn--secondary" onClick={() => setChanging(true)}>Change bib</button>}
        </>}
        {done ? (
          <>
            <p id={`${issuedBibId}-label`} className="ci-bib__label">Bib</p>
            <p id={issuedBibId} className="ci-bib__number">{rider.bib}</p>
            <p className="muted small">Checked in at {new Date(rider.checkedInAt!).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. Checking in again keeps this bib.</p>
            <div className="ci-bib__actions">
              <button
                type="button"
                className="btn btn--primary"
                ref={focusNextRider}
                aria-describedby={`${issuedBibId}-label ${issuedBibId}`}
                onKeyDown={(event) => {
                  // The Enter press that submitted check-in can still be held when focus arrives.
                  if (event.key === 'Enter' && event.repeat) event.preventDefault();
                }}
                onClick={onNext}
              >
                Next rider
              </button>
              {!changing && !undoing && (
                <button type="button" className="btn btn--secondary" onClick={() => setChanging(true)}>
                  Change bib
                </button>
              )}
              {!changing && !undoing && (
                <button type="button" className="btn btn--ghost" onClick={() => setUndoing(true)}>
                  Undo check-in
                </button>
              )}
            </div>
            {undoing && (
              <form className="ci-bib__change" onSubmit={undo}>
                <p className="small">This removes today’s check-in and releases the bib (unless it also covers another day the rider is checked in for). The rider must be checked in again before racing.</p>
                <label>
                  Reason
                  <input className="input" required minLength={3} placeholder="For example: checked in the wrong rider" value={undoReason} onChange={(e) => setUndoReason(e.target.value)} />
                </label>
                <div className="ci-bib__actions">
                  <button type="submit" className="btn btn--primary" disabled={busy}>
                    Undo check-in
                  </button>
                  <button type="button" className="btn btn--ghost" onClick={() => setUndoing(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            )}

          </>
        ) : ready && hasBib && !changing ? (
          <form onSubmit={checkIn} className="ci-bib__issue">
            {rider.bib === null && <label>
              Bib <span className="muted small">(leave empty for the next free bib)</span>
              <input className="input ci-bib__input" inputMode="numeric" pattern="[0-9]*" value={bib} onChange={(e) => setBib(e.target.value.replace(/\D/g, ''))} />
            </label>}
            <button type="submit" className="btn btn--primary btn--large" disabled={busy}>
              {busy ? 'Checking in…' : rider.bib !== null ? `Check in and issue bib ${rider.bib}` : bib ? `Check in with bib ${bib}` : 'Check in and issue next bib'}
            </button>
          </form>
        ) : null}
            {changing && (
              <form className="ci-bib__change" onSubmit={changeBib} aria-label="Change rider bib">
                <label>
                  New bib
                  <input className="input" inputMode="numeric" pattern="[0-9]*" disabled={busy} required value={newBib} onChange={(e) => { setNewBib(e.target.value.replace(/\D/g, '')); setBibPreview(null); }} />
                </label>
                <label>
                  Reason
                  <input className="input" disabled={busy} required minLength={3} placeholder="For example: bib damaged" value={reason} onChange={(e) => { setReason(e.target.value); setBibPreview(null); }} />
                </label>
                <label className="ci-batch__choice"><input type="checkbox" disabled={busy} checked={acknowledgeCheckedIn} onChange={(e) => { setAcknowledgeCheckedIn(e.target.checked); setBibPreview(null); }} />I approve changing this rider’s issued bib if already checked in.</label>
                {bibPreview && <BibReassignmentPreview plan={bibPreview.plan} />}
                <div className="ci-bib__actions">
                  <button type="submit" className="btn btn--primary" disabled={busy || (!!bibPreview && !changedBibAssignments(bibPreview.plan).length)}>
                    {bibPreview ? 'Apply bib change' : 'Preview bib change'}
                  </button>
                  <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => { setChanging(false); setBibPreview(null); setAcknowledgeCheckedIn(false); }}>
                    Cancel
                  </button>
                </div>
              </form>
            )}
        {error && (
          <p className="text-error small" role="alert">
            {error}
          </p>
        )}
      </div>}

      {recovery !== 'pending' && rider.bibHistory.some((h) => h.releasedAt) && (
        <div className="ci-section">
          <h3>Bib history</h3>
          <ul className="ci-history">
            {rider.bibHistory.map((h) => (
              <li key={h.assignedAt}>
                <strong>{h.bib}</strong> {h.releasedAt ? `released: ${h.reason}` : 'current'}
              </li>
            ))}
          </ul>
        </div>
      )}

      {recovery !== 'pending' && rider.undoneCheckIns.length > 0 && (
        <div className="ci-section">
          <h3>Undone check-ins</h3>
          <ul className="ci-history">
            {rider.undoneCheckIns.map((u) => (
              <li key={u.undoneAt}>
                Checked in {new Date(u.checkedInAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}, undone {new Date(u.undoneAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                {u.bib !== null ? (u.bibReleased ? ` · bib ${u.bib} released` : ` · bib ${u.bib} kept for another day`) : ''}: {u.reason}
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
          {BIB_SCOPES.map((s) => (
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

/** Minimal typing for the browser's built-in BarcodeDetector (Chrome and Edge). */
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (opts: { formats: string[] }) => BarcodeDetectorLike;

/**
 * Read a check-in QR code with the device camera. Uses the browser's built-in barcode detector,
 * so it works in Chrome and Edge; elsewhere it explains that typing or a USB scanner still works.
 * The video stays on this device; nothing is recorded or sent.
 */
function CameraScan({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;

  useEffect(() => {
    if (!Detector) return;
    let stream: MediaStream | null = null;
    let timer: number | null = null;
    let done = false;
    const detector = new Detector({ formats: ['qr_code'] });
    (async () => {
      try {
        const opened = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        const video = videoRef.current;
        if (done || !video) {
          opened.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = opened;
        video.srcObject = stream;
        await video.play();
        if (done) return;
        timer = window.setInterval(async () => {
          if (done || !videoRef.current) return;
          try {
            const found = await detector.detect(videoRef.current);
            const value = found[0]?.rawValue?.trim();
            if (value && !done) {
              done = true;
              onCode(value);
            }
          } catch {
            /* frame not ready yet */
          }
        }, 250);
      } catch {
        if (done) return;
        setError('The camera could not be opened. Allow camera access for this page, or type the code instead.');
      }
    })();
    return () => {
      done = true;
      if (timer !== null) window.clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!Detector) {
    return (
      <p className="ci__notice small" role="status">
        This browser cannot read QR codes from the camera. Use Chrome or Edge, a USB scanner, or type the code.{' '}
        <button type="button" className="link-btn" onClick={onClose}>
          Close
        </button>
      </p>
    );
  }
  return (
    <div className="ci__camera">
      <video ref={videoRef} className="ci__video" muted playsInline aria-label="Camera view for scanning a check-in QR code" />
      {error ? (
        <p className="text-error small" role="alert">
          {error}
        </p>
      ) : (
        <p className="muted small" role="status">
          Hold the rider’s QR code in front of the camera.
        </p>
      )}
    </div>
  );
}
