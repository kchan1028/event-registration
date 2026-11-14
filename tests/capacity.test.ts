import { describe, expect, it } from 'vitest';
import { canAdmit, limitsForCategory, remainingForCategory, usageForCategory } from '../src/shared/capacity';
import { configFromTemplate, newCategory } from '../src/shared/factory';
import type { Category, EventConfig, TestEntry } from '../src/shared/schema';

/** Two categories with caps of 40 each and a combined pool of 60 (product.md acceptance criterion). */
function sharedCapScenario() {
  const config = configFromTemplate({ name: 'Cap test', template: 'road_race', startDate: '2027-05-01', timeZone: 'America/Los_Angeles', venue: '' });
  const raceId = config.races[0].id;
  const a: Category = { ...newCategory(config, raceId), name: 'Masters 50+', timingCode: 'A', cap: 40 };
  const b: Category = { ...newCategory(config, raceId), name: 'Masters 60+', timingCode: 'B', cap: 40, sortOrder: 1 };
  const sg = { id: 'sg_shared', raceId, name: 'Masters 50+ and 60+', startTime: '09:00', stagingTime: null, fieldLimit: null };
  a.startGroupId = sg.id;
  b.startGroupId = sg.id;
  const next: EventConfig = {
    ...config,
    startGroups: [sg],
    categories: [a, b],
    capacityPools: [{ id: 'pool_ab', name: 'Combined 60', limit: 60, memberCategoryIds: [a.id, b.id], memberStartGroupIds: [] }],
  };
  return { config: next, a, b };
}

function entries(categoryId: string, n: number, prefix = 'r'): TestEntry[] {
  return Array.from({ length: n }, (_, i) => ({ id: `${prefix}${categoryId}${i}`, categoryId, riderRef: `${prefix}-${categoryId}-${i}` }));
}

describe('capacity: category caps, start groups, and shared pools', () => {
  it('35 entries in A leave at most 25 places in B (40/40/60)', () => {
    const { config, a, b } = sharedCapScenario();
    const list = entries(a.id, 35);
    expect(remainingForCategory(config, list, b.id)).toBe(25);
    expect(remainingForCategory(config, list, a.id)).toBe(5);
  });

  it('refuses the 61st rider even though B is under its own cap', () => {
    const { config, a, b } = sharedCapScenario();
    const list = [...entries(a.id, 35), ...entries(b.id, 25)];
    const r = canAdmit(config, list, b.id, 'new-rider');
    expect(r.ok).toBe(false);
    if (!r.ok && r.reason === 'full') expect(r.blockedBy.kind).toBe('pool');
  });

  it('refuses the 41st rider in A even though the pool has room', () => {
    const { config, a } = sharedCapScenario();
    const r = canAdmit(config, entries(a.id, 40), a.id, 'new-rider');
    expect(r.ok).toBe(false);
    if (!r.ok && r.reason === 'full') expect(r.blockedBy.kind).toBe('category');
  });

  it('counts a rider once toward a shared limit', () => {
    const { config, a, b } = sharedCapScenario();
    const list: TestEntry[] = [...entries(a.id, 30), ...entries(b.id, 29), { id: 'x', categoryId: a.id, riderRef: 'dual-rider' }];
    // 60 distinct riders: the pool is full for new riders...
    expect(canAdmit(config, list, b.id, 'someone-new').ok).toBe(false);
    // ...but the rider already counted in the pool can take a second (dual-scored) entry without a second place.
    expect(canAdmit(config, list, b.id, 'dual-rider').ok).toBe(true);
  });

  it('applies the start group field limit to every category in it', () => {
    const { config, a, b } = sharedCapScenario();
    config.startGroups[0].fieldLimit = 50;
    config.capacityPools = [];
    const list = [...entries(a.id, 30), ...entries(b.id, 20)];
    const r = canAdmit(config, list, b.id, 'new');
    expect(r.ok).toBe(false);
    if (!r.ok && r.reason === 'full') expect(r.blockedBy.kind).toBe('start_group');
    expect(usageForCategory(config, list, a.id).map((u) => u.kind)).toEqual(['category', 'start_group']);
  });

  it('never creates a limit from a display group', () => {
    const { config, a, b } = sharedCapScenario();
    a.cap = null;
    b.cap = null;
    config.capacityPools = [];
    a.displayGroupId = config.displayGroups[0].id;
    b.displayGroupId = config.displayGroups[0].id;
    expect(limitsForCategory(config, a.id)).toEqual([]);
    expect(remainingForCategory(config, entries(a.id, 500), b.id)).toBeNull();
  });

  it('refuses entries to closed categories and duplicate entries', () => {
    const { config, a } = sharedCapScenario();
    expect(canAdmit(config, [{ id: '1', categoryId: a.id, riderRef: 'r1' }], a.id, 'r1')).toEqual({ ok: false, reason: 'duplicate' });
    a.status = 'closed';
    expect(canAdmit(config, [], a.id, 'r2')).toEqual({ ok: false, reason: 'closed' });
  });

  it('pools can include whole start groups', () => {
    const { config, a, b } = sharedCapScenario();
    config.capacityPools = [{ id: 'p', name: 'By start group', limit: 10, memberCategoryIds: [], memberStartGroupIds: [config.startGroups[0].id] }];
    expect(remainingForCategory(config, entries(a.id, 6), b.id)).toBe(4);
  });
});
