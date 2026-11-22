import { useState } from 'react';
import { awaitsLicenseReview } from '../shared/checkout';
import { matchesRegistration } from '../shared/lookup';
import { can } from '../shared/roles';
import { api, type OrderView } from './api';
import { href } from './App';
import type { Draft } from './Builder';
import { Coupons } from './Coupons';
import { refundedCents } from './format';
import { CancellationPreview } from './registrations/CancellationPreview';
import { ChangesToResolve } from './registrations/ChangesToResolve';
import { OrderRow } from './registrations/OrderRow';
import { SameRider } from './registrations/SameRider';
import { ReconciliationDownload } from './registrations/ReconciliationDownload';
import { ReservationLookup } from './registrations/ReservationLookup';
import { Summary } from './registrations/Summary';
import { Waitlists } from './registrations/Waitlists';
import { DownloadLink, Pending } from './ui';
import { useLoad } from './useLoad';

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
  const { roles } = draft.data;
  const { data: orders, setData: setOrders, error, reload } = useLoad(() => api.orders(eventId), [eventId]);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  // Search narrows the list first; the filter chips and their counts apply to what it found.
  const found = (orders ?? []).filter((o) => matchesRegistration(o, query));
  const shown = found.filter(FILTERS[filter].test);
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

      {published && can(roles, 'export.ledger') && <ReconciliationDownload key={eventId} eventId={eventId} />}
      {published && <Summary eventId={eventId} refreshKey={orders} />}
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
          placeholder="Rider name, email, team, order number, or check-in code"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {orders && query.trim() && (
          <p className="small muted" role="status">
            {found.length === 1 ? '1 registration matches' : `${found.length} registrations match`} “{query.trim()}”.
          </p>
        )}
      </form>

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
                ? `No registration matches “${query.trim()}”. Try the rider’s email, last name, or the order number.`
                : 'Nothing here. Every registration in this view is handled.'}
          </p>
        </div>
      )}
      {canManage && <ChangesToResolve eventId={eventId} refreshKey={orders} />}

      {canManage && <SameRider eventId={eventId} onChanged={reload} />}

      {canManage && <Waitlists draft={draft} onChanged={reload} />}

      {!draft.readOnly && <Coupons eventId={eventId} categories={draft.config.categories} races={draft.config.races} />}

      <ul className="orders" aria-label="Registrations">
        {shown.map((o) => (
          <OrderRow key={o.id} order={o} categories={draft.config.categories} canManage={canManage} canRefund={can(roles, 'payments.refund')} onChange={(next) => setOrders((list) => (list ?? []).map((x) => (x.id === next.id ? next : x)))} />
        ))}
      </ul>
    </div>
  );
}
