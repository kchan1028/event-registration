import { useRef, useState } from 'react';
import { api, type ConfirmationDelivery } from '../api';

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

export function ConfirmationDeliveryPanel({ eventId, orderId }: { eventId: string; orderId: string }) {
  const [confirmation, setConfirmation] = useState<ConfirmationDelivery | null>();
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
      const result = await (action === 'retry' ? api.retryConfirmation(eventId, orderId) : api.confirmationDelivery(eventId, orderId));
      if (!result.confirmation?.canRetry && document.activeElement === retryButton.current) refreshButton.current?.focus();
      setConfirmation(result.confirmation);
    } catch {
      if (document.activeElement === retryButton.current) refreshButton.current?.focus();
      setConfirmation(undefined);
      setError(action === 'retry' ? 'Retry outcome could not be verified. Refresh status before trying again.' : 'Could not read confirmation status. Refresh to try again.');
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  return (
    <details className="confirmation-delivery" onToggle={(event) => { if (event.currentTarget.open) void load('refresh'); }}>
      <summary className="lookup-toggle">Confirmation email</summary>
      <p className="small" role="status">
        {busy === 'retry' ? 'Retrying confirmation…'
          : busy ? 'Checking confirmation status…'
            : confirmation === null ? 'No confirmation email recorded.'
              : confirmation && (
                <>Send status: {sendLabels[confirmation.status]}. Delivery: {confirmation.delivery ? deliveryLabels[confirmation.delivery] : 'No outcome recorded'}.</>
              )}
      </p>
      {error && <p className="field__error" role="alert">{error}</p>}
      <div className="row-actions">
        <button ref={refreshButton} type="button" className="btn btn--secondary btn--small" aria-disabled={busy !== null} onClick={() => void load('refresh')}>Refresh status</button>
        {confirmation?.canRetry && (
          <button ref={retryButton} type="button" className="btn btn--secondary btn--small" aria-disabled={busy !== null} onClick={() => void load('retry')}>Retry confirmation</button>
        )}
      </div>
    </details>
  );
}
