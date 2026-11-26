import { useRef, useState } from 'react';
import { api, type RiderEmailDelivery } from '../api';

const sendLabels = {
  recorded: 'Recorded',
  uncertain: 'Send outcome unknown',
  failed: 'Could not send',
  sent: 'Accepted by email provider',
};

const deliveryLabels = {
  delivered: 'Delivered',
  bounced: 'Bounced',
  complained: 'Complaint received',
};

export function RiderEmailDeliveryPanel({ eventId, recordId, kind }: { eventId: string; recordId: string; kind: 'confirmation' | 'offer' }) {
  const offer = kind === 'offer';
  const [delivery, setDelivery] = useState<RiderEmailDelivery | null>();
  const [busy, setBusy] = useState<'refresh' | 'retry' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const retryButton = useRef<HTMLButtonElement>(null);
  const refreshButton = useRef<HTMLButtonElement>(null);

  async function load(action: 'refresh' | 'retry') {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(action);
    setError(null);
    try {
      const result = offer
        ? (await (action === 'retry' ? api.retryWaitlistOfferEmail : api.waitlistOfferEmail)(eventId, recordId)).offerEmail
        : (await (action === 'retry' ? api.retryConfirmation : api.confirmationDelivery)(eventId, recordId)).confirmation;
      if (!result?.canRetry && document.activeElement === retryButton.current) refreshButton.current?.focus();
      setDelivery(result);
    } catch {
      if (document.activeElement === retryButton.current) refreshButton.current?.focus();
      setDelivery(undefined);
      setError(action === 'retry' ? 'Retry outcome could not be verified. Refresh status before trying again.' : 'Could not read email status. Refresh to try again.');
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  return (
    <details className={offer ? 'offer-email-delivery' : 'confirmation-delivery'} onToggle={(event) => { if (event.currentTarget.open) void load('refresh'); }}>
      <summary className="lookup-toggle">{offer ? 'Offer email' : 'Confirmation email'}</summary>
      <p className="small" role="status">
        {busy === 'retry' ? 'Retrying email…'
          : busy ? 'Checking email status…'
            : delivery === null ? 'No email recorded.'
              : delivery && (
                <>Send status: {sendLabels[delivery.status]}. Delivery: {delivery.delivery ? deliveryLabels[delivery.delivery] : 'No outcome recorded'}.</>
              )}
      </p>
      {error && <p className="field__error" role="alert">{error}</p>}
      <div className="row-actions">
        <button ref={refreshButton} type="button" className="btn btn--secondary btn--small" aria-disabled={busy !== null} onClick={() => void load('refresh')}>Refresh status</button>
        {delivery?.canRetry && (
          <button ref={retryButton} type="button" className="btn btn--secondary btn--small" aria-disabled={busy !== null} onClick={() => void load('retry')}>{offer ? 'Retry offer email' : 'Retry confirmation'}</button>
        )}
      </div>
    </details>
  );
}
