import { useEffect, useRef, useState } from 'react';
import { useSession } from './auth';
import { OrderPage, Register } from './Register';

export function KioskRegistration({ eventId }: { eventId: string }) {
  const session = useSession();
  const [orderId, setOrderId] = useState<string | null>(null);
  const entrance = useRef<HTMLButtonElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const signedIn = session.status === 'signed-in';

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

  function endSession() {
    setOrderId(null);
    session.signOut();
    window.scrollTo(0, 0);
  }

  return (
    <div ref={surface}>
      {signedIn ? (
        <>
          <header className="reg__bar">
            <span>Shared test kiosk</span>
            <button className="btn btn--secondary btn--small" type="button" onClick={endSession}>End kiosk session</button>
          </header>
          {orderId ? <OrderPage orderId={orderId} kiosk /> : <Register eventId={eventId} onKioskOrder={setOrderId} />}
        </>
      ) : (
        <main className="reg__main reg__main--narrow">
          <h1>Walk-up registration kiosk</h1>
          <p>Fictional riders and simulated payments only. Sign in as the rider or their guardian. End your session before handing the device to someone else.</p>
          <button ref={entrance} className="btn btn--primary" type="button" onClick={session.signIn}>Sign in to register</button>
        </main>
      )}
    </div>
  );
}
