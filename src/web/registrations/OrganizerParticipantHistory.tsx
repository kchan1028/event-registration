import { useState } from 'react';
import { api, type OrderView } from '../api';
import { formatDateTime } from '../format';
import { useLoad } from '../useLoad';

type HistoryProps = {
  order: OrderView;
  ordersById: ReadonlyMap<string, OrderView>;
};

export function OrganizerParticipantHistory({ order, ordersById }: HistoryProps) {
  const [open, setOpen] = useState(false);
  return (
    <details className="organizer-participant-history" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="lookup-toggle" aria-label={`Participant history for ${order.orderNumber}`}>Participant history</summary>
      {open && <HistoryOrders order={order} ordersById={ordersById} />}
    </details>
  );
}

function HistoryOrders({ order, ordersById }: HistoryProps) {
  const { data, error } = useLoad(
    () => api.eventParticipantHistory(order.eventId, order.id),
    [order.eventId, order.id, ordersById],
  );
  if (error) return <p className="alert alert--error" role="alert">Could not load participant history. Close and reopen it to try again.</p>;
  if (!data) return <p role="status">Loading participant history…</p>;

  const related = data.orderIds.flatMap((id) => {
    const candidate = ordersById.get(id);
    return candidate?.eventId === order.eventId && candidate.status === 'confirmed' ? [candidate] : [];
  });
  return (
    <>
      <p className="muted small">
        History can connect junior and adult orders through an approved claim. Event participants counts adult self-registrations by account.
      </p>
      {related.length > 0 && (
        <ul className="order__entries small" aria-label="Confirmed participant history">
          {related.map((row) => (
            <li key={row.id}>
              Order {row.orderNumber} · <time dateTime={row.createdAt}>{formatDateTime(row.createdAt)}</time>
            </li>
          ))}
        </ul>
      )}
      {related.length < data.orderIds.length && <p className="muted small">Refresh Registrations to see the latest orders.</p>}
    </>
  );
}
