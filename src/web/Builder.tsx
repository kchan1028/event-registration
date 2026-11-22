import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { formatDate } from '../shared/format';
import type { EventConfig } from '../shared/schema';
import { countIssues, validateConfig, type Issue } from '../shared/validation';
import { api, ApiError, type EventPayload, type TestEntryResult } from './api';
import { href, navigate, type Route } from './App';
import { CategoryEditor } from './CategoryEditor';
import { CategoryTable } from './CategoryTable';
import { EventSettings, REFUND_RULES_HEADING_ID } from './EventSettings';
import { FieldBoard } from './FieldBoard';
import { IssuesPanel } from './IssuesPanel';
import { Pools } from './Pools';
import { Preview } from './Preview';
import { Publish } from './Publish';
import { StartLists } from './StartLists';
import { Registrations } from './Registrations';
import { CsvImport } from './CsvImport';
import { dayHue, Icon, Pending, ThemeToggle } from './ui';
import { AccountMenu } from './auth';
import { formatMonthDay } from './format';
import { can, ROLE_LABELS, type Role } from '../shared/roles';

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';

export interface Draft {
  /** The event as last loaded or saved. `roles` are the signed-in person's roles in its organization. */
  data: EventPayload & { roles: Role[] };
  /** True when the person may look at the schedule but not change it (no `event.edit`). Edits are ignored. */
  readOnly: boolean;
  config: EventConfig;
  issues: Issue[];
  saveState: SaveState;
  saveError: string | null;
  update: (fn: (c: EventConfig) => EventConfig) => void;
  addTestEntries: (categoryId: string, count: number) => Promise<TestEntryResult>;
  clearTestEntries: () => Promise<number>;
  publish: (acknowledgeWarnings: boolean, acknowledgeImpact?: boolean) => Promise<number>;
  reload: () => void;
}

/**
 * Holds the working copy of the draft and autosaves it. Saves carry the last
 * known revision; the server rejects stale saves instead of overwriting.
 */
function useDraft(eventId: string) {
  const [data, setDataRaw] = useState<Draft['data'] | null>(null);
  // Only GET /api/events/:id sends the caller's roles; payloads from saves and publishes keep the ones already known.
  const setData = useCallback((payload: EventPayload) => setDataRaw((prev) => ({ ...payload, roles: payload.roles ?? prev?.roles ?? [] })), []);
  const readOnly = !can(data?.roles ?? [], 'event.edit');
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  const [config, setConfig] = useState<EventConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const configRef = useRef<EventConfig | null>(null);
  const savedJson = useRef('');
  const revision = useRef(0);
  const inflight = useRef<Promise<void> | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const load = useCallback(() => {
    setLoadError(null);
    api
      .event(eventId)
      .then((payload) => {
        setData(payload);
        setConfig(payload.config);
        configRef.current = payload.config;
        savedJson.current = JSON.stringify(payload.config);
        revision.current = payload.revision;
        setSaveState('saved');
        setSaveError(null);
      })
      .catch((e: ApiError) => setLoadError(e.message));
  }, [eventId, setData]);
  useEffect(load, [load]);

  const flush = useCallback(async (): Promise<boolean> => {
    window.clearTimeout(timer.current);
    if (inflight.current) await inflight.current;
    const cfg = configRef.current;
    if (!cfg) return true;
    const json = JSON.stringify(cfg);
    if (json === savedJson.current) return true;
    setSaveState('saving');
    let ok = false;
    const p = api
      .saveConfig(eventId, revision.current, cfg)
      .then((payload) => {
        revision.current = payload.revision;
        savedJson.current = json;
        setData(payload);
        setSaveError(null);
        setSaveState(configRef.current === cfg ? 'saved' : 'dirty');
        ok = true;
      })
      .catch((e: ApiError) => {
        const conflict = e.status === 409 && typeof e.details === 'object' && e.details !== null && 'currentRevision' in e.details;
        setSaveState(conflict ? 'conflict' : 'error');
        setSaveError(e.message);
      });
    inflight.current = p.finally(() => {
      inflight.current = null;
    });
    await inflight.current;
    if (ok && configRef.current !== cfg) timer.current = window.setTimeout(() => void flush(), 400);
    return ok;
  }, [eventId, setData]);

  const update = useCallback(
    (fn: (c: EventConfig) => EventConfig) => {
      // A person who cannot edit never changes the working copy, so nothing autosaves into a refusal.
      if (!configRef.current || readOnlyRef.current) return;
      const next = fn(configRef.current);
      configRef.current = next;
      setConfig(next);
      setSaveState((s) => (s === 'conflict' ? s : 'dirty'));
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), 500);
    },
    [flush],
  );

  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (configRef.current && JSON.stringify(configRef.current) !== savedJson.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);

  const addTestEntries = useCallback(
    async (categoryId: string, count: number) => {
      if (!(await flush())) throw new ApiError(409, 'Save your changes before adding test entries.');
      const { result, event } = await api.addTestEntries(eventId, categoryId, count);
      setData(event);
      return result;
    },
    [eventId, flush, setData],
  );

  const clearTestEntries = useCallback(async () => {
    const { removed, event } = await api.clearTestEntries(eventId);
    setData(event);
    return removed;
  }, [eventId, setData]);

  const publish = useCallback(
    async (acknowledgeWarnings: boolean, acknowledgeImpact = false) => {
      if (!(await flush())) throw new ApiError(409, 'The latest changes could not be saved, so nothing was published.');
      const payload = await api.publish(eventId, acknowledgeWarnings, acknowledgeImpact);
      setData(payload);
      return payload.publishedVersion;
    },
    [eventId, flush, setData],
  );

  const issues = useMemo(() => (config && data ? validateConfig(config, data.entries) : []), [config, data]);

  const draft: Draft | null =
    data && config ? { data, readOnly, config, issues, saveState, saveError, update, addTestEntries, clearTestEntries, publish, reload: load } : null;
  return { draft, loadError };
}

const WIDE = '(min-width: 1081px)';
function useWide(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(WIDE);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia(WIDE).matches,
  );
}

function IssueCount({ errors, warnings }: { errors: number; warnings: number }) {
  if (errors + warnings === 0) return <span className="issue-count issue-count--ok">No issues</span>;
  return (
    <span className={`issue-count ${errors ? 'issue-count--error' : 'issue-count--warn'}`}>
      {errors > 0 && `${errors} ${errors === 1 ? 'error' : 'errors'}`}
      {errors > 0 && warnings > 0 && ', '}
      {warnings > 0 && `${warnings} ${warnings === 1 ? 'warning' : 'warnings'}`}
    </span>
  );
}

function focusHeading(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ block: 'start' });
  el.focus({ preventScroll: true });
}

export function Builder({ route }: { route: Extract<Route, { page: 'event' }> }) {
  const { draft, loadError } = useDraft(route.eventId);
  const [selected, setSelected] = useState<string | null>(null);
  const wide = useWide();
  // A selection requested together with a navigation survives the route-change reset.
  const pendingSelect = useRef<string | null>(null);
  const pendingSetupFocus = useRef<string | null>(null);

  const raceId = route.view === 'race' ? (route.raceId ?? draft?.config.races[0]?.id ?? null) : null;
  useEffect(() => {
    setSelected(pendingSelect.current);
    pendingSelect.current = null;
  }, [raceId, route.view]);
  useEffect(() => {
    if (route.view !== 'setup' || !pendingSetupFocus.current) return;
    const id = pendingSetupFocus.current;
    const frame = requestAnimationFrame(() => {
      if (pendingSetupFocus.current !== id) return;
      pendingSetupFocus.current = null;
      focusHeading(id);
    });
    return () => cancelAnimationFrame(frame);
  }, [route.view]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (loadError) {
    return (
      <div className="state-page">
        <p className="alert alert--error" role="alert">
          {loadError}
        </p>
        <a className="btn btn--secondary" href="#/">
          Back to organizations
        </a>
      </div>
    );
  }
  if (!draft) return <div className="state-page"><div className="skeleton skeleton--page" aria-label="Loading event" /></div>;

  const { config } = draft;
  if (route.view === 'preview') return <Preview draft={draft} />;

  const counts = countIssues(draft.issues);
  const { roles } = draft.data;
  const editView = route.view === 'setup' || route.view === 'pools' || route.view === 'publish' || route.view === 'import';
  const race = config.races.find((r) => r.id === raceId) ?? null;
  const selectedCategory = selected ? config.categories.find((c) => c.id === selected && c.raceId === race?.id) : undefined;
  // View-only roles have no publishing checks, so their side column exists only for category details or the wide board.
  const showSide = !draft.readOnly || !!selectedCategory || (wide && !!race);

  const openIssue = (issue: Issue) => {
    const t = issue.target;
    if (t.kind === 'category') {
      const cat = config.categories.find((c) => c.id === t.id);
      if (cat) {
        if (route.view === 'race' && raceId === cat.raceId) setSelected(cat.id);
        else {
          pendingSelect.current = cat.id;
          navigate({ page: 'event', eventId: route.eventId, view: 'race', raceId: cat.raceId });
        }
      }
    } else if (t.kind === 'startGroup') {
      const sg = config.startGroups.find((g) => g.id === t.id);
      if (sg) navigate({ page: 'event', eventId: route.eventId, view: 'race', raceId: sg.raceId });
    } else if (t.kind === 'race') navigate({ page: 'event', eventId: route.eventId, view: 'race', raceId: t.id });
    else if (t.kind === 'pool') navigate({ page: 'event', eventId: route.eventId, view: 'pools' });
    else if (issue.key === 'event.refund') {
      if (route.view === 'setup') focusHeading(REFUND_RULES_HEADING_ID);
      else {
        pendingSetupFocus.current = REFUND_RULES_HEADING_ID;
        navigate({ page: 'event', eventId: route.eventId, view: 'setup' });
      }
    } else navigate({ page: 'event', eventId: route.eventId, view: 'setup' });
  };

  return (
    <div className="app">
      <TopBar draft={draft} eventId={route.eventId} errors={counts.errors} warnings={counts.warnings} />
      {config.event.isDemo && (
        <p className="demo-banner" role="note">
          <strong>Example data.</strong> {config.event.demoNotice}
        </p>
      )}
      {draft.readOnly && (
        <p className="alert alert--warn role-banner" role="note">
          You are signed in as {roles.map((r) => ROLE_LABELS[r].toLowerCase()).join(' and ')} for this organization. You can look at the schedule;
          changes need a registration manager or owner.{' '}
          {can(roles, 'checkin') && <a href={href({ page: 'checkin', eventId: route.eventId })}>Open check-in</a>}
          {can(roles, 'startlists') && <a href={href({ page: 'event', eventId: route.eventId, view: 'startlists' })}>Open start lists</a>}
        </p>
      )}
      <div className={`workspace ${selectedCategory ? 'has-selection' : ''} ${showSide ? '' : 'workspace--no-side'}`}>
        <Rail draft={draft} route={route} activeRaceId={race?.id ?? null} errors={counts.errors} warnings={counts.warnings} />
        <main className="main" id="main">
          {route.view === 'race' && race && (
            <>
              <RaceHeader draft={draft} raceId={race.id} />
              <CategoryTable draft={draft} raceId={race.id} selectedId={selected} onSelect={setSelected} />
              {!wide && <FieldBoard draft={draft} raceId={race.id} onSelect={setSelected} selectedId={selected} />}
            </>
          )}
          {route.view === 'race' && !race && (
            <div className="empty">
              <p>{draft.readOnly ? 'This event has no races yet.' : 'This event has no races. Add one in event setup.'}</p>
              {!draft.readOnly && (
                <a className="btn btn--secondary" href={href({ page: 'event', eventId: route.eventId, view: 'setup' })}>
                  Open event setup
                </a>
              )}
            </div>
          )}
          {editView && draft.readOnly && <NoAccess>Event setup, shared pools, import, and publishing need a registration manager or owner.</NoAccess>}
          {route.view === 'setup' && !draft.readOnly && <EventSettings draft={draft} />}
          {route.view === 'pools' && !draft.readOnly && <Pools draft={draft} />}
          {route.view === 'publish' && !draft.readOnly && <Publish draft={draft} onOpenIssue={openIssue} />}
          {route.view === 'registrations' && (can(roles, 'orders.view') ? <Registrations draft={draft} /> : <NoAccess>Registrations need a registration manager, finance, or owner role.</NoAccess>)}
          {route.view === 'import' && !draft.readOnly && <CsvImport draft={draft} />}
          {route.view === 'startlists' && (can(roles, 'startlists') ? <StartLists draft={draft} /> : <NoAccess>Start lists need a timer and exports, registration manager, or owner role.</NoAccess>)}
        </main>
        {selectedCategory && !wide && <div className="scrim" aria-hidden="true" onClick={() => setSelected(null)} />}
        {showSide && (
          <aside
            className={`inspector ${selectedCategory ? 'is-open' : ''} ${wide && race && !selectedCategory ? 'inspector--board' : ''}`}
            aria-label={selectedCategory ? (draft.readOnly ? 'Category details' : 'Category editor') : race && wide ? 'Start groups and shared field limits' : 'Checks before publishing'}
          >
            {selectedCategory ? (
              <CategoryEditor key={selectedCategory.id} draft={draft} categoryId={selectedCategory.id} onClose={() => setSelected(null)} onSelect={setSelected} drawer={!wide} />
            ) : wide && race && route.view === 'race' ? (
              <FieldBoard draft={draft} raceId={race.id} onSelect={setSelected} selectedId={selected} />
            ) : (
              <IssuesPanel issues={draft.issues} config={config} onOpen={openIssue} eventId={route.eventId} />
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

/** Shown in place of a section the signed-in person's roles do not cover (the server refuses it too). */
function NoAccess({ children }: { children: string }) {
  return (
    <div className="empty">
      <p>
        <strong>Your role does not include this section.</strong> {children}
      </p>
    </div>
  );
}

function TopBar({ draft, eventId, errors, warnings }: { draft: Draft; eventId: string; errors: number; warnings: number }) {
  const { data, config, saveState, saveError } = draft;
  const label: Record<SaveState, string> = {
    saved: 'All changes saved',
    dirty: 'Unsaved changes',
    saving: 'Saving…',
    error: 'Not saved',
    conflict: 'Changed elsewhere',
  };
  const published = data.publishedVersion
    ? data.publishedRevision === data.revision && saveState === 'saved'
      ? `Published v${data.publishedVersion}`
      : `Published v${data.publishedVersion} · draft has changes`
    : 'Draft, not published';
  return (
    <header className="topbar">
      <a className="brand" href="#/" aria-label="CycleReg, back to organizations">
        CycleReg
      </a>
      <div className="topbar__crumbs">
        <span className="topbar__org">{data.organizationName}</span>
        <span className="topbar__sep" aria-hidden="true">/</span>
        <h1 className="topbar__event">{config.event.name}</h1>
        <span className="tag">{published}</span>
      </div>
      {draft.readOnly ? (
        <div className="save">View only</div>
      ) : (
        <div className={`save save--${saveState}`} role="status" aria-live="polite">
          <span className="save__dot" aria-hidden="true" />
          {label[saveState]}
          {saveError && (saveState === 'error' || saveState === 'conflict') && <span className="save__detail">{saveError}</span>}
          {saveState === 'conflict' && (
            <button className="btn btn--small btn--secondary" onClick={draft.reload}>
              Reload
            </button>
          )}
        </div>
      )}
      <nav className="topbar__actions" aria-label="Event actions">
        <a className="btn btn--secondary" href={href({ page: 'event', eventId, view: 'preview' })}>
          <Icon name="eye" /> Rider preview
        </a>
        {!draft.readOnly && (
          <>
            <a className="topbar__issues" href={href({ page: 'event', eventId, view: 'publish' })}>
              <IssueCount errors={errors} warnings={warnings} />
            </a>
            <a className="btn btn--primary" href={href({ page: 'event', eventId, view: 'publish' })}>
              Review and publish
            </a>
          </>
        )}
        <ThemeToggle />
        <AccountMenu />
      </nav>
    </header>
  );
}

function Rail({ draft, route, activeRaceId, errors, warnings }: { draft: Draft; route: Extract<Route, { page: 'event' }>; activeRaceId: string | null; errors: number; warnings: number }) {
  const { config } = draft;
  const ev = route.eventId;
  const { roles } = draft.data;
  const edit = !draft.readOnly;
  return (
    <nav className="rail" aria-label="Event sections">
      {edit && (
        <a className={`rail__item ${route.view === 'setup' ? 'is-active' : ''}`} href={href({ page: 'event', eventId: ev, view: 'setup' })} aria-current={route.view === 'setup' ? 'page' : undefined}>
          Event setup
        </a>
      )}
      {config.days.map((day, di) => (
        <div className="rail__day" key={day.id}>
          <p className="rail__day-label">
            {day.label} <span>{formatMonthDay(day.date)}</span>
          </p>
          {config.races
            .filter((r) => r.dayId === day.id)
            .map((r) => {
              const n = config.categories.filter((c) => c.raceId === r.id && c.status !== 'archived').length;
              const active = route.view === 'race' && activeRaceId === r.id;
              return (
                <a
                  key={r.id}
                  className={`rail__race ${active ? 'is-active' : ''}`}
                  style={{ ['--day' as string]: dayHue(di) }}
                  href={href({ page: 'event', eventId: ev, view: 'race', raceId: r.id })}
                  aria-current={active ? 'page' : undefined}
                >
                  <span className="rail__swatch" aria-hidden="true" />
                  <span className="rail__race-name">{r.name}</span>
                  <span className="rail__count" aria-label={`${n} categories`}>
                    {n}
                  </span>
                </a>
              );
            })}
        </div>
      ))}
      {edit && (
        <a className={`rail__item ${route.view === 'pools' ? 'is-active' : ''}`} href={href({ page: 'event', eventId: ev, view: 'pools' })} aria-current={route.view === 'pools' ? 'page' : undefined}>
          Shared capacity pools <span className="rail__count">{config.capacityPools.length}</span>
        </a>
      )}
      {edit && (
        <a className={`rail__item ${route.view === 'import' ? 'is-active' : ''}`} href={href({ page: 'event', eventId: ev, view: 'import' })} aria-current={route.view === 'import' ? 'page' : undefined}>
          Import and export
        </a>
      )}
      {can(roles, 'orders.view') && (
        <a
          className={`rail__item ${route.view === 'registrations' ? 'is-active' : ''}`}
          href={href({ page: 'event', eventId: ev, view: 'registrations' })}
          aria-current={route.view === 'registrations' ? 'page' : undefined}
        >
          Registrations
        </a>
      )}
      {can(roles, 'checkin') && (
        <a className="rail__item" href={href({ page: 'checkin', eventId: ev })}>
          Race-day check-in
        </a>
      )}
      {can(roles, 'startlists') && (
        <a
          className={`rail__item ${route.view === 'startlists' ? 'is-active' : ''}`}
          href={href({ page: 'event', eventId: ev, view: 'startlists' })}
          aria-current={route.view === 'startlists' ? 'page' : undefined}
        >
          Start lists and timer export
        </a>
      )}
      {edit && (
        <a className={`rail__item ${route.view === 'publish' ? 'is-active' : ''}`} href={href({ page: 'event', eventId: ev, view: 'publish' })} aria-current={route.view === 'publish' ? 'page' : undefined}>
          Review and publish
          <IssueCount errors={errors} warnings={warnings} />
        </a>
      )}
      <div className="rail__pending">
        <p className="rail__pending-title">Not connected yet</p>
        <Pending>USA Cycling license checks</Pending>
        <Pending>{draft.data.pending.payments}</Pending>
        <Pending>Multi-factor sign-in for organizers</Pending>
      </div>
    </nav>
  );
}

const DISCIPLINE: Record<string, string> = { road_race: 'Road race', criterium: 'Criterium' };

function RaceHeader({ draft, raceId }: { draft: Draft; raceId: string }) {
  const { config } = draft;
  const race = config.races.find((r) => r.id === raceId)!;
  const dayIndex = config.days.findIndex((d) => d.id === race.dayId);
  const day = config.days[dayIndex];
  const cats = config.categories.filter((c) => c.raceId === raceId && c.status !== 'archived');
  const groups = config.startGroups.filter((g) => g.raceId === raceId);
  // Every place in use: test entries, confirmed and held order entries, and live waitlist offers.
  const taken = draft.data.entries.filter((e) => cats.some((c) => c.id === e.categoryId)).length;
  return (
    <header className="race-head" style={{ ['--day' as string]: dayHue(dayIndex) }}>
      <h2 className="race-head__name">{race.name}</h2>
      <p className="race-head__course">
        {DISCIPLINE[race.discipline]} · {day ? formatDate(day.date) : 'No day'}
        {race.course ? ` · ${race.course}` : ''}
      </p>
      <p className="race-head__stats">
        {cats.length} {cats.length === 1 ? 'category' : 'categories'} · {groups.length} start {groups.length === 1 ? 'group' : 'groups'} · {taken}{' '}
        {taken === 1 ? 'place' : 'places'} taken
      </p>
    </header>
  );
}
