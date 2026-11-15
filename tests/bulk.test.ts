import { describe, expect, it } from 'vitest';
import { copyDay, planBulkEdit } from '../src/shared/bulk';
import { buildDemoEvent } from '../src/shared/demo';
import { validateConfig } from '../src/shared/validation';

/* Copy-day and bulk edit (product.md 1a): new IDs, review flags, before/after preview. */

describe('copy a race day', () => {
  it('copies races, start groups, and categories with new IDs, review flags, and no pool links', () => {
    const config = buildDemoEvent().config;
    const [sat, sun] = config.days;
    const satRaces = config.races.filter((r) => r.dayId === sat.id);
    const satCats = config.categories.filter((c) => satRaces.some((r) => r.id === c.raceId) && c.status !== 'archived');
    const { config: out, races, categories } = copyDay(config, sat.id, sun.id);

    expect(races).toBe(satRaces.length);
    expect(categories).toBe(satCats.length);
    const copies = out.categories.slice(config.categories.length);
    const oldIds = new Set([...config.categories.map((c) => c.id), ...config.races.map((r) => r.id), ...config.startGroups.map((g) => g.id)]);
    for (const c of copies) {
      expect(oldIds.has(c.id)).toBe(false);
      expect(c.needsReview).toBe(true);
      expect(c.reviewReason).toContain('Shared capacity pools were not copied');
      expect(c.timingCode.endsWith('-COPY')).toBe(true);
      const race = out.races.find((r) => r.id === c.raceId)!;
      expect(race.dayId).toBe(sun.id);
      expect(race.name.endsWith('(copy)')).toBe(true);
      expect(oldIds.has(race.id)).toBe(false);
      if (c.startGroupId) expect(out.startGroups.find((g) => g.id === c.startGroupId)?.raceId).toBe(race.id);
      expect(out.capacityPools.some((p) => p.memberCategoryIds.includes(c.id))).toBe(false);
    }
    // The original day is untouched.
    expect(out.categories.slice(0, config.categories.length)).toEqual(config.categories);
    // The copy introduces no validation errors of its own.
    const errorsBefore = validateConfig(config).filter((i) => i.level === 'error').length;
    expect(validateConfig(out).filter((i) => i.level === 'error').length).toBe(errorsBefore);
  });

  it('does nothing when copying a day onto itself', () => {
    const config = buildDemoEvent().config;
    expect(copyDay(config, config.days[0].id, config.days[0].id)).toEqual({ config, races: 0, categories: 0 });
  });
});

describe('bulk edit', () => {
  it('previews before and after, and applies a price change to every selected category', () => {
    const config = buildDemoEvent().config;
    const ids = config.categories.slice(0, 3).map((c) => c.id);
    const { rows, config: out } = planBulkEdit(config, ids, { field: 'price', cents: 4200 }, {});
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.after === '$42' || r.after === '$42.00')).toBe(true);
    expect(rows.every((r) => r.problem === null)).toBe(true);
    for (const id of ids) expect(out.categories.find((c) => c.id === id)!.pricing.baseCents).toBe(4200);
    const untouched = config.categories[3];
    expect(out.categories.find((c) => c.id === untouched.id)).toEqual(untouched);
  });

  it('refuses a cap below current entries for that row only', () => {
    const config = buildDemoEvent().config;
    const [a, b] = config.categories;
    const { rows, config: out } = planBulkEdit(config, [a.id, b.id], { field: 'cap', cap: 5 }, { [a.id]: 9 });
    expect(rows.find((r) => r.categoryId === a.id)?.problem).toContain('below the 9 entries');
    expect(out.categories.find((c) => c.id === a.id)!.cap).toBe(a.cap);
    expect(out.categories.find((c) => c.id === b.id)!.cap).toBe(5);
  });

  it('refuses a registration window that would close before it opens', () => {
    const config = buildDemoEvent().config;
    const cat = config.categories.find((c) => c.registration.opensAt)!;
    const before = cat.registration.opensAt!;
    const { rows, config: out } = planBulkEdit(config, [cat.id], { field: 'closesAt', at: before }, {});
    expect(rows[0].problem).toContain('close before it opens');
    expect(out.categories.find((c) => c.id === cat.id)!.registration.closesAt).toBe(cat.registration.closesAt);
  });

  it('can close and reopen categories', () => {
    const config = buildDemoEvent().config;
    const id = config.categories[0].id;
    const closed = planBulkEdit(config, [id], { field: 'status', status: 'closed' }, {});
    expect(closed.rows[0]).toMatchObject({ before: 'Open', after: 'Closed' });
    expect(closed.config.categories.find((c) => c.id === id)!.status).toBe('closed');
  });
});
