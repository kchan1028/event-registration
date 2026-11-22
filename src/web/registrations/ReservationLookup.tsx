import { useRef, useState, type FormEvent } from 'react';
import { api, type ReservationStatus } from '../api';
import { formatDateTime, ORDER_STATUS_LABEL } from '../format';

export function ReservationLookup({ eventId, onFound }: { eventId: string; onFound: (order: ReservationStatus) => void }) {
  const inFlight = useRef(false);
  const field = useRef<HTMLInputElement>(null);
  const [invalid, setInvalid] = useState<string>();
  const [reference, setReference] = useState('');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{ order: ReservationStatus | null }>();
  const [error, setError] = useState<string>();

  const lookup = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (inFlight.current) return;
    // References match exactly, so try the text as typed before dropping the spaces a paste can add.
    const candidates = [...new Set([reference, reference.trim()])].filter((value) => value.trim() && value.length >= 8 && value.length <= 64);
    if (candidates.length === 0) {
      setInvalid('Enter the reservation reference shown in the rider’s pending checkout.');
      setResult(undefined);
      setError(undefined);
      field.current?.focus();
      return;
    }
    inFlight.current = true;
    setChecking(true);
    setResult(undefined);
    setError(undefined);
    setInvalid(undefined);
    try {
      let order: ReservationStatus | null = null;
      for (const value of candidates) {
        order = (await api.reservationStatus(eventId, value)).order;
        if (order) break;
      }
      setResult({ order });
      if (order) onFound(order);
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
          ref={field}
          className="input"
          aria-invalid={!!invalid || undefined}
          aria-describedby={invalid ? 'staff-reservation-reference-error' : undefined}
          value={reference}
          onChange={(e) => { setReference(e.target.value); setResult(undefined); setError(undefined); setInvalid(undefined); }}
          readOnly={checking}
          autoComplete="off"
          spellCheck={false}
        />
        {invalid && <p className="field__error" id="staff-reservation-reference-error" role="alert">{invalid}</p>}
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
