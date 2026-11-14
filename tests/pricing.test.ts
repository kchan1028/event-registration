import { describe, expect, it } from 'vitest';
import { checkSelection, findConflicts, profileOf } from '../src/shared/checkout';
import { buildDemoEvent } from '../src/shared/demo';
import { categoryPrice, quote } from '../src/shared/pricing';
import type { EventConfig } from '../src/shared/schema';

const demo = () => buildDemoEvent().config;
const id = (c: EventConfig, code: string) => c.categories.find((x) => x.timingCode === code)!.id;
const cat = (c: EventConfig, code: string) => c.categories.find((x) => x.timingCode === code)!;

describe('prices', () => {
  it('uses the scheduled price in effect on the purchase date and adds the race-day fee only on race day', () => {
    const c = demo();
    const m35 = cat(c, 'RR-M35-34'); // $50, then $55 from Apr 10, +$15 on race day
    expect(categoryPrice(m35, '2027-03-01', '2027-04-24').cents).toBe(5000);
    expect(categoryPrice(m35, '2027-04-15', '2027-04-24').cents).toBe(5500);
    expect(categoryPrice(m35, '2027-04-24', '2027-04-24')).toEqual({ cents: 7000, dayOf: true });
  });
});

describe('order quotes and discount precedence', () => {
  it('applies the weekend bundle when both days have an entry (Buy both days)', () => {
    const c = demo();
    const q = quote(c, [id(c, 'RR-M35-34'), id(c, 'CR-M35-34')], '2027-03-01');
    expect(q.subtotalCents).toBe(9000);
    expect(q.bundle?.name).toBe('Weekend omnium entry');
    expect(q.discountCents).toBe(1500);
    expect(q.totalCents).toBe(7500);
    expect(q.lines.every((l) => l.discountReason === 'Weekend omnium entry')).toBe(true);
  });

  it('applies the additional-race discount exactly once for two criterium entries, keeping both entries distinct (Multi-race discount)', () => {
    const c = demo();
    const q = quote(c, [id(c, 'CR-45'), id(c, 'CR-M35-34')], '2027-03-01');
    expect(q.lines).toHaveLength(2);
    expect(q.bundle).toBeNull();
    expect(q.lines.filter((l) => l.discountCents > 0)).toHaveLength(1);
    expect(q.discountCents).toBe(1000);
    expect(q.totalCents).toBe(3500 + 4000 - 1000);
  });

  it('never stacks: bundled entries get only the bundle; a third entry gets only the additional-race discount', () => {
    const c = demo();
    const q = quote(c, [id(c, 'RR-M35-34'), id(c, 'CR-M35-34'), id(c, 'CR-45')], '2027-03-01');
    const reasons = q.lines.map((l) => l.discountReason);
    expect(reasons.filter((r) => r === 'Weekend omnium entry')).toHaveLength(2);
    expect(reasons.filter((r) => r === 'Additional race')).toHaveLength(1);
    expect(q.totalCents).toBe(5000 + 4000 + 3500 - 1500 - 1000);
  });

  it('gives free entries no discount and never discounts below zero', () => {
    const c = demo();
    c.registration.additionalRaceDiscountCents = 99_00;
    const q = quote(c, [id(c, 'CR-J1014'), id(c, 'CR-45')], '2027-03-01');
    const junior = q.lines.find((l) => l.code === 'CR-J1014')!;
    expect(junior.discountCents).toBe(0);
    expect(q.lines.every((l) => l.totalCents >= 0)).toBe(true);
  });

  it('a single entry pays full price', () => {
    const c = demo();
    expect(quote(c, [id(c, 'RR-P12')], '2027-03-01').totalCents).toBe(5500);
  });
});

describe('schedule conflicts', () => {
  it('blocks two categories in the same start group', () => {
    const c = demo();
    const r = findConflicts(c, [id(c, 'RR-M50'), id(c, 'RR-M60')]);
    expect(r[0].level).toBe('block');
  });

  it('blocks a start that falls inside an earlier timed criterium', () => {
    const c = demo();
    c.startGroups.find((g) => g.id === cat(c, 'CR-45').startGroupId)!.startTime = '13:30'; // inside 13:15 + 40 min
    expect(findConflicts(c, [id(c, 'CR-45'), id(c, 'CR-M35-34')]).map((x) => x.level)).toEqual(['block']);
  });

  it('warns when recovery between criteriums is shorter than the event suggests', () => {
    const c = demo();
    expect(findConflicts(c, [id(c, 'CR-45'), id(c, 'CR-M35-34')])).toEqual([]); // 12:50 finish, 13:15 start, 15 min suggested
    c.registration.recoveryMinutes = 30;
    expect(findConflicts(c, [id(c, 'CR-45'), id(c, 'CR-M35-34')]).map((x) => x.level)).toEqual(['warn']);
  });

  it('warns when a distance race has no fixed finish before another start the same day', () => {
    const c = demo();
    expect(findConflicts(c, [id(c, 'RR-P12'), id(c, 'RR-M35-34')]).map((x) => x.level)).toEqual(['warn']);
  });

  it('ignores races on different days', () => {
    const c = demo();
    expect(findConflicts(c, [id(c, 'RR-M35-34'), id(c, 'CR-M35-34')])).toEqual([]);
  });
});

describe('selection checks', () => {
  const rider = (p: Partial<Parameters<typeof profileOf>[0]>) =>
    profileOf({ racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, ...p });

  it('refuses categories the rider is not eligible for, allows review-required ones', () => {
    const c = demo();
    expect(checkSelection(c, [id(c, 'RR-P12')], rider({})).ok).toBe(false);
    const unknown = checkSelection(c, [id(c, 'RR-M35-34')], rider({ licenseCategory: null }));
    expect(unknown.ok).toBe(true);
    expect(unknown.eligibility[id(c, 'RR-M35-34')].status).toBe('needs_review');
  });

  it('flags when a guardian is needed', () => {
    const c = demo();
    expect(checkSelection(c, [id(c, 'RR-J1516')], rider({ racingAge: 16, licenseCategory: null })).needsGuardian).toBe(true);
  });
});
