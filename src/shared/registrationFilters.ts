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

function entryMatches(e: FilterableEntry, f: RegistrationFilter): boolean {
  if (f.dayId && e.dayId !== f.dayId) return false;
  if (f.categoryId && e.categoryId !== f.categoryId) return false;
  if (f.entryStatus && STATUS_GROUP[e.status] !== f.entryStatus) return false;
  if (f.missingWaiver && !e.readiness.some((r) => (r.key === 'waiver' || r.key === 'guardian') && r.state !== 'done')) return false;
  return true;
}

export function isFilterActive(f: RegistrationFilter): boolean {
  return Boolean(f.dayId || f.categoryId || f.entryStatus || f.missingWaiver);
}

export function matchesRegistrationFilter(order: { entries: readonly FilterableEntry[] }, f: RegistrationFilter): boolean {
  if (!isFilterActive(f)) return true;
  return order.entries.some((e) => entryMatches(e, f));
}
