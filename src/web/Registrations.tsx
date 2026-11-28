import { useMemo, useState } from 'react';
import { awaitsLicenseReview } from '../shared/checkout';
import { matchesRegistration } from '../shared/lookup';
import { can } from '../shared/roles';
import { api, type ApiError, type SavedView, type OrderView } from './api';
import { href } from './App';
import { useSession } from './auth';
import type { Draft } from './Builder';
import { Coupons } from './Coupons';
import { refundedCents } from './format';
import { CancellationPreview } from './registrations/CancellationPreview';
import { ChangesToResolve } from './registrations/ChangesToResolve';
import { WithdrawalRequests } from './registrations/WithdrawalRequests';
import { OrderRow } from './registrations/OrderRow';
import { ParticipantCount } from './registrations/ParticipantCount';
import { OrganizerParticipantHistory } from './registrations/OrganizerParticipantHistory';
import { SameRider } from './registrations/SameRider';
import { FinanceDownloads } from './registrations/FinanceDownloads';
import { ReservationLookup } from './registrations/ReservationLookup';
import { Summary } from './registrations/Summary';
import { Waitlists } from './registrations/Waitlists';
import { DownloadLink, Pending } from './ui';
import { useLoad } from './useLoad';
import { ENTRY_COLUMNS, REQUIRED_ENTRY_COLUMNS, type EntryColumn } from '../shared/exports';
import { filterToParams, isFilterActive, matchesRegistrationFilter, REGISTRATION_SORTS, sortRegistrations, type RegistrationFilter, type RegistrationSort } from '../shared/registrationFilters';

const FILTERS = {
  all: { label: 'All', test: () => true },
  review: { label: 'License review', test: needsLicenseReview },
  attention: { label: 'Needs attention', test: (o: OrderView) => o.status === 'needs_attention' },
  unpaid: { label: 'Unpaid holds', test: (o: OrderView) => o.status === 'held' || o.status === 'payment_failed' },
  refunded: { label: 'Refunded', test: (o: OrderView) => refundedCents(o.totalCents, o.refunds) > 0 },
} satisfies Record<string, { label: string; test: (o: OrderView) => boolean }>;
type Filter = keyof typeof FILTERS;

function needsLicenseReview(o: OrderView): boolean {
  return o.entries.some((e) => awaitsLicenseReview(o.status, e));
}

/** Registration exception queue: one list, filtered by what needs a person. Each section shows only for roles that can use it. */
export function Registrations({ draft }: { draft: Draft }) {
  const eventId = draft.data.id;
  const { email, signInIdentity } = useSession();
  const { roles } = draft.data;
  const { data: orders, setData: setOrders, error, reload } = useLoad(() => api.orders(eventId), [eventId]);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [entryFilter, setEntryFilter] = useState<RegistrationFilter>({});
  const setEntry = (patch: Partial<RegistrationFilter>) => setEntryFilter((f) => ({ ...f, ...patch }));
  // Archived categories stay in the list while registrations still use them, so those entries can be found.
  const usedCategories = useMemo(() => new Set((orders ?? []).flatMap((o) => o.entries.map((e) => e.categoryId))), [orders]);
  const filterCategories = draft.config.categories.filter((c) => c.status !== 'archived' || usedCategories.has(c.id));
  const ordersById = useMemo(() => new Map(orders?.map((order) => [order.id, order])), [orders]);

  // Search narrows the list first; the filter chips and their counts apply to what it found.
  const found = (orders ?? []).filter((o) => matchesRegistration(o, query) && matchesRegistrationFilter(o, entryFilter));
  const shown = sortRegistrations(found.filter(FILTERS[filter].test), entryFilter.sort);
  const published = draft.data.publishedVersion !== null;
  const canManage = can(roles, 'entries.manage');

  return (
    <div className="settings settings--wide">
      <h2 className="page-title">Registrations</h2>
      <p className="lede">
        Every order from the rider registration page, with what still needs a person. Payment state and readiness are separate: a paid entry still needs its license reviewed.
      </p>
      <div className="pending-stack">
        <Pending>{draft.data.pending.payments} Only people with a registration manager, finance, or owner role in this organization can see these registrations.</Pending>
      </div>
      {published ? (
        <p className="row-actions">
          <a className="btn btn--secondary btn--small" href={href({ page: 'register', eventId })}>
            Open rider registration (version {draft.data.publishedVersion})
          </a>
          {can(roles, 'export.entries') && (
            <DownloadLink className="btn btn--ghost btn--small" href={`/api/events/${eventId}/exports/entries.csv`}>
              Download entries (CSV)
            </DownloadLink>
          )}
          {can(roles, 'export.ledger') && (
            <DownloadLink className="btn btn--ghost btn--small" href={`/api/events/${eventId}/exports/ledger.csv`}>
              Download ledger (CSV)
            </DownloadLink>
          )}
        </p>
      ) : (
        <p className="note">Riders can register once the event is published. {draft.readOnly ? 'A registration manager or owner publishes it.' : 'Publish from Review and publish.'}</p>
      )}

      {published && can(roles, 'export.ledger') && <FinanceDownloads key={eventId} eventId={eventId} />}
      {published && <Summary eventId={eventId} refreshKey={orders} />}
      {published && canManage && <ParticipantCount key={eventId} eventId={eventId} refreshKey={orders} />}
      {published && orders !== null && can(roles, 'payments.refund') && <CancellationPreview eventId={eventId} revision={draft.data.revision} publishedVersion={draft.data.publishedVersion} orders={orders} onExecutionSaved={reload} />}

      {published && can(roles, 'orders.view') && (
        <ReservationLookup
          key={eventId}
          eventId={eventId}
          canManage={canManage}
          onFound={() => {
            // The order can commit or change after the list loaded, and staff search that list by its number next.
            setFilter('all');
            reload();
          }}
        />
      )}
      <form role="search" className="reg-search" onSubmit={(e) => e.preventDefault()}>
        <label htmlFor="reg-search">Find a registration</label>
        <input
          id="reg-search"
          className="input"
          type="search"
          autoComplete="off"
          spellCheck={false}
          placeholder="Rider name, email, team, bib, license number, order number, or check-in code"
          value={query}
          maxLength={200}
          onChange={(e) => setQuery(e.target.value)}
        />
        {orders && query.trim() && (
          <p className="small muted" role="status">
            {found.length === 1 ? '1 registration matches' : `${found.length} registrations match`} “{query.trim()}”.
          </p>
        )}
      </form>

      <fieldset className="reg-entry-filters">
        <legend className="small">Narrow by entry</legend>
        <label className="small">
          Race day{' '}
          <select className="input" value={entryFilter.dayId ?? ''} onChange={(e) => setEntry({ dayId: e.target.value || undefined })}>
            <option value="">All days</option>
            {draft.config.days.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </label>
        <label className="small">
          Category{' '}
          <select className="input" value={entryFilter.categoryId ?? ''} onChange={(e) => setEntry({ categoryId: e.target.value || undefined })}>
            <option value="">All categories</option>
            {filterCategories.map((c) => <option key={c.id} value={c.id}>{c.timingCode} {c.name}{c.status === 'archived' ? ' (archived)' : ''}</option>)}
          </select>
        </label>
        <label className="small">
          Entry status{' '}
          <select className="input" value={entryFilter.entryStatus ?? ''} onChange={(e) => setEntry({ entryStatus: (e.target.value || undefined) as RegistrationFilter['entryStatus'] })}>
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="withdrawn">Withdrawn</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <label className="check small">
          <input type="checkbox" checked={entryFilter.missingWaiver ?? false} onChange={(e) => setEntry({ missingWaiver: e.target.checked || undefined })} />
          Missing waiver or guardian signature
        </label>
        <label className="small">
          Sort by{' '}
          <select className="input" value={entryFilter.sort ?? 'newest'} onChange={(e) => setEntry({ sort: e.target.value === 'newest' ? undefined : e.target.value as RegistrationSort })}>
            {(Object.keys(REGISTRATION_SORTS) as RegistrationSort[]).map((k) => <option key={k} value={k}>{REGISTRATION_SORTS[k]}</option>)}
          </select>
        </label>
        {can(roles, 'export.entries') && <DownloadColumns columns={entryFilter.columns} onChange={(columns) => setEntry({ columns })} />}
        {/* Clearing the filters keeps the chosen row order and download columns. */}
        {isFilterActive(entryFilter) && (
          <button type="button" className="btn btn--ghost btn--small" onClick={() => setEntryFilter((f) => ({ sort: f.sort, columns: f.columns }))}>Clear entry filters</button>
        )}
        <SavedViews eventId={eventId} filter={entryFilter} onApply={setEntryFilter} />
        {/* The same view as a file: the server applies the same search and entry filters, with the usual columns and audit. */}
        {/* The file covers the entry filters and row order only; a sort alone is enough to offer it. Search text is never sent in the address (it can hold an email or check-in code),
            so the download is offered only without a search and with the All chip. */}
        {can(roles, 'export.entries') && filterToParams(entryFilter).toString() !== '' && (filter === 'all' && !query.trim() ? (
          <DownloadLink className="btn btn--ghost btn--small" href={`/api/events/${eventId}/exports/entries.csv?${filterToParams(entryFilter)}`}>
            Download this view (CSV)
          </DownloadLink>
        ) : (
          <span className="small muted">Clear the search and choose All to download this view.</span>
        ))}
      </fieldset>

      <div className="filters" role="group" aria-label="Show registrations">
        {(Object.keys(FILTERS) as Filter[]).map((key) => (
          <button key={key} className={`chip ${filter === key ? 'is-on' : ''}`} aria-pressed={filter === key} onClick={() => setFilter(key)}>
            {FILTERS[key].label} <span className="num">{found.filter(FILTERS[key].test).length}</span>
          </button>
        ))}
      </div>

      {error && <p className="alert alert--error">{error}</p>}
      {orders === null && !error && <div className="skeleton" aria-label="Loading registrations" />}
      {orders && shown.length === 0 && (
        <div className="empty">
          <p>
            {orders.length === 0
              ? 'No registrations yet.'
              : found.length === 0
                ? `No registration matches “${query.trim()}”. Try the rider’s email, last name, order number, bib, or license number.`
                : 'Nothing here. Every registration in this view is handled.'}
          </p>
        </div>
      )}
      {canManage && <WithdrawalRequests eventId={eventId} refreshKey={orders} onChanged={reload} />}
      {canManage && <ChangesToResolve eventId={eventId} refreshKey={orders} />}

      {canManage && <SameRider eventId={eventId} onChanged={reload} />}

      {canManage && <Waitlists key={`${eventId}:${email?.toLowerCase() ?? ''}`} draft={draft} onChanged={reload} />}

      {!draft.readOnly && <Coupons eventId={eventId} categories={draft.config.categories} races={draft.config.races} />}

      <ul className="orders" aria-label="Registrations">
        {shown.map((o) => (
          <OrderRow
            key={o.id}
            order={o}
            categories={draft.config.categories}
            canManage={canManage}
            canRefund={can(roles, 'payments.refund')}
            onChange={(next) => setOrders((list) => (list ?? []).map((x) => (x.id === next.id ? next : x)))}
            participantHistory={published && canManage && o.status === 'confirmed' && (
              <OrganizerParticipantHistory key={`${eventId}:${signInIdentity}`} order={o} ordersById={ordersById} />
            )}
          />
        ))}
      </ul>
    </div>
  );
}

/** The columns a download actually has, in file order: a view's choice plus the always-included ids. */
const downloadedColumns = (columns?: readonly EntryColumn[]) =>
  ENTRY_COLUMNS.filter((c) => !columns || REQUIRED_ENTRY_COLUMNS.includes(c) || columns.includes(c)).join();

/**
 * Which columns the view download includes. Every column is the default; the order and rider ids are always included,
 * so each row can be traced. Choosing every column again goes back to the default.
 */
function DownloadColumns({ columns, onChange }: { columns?: EntryColumn[]; onChange: (columns: EntryColumn[] | undefined) => void }) {
  const chosen = columns ?? ENTRY_COLUMNS;
  // The checkboxes exist only while the list is open, so a closed list adds nothing for screen readers to step through.
  const [open, setOpen] = useState(false);
  const toggle = (c: EntryColumn, on: boolean) => {
    // Kept in the file's column order, so the same choice always saves and compares the same way.
    // The required columns are always part of the choice, even when a saved view left them out.
    const next = ENTRY_COLUMNS.filter((x) => REQUIRED_ENTRY_COLUMNS.includes(x) || (x === c ? on : chosen.includes(x)));
    onChange(next.length === ENTRY_COLUMNS.length ? undefined : next);
  };
  return (
    <details className="small" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Columns in the download{columns ? ` (${ENTRY_COLUMNS.filter((c) => REQUIRED_ENTRY_COLUMNS.includes(c) || columns.includes(c)).length} of ${ENTRY_COLUMNS.length})` : ''}</summary>
      {open && <fieldset className="reg-columns">
        <legend className="sr-only">Columns in the download</legend>
        {ENTRY_COLUMNS.map((c) => {
          const required = REQUIRED_ENTRY_COLUMNS.includes(c);
          return (
            <label key={c} className="check small">
              <input type="checkbox" checked={required || chosen.includes(c)} disabled={required} onChange={(e) => toggle(c, e.target.checked)} />
              {c}{required ? ' (always included)' : ''}
            </label>
          );
        })}
      </fieldset>}
    </details>
  );
}

/** An organizer's named views for this event: entry filters only, private to their account. */
function SavedViews({ eventId, filter, onApply }: { eventId: string; filter: RegistrationFilter; onApply: (f: RegistrationFilter) => void }) {
  const { data: views, setData: setViews, error } = useLoad(() => api.savedViews(eventId), [eventId]);
  // Only the view the organizer picked or just saved is selected, and only while the filters still match it, so editing
  // or clearing them deselects it and Delete view never targets a view nobody chose.
  const [chosenId, setChosenId] = useState('');
  const same = (a: RegistrationFilter, b: RegistrationFilter) =>
    (a.dayId ?? '') === (b.dayId ?? '') && (a.categoryId ?? '') === (b.categoryId ?? '') && (a.entryStatus ?? '') === (b.entryStatus ?? '') && Boolean(a.missingWaiver) === Boolean(b.missingWaiver) && (a.sort ?? 'newest') === (b.sort ?? 'newest')
    && downloadedColumns(a.columns) === downloadedColumns(b.columns);
  const chosen = views?.find((v) => v.id === chosenId);
  const selected = chosen && same(chosen.filter, filter) ? chosen.id : '';
  const [name, setName] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  // While a save or delete is running, the picker and both buttons are disabled, so no pick or second request can race it.
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<{ views: SavedView[]; savedId?: string }>, done: string) => {
    setBusy(true);
    try {
      const { views: next, savedId } = await action();
      setViews(next);
      if (savedId) setChosenId(savedId);
      setMessage({ ok: true, text: done });
    } catch (e) {
      setMessage({ ok: false, text: (e as ApiError).message });
    } finally {
      setBusy(false);
    }
  };
  if (error) return <p className="small text-error">Saved views could not load.</p>;
  return (
    <>
      {views && views.length > 0 && (
        <label className="small">
          Saved view{' '}
          <select className="input" value={selected} disabled={busy} onChange={(e) => {
            const view = views.find((v) => v.id === e.target.value);
            setChosenId(view?.id ?? '');
            if (view) onApply(view.filter);
          }}>
            <option value="">Choose a view</option>
            {views.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </label>
      )}
      {selected && (
        <button type="button" className="btn btn--ghost btn--small" disabled={busy} onClick={() => { const id = selected; void run(async () => ({ views: await api.deleteView(eventId, id) }), 'View deleted.'); }}>
          Delete view
        </button>
      )}
      {isFilterActive(filter) && (
        <span className="order__entry-actions">
          <label className="small">
            View name{' '}
            <input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </label>
          <button type="button" className="btn btn--secondary btn--small" disabled={busy || !name.trim()} onClick={() => void run(() => api.saveView(eventId, name.trim(), filter), `Saved “${name.trim()}”.`)}>
            Save view
          </button>
        </span>
      )}
      <span className={message && !message.ok ? 'small text-error' : 'sr-only'} role={message && !message.ok ? 'alert' : 'status'}>{message?.text ?? ''}</span>
    </>
  );
}

