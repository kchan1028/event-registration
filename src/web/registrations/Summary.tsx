import { formatDollars } from '../../shared/format';
import { api } from '../api';
import { useLoad } from '../useLoad';

/**
 * Event totals at a glance: riders, entries, and the work still open (license reviews, payment
 * exceptions, waitlist). Roles that may download
 * the ledger also see the money, which adds up to the ledger CSV.
 */
export function Summary({ eventId, refreshKey }: { eventId: string; refreshKey: unknown }) {
  const { data: s, error } = useLoad(() => api.summary(eventId), [eventId, refreshKey]);
  if (error)
    return (
      <p className="alert alert--error" role="alert">
        {error}
      </p>
    );
  if (!s) return <div className="skeleton" aria-label="Loading summary" />;
  const m = s.money;
  return (
    <section className="settings__section reg-summary" aria-labelledby="summary-title">
      <h3 id="summary-title">Summary</h3>
      <dl className="stat-grid">
        <div>
          <dt>Riders</dt>
          <dd>{s.riders}</dd>
        </div>
        <div>
          <dt>Paid entries</dt>
          <dd>{s.entries.confirmed}</dd>
        </div>
        <div>
          <dt>Unpaid holds</dt>
          <dd>{s.orders.held + s.orders.paymentFailed}</dd>
        </div>
        <div>
          <dt>Needs attention</dt>
          <dd>{s.orders.needsAttention}</dd>
        </div>
        <div>
          <dt>License reviews to do</dt>
          <dd>{s.licenseReviews}</dd>
        </div>
        <div>
          <dt>Waitlist waiting</dt>
          <dd>{s.waitlist.waiting}</dd>
        </div>
        <div>
          <dt>Withdrawn entries</dt>
          <dd>{s.entries.withdrawn}</dd>
        </div>
      </dl>
      {(s.waitlist.offered > 0 || s.waitlist.expired > 0 || s.waitlist.accepted > 0) && (
        <p className="small">
          Waitlist offers: {s.waitlist.offered} open, {s.waitlist.expired} ran out, {s.waitlist.accepted} registered.
        </p>
      )}
      <p className="muted small">A rider with several entries counts once; separate orders count once only after they are linked as the same rider.</p>
      {m && (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Money">
          <table className="mini-table reg-summary__money">
            <tbody>
              <tr>
                <th scope="row">Entry prices</th>
                <td className="num">{formatDollars(m.entryPriceCents)}</td>
              </tr>
              <tr>
                <th scope="row">Discounts</th>
                <td className="num">{formatDollars(-m.discountCents)}</td>
              </tr>
              <tr>
                <th scope="row">Fees</th>
                <td className="num">{formatDollars(m.feeCents)}</td>
              </tr>
              <tr className="reg-summary__total">
                <th scope="row">Received</th>
                <td className="num">{formatDollars(m.receivedCents)}</td>
              </tr>
              <tr>
                <th scope="row">Refunded</th>
                <td className="num">{formatDollars(-m.refundedCents)}</td>
              </tr>
              <tr className="reg-summary__total">
                <th scope="row">Net</th>
                <td className="num">{formatDollars(m.netCents)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {m && (m.needsAttention.orders > 0 || m.duplicateChargeRefundedCents > 0) && (
        <p className="muted small">
          {m.needsAttention.orders > 0 && `Received includes ${formatDollars(m.needsAttention.cents)} from ${m.needsAttention.orders === 1 ? '1 order' : `${m.needsAttention.orders} orders`} that paid without a confirmed place. `}
          {m.duplicateChargeRefundedCents > 0 && `${formatDollars(m.duplicateChargeRefundedCents)} of duplicate charges was refunded separately; it is not order money.`}
        </p>
      )}
      {s.byCategory.length > 0 && (
        <details>
          <summary className="small">Paid entries by category ({s.byCategory.length})</summary>
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Paid entries by category">
            <table className="mini-table">
              <thead>
                <tr>
                  <th scope="col">Race</th>
                  <th scope="col">Category</th>
                  <th scope="col">Entries</th>
                </tr>
              </thead>
              <tbody>
                {s.byCategory.map((c) => (
                  <tr key={c.categoryId}>
                    <td>{c.raceName}</td>
                    <td>
                      {c.categoryName} <span className="muted small">{c.code}</span>
                    </td>
                    <td className="num">{c.entries}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
