import { useCallback, useEffect, useState } from 'react';
import { formatCents } from '../shared/format';
import { api, ApiError, type OrderStatus, type OrderView } from './api';
import { href } from './App';
import type { Draft } from './Builder';
import { Icon, Pending } from './ui';

type Filter = 'all' | 'review' | 'attention' | 'unpaid';

const STATUS_LABEL: Record<OrderStatus, string> = {
  held: 'Places held, unpaid',
  payment_failed: 'Payment declined',
  confirmed: 'Paid (simulated)',
  expired: 'Hold expired',
  cancelled: 'Cancelled by rider',
  needs_attention: 'Needs attention',
};

const STATUS_TONE: Record<OrderStatus, string> = {
  held: 'needs_review',
  payment_failed: 'ineligible',
  confirmed: 'eligible',
  expired: 'muted',
  cancelled: 'muted',
  needs_attention: 'ineligible',
};

export function needsLicenseReview(o: OrderView): boolean {
  return o.status === 'confirmed' && o.entries.some((e) => !e.licenseReviewed);
}

/** Registration exception queue: one list, filtered by what needs a person. */
export function Registrations({ draft }: { draft: Draft }) {
  const eventId = draft.data.id;
  const [orders, setOrders] = useState<OrderView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(() => {
    api
      .orders(eventId)
      .then(setOrders)
      .catch((e: ApiError) => setError(e.message));
  }, [eventId]);
  useEffect(load, [load]);

  const counts = {
    all: orders?.length ?? 0,
    review: orders?.filter(needsLicenseReview).length ?? 0,
    attention: orders?.filter((o) => o.status === 'needs_attention').length ?? 0,
    unpaid: orders?.filter((o) => o.status === 'held' || o.status === 'payment_failed').length ?? 0,
  };
  const shown = (orders ?? []).filter((o) =>
    filter === 'review' ? needsLicenseReview(o) : filter === 'attention' ? o.status === 'needs_attention' : filter === 'unpaid' ? o.status === 'held' || o.status === 'payment_failed' : true,
  );
  const published = draft.data.publishedVersion !== null;

  return (
    <div className="settings settings--wide">
      <h2 className="page-title">Registrations</h2>
      <p className="lede">
        Every order from the rider registration page, with what still needs a person. Payment state and readiness are separate: a paid entry still needs its license reviewed.
      </p>
      <div className="pending-stack">
        <Pending>Payments are simulated. Sign-in and role-based access are not built, so anyone using this computer can see these registrations.</Pending>
      </div>
      {published ? (
        <p>
          <a className="btn btn--secondary btn--small" href={href({ page: 'register', eventId })}>
            Open rider registration (version {draft.data.publishedVersion})
          </a>
        </p>
      ) : (
        <p className="note">Riders can register once the event is published. Publish from Review and publish.</p>
      )}

      <div className="filters" role="group" aria-label="Show registrations">
        {(
          [
            ['all', 'All'],
            ['review', 'License review'],
            ['attention', 'Needs attention'],
            ['unpaid', 'Unpaid holds'],
          ] as [Filter, string][]
        ).map(([key, label]) => (
          <button key={key} className={`chip ${filter === key ? 'is-on' : ''}`} aria-pressed={filter === key} onClick={() => setFilter(key)}>
            {label} <span className="num">{counts[key]}</span>
          </button>
        ))}
      </div>

      {error && <p className="alert alert--error">{error}</p>}
      {orders === null && !error && <div className="skeleton" aria-label="Loading registrations" />}
      {orders && shown.length === 0 && (
        <div className="empty">
          <p>{orders.length === 0 ? 'No registrations yet.' : 'Nothing here. Every registration in this view is handled.'}</p>
        </div>
      )}
      <ul className="orders">
        {shown.map((o) => (
          <OrderRow key={o.id} order={o} onChange={(next) => setOrders((list) => (list ?? []).map((x) => (x.id === next.id ? next : x)))} />
        ))}
      </ul>
    </div>
  );
}

function OrderRow({ order, onChange }: { order: OrderView; onChange: (o: OrderView) => void }) {
  return (
    <li className="order">
      <div className="order__head">
        <p className="order__name">
          {order.rider.firstName} {order.rider.lastName}
          {order.rider.team && <span className="muted"> · {order.rider.team}</span>}
        </p>
        <span className={`status status--${STATUS_TONE[order.status]}`}>{STATUS_LABEL[order.status]}</span>
        <span className="num order__total">{formatCents(order.totalCents)}</span>
      </div>
      <p className="muted small">
        Racing age {order.rider.racingAge} · license {order.rider.licenseCategory ? (order.rider.licenseCategory === 'PRO' ? 'Pro' : `Cat ${order.rider.licenseCategory}`) : 'not known'}
        {order.rider.guardian ? ` · guardian ${order.rider.guardian.name}` : ''} · waiver {order.waiver.version} signed by {order.waiver.signatureName} · emergency contact on file · order {order.orderNumber}
      </p>
      {order.checkInCode && (
        <p className="small order__checkin">
          Check-in code <code className="code">{order.checkInCode}</code> ·{' '}
          <a href={href({ page: 'order', orderId: order.id })}>Rider confirmation</a>
        </p>
      )}
      {order.status === 'needs_attention' && (
        <p className="note note--error">Payment arrived after the hold ended and a place had filled. Nothing was confirmed. Contact the rider about a refund or another race.</p>
      )}
      <ul className="order__entries">
        {order.entries.map((e) => (
          <EntryLine key={e.id} entry={e} confirmed={order.status === 'confirmed'} onChange={onChange} />
        ))}
      </ul>
    </li>
  );
}

function EntryLine({ entry, confirmed, onChange }: { entry: OrderView['entries'][number]; confirmed: boolean; onChange: (o: OrderView) => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    if (note.trim().length < 3) {
      setErr('Write how you checked the license, for example "license card seen".');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      onChange(await api.reviewLicense(entry.id, note));
      setOpen(false);
    } catch (e) {
      setErr((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="order__entry">
      <span className="order__entry-name">
        <code className="code">{entry.code}</code> {entry.categoryName}
      </span>
      {confirmed ? (
        entry.licenseReviewed ? (
          <span className="readiness__item readiness__item--done">
            <Icon name="check" size={14} /> License reviewed: {entry.licenseReviewNote}
          </span>
        ) : open ? (
          <span className="review-form">
            <input className="input" aria-label={`How was the license for ${entry.categoryName} checked?`} placeholder="How you checked it, for example: license card seen" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn btn--primary btn--small" disabled={busy} onClick={submit}>
              Mark reviewed
            </button>
            <button className="btn btn--ghost btn--small" onClick={() => setOpen(false)}>
              Cancel
            </button>
            {err && <span className="text-error small" role="alert">{err}</span>}
          </span>
        ) : (
          <span className="order__entry-actions">
            <span className="readiness__item readiness__item--needs_review">
              <Icon name="warn" size={14} /> License not verified
            </span>
            <button className="btn btn--secondary btn--small" onClick={() => setOpen(true)}>
              Review license
            </button>
          </span>
        )
      ) : (
        <span className="muted small">{entry.status === 'held' ? 'Place held' : 'Place released'}</span>
      )}
    </li>
  );
}
