import { useState } from 'react';
import { href } from './App';
import { TEST_MODE } from './auth';
import { QrCodeImage } from './QrCodeImage';
import { WalkUpChoices } from './WalkUpChoices';

/** Published event handoff. Staff stay signed in on their own device. */
export function WalkUpRegistration({ eventId, dayId, published }: { eventId: string; dayId: string; published: boolean }) {
  const [showChoices, setShowChoices] = useState(false);
  const address = new URL(href({ page: 'register', eventId }), window.location.origin + window.location.pathname);
  const kiosk = new URL(window.location.origin + window.location.pathname);
  kiosk.searchParams.set('kiosk', eventId);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(address.hostname);
  return <section className="ci-walkup" aria-label="Rider phone registration">
    <h2>Register on the rider’s phone</h2>
    {!published ? <p role="status">Publish this event before sharing rider registration.</p> : <>
      <p>The rider or guardian opens this public event link on their own phone and signs in with their own account. Keep the staff session on this device.</p>
      <QrCodeImage value={address.href} alt="QR code to open rider registration" />
      <label>Public registration address<input className="input" readOnly value={address.href} onFocus={(e) => e.currentTarget.select()} /></label>
      <a className="btn btn--secondary" href={address.href} target="_blank" rel="noopener noreferrer">Preview registration (new tab)</a>
      {local && <p className="ci__notice" role="note">This local address works only on this computer. Another device needs a reachable test site; do not use real rider data.</p>}
      <ol>
        <li>The rider chooses available races, checks the total including configured day-of surcharges, and completes their own details, waiver and payment. Published windows, eligibility, capacity and waitlists still apply.</li>
        <li>Ask for their name or confirmation code, then search again in check-in. Payment alone does not clear readiness.</li>
        <li>Resolve outstanding requirements through authorized review. Issue a bib only when check-in shows Ready to race; existing start-list rules still apply.</li>
      </ol>
      <p>Connectivity is required. A closed race needs organizer review; this handoff does not reopen registration. Cash/check and card terminals are outside this workflow.</p>
      <button type="button" className="btn btn--secondary" aria-expanded={showChoices} onClick={() => setShowChoices((open) => !open)}>
        Prepare race choices
      </button>
      {showChoices && <>
        <p>Staff prepare the race choices. The rider or guardian reviews them and completes checkout on their phone.</p>
        <WalkUpChoices key={dayId} eventId={eventId} dayId={dayId} address={address.href} />
      </>}
      {TEST_MODE && <>
        <h3>Shared test kiosk</h3>
        <p>Copy this address to a dedicated rider browser or device with autofill disabled. Use fictional accounts and simulated payments.</p>
        <label>Test kiosk address<input className="input" readOnly value={kiosk.href} onFocus={(e) => e.currentTarget.select()} /></label>
      </>}
    </>}
  </section>;
}
