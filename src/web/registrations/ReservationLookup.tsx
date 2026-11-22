import { useRef, useState, type FormEvent, type SyntheticEvent } from 'react';
import { reservationLookupSchema } from '../../shared/checkout';
import { api, type ReservationStatus } from '../api';
import { formatDateTime, ORDER_STATUS_LABEL } from '../format';

export function ReservationLookup({ eventId, onFound }: { eventId: string; onFound: () => void }) {
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
    // References match exactly: send the text as typed, with checkout's own length rule.
    const checked = reservationLookupSchema.safeParse(reference);
    if (!checked.success) {
      setInvalid(checked.error.issues[0]!.message);
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
      const { order } = await api.reservationStatus(eventId, reference);
      setResult({ order });
      if (order) onFound();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not check the reservation. Try again.');
    } finally {
      inFlight.current = false;
      setChecking(false);
    }
  };

  // The browser would drop or replace line breaks and then look up a different reference.
  const refuseLineBreaks = (e: SyntheticEvent, text: string) => {
    // The field is read-only while a lookup runs, so its answer stays that of the reference on screen.
    if (inFlight.current) {
      e.preventDefault();
      return;
    }
    if (!/[\r\n]/.test(text)) return;
    e.preventDefault();
    // Clear the earlier reference, or Check would look that one up instead.
    setReference('');
    setResult(undefined);
    setError(undefined);
    setInvalid('A reservation reference is one line. Copy it again without line breaks.');
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
          onPaste={(e) => refuseLineBreaks(e, e.clipboardData.getData('text'))}
          onDrop={(e) => refuseLineBreaks(e, e.dataTransfer.getData('text'))}
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
          {result?.order === null && <p>No order is visible for this reference yet. {reference !== reference.trim() && 'It starts or ends with a space, which counts as part of the reference. '}Check the reference against the rider’s checkout. Ask the rider to keep the pending checkout and retry the same reservation.</p>}
        </div>
        {error && <p className="field__error" role="alert">{error}</p>}
      </form>
    </details>
  );
}
