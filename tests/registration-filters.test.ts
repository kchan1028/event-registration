import { describe, expect, it } from 'vitest';
import { isFilterActive, matchesRegistrationFilter } from '../src/shared/registrationFilters';

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
});
