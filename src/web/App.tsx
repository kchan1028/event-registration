import { useEffect, useState } from 'react';
import { Builder } from './Builder';
import { CheckIn } from './CheckIn';
import { Home } from './Home';
import { OrderPage, Register, RegisterIndex } from './Register';

export type Route =
  | { page: 'home' }
  | { page: 'register'; eventId: string }
  | { page: 'events' }
  | { page: 'order'; orderId: string }
  | { page: 'checkin'; eventId: string }
  | { page: 'event'; eventId: string; view: 'race'; raceId: string | null }
  | { page: 'event'; eventId: string; view: 'setup' | 'pools' | 'publish' | 'preview' | 'registrations' | 'startlists' };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'register' && parts[1]) return { page: 'register', eventId: parts[1] };
  if (parts[0] === 'register') return { page: 'events' };
  if (parts[0] === 'orders' && parts[1]) return { page: 'order', orderId: parts[1] };
  if (parts[0] !== 'events' || !parts[1]) return { page: 'home' };
  const eventId = parts[1];
  const view = parts[2];
  if (view === 'check-in') return { page: 'checkin', eventId };
  if (view === 'setup' || view === 'pools' || view === 'publish' || view === 'preview' || view === 'registrations' || view === 'startlists') return { page: 'event', eventId, view };
  return { page: 'event', eventId, view: 'race', raceId: view === 'race' ? (parts[3] ?? null) : null };
}

export function href(route: Route): string {
  if (route.page === 'home') return '#/';
  if (route.page === 'register') return `#/register/${route.eventId}`;
  if (route.page === 'events') return '#/register';
  if (route.page === 'order') return `#/orders/${route.orderId}`;
  if (route.page === 'checkin') return `#/events/${route.eventId}/check-in`;
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

  if (route.page === 'home') return <Home />;
  if (route.page === 'register') return <Register key={route.eventId} eventId={route.eventId} />;
  if (route.page === 'events') return <RegisterIndex />;
  if (route.page === 'order') return <OrderPage key={route.orderId} orderId={route.orderId} />;
  if (route.page === 'checkin') return <CheckIn key={route.eventId} eventId={route.eventId} />;
  return <Builder key={route.eventId} route={route} />;
}
