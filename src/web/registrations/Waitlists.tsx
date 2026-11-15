import { OFFER_HOURS } from '../../shared/waitlist';
import { api, type ApiError, type WaitlistEntryView } from '../api';
import { href } from '../App';
import type { Draft } from '../Builder';
import { formatDateTime } from '../format';
import { useLoad } from '../useLoad';

const WL_LABEL: Record<WaitlistEntryView['status'], string> = { waiting: 'Waiting', offered: 'Offer sent', expired: 'Offer expired', accepted: 'Registered', removed: 'Removed' };

/** Organizer-managed waitlists: offer freed places in order. No email is sent; copy the offer link to the rider. */
export function Waitlists({ draft }: { draft: Draft }) {
  const eventId = draft.data.id;
  const { data, error, setError, reload } = useLoad(() => api.waitlist(eventId), [eventId]);
  const entries = data?.entries ?? null;
  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      reload();
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
      <p className="muted small">Freed places go to waiting riders first. Offer them in order; an offer holds the place for {OFFER_HOURS} hours. Email is not sent yet: copy the link to the rider.</p>
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
                    Offer link (until {formatDateTime(w.offerExpiresAt!)}): <code className="code">{link(w.offerToken)}</code>
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
