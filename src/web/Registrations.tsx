import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { formatCents } from '../shared/format';
import type { Category } from '../shared/schema';
import { api, ApiError, type OrderStatus, type OrderView, type ResolutionItem, type RiderIdentityOverview, type WaitlistEntryView } from './api';
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
        <p className="row-actions">
          <a className="btn btn--secondary btn--small" href={href({ page: 'register', eventId })}>
            Open rider registration (version {draft.data.publishedVersion})
          </a>
          <a className="btn btn--ghost btn--small" href={`/api/events/${eventId}/exports/entries.csv`} download>
            Download entries (CSV)
          </a>
          <a className="btn btn--ghost btn--small" href={`/api/events/${eventId}/exports/ledger.csv`} download>
            Download ledger (CSV)
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
      <ChangesToResolve eventId={eventId} refreshKey={orders} />

      <SameRider eventId={eventId} onChanged={load} />

      <Waitlists draft={draft} />

      <ul className="orders">
        {shown.map((o) => (
          <OrderRow key={o.id} order={o} categories={draft.config.categories} onChange={(next) => setOrders((list) => (list ?? []).map((x) => (x.id === next.id ? next : x)))} />
        ))}
      </ul>
    </div>
  );
}

function OrderRow({ order, categories, onChange }: { order: OrderView; categories: Category[]; onChange: (o: OrderView) => void }) {
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
      {(order.answers.length > 0 || order.addenda.length > 0) && (
        <ul className="small order__answers">
          {order.answers.map((a) => (
            <li key={`${a.categoryId}-${a.label}`}>
              {a.category}: {a.label}: <strong>{a.answer}</strong>
            </li>
          ))}
          {order.addenda.map((a) => (
            <li key={`add-${a.categoryId}`}>Accepted: {a.title}</li>
          ))}
        </ul>
      )}
      {order.status === 'needs_attention' && (
        <p className="note note--error">Payment arrived after the hold ended and a place had filled. Nothing was confirmed. Contact the rider about a refund or another race.</p>
      )}
      <ul className="order__entries">
        {order.entries.map((e) => (
          <EntryLine key={e.id} entry={e} confirmed={order.status === 'confirmed'} onChange={onChange}>
            {order.status === 'confirmed' && e.status === 'confirmed' && (
              <EntryChange entry={e} categories={categories} taken={order.entries.filter((x) => x.status === 'confirmed').map((x) => x.categoryId)} onChange={onChange} />
            )}
          </EntryLine>
        ))}
      </ul>
      <ul className="order__entries">
        {order.entries.flatMap((e) => e.changes.map((c, i) => <ChangeLine key={`${e.id}-${i}`} change={c} />))}
      </ul>
    </li>
  );
}

function EntryLine({ entry, confirmed, onChange, children }: { entry: OrderView['entries'][number]; confirmed: boolean; onChange: (o: OrderView) => void; children?: ReactNode }) {
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
      {entry.status === 'withdrawn' ? (
        <span className="muted small">Withdrawn</span>
      ) : confirmed ? (
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
      {children}
    </li>
  );
}

type EntryView = OrderView['entries'][number];

/** One logged transfer or withdrawal, with the money difference stated plainly. */
function ChangeLine({ change: c }: { change: EntryView['changes'][number] }) {
  const when = new Date(c.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  const money =
    c.kind === 'withdraw'
      ? `Paid ${formatCents(c.amountPaidCents)} for this entry. No refund was processed: payments are simulated, so settle any refund outside the app.`
      : c.differenceCents === null || c.differenceCents === 0
        ? `Paid ${formatCents(c.amountPaidCents)}; the new category costs the same. Nothing to settle.`
        : c.differenceCents > 0
          ? `Paid ${formatCents(c.amountPaidCents)}; the new category costs ${formatCents(c.newPriceCents ?? 0)}. The rider owes ${formatCents(c.differenceCents)}, to settle outside the app. The price paid was not changed.`
          : `Paid ${formatCents(c.amountPaidCents)}; the new category costs ${formatCents(c.newPriceCents ?? 0)}. A refund of ${formatCents(-c.differenceCents)} is due, to settle outside the app.`;
  return (
    <li className="order__entry order__change">
      <span className="small">
        <strong>{c.kind === 'withdraw' ? `Withdrawn from ${c.fromCategoryName}` : `Transferred from ${c.fromCategoryName} to ${c.toCategoryName}`}</strong> · {when} · Reason: {c.reason}
        <br />
        {money}
      </span>
    </li>
  );
}

/** Transfer or withdraw a paid entry. The server rechecks eligibility, capacity, the waitlist, and conflicts. */
function EntryChange({ entry, categories, taken, onChange }: { entry: EntryView; categories: Category[]; taken: string[]; onChange: (o: OrderView) => void }) {
  const [mode, setMode] = useState<'none' | 'transfer' | 'withdraw'>('none');
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const options = categories.filter((c) => c.status === 'active' && !taken.includes(c.id));
  const close = () => {
    setMode('none');
    setErr(null);
    setReason('');
    setTarget('');
  };
  const submit = async () => {
    if (mode === 'transfer' && !target) return setErr('Choose the category to move to.');
    if (reason.trim().length < 3) return setErr(mode === 'transfer' ? 'Write why the entry is moving.' : 'Write why the entry is withdrawn.');
    setBusy(true);
    setErr(null);
    try {
      onChange(mode === 'transfer' ? await api.transferEntry(entry.id, target, reason) : await api.withdrawEntry(entry.id, reason));
      close();
    } catch (e) {
      setErr((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  if (mode === 'none') {
    return (
      <span className="order__entry-actions">
        <button className="btn btn--secondary btn--small" aria-label={`Transfer ${entry.code} ${entry.categoryName}`} onClick={() => setMode('transfer')}>
          Transfer
        </button>
        <button className="btn btn--ghost btn--small" aria-label={`Withdraw ${entry.code} ${entry.categoryName}`} onClick={() => setMode('withdraw')}>
          Withdraw
        </button>
      </span>
    );
  }
  const label = mode === 'transfer' ? `Transfer ${entry.categoryName}` : `Withdraw ${entry.categoryName}`;
  return (
      <span className="review-form" role="group" aria-label={label}>
        {mode === 'transfer' && (
          <select className="input" aria-label={`Move ${entry.categoryName} to`} value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Move to…</option>
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.timingCode} {c.name}
              </option>
            ))}
          </select>
        )}
        <input className="input" aria-label={mode === 'transfer' ? 'Reason for the transfer' : 'Reason for the withdrawal'} placeholder={mode === 'transfer' ? 'Reason, for example: upgraded to Cat 3' : 'Reason, for example: injured, asked to withdraw'} value={reason} onChange={(e) => setReason(e.target.value)} />
        <button className="btn btn--primary btn--small" disabled={busy} onClick={submit}>
          {mode === 'transfer' ? 'Transfer entry' : 'Withdraw entry'}
        </button>
        <button className="btn btn--ghost btn--small" onClick={close}>
          Cancel
        </button>
        {err && (
          <span className="text-error small" role="alert">
            {err}
          </span>
        )}
      </span>
  );
}

const WL_LABEL: Record<WaitlistEntryView['status'], string> = { waiting: 'Waiting', offered: 'Offer sent', expired: 'Offer expired', accepted: 'Registered', removed: 'Removed' };

/** Organizer-managed waitlists: offer freed places in order. No email is sent; copy the offer link to the rider. */
function Waitlists({ draft }: { draft: Draft }) {
  const eventId = draft.data.id;
  const [entries, setEntries] = useState<WaitlistEntryView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    api
      .waitlist(eventId)
      .then((r) => setEntries(r.entries))
      .catch((e: ApiError) => setError(e.message));
  }, [eventId]);
  useEffect(load, [load]);
  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      load();
    } catch (e) {
      setError((e as ApiError).message);
    }
  };
  if (!entries || entries.length === 0) return error ? <p className="alert alert--error">{error}</p> : null;
  const byCat = new Map<string, WaitlistEntryView[]>();
  for (const e of entries) byCat.set(e.categoryId, [...(byCat.get(e.categoryId) ?? []), e]);
  const name = (id: string) => draft.config.categories.find((c) => c.id === id)?.name ?? 'Removed category';
  const link = (token: string) => `${window.location.origin}/${href({ page: 'register', eventId })}?offer=${token}`;
  return (
    <section className="settings__section" aria-labelledby="wl-title">
      <h3 id="wl-title">Waitlists</h3>
      <p className="muted small">Freed places go to waiting riders first. Offer them in order; an offer holds the place for 24 hours. No email is sent in this prototype: copy the link to the rider.</p>
      {error && (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      )}
      {[...byCat].map(([catId, list]) => (
        <div key={catId}>
          <h4>{name(catId)}</h4>
          <ol className="orders">
            {list.map((w) => (
              <li key={w.id} className="order">
                <div className="order__head">
                  <p className="order__name">
                    {w.position ? `${w.position}. ` : ''}
                    {w.firstName} {w.lastName}
                    <span className="muted"> · {w.email} · racing age {w.racingAge}</span>
                  </p>
                  <span className="status status--muted">{WL_LABEL[w.status]}</span>
                </div>
                {w.status === 'offered' && w.offerToken && (
                  <p className="small">
                    Offer link (until {new Date(w.offerExpiresAt!).toLocaleString()}): <code className="code">{link(w.offerToken)}</code>
                  </p>
                )}
                <p className="order__entry-actions">
                  {w.status === 'waiting' && (
                    <button className="btn btn--primary btn--small" onClick={() => act(() => api.offerWaitlistPlace(eventId, w.id))}>
                      Offer a place
                    </button>
                  )}
                  {(w.status === 'waiting' || w.status === 'offered' || w.status === 'expired') && (
                    <button className="btn btn--ghost btn--small" onClick={() => act(() => api.removeFromWaitlist(eventId, w.id))}>
                      Remove
                    </button>
                  )}
                </p>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  );
}

/**
 * Rider identity across orders: likely matches are suggested; the organizer confirms each link.
 * Linked orders become one rider at check-in, on start lists, and on the fallback roster.
 */
function SameRider({ eventId, onChanged }: { eventId: string; onChanged: () => void }) {
  const [data, setData] = useState<RiderIdentityOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    api
      .riderIdentity(eventId)
      .then(setData)
      .catch((e: ApiError) => setError(e.message));
  }, [eventId]);
  useEffect(load, [load]);
  const act = async (fn: () => Promise<RiderIdentityOverview>) => {
    setError(null);
    try {
      setData(await fn());
      onChanged();
    } catch (e) {
      setError((e as ApiError).message);
    }
  };
  if (!data || (data.suggestions.length === 0 && data.groups.length === 0)) return error ? <p className="alert alert--error">{error}</p> : null;
  const who = (o: RiderIdentityOverview['groups'][number]['orders'][number]) => `${o.name}${o.team ? ` · ${o.team}` : ''} · order ${o.orderNumber}`;
  return (
    <section className="settings__section" aria-labelledby="same-rider-title">
      <h3 id="same-rider-title">Same rider?</h3>
      <p className="muted small">Orders that may belong to one rider. Linking makes them one rider at check-in (one bib, one check-in), on start lists, and on the roster. Nothing is linked unless you choose to.</p>
      {error && (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      )}
      {data.suggestions.length > 0 && (
        <ul className="orders">
          {data.suggestions.map((s) => (
            <li key={`${s.a}-${s.b}`} className="order">
              <p className="order__name">{s.reasons.join(' · ')}</p>
              <ul className="small">
                {s.orders.map((o) => (
                  <li key={o.orderId}>{who(o)}</li>
                ))}
              </ul>
              <p className="order__entry-actions">
                <button className="btn btn--primary btn--small" onClick={() => act(() => api.linkRiders(eventId, s.a, s.b))}>
                  Link as one rider
                </button>
                <button className="btn btn--ghost btn--small" onClick={() => act(() => api.dismissRiderMatch(eventId, s.a, s.b))}>
                  Not the same rider
                </button>
              </p>
            </li>
          ))}
        </ul>
      )}
      {data.groups.length > 0 && (
        <>
          <h4>Linked riders</h4>
          <ul className="orders">
            {data.groups.map((g) => (
              <li key={g.key} className="order">
                <ul className="small">
                  {g.orders.map((o) => (
                    <li key={o.orderId}>{who(o)}</li>
                  ))}
                </ul>
                <p className="order__entry-actions">
                  <button className="btn btn--ghost btn--small" onClick={() => act(() => api.unlinkRider(eventId, g.key))}>
                    Unlink
                  </button>
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

const OUTCOME_LABEL: Record<ResolutionItem['status'], string> = { open: 'Open', kept: 'Kept as is', transferred: 'Transferred', withdrawn: 'Withdrawn' };

/**
 * Paid entries affected by a published change, one item each. The organizer records the outcome,
 * confirms the rider was told, and adds a note. Transfer or withdraw the entry on its order first.
 */
function ChangesToResolve({ eventId, refreshKey }: { eventId: string; refreshKey: unknown }) {
  const [items, setItems] = useState<ResolutionItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    api
      .resolutions(eventId)
      .then(setItems)
      .catch((e: ApiError) => setError(e.message));
  }, [eventId]);
  useEffect(load, [load, refreshKey]);
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
