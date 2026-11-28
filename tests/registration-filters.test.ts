import { describe, expect, it } from 'vitest';
import { filterToParams, isFilterActive, matchesRegistrationFilter, sortRegistrations } from '../src/shared/registrationFilters';

type Entry = Parameters<typeof matchesRegistrationFilter>[0]['entries'][number];
const done = [{ key: 'waiver', state: 'done' }, { key: 'license', state: 'needs_review' }] as Entry['readiness'];
const entry = (over: Partial<Entry> = {}): Entry => ({ dayId: 'sat', categoryId: 'rr-m35', status: 'confirmed', readiness: done, ...over });

describe('registration filters', () => {
  it('matches everything when no filter is set', () => {
    expect(isFilterActive({})).toBe(false);
    expect(matchesRegistrationFilter({ entries: [] }, {})).toBe(true);
  });

  it('matches an order when one entry meets every chosen condition', () => {
    const weekend = { entries: [entry(), entry({ dayId: 'sun', categoryId: 'cr-m35' })] };
    expect(matchesRegistrationFilter(weekend, { dayId: 'sun' })).toBe(true);
    expect(matchesRegistrationFilter(weekend, { dayId: 'sun', categoryId: 'cr-m35' })).toBe(true);
    // Conditions apply to the same entry, not across entries.
    expect(matchesRegistrationFilter(weekend, { dayId: 'sun', categoryId: 'rr-m35' })).toBe(false);
  });

  it('groups held and confirmed as active, and never shows a released hold under a status', () => {
    expect(matchesRegistrationFilter({ entries: [entry({ status: 'held' })] }, { entryStatus: 'active' })).toBe(true);
    expect(matchesRegistrationFilter({ entries: [entry({ status: 'withdrawn' })] }, { entryStatus: 'active' })).toBe(false);
    expect(matchesRegistrationFilter({ entries: [entry({ status: 'withdrawn' })] }, { entryStatus: 'withdrawn' })).toBe(true);
    expect(matchesRegistrationFilter({ entries: [entry({ status: 'cancelled' })] }, { entryStatus: 'cancelled' })).toBe(true);
    for (const entryStatus of ['active', 'withdrawn', 'cancelled'] as const) {
      expect(matchesRegistrationFilter({ entries: [entry({ status: 'released' })] }, { entryStatus })).toBe(false);
    }
  });

  it('finds a missing waiver or guardian signature, but not a license review alone', () => {
    expect(matchesRegistrationFilter({ entries: [entry()] }, { missingWaiver: true })).toBe(false);
    expect(matchesRegistrationFilter({ entries: [entry({ readiness: [{ key: 'waiver', state: 'missing' }] })] }, { missingWaiver: true })).toBe(true);
    expect(matchesRegistrationFilter({ entries: [entry({ readiness: [{ key: 'waiver', state: 'done' }, { key: 'guardian', state: 'missing' }] })] }, { missingWaiver: true })).toBe(true);
  });

  it('sorts deterministically, never treats a sort as a filter, and leaves the default sort out of the address', () => {
    const order = (id: string, orderNumber: string, createdAt: string, lastName: string, firstName = 'Ana') => ({ id, orderNumber, createdAt, rider: { firstName, lastName } });
    const orders = [
      order('o1', 'R-002', '2026-11-01T10:00:00Z', 'zhou'),
      order('o2', 'R-001', '2026-11-02T10:00:00Z', 'Álvarez'),
      order('o3', 'R-003', '2026-11-02T10:00:00Z', 'Zhou', 'Ben'),
    ];
    const ids = (sort?: Parameters<typeof sortRegistrations>[1]) => sortRegistrations(orders, sort).map((o) => o.id);
    // Same time: the order number breaks the tie.
    expect(ids()).toEqual(['o2', 'o3', 'o1']);
    expect(ids('oldest')).toEqual(['o1', 'o2', 'o3']);
    // Case and accents do not change the name order; the first name breaks a tie.
    expect(ids('name')).toEqual(['o2', 'o1', 'o3']);
    expect(ids('order')).toEqual(['o2', 'o1', 'o3']);
    expect(isFilterActive({ sort: 'name' })).toBe(false);
    expect(matchesRegistrationFilter({ entries: [entry({ status: 'withdrawn' })] }, { sort: 'name' })).toBe(true);
    expect(filterToParams({ sort: 'newest' }).toString()).toBe('');
    expect(filterToParams({ entryStatus: 'active', sort: 'name' }).toString()).toBe('entryStatus=active&sort=name');
  });
});
