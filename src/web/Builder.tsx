import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { formatDate } from '../shared/format';
import type { EventConfig } from '../shared/schema';
import { countIssues, validateConfig, type Issue } from '../shared/validation';
import { api, ApiError, type EventPayload, type TestEntryResult } from './api';
import { href, navigate, type Route } from './App';
import { CategoryEditor } from './CategoryEditor';
import { CategoryTable } from './CategoryTable';
import { EventSettings } from './EventSettings';
import { FieldBoard } from './FieldBoard';
import { IssuesPanel } from './IssuesPanel';
import { Pools } from './Pools';
import { Preview } from './Preview';
import { Publish } from './Publish';
import { dayHue, Icon, Pending } from './ui';

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';

export interface Draft {
  data: EventPayload;
  config: EventConfig;
  issues: Issue[];
  saveState: SaveState;
  saveError: string | null;
  update: (fn: (c: EventConfig) => EventConfig) => void;
  addTestEntries: (categoryId: string, count: number) => Promise<TestEntryResult>;
  clearTestEntries: () => Promise<number>;
  publish: (acknowledgeWarnings: boolean) => Promise<number>;
  reload: () => void;
}

/**
 * Holds the working copy of the draft and autosaves it. Saves carry the last
 * known revision; the server rejects stale saves instead of overwriting.
 */
function useDraft(eventId: string) {
  const [data, setData] = useState<EventPayload | null>(null);
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
  }, [eventId]);
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
  }, [eventId]);

  const update = useCallback(
    (fn: (c: EventConfig) => EventConfig) => {
      if (!configRef.current) return;
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
    [eventId, flush],
  );

  const clearTestEntries = useCallback(async () => {
    const { removed, event } = await api.clearTestEntries(eventId);
    setData(event);
    return removed;
  }, [eventId]);

  const publish = useCallback(
    async (acknowledgeWarnings: boolean) => {
      if (!(await flush())) throw new ApiError(409, 'The latest changes could not be saved, so nothing was published.');
      const payload = await api.publish(eventId, acknowledgeWarnings);
      setData(payload);
      return payload.publishedVersion;
    },
    [eventId, flush],
  );

  const issues = useMemo(() => (config && data ? validateConfig(config, data.entries) : []), [config, data]);

  const draft: Draft | null =
    data && config ? { data, config, issues, saveState, saveError, update, addTestEntries, clearTestEntries, publish, reload: load } : null;
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

export function IssueCount({ errors, warnings }: { errors: number; warnings: number }) {
  if (errors + warnings === 0) return <span className="issue-count issue-count--ok">No issues</span>;
  return (
    <span className={`issue-count ${errors ? 'issue-count--error' : 'issue-count--warn'}`}>
      {errors > 0 && `${errors} ${errors === 1 ? 'error' : 'errors'}`}
      {errors > 0 && warnings > 0 && ', '}
      {warnings > 0 && `${warnings} ${warnings === 1 ? 'warning' : 'warnings'}`}
    </span>
  );
}

export function Builder({ route }: { route: Extract<Route, { page: 'event' }> }) {
  const { draft, loadError } = useDraft(route.eventId);
  const [selected, setSelected] = useState<string | null>(null);
  const wide = useWide();

  const raceId = route.view === 'race' ? (route.raceId ?? draft?.config.races[0]?.id ?? null) : null;
  useEffect(() => setSelected(null), [raceId, route.view]);
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
  const race = config.races.find((r) => r.id === raceId) ?? null;
  const selectedCategory = selected ? config.categories.find((c) => c.id === selected && c.raceId === race?.id) : undefined;

  const openIssue = (issue: Issue) => {
    const t = issue.target;
    if (t.kind === 'category') {
      const cat = config.categories.find((c) => c.id === t.id);
      if (cat) {
        navigate({ page: 'event', eventId: route.eventId, view: 'race', raceId: cat.raceId });
        window.setTimeout(() => setSelected(cat.id), 0);
      }
    } else if (t.kind === 'startGroup') {
      const sg = config.startGroups.find((g) => g.id === t.id);
      if (sg) navigate({ page: 'event', eventId: route.eventId, view: 'race', raceId: sg.raceId });
    } else if (t.kind === 'race') navigate({ page: 'event', eventId: route.eventId, view: 'race', raceId: t.id });
    else if (t.kind === 'pool') navigate({ page: 'event', eventId: route.eventId, view: 'pools' });
    else navigate({ page: 'event', eventId: route.eventId, view: 'setup' });
  };

  return (
    <div className="app">
      <TopBar draft={draft} eventId={route.eventId} errors={counts.errors} warnings={counts.warnings} />
      {config.event.isDemo && (
        <p className="demo-banner" role="note">
          <strong>Example data.</strong> {config.event.demoNotice}
        </p>
      )}
      <div className={`workspace ${selectedCategory ? 'has-selection' : ''}`}>
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
              <p>This event has no races. Add one in event setup.</p>
              <a className="btn btn--secondary" href={href({ page: 'event', eventId: route.eventId, view: 'setup' })}>
                Open event setup
              </a>
            </div>
          )}
          {route.view === 'setup' && <EventSettings draft={draft} />}
          {route.view === 'pools' && <Pools draft={draft} />}
          {route.view === 'publish' && <Publish draft={draft} onOpenIssue={openIssue} />}
        </main>
        <aside
          className={`inspector ${selectedCategory ? 'is-open' : ''} ${wide && race && !selectedCategory ? 'inspector--board' : ''}`}
          aria-label={selectedCategory ? 'Category editor' : race && wide ? 'Start groups and shared field limits' : 'Checks before publishing'}
        >
          {selectedCategory ? (
            <CategoryEditor key={selectedCategory.id} draft={draft} categoryId={selectedCategory.id} onClose={() => setSelected(null)} onSelect={setSelected} />
          ) : wide && race && route.view === 'race' ? (
            <FieldBoard draft={draft} raceId={race.id} onSelect={setSelected} selectedId={selected} />
          ) : (
            <IssuesPanel issues={draft.issues} config={config} onOpen={openIssue} eventId={route.eventId} />
          )}
        </aside>
      </div>
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
      <nav className="topbar__actions" aria-label="Event actions">
        <a className="btn btn--secondary" href={href({ page: 'event', eventId, view: 'preview' })}>
          <Icon name="eye" /> Rider preview
        </a>
        <a className="topbar__issues" href={href({ page: 'event', eventId, view: 'publish' })}>
          <IssueCount errors={errors} warnings={warnings} />
        </a>
        <a className="btn btn--primary" href={href({ page: 'event', eventId, view: 'publish' })}>
          Review and publish
        </a>
      </nav>
    </header>
  );
}

function Rail({ draft, route, activeRaceId, errors, warnings }: { draft: Draft; route: Extract<Route, { page: 'event' }>; activeRaceId: string | null; errors: number; warnings: number }) {
  const { config } = draft;
  const ev = route.eventId;
  return (
    <nav className="rail" aria-label="Event sections">
      <a className={`rail__item ${route.view === 'setup' ? 'is-active' : ''}`} href={href({ page: 'event', eventId: ev, view: 'setup' })} aria-current={route.view === 'setup' ? 'page' : undefined}>
        Event setup
      </a>
      {config.days.map((day, di) => (
        <div className="rail__day" key={day.id}>
          <p className="rail__day-label">
            {day.label} <span>{shortDate(day.date)}</span>
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
      <a className={`rail__item ${route.view === 'pools' ? 'is-active' : ''}`} href={href({ page: 'event', eventId: ev, view: 'pools' })} aria-current={route.view === 'pools' ? 'page' : undefined}>
        Shared capacity pools <span className="rail__count">{config.capacityPools.length}</span>
      </a>
      <a className={`rail__item ${route.view === 'publish' ? 'is-active' : ''}`} href={href({ page: 'event', eventId: ev, view: 'publish' })} aria-current={route.view === 'publish' ? 'page' : undefined}>
        Review and publish
        <IssueCount errors={errors} warnings={warnings} />
      </a>
      <div className="rail__pending">
        <p className="rail__pending-title">Not connected yet</p>
        <Pending>USA Cycling license checks</Pending>
        <Pending>Payments and checkout</Pending>
        <Pending>Sign-in with MFA</Pending>
      </div>
    </nav>
  );
}

function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

const DISCIPLINE: Record<string, string> = { road_race: 'Road race', criterium: 'Criterium' };

function RaceHeader({ draft, raceId }: { draft: Draft; raceId: string }) {
  const { config } = draft;
  const race = config.races.find((r) => r.id === raceId)!;
  const dayIndex = config.days.findIndex((d) => d.id === race.dayId);
  const day = config.days[dayIndex];
  const cats = config.categories.filter((c) => c.raceId === raceId && c.status !== 'archived');
  const groups = config.startGroups.filter((g) => g.raceId === raceId);
  const entries = draft.data.entries.filter((e) => cats.some((c) => c.id === e.categoryId)).length;
  return (
    <header className="race-head" style={{ ['--day' as string]: dayHue(dayIndex) }}>
      <h2 className="race-head__name">{race.name}</h2>
      <p className="race-head__course">
        {DISCIPLINE[race.discipline]} · {day ? formatDate(day.date) : 'No day'}
        {race.course ? ` · ${race.course}` : ''}
      </p>
      <p className="race-head__stats">
        {cats.length} {cats.length === 1 ? 'category' : 'categories'} · {groups.length} start {groups.length === 1 ? 'group' : 'groups'} · {entries} test{' '}
        {entries === 1 ? 'entry' : 'entries'}
      </p>
    </header>
  );
}
