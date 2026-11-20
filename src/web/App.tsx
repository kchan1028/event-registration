import { useEffect, useState } from 'react';
import { MyRegistrations } from './MyRegistrations';
import { kioskEventId, RequireSignIn, TEST_MODE } from './auth';
import { KioskRegistration } from './KioskRegistration';
import { Builder } from './Builder';
import { CheckIn } from './CheckIn';
import { Home } from './Home';
import { OrderPage, Register, RegisterIndex } from './Register';
import { Roster } from './Roster';

export type Route =
  | { page: 'home' }
  | { page: 'register'; eventId: string }
  | { page: 'events' }
  | { page: 'order'; orderId: string }
  | { page: 'my-registrations' }
  | { page: 'checkin'; eventId: string }
  | { page: 'roster'; eventId: string }
  | { page: 'event'; eventId: string; view: 'race'; raceId: string | null }
  | { page: 'event'; eventId: string; view: 'setup' | 'pools' | 'publish' | 'preview' | 'registrations' | 'import' | 'startlists' };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'register' && parts[1]) return { page: 'register', eventId: parts[1] };
  if (parts[0] === 'register') return { page: 'events' };
  if (parts[0] === 'orders' && parts[1]) return { page: 'order', orderId: parts[1] };
  if (parts[0] === 'my-registrations') return { page: 'my-registrations' };
  if (parts[0] !== 'events' || !parts[1]) return { page: 'home' };
  const eventId = parts[1];
  const view = parts[2];
  if (view === 'check-in') return { page: 'checkin', eventId };
  if (view === 'roster') return { page: 'roster', eventId };
  if (view === 'setup' || view === 'pools' || view === 'publish' || view === 'preview' || view === 'registrations' || view === 'import' || view === 'startlists') return { page: 'event', eventId, view };
  return { page: 'event', eventId, view: 'race', raceId: view === 'race' ? (parts[3] ?? null) : null };
}

export function href(route: Route): string {
  if (route.page === 'home') return '#/';
  if (route.page === 'register') return `#/register/${route.eventId}`;
  if (route.page === 'events') return '#/register';
  if (route.page === 'order') return `#/orders/${route.orderId}`;
  if (route.page === 'my-registrations') return '#/my-registrations';
  if (route.page === 'checkin') return `#/events/${route.eventId}/check-in`;
  if (route.page === 'roster') return `#/events/${route.eventId}/roster`;
  if (route.view === 'race') return `#/events/${route.eventId}${route.raceId ? `/race/${route.raceId}` : ''}`;
  return `#/events/${route.eventId}/${route.view}`;
}

export function navigate(route: Route): void {
  window.location.hash = href(route);
}

export function App() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const kiosk = kioskEventId();
  if (kiosk !== null) return TEST_MODE && kiosk
    ? <KioskRegistration key={kiosk} eventId={kiosk} />
    : <main className="state-page"><h1>Test kiosk unavailable</h1><p>Ask staff for the public registration address.</p></main>;

  // The open event list and rider event pages are public; Register asks riders to sign in before checkout.
  if (route.page === 'register') return <Register key={route.eventId} eventId={route.eventId} />;
  if (route.page === 'events') return <RegisterIndex />;
  return <RequireSignIn>{signedInPage(route)}</RequireSignIn>;
}

function signedInPage(route: Exclude<Route, { page: 'register' } | { page: 'events' }>) {
  if (route.page === 'home') return <Home />;
  if (route.page === 'order') return <OrderPage key={route.orderId} orderId={route.orderId} />;
  if (route.page === 'my-registrations') return <MyRegistrations />;
  if (route.page === 'checkin') return <CheckIn key={route.eventId} eventId={route.eventId} />;
  if (route.page === 'roster') return <Roster key={route.eventId} eventId={route.eventId} />;
  return <Builder key={route.eventId} route={route} />;
}
