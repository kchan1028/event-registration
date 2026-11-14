import { useEffect, useState } from 'react';
import { Builder } from './Builder';
import { Home } from './Home';

export type Route =
  | { page: 'home' }
  | { page: 'event'; eventId: string; view: 'race'; raceId: string | null }
  | { page: 'event'; eventId: string; view: 'setup' | 'pools' | 'publish' | 'preview' };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] !== 'events' || !parts[1]) return { page: 'home' };
  const eventId = parts[1];
  const view = parts[2];
  if (view === 'setup' || view === 'pools' || view === 'publish' || view === 'preview') return { page: 'event', eventId, view };
  return { page: 'event', eventId, view: 'race', raceId: view === 'race' ? (parts[3] ?? null) : null };
}

export function href(route: Route): string {
  if (route.page === 'home') return '#/';
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
  return <Builder key={route.eventId} route={route} />;
}
