import { useEffect, useRef, useState } from 'react';
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
  const showButton = useRef<HTMLButtonElement>(null);
  const hideButton = useRef<HTMLButtonElement>(null);
  const focusAfter = useRef<'show' | 'hide' | null>(null);
  const contactId = `ec-${orderId ?? entryId ?? 'lookup'}`;

  useEffect(() => {
    setContact(null);
    setError(null);
  }, [orderId, entryId]);

  useEffect(() => {
    const which = focusAfter.current;
    focusAfter.current = null;
    if (!which) return;
    const active = document.activeElement;
    const stillHere = active === showButton.current || active === hideButton.current || active === document.body || active === null;
    if (!stillHere) return;
    if (which === 'hide') hideButton.current?.focus();
    if (which === 'show') showButton.current?.focus();
  }, [contact, error]);

  function ignoreHeldEnter(event: { key: string; repeat: boolean; preventDefault: () => void }) {
    if (event.key === 'Enter' && event.repeat) event.preventDefault();
  }

  async function show() {
    setBusy(true);
    setError(null);
    try {
      const body = orderId ? { orderId } : { entryId: entryId! };
      const shown = await api.viewEmergencyContact(eventId, body);
      focusAfter.current = 'hide';
      setContact(shown);
    } catch (err) {
      focusAfter.current = 'show';
      setContact(null);
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  function hide() {
    focusAfter.current = 'show';
    setContact(null);
    setError(null);
  }

  return (
    <div className="ec-lookup no-print">
      {contact ? (
        <div className="ec-lookup__shown">
          <p id={contactId} className="ec-lookup__contact" role="status">
            <span className="muted">Emergency contact</span>
            <strong>{contact.name}</strong>
            <a href={`tel:${contact.phone}`}>{contact.phone}</a>
          </p>
          <button type="button" className="btn btn--ghost" ref={hideButton} onClick={hide} onKeyDown={ignoreHeldEnter} aria-describedby={contactId} aria-label={`Hide emergency contact for ${riderName}`}>
            Hide
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn--secondary"
          ref={showButton}
          disabled={busy}
          aria-busy={busy || undefined}
          aria-label={`Emergency contact for ${riderName}`}
          onKeyDown={ignoreHeldEnter}
          onClick={() => void show()}
        >
          {busy ? 'Looking up' : 'Emergency contact'}
        </button>
      )}
      {error && <p className="text-error small" role="alert">{error}</p>}
    </div>
  );
}
