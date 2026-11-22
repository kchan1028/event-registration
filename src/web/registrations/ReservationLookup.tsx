import { useEffect, useRef, useState, type FormEvent, type SyntheticEvent } from 'react';
import { reservationLookupSchema } from '../../shared/checkout';
import { staffReleaseReasonSchema } from '../../shared/lookup';
import { api, ApiError, type ReservationLookupResult } from '../api';
import { formatDateTime, ORDER_STATUS_LABEL, RELEASED_BY_STAFF } from '../format';
import { ReasonForm } from '../ui';

export function ReservationLookup({ eventId, canManage, onFound }: { eventId: string; canManage: boolean; onFound: () => void }) {
  const inFlight = useRef(false);
  const field = useRef<HTMLInputElement>(null);
  const [invalid, setInvalid] = useState<string>();
  const [reference, setReference] = useState('');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<ReservationLookupResult>();
  const [error, setError] = useState<string>();
  const releasing = useRef(false);
  const checkButton = useRef<HTMLButtonElement>(null);
  const confirmation = useRef<HTMLInputElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [riderRequested, setRiderRequested] = useState(false);
  const order = result?.order;
  const active = order?.status === 'held' || order?.status === 'payment_failed';

  useEffect(() => {
    if (confirming) confirmation.current?.focus();
  }, [confirming]);

  const closeConfirmation = () => {
    setConfirming(false);
    setRiderRequested(false);
    checkButton.current?.focus();
  };

  const release = async (reason: string) => {
    if (!riderRequested || releasing.current) return;
    releasing.current = true;
    try {
      setResult(await api.releaseReservation(eventId, { reference, reason, riderRequested: true }));
      closeConfirmation();
      onFound();
    } catch (failure) {
      // Any other failure stays in the form, where the same release can be sent again safely.
      if (!(failure instanceof ApiError) || failure.status !== 409) throw failure;
      setResult(undefined);
      setError(`${failure.message} Check the reservation again to see its status.`);
      closeConfirmation();
    } finally {
      releasing.current = false;
    }
  };

  const lookup = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (inFlight.current || confirming) return;
    // A refused paste left the field empty: keep its explanation.
    if (!reference && invalid) {
      field.current?.focus();
      return;
    }
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
      const found = await api.reservationStatus(eventId, reference);
      setResult(found);
      if (found.order) onFound();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not check the reservation. Try again.');
    } finally {
      inFlight.current = false;
      setChecking(false);
    }
  };

  // The browser would drop or replace line breaks and then look up a different reference.
  const refuseLineBreaks = (e: SyntheticEvent, text: string) => {
    // The field is read-only while a lookup or release is open, so it stays the reference being acted on.
    if (inFlight.current || confirming) {
      e.preventDefault();
      return;
    }
    if (!/[\r\n]/.test(text)) return;
    e.preventDefault();
    // Clear the earlier reference, or Check would look that one up instead.
    setReference('');
    setResult(undefined);
    setError(undefined);
    setInvalid('This field cannot check a reference with a line break. Keep the original unchanged: removing the break makes it a different reference.');
  };

  return (
    <details className="settings__section">
      <summary className="lookup-toggle">Check a pending reservation</summary>
      <form className="reg-search" onSubmit={lookup}>
        <label htmlFor="staff-reservation-reference">Reservation reference</label>
        <input
          id="staff-reservation-reference"
          ref={field}
          className="input reference-input"
          aria-invalid={!!invalid || undefined}
          aria-describedby={invalid ? 'staff-reservation-reference-error' : undefined}
          value={reference}
          onChange={(e) => { setReference(e.target.value); setResult(undefined); setError(undefined); setInvalid(undefined); }}
          onPaste={(e) => refuseLineBreaks(e, e.clipboardData.getData('text'))}
          onDrop={(e) => refuseLineBreaks(e, e.dataTransfer.getData('text'))}
          readOnly={checking || confirming}
          autoComplete="off"
          spellCheck={false}
        />
        {invalid && <p className="field__error" id="staff-reservation-reference-error" role="alert">{invalid}</p>}
        <div>
          <button ref={checkButton} className="btn btn--secondary lookup-submit" aria-disabled={checking || confirming || undefined}>
            {checking ? 'Checking…' : 'Check reservation'}
          </button>
        </div>
        <div className="small" role="status">
          {checking && 'Checking for a saved order…'}
          {order && (
            <p>
              <strong>{order.orderNumber}</strong> · {order.status === 'cancelled' && order.releasedByStaff ? RELEASED_BY_STAFF : ORDER_STATUS_LABEL[order.status]}
              {order.holdExpiresAt && <> · Hold expires {formatDateTime(order.holdExpiresAt)}</>}
            </p>
          )}
          {canManage && active && !result?.releaseEnabled && <p>This hold cannot be released here. Ask the treasurer to review its payment history.</p>}
          {result?.order === null && <p>No order is visible for this reference yet. {reference !== reference.trim() && 'It starts or ends with a space or other blank character, which counts as part of the reference. '}Check the reference against the rider’s checkout. Ask the rider to keep the pending checkout and retry the same reservation.</p>}
        </div>
        {error && <p className="field__error" role="alert">{error}</p>}
      </form>
      {result?.releaseEnabled && active && !confirming && (
        <button type="button" className="btn btn--secondary lookup-submit" onClick={() => setConfirming(true)}>Release unpaid hold</button>
      )}
      {result?.releaseEnabled && active && confirming && (
        <div className="lookup-release">
          <ReasonForm
            variant="block"
            label="Release unpaid hold"
            intro={<>Release the places held for {order?.orderNumber}. The rider can start a new registration afterward.</>}
            reasonLabel="Reason for release"
            hint="Leave out names and contact details."
            submitLabel="Confirm hold release"
            busyLabel="Releasing hold…"
            disabled={!riderRequested}
            validate={(reason) => staffReleaseReasonSchema.safeParse(reason).error?.issues[0]?.message ?? null}
            onSubmit={release}
            onCancel={() => { if (!releasing.current) closeConfirmation(); }}
          >
            <label className="check">
              <input ref={confirmation} type="checkbox" checked={riderRequested} onChange={(e) => setRiderRequested(e.target.checked)} />
              The rider asked me to release this hold
            </label>
          </ReasonForm>
        </div>
      )}
    </details>
  );
}
