import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from './auth';
import { OrderPage, Register } from './Register';

const IDLE_MS = 5 * 60_000;
const WARNING_MS = 60_000;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'click', 'input', 'wheel', 'touchmove'];

export function KioskRegistration({ eventId }: { eventId: string }) {
  const { status, signIn, signOut } = useSession();
  const [orderId, setOrderId] = useState<string | null>(null);
  const [warning, setWarning] = useState(false);
  const [expired, setExpired] = useState(false);
  const signOutRef = useRef(signOut);
  const entrance = useRef<HTMLButtonElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const warningDialog = useRef<HTMLDialogElement>(null);
  const extendSession = useRef<(() => void) | null>(null);
  const signedIn = status === 'signed-in';

  useEffect(() => {
    if (!signedIn) entrance.current?.focus();
  }, [signedIn]);

  useEffect(() => {
    const hide = () => { if (surface.current) surface.current.hidden = true; };
    const restore = (event: PageTransitionEvent) => { if (event.persisted) window.location.reload(); };
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', restore);
    return () => {
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', restore);
    };
  }, []);

  useEffect(() => { signOutRef.current = signOut; }, [signOut]);

  const endSession = useCallback((timedOut = false) => {
    setOrderId(null);
    setWarning(false);
    setExpired(timedOut);
    signOutRef.current();
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    let deadline = Date.now() + IDLE_MS;
    let timer: number | undefined;
    let ended = false;

    const checkDeadline = () => {
      window.clearTimeout(timer);
      if (ended) return;
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        ended = true;
        endSession(true);
        return;
      }
      const showWarning = remaining <= WARNING_MS;
      setWarning(showWarning);
      timer = window.setTimeout(checkDeadline, showWarning ? remaining : remaining - WARNING_MS);
    };

    extendSession.current = () => {
      const now = Date.now();
      if (!ended && now < deadline) deadline = now + IDLE_MS;
      checkDeadline();
    };

    const activity = (event: Event) => {
      if (!event.isTrusted) return;
      const now = Date.now();
      if (ended || now >= deadline) {
        event.preventDefault();
        event.stopImmediatePropagation();
      } else if (now < deadline - WARNING_MS) {
        deadline = now + IDLE_MS;
      }
      checkDeadline();
    };

    checkDeadline();
    for (const type of ACTIVITY_EVENTS) document.addEventListener(type, activity, true);
    document.addEventListener('visibilitychange', checkDeadline);
    return () => {
      window.clearTimeout(timer);
      extendSession.current = null;
      for (const type of ACTIVITY_EVENTS) document.removeEventListener(type, activity, true);
      document.removeEventListener('visibilitychange', checkDeadline);
    };
  }, [signedIn, endSession]);

  useEffect(() => {
    const dialog = warningDialog.current;
    if (warning && dialog && !dialog.open) dialog.showModal();
    if (!warning && dialog?.open) dialog.close();
  }, [warning]);

  return (
    <div ref={surface}>
      {signedIn ? (
        <>
          <header className="reg__bar">
            <span>Shared test kiosk</span>
            <button className="btn btn--secondary btn--small" type="button" onClick={() => endSession()}>End kiosk session</button>
          </header>
          {orderId ? <OrderPage orderId={orderId} kiosk /> : <Register eventId={eventId} onKioskOrder={setOrderId} />}
          <dialog
            ref={warningDialog}
            className="kiosk-expiry panel-form"
            aria-labelledby="kiosk-expiry-title"
            aria-describedby="kiosk-expiry-description"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                extendSession.current?.();
              }
            }}
            onClose={() => { if (warning) extendSession.current?.(); }}
          >
            <h2 id="kiosk-expiry-title">This kiosk session is about to end</h2>
            <p id="kiosk-expiry-description">This kiosk has been inactive. Your session ends within one minute. Choose Keep working or press Escape to continue.</p>
            <div className="form-actions">
              <button className="btn btn--primary" type="button" onClick={() => extendSession.current?.()}>Keep working</button>
              <button className="btn btn--secondary" type="button" onClick={() => endSession()}>End session</button>
            </div>
          </dialog>
        </>
      ) : (
        <main className="reg__main reg__main--narrow">
          <h1>Walk-up registration kiosk</h1>
          {expired && <p className="note" role="status">The kiosk session ended after inactivity. To check a reservation or payment before trying again, sign in to My registrations on your own device.</p>}
          <p>Fictional riders and simulated payments only. Sign in as the rider or their guardian. End your session before handing the device to someone else.</p>
          <button ref={entrance} className="btn btn--primary" type="button" onClick={signIn}>Sign in to register</button>
        </main>
      )}
    </div>
  );
}
