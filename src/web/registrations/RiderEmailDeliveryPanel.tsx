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

const panelCopy = {
  confirmation: { summary: 'Confirmation email', retry: 'Retry confirmation', className: 'confirmation-delivery' },
  offer: { summary: 'Offer email', retry: 'Retry offer email', className: 'offer-email-delivery' },
  receipt: { summary: 'Receipt email', retry: 'Retry receipt email', className: 'receipt-email-delivery' },
  refund: { summary: 'Refund email', retry: 'Retry refund email', className: 'refund-email-delivery' },
} as const;

async function readDelivery(kind: keyof typeof panelCopy, eventId: string, recordId: string, action: 'refresh' | 'retry') {
  if (kind === 'offer') return (await (action === 'retry' ? api.retryWaitlistOfferEmail : api.waitlistOfferEmail)(eventId, recordId)).offerEmail;
  if (kind === 'receipt') return (await (action === 'retry' ? api.retryReceiptDelivery : api.receiptDelivery)(eventId, recordId)).receipt;
  if (kind === 'refund') return (await (action === 'retry' ? api.retryRefundNotice : api.noticeDelivery)(eventId, recordId)).notice;
  return (await (action === 'retry' ? api.retryConfirmation : api.confirmationDelivery)(eventId, recordId)).confirmation;
}

export function RiderEmailDeliveryPanel({ eventId, recordId, kind }: { eventId: string; recordId: string; kind: keyof typeof panelCopy }) {
  const copy = panelCopy[kind];
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
      const result = await readDelivery(kind, eventId, recordId, action);
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
    <details className={copy.className} onToggle={(event) => { if (event.currentTarget.open) void load('refresh'); }}>
      <summary className="lookup-toggle">{copy.summary}</summary>
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
          <button ref={retryButton} type="button" className="btn btn--secondary btn--small" aria-disabled={busy !== null} onClick={() => void load('retry')}>{copy.retry}</button>
        )}
      </div>
    </details>
  );
}
