import type { ReadinessItem } from './checkout';

/**
 * Entry-level filters for an event's registrations. Shared by the Registrations screen and any export of the same view,
 * so both apply one rule. An order matches when at least one of its entries meets every chosen condition, so a rider
 * entered in several races is found by any of them and still counts once.
 */
export interface RegistrationFilter {
  /** A race day id from the event configuration. */
  dayId?: string;
  categoryId?: string;
  /** `active` is a held or confirmed entry. */
  entryStatus?: 'active' | 'withdrawn' | 'cancelled';
  /** The entry's waiver or required guardian signature is not done. */
  missingWaiver?: boolean;
  /** Row order, not a condition: it never narrows the list. Missing means `newest`. */
  sort?: RegistrationSort;
}

export const REGISTRATION_SORTS = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  name: 'Rider last name',
  order: 'Order number',
} as const;
export type RegistrationSort = keyof typeof REGISTRATION_SORTS;
/** The sort names as a non-empty tuple, for validating a sort from a request. */
export const REGISTRATION_SORT_KEYS = Object.keys(REGISTRATION_SORTS) as [RegistrationSort, ...RegistrationSort[]];

interface SortableOrder {
  id: string;
  orderNumber: string;
  createdAt: string;
  rider: { firstName: string; lastName: string };
}

const byText = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base' });

/**
 * Orders in the chosen row order. Shared by the screen and the entries download, so a saved view lists and exports rows
 * the same way. Ties fall back to the order number and then the id, so the order never depends on how rows were read.
 */
export function sortRegistrations<T extends SortableOrder>(orders: readonly T[], sort: RegistrationSort = 'newest'): T[] {
  const tie = (a: T, b: T) => byText(a.orderNumber, b.orderNumber) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const compare: Record<RegistrationSort, (a: T, b: T) => number> = {
    newest: (a, b) => b.createdAt.localeCompare(a.createdAt) || tie(a, b),
    oldest: (a, b) => a.createdAt.localeCompare(b.createdAt) || tie(a, b),
    name: (a, b) => byText(a.rider.lastName, b.rider.lastName) || byText(a.rider.firstName, b.rider.firstName) || tie(a, b),
    order: tie,
  };
  return [...orders].sort(compare[sort]);
}

interface FilterableEntry {
  dayId: string;
  categoryId: string;
  status: 'held' | 'confirmed' | 'released' | 'withdrawn' | 'cancelled';
  readiness: readonly Pick<ReadinessItem, 'key' | 'state'>[];
}

const STATUS_GROUP: Record<FilterableEntry['status'], RegistrationFilter['entryStatus'] | null> = {
  held: 'active',
  confirmed: 'active',
  withdrawn: 'withdrawn',
  cancelled: 'cancelled',
  released: null,
};

export function entryMatchesFilter(e: FilterableEntry, f: RegistrationFilter): boolean {
  if (f.dayId && e.dayId !== f.dayId) return false;
  if (f.categoryId && e.categoryId !== f.categoryId) return false;
  if (f.entryStatus && STATUS_GROUP[e.status] !== f.entryStatus) return false;
  if (f.missingWaiver && !e.readiness.some((r) => (r.key === 'waiver' || r.key === 'guardian') && r.state !== 'done')) return false;
  return true;
}

/**
 * Query parameters for the entry filters, shared by the screen's download link and the server's export. Search text is
 * never included: it can hold a rider's email or check-in code, and a URL is kept in browser history and access logs.
 */
export function filterToParams(f: RegistrationFilter): URLSearchParams {
  const p = new URLSearchParams();
  if (f.dayId) p.set('dayId', f.dayId);
  if (f.categoryId) p.set('categoryId', f.categoryId);
  if (f.entryStatus) p.set('entryStatus', f.entryStatus);
  if (f.missingWaiver) p.set('missingWaiver', '1');
  if (f.sort && f.sort !== 'newest') p.set('sort', f.sort);
  return p;
}

export function isFilterActive(f: RegistrationFilter): boolean {
  return Boolean(f.dayId || f.categoryId || f.entryStatus || f.missingWaiver);
}

export function matchesRegistrationFilter(order: { entries: readonly FilterableEntry[] }, f: RegistrationFilter): boolean {
  if (!isFilterActive(f)) return true;
  return order.entries.some((e) => entryMatchesFilter(e, f));
}
