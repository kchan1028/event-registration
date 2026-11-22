import { useState } from 'react';
import { api, ApiError } from './api';

/**
 * One deliberate lookup. Hide clears the contact from this screen so a shared
 * desk does not leave the name and phone up. Showing it again is a new lookup.
 */
export function EmergencyContactLookup({ eventId, riderName, orderId, entryId }: {
  eventId: string;
  riderName: string;
  orderId?: string;
  entryId?: string;
}) {
  const [contact, setContact] = useState<{ name: string; phone: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function show() {
    setBusy(true);
    setError(null);
    try {
      const body = orderId ? { orderId } : { entryId: entryId! };
      setContact(await api.viewEmergencyContact(eventId, body));
    } catch (err) {
      setContact(null);
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  function hide() {
    setContact(null);
    setError(null);
  }

  return (
    <div className="ec-lookup">
      {contact ? (
        <div className="ec-lookup__shown">
          <p className="ec-lookup__contact" role="status">
            <span className="muted">Emergency contact</span>
            <strong>{contact.name}</strong>
            <a href={`tel:${contact.phone}`}>{contact.phone}</a>
          </p>
          <button type="button" className="btn btn--ghost" onClick={hide} aria-label={`Hide emergency contact for ${riderName}`}>
            Hide
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn--secondary"
          disabled={busy}
          aria-busy={busy || undefined}
          aria-label={`Emergency contact for ${riderName}`}
          onClick={() => void show()}
        >
          {busy ? 'Looking up' : 'Emergency contact'}
        </button>
      )}
      {error && <p className="text-error small" role="alert">{error}</p>}
    </div>
  );
}
