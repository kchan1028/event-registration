import { useRef, useState, type FormEvent } from 'react';
import { api, type ReservationStatus } from '../api';
import { formatDateTime, ORDER_STATUS_LABEL } from '../format';

export function ReservationLookup({ eventId }: { eventId: string }) {
  const inFlight = useRef(false);
  const [reference, setReference] = useState('');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{ order: ReservationStatus | null }>();
  const [error, setError] = useState<string>();

  const lookup = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (inFlight.current) return;
    const input = reference.trim();
    if (input.length < 8 || input.length > 64) {
      setError('Enter the reservation reference shown in the rider’s pending checkout.');
      return;
    }
    inFlight.current = true;
    setChecking(true);
    setResult(undefined);
    setError(undefined);
    try {
      setResult(await api.reservationStatus(eventId, input));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not check the reservation. Try again.');
    } finally {
      inFlight.current = false;
      setChecking(false);
    }
  };

  return (
    <details className="settings__section">
      <summary>Check a pending reservation</summary>
      <form className="reg-search" onSubmit={lookup}>
        <label htmlFor="staff-reservation-reference">Reservation reference</label>
        <input
          id="staff-reservation-reference"
          className="input"
          value={reference}
          onChange={(e) => { setReference(e.target.value); setResult(undefined); setError(undefined); }}
          readOnly={checking}
          autoComplete="off"
          spellCheck={false}
          maxLength={64}
        />
        <div>
          <button className="btn btn--secondary" aria-disabled={checking || undefined}>
            {checking ? 'Checking…' : 'Check reservation'}
          </button>
        </div>
        <div className="small" role="status">
          {checking && 'Checking for a saved order…'}
          {result?.order && (
            <p>
              <strong>{result.order.orderNumber}</strong> · {ORDER_STATUS_LABEL[result.order.status]}
              {result.order.holdExpiresAt && <> · Hold expires {formatDateTime(result.order.holdExpiresAt)}</>}
            </p>
          )}
          {result?.order === null && <p>No order is visible for this reference yet. Check the reference against the rider’s checkout. Ask the rider to keep the pending checkout and retry the same reservation.</p>}
        </div>
        {error && <p className="field__error" role="alert">{error}</p>}
      </form>
    </details>
  );
}
