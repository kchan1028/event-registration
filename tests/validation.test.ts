import { describe, expect, it } from 'vitest';
import { buildDemoEvent } from '../src/shared/demo';
import { cloneCategory, codesInUse, configFromTemplate, copyCode, duplicateCategory, moveCategory } from '../src/shared/factory';
import { formatLength } from '../src/shared/format';
import { DEFAULT_REGISTRATION_SETTINGS, eventConfigSchema, type EventConfig } from '../src/shared/schema';
import { countIssues, validateConfig } from '../src/shared/validation';

const demo = () => buildDemoEvent().config;
const code = (c: EventConfig, timingCode: string) => c.categories.find((x) => x.timingCode === timingCode)!;
const keys = (c: EventConfig, entries = [] as { id: string; categoryId: string; riderRef: string }[]) => validateConfig(c, entries).map((i) => `${i.level}:${i.key}`);

describe('demonstration data', () => {
  it('passes the schema and has no blocking errors', () => {
    const c = demo();
    expect(() => eventConfigSchema.parse(c)).not.toThrow();
    expect(countIssues(validateConfig(c)).errors).toBe(0);
  });

  it('parses an event saved before registration settings with independent defaults', () => {
    const legacy = { ...demo(), registration: undefined };
    const first = eventConfigSchema.parse(legacy);
    const second = eventConfigSchema.parse(legacy);
    expect(first.registration).toEqual(DEFAULT_REGISTRATION_SETTINGS);
    expect(first.registration.bundles).not.toBe(second.registration.bundles);
  });

  it('covers elite, masters, women, junior, and collegiate fields and is labeled as an example', () => {
    const c = demo();
    const names = c.categories.map((x) => x.name).join(' | ');
    for (const word of ['Elite', 'Masters', "Women's", 'Junior', 'Collegiate']) expect(names).toContain(word);
    expect(c.event.isDemo).toBe(true);
    expect(c.event.demoNotice).toMatch(/not an approved race schedule/);
  });

  it('formats a timed criterium as minutes plus laps without inventing a distance', () => {
    expect(formatLength(code(demo(), 'CR-W123').length)).toBe('45 min + 3 laps');
  });
});

describe('validation before publishing', () => {
  it('flags a duplicated category for review and keeps it distinct', () => {
    const c = demo();
    const src = code(c, 'RR-M50');
    const next = duplicateCategory(c, src.id);
    const copy = next.categories.find((x) => x.name === 'Masters 50+ (copy)')!;
    expect(copy.id).not.toBe(src.id);
    expect(copy.needsReview).toBe(true);
    expect(next.capacityPools[0].memberCategoryIds).toContain(copy.id);
    expect(keys(next)).toContain(`error:cat.${copy.id}.review`);
  });

  it('gives each copy of a category a code no other category has', () => {
    const c = demo();
    const src = code(c, 'RR-M50');
    const once = duplicateCategory(c, src.id);
    const twice = duplicateCategory(once, src.id);
    const timingCodes = twice.categories.map((x) => x.timingCode);
    expect(timingCodes).toEqual(expect.arrayContaining(['RR-M50', 'RR-M50-COPY', 'RR-M50-COPY2']));
    expect(new Set(timingCodes).size).toBe(timingCodes.length);
    const copies = twice.categories.filter((x) => x.name.includes('(copy)'));
    expect(copies.map((x) => x.classifications[0].code).sort()).toEqual(['RR-M50-COPY', 'RR-M50-COPY2']);
    expect(keys(twice).filter((k) => k.includes('.code-dupe') || k.includes('.class.'))).toEqual([]);
  });

  it('shortens a long code so the copy still fits the schema, and leaves an empty code empty', () => {
    const long = 'X'.repeat(24);
    const taken = new Set([long]);
    const first = copyCode(long, taken);
    const second = copyCode(long, taken);
    expect(first).toBe(`${'X'.repeat(19)}-COPY`);
    expect(second).toBe(`${'X'.repeat(18)}-COPY2`);
    expect(copyCode('', taken)).toBe('');

    const c = demo();
    const src = { ...code(c, 'RR-M50'), timingCode: long, classifications: [{ code: long, label: 'Masters 50+' }], bibRange: { first: 100, last: 199 } };
    const copy = cloneCategory(src, codesInUse(c), { name: 'Copy' });
    expect(copy.name).toBe('Copy');
    expect(copy.timingCode).toBe(`${'X'.repeat(19)}-COPY`);
    expect(copy.classifications[0].code).toBe(`${'X'.repeat(19)}-COPY`);
    expect(copy.bibRange).toBeNull();
    expect(eventConfigSchema.shape.categories.element.safeParse(copy).success).toBe(true);
  });

  it('warns about a bundle with no discount, but not about a fixed-price bundle', () => {
    const c = demo();
    const raceIds = c.races.slice(0, 2).map((r) => r.id);
    c.registration.bundles = [
      { id: 'b-none', name: 'No saving', raceIds, discountCents: 0, priceCents: null },
      { id: 'b-fixed', name: 'Weekend pass', raceIds, discountCents: 0, priceCents: 6000 },
    ];
    const k = keys(c);
    expect(k).toContain('warning:bundle.b-none.zero');
    expect(k).not.toContain('warning:bundle.b-fixed.zero');
  });

  it('rejects two categories in one start group sharing a classification code', () => {
    const c = demo();
    code(c, 'RR-M60').classifications = [{ code: 'RR-M50', label: 'oops' }];
    const sg = code(c, 'RR-M60').startGroupId!;
    expect(keys(c)).toContain(`error:sg.${sg}.class.RR-M50`);
  });

  it('requires approval for dual scoring', () => {
    const c = demo();
    const cat = code(c, 'RR-M50');
    cat.classifications.push({ code: 'RR-M50-ALT', label: 'Second' });
    expect(keys(c)).toContain(`error:cat.${cat.id}.dual`);
    cat.dualScoringApproved = true;
    expect(keys(c)).not.toContain(`error:cat.${cat.id}.dual`);
  });

  it('rejects duplicate timing codes within a race', () => {
    const c = demo();
    const cat = code(c, 'RR-M60');
    cat.timingCode = 'RR-M50';
    expect(keys(c)).toContain(`error:cat.${cat.id}.code-dupe`);
  });

  it('rejects a cap below the riders already entered', () => {
    const c = demo();
    const cat = code(c, 'RR-M50');
    cat.cap = 3;
    const entries = Array.from({ length: 5 }, (_, i) => ({ id: `e${i}`, categoryId: cat.id, riderRef: `r${i}` }));
    expect(keys(c, entries)).toContain(`error:cat.${cat.id}.below-entries`);
  });

  it('rejects a category placed in another race’s start group', () => {
    const c = demo();
    const cat = code(c, 'RR-M50');
    cat.startGroupId = code(c, 'CR-P12').startGroupId;
    expect(keys(c)).toContain(`error:cat.${cat.id}.sg-race`);
  });

  it('requires a race length and a start group', () => {
    const c = configFromTemplate({ name: 'x', template: 'road_race', startDate: '2027-06-01', timeZone: 'America/Denver', venue: '' });
    const errs = keys(c);
    expect(errs).toContain('error:event.no-categories');
  });

  it('warns when a pool limit can never bind', () => {
    const c = demo();
    c.capacityPools[0].limit = 80;
    expect(keys(c)).toContain(`warning:pool.${c.capacityPools[0].id}.never-binds`);
  });

  it('warns when the eligibility rule season does not match the event year', () => {
    const c = demo();
    c.ruleSet.season = 2026;
    expect(keys(c)).toContain('warning:event.ruleset-season');
  });

  it('catches impossible age ranges and registration windows', () => {
    const c = demo();
    const cat = code(c, 'RR-J1516');
    cat.eligibility.paths[0].minAge = 18;
    cat.registration.closesAt = '2027-01-01T00:00';
    const k = keys(c);
    expect(k).toContain(`error:cat.${cat.id}.age.${cat.eligibility.paths[0].id}`);
    expect(k).toContain(`error:cat.${cat.id}.window-order`);
  });
});

describe('factory', () => {
  it('builds a two-day weekend template with a road race and a criterium', () => {
    const c = configFromTemplate({ name: 'Weekend', template: 'weekend', startDate: '2027-04-24', timeZone: 'America/Los_Angeles', venue: '' });
    expect(c.days.map((d) => d.date)).toEqual(['2027-04-24', '2027-04-25']);
    expect(c.races.map((r) => r.discipline)).toEqual(['road_race', 'criterium']);
    expect(c.categories).toHaveLength(0);
  });

  it('reorders categories within a display group', () => {
    const c = demo();
    const m50 = code(c, 'RR-M50');
    const m60 = code(c, 'RR-M60');
    const moved = moveCategory(c, m60.id, -1);
    expect(code(moved, 'RR-M60').sortOrder).toBe(m50.sortOrder);
    expect(code(moved, 'RR-M50').sortOrder).toBe(m60.sortOrder);
  });
});
