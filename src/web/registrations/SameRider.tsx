import { api, type ApiError, type RiderIdentityOverview } from '../api';
import { useLoad } from '../useLoad';

/**
 * Rider identity across orders: likely matches are suggested; the organizer confirms each link.
 * Linked orders become one rider at check-in, on start lists, and on the fallback roster.
 */
export function SameRider({ eventId, onChanged }: { eventId: string; onChanged: () => void }) {
  const { data, setData, error, setError } = useLoad(() => api.riderIdentity(eventId), [eventId]);
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
