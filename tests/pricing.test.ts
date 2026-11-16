import { describe, expect, it } from 'vitest';
import { checkSelection, findConflicts, profileOf } from '../src/shared/checkout';
import { buildBerkeleyOmniumEvent } from '../src/shared/berkeleyOmnium';
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

  it('needs a guardian for racing age 18 or under in an adult/open category without a guardian flag', () => {
    const c = demo();
    const open = id(c, 'RR-45');
    expect(c.categories.find((x) => x.id === open)!.eligibility.guardianRequired).toBe(false);
    const at = (racingAge: number) => checkSelection(c, [open], rider({ racingAge, licenseCategory: '5' }));
    expect(at(17).ok).toBe(true);
    expect(at(17).needsGuardian).toBe(true);
    expect(at(18).needsGuardian).toBe(true); // racing age 18 can still be 17 on race day
    expect(at(19).needsGuardian).toBe(false);
  });
});

import { readFileSync } from 'node:fs';
import { FIXTURE_WAIVER_TEXT, FIXTURE_WAIVER_VERSION } from '../src/shared/fixtures';
import { buildCaseStudyScenarios } from '../src/shared/caseStudies';

describe('generated case-study purchase examples', () => {
  const cases = buildCaseStudyScenarios();
  const criterium = cases.find((c) => c.key === 'criterium')!.config;
  const weekend = cases.find((c) => c.key === 'omnium')!.config;
  const byName = (c: EventConfig, name: string) => c.categories.find((x) => x.name === name)!.id;

  it('reproduces every worked demo order total in docs/fixtures/README.md', () => {
    // Two races, one day: $65 - $10 second-race discount + $3 platform + $1.65 processing
    const alex = quote(criterium, [byName(criterium, 'Men Cat 4/5'), byName(criterium, 'Open Cat 4/5 Evening')], '2027-03-01');
    expect([alex.entriesTotalCents, alex.fees.map((f) => f.cents), alex.totalCents]).toEqual([5500, [300, 165], 5965]);
    // Weekend bundle: $75 bundle + $3 + $2.25
    const blake = quote(weekend, [byName(weekend, 'Masters 35+ Cat 3/4 Road Race'), byName(weekend, 'Masters 35+ Cat 3/4 Criterium')], '2027-03-01');
    expect([blake.entriesTotalCents, blake.bundle?.name, blake.totalCents]).toEqual([7500, 'Weekend bundle (one road race + one criterium)', 8025]);
    // Junior with guardian: $15 + $3 + $0.45
    expect(quote(criterium, [byName(criterium, 'Juniors 10-14')], '2027-03-01').totalCents).toBe(1845);
    // Uncertain license: $35 + $3 + $1.05
    expect(quote(criterium, [byName(criterium, 'Women Cat 3/4/5')], '2027-03-01').totalCents).toBe(3905);
  });

  it('applies the generated criterium second-race discount once, only for two entries on the same day', () => {
    const one = quote(criterium, [byName(criterium, 'Men Cat 4/5')], '2027-03-01');
    expect(one.discountCents).toBe(0);
    const two = quote(criterium, [byName(criterium, 'Men Cat 4/5'), byName(criterium, 'Open Cat 4/5 Evening')], '2027-03-01');
    expect(two.lines.filter((l) => l.discountReason === 'Second race discount')).toHaveLength(1);
  });

  it('uses the documented sample waiver', () => {
    const waiver = readFileSync('docs/fixtures/sample-waiver.md', 'utf8');
    expect(waiver).toContain(FIXTURE_WAIVER_VERSION);
    expect(waiver).toContain('I understand bicycle racing can cause injury');
    expect(FIXTURE_WAIVER_TEXT).toContain('I understand bicycle racing can cause injury');
  });

  it('marks Masters 35+ Cat 3/4 at the generated criterium as full', () => {
    const plan = buildCaseStudyScenarios().find((c) => c.key === 'criterium')!;
    const m35 = plan.config.categories.find((c) => c.name === 'Masters 35+ Cat 3/4')!;
    expect(plan.entryPlan.find((p) => p.categoryId === m35.id)?.count).toBe(m35.cap);
  });
});

describe('flat price for an extra entry in the same race (Berkeley Omnium: second crit race $20)', () => {
  const omnium = () => buildBerkeleyOmniumEvent().config;

  it('charges the second criterium entry $20 and leaves the first at full price', () => {
    const c = omnium();
    const q = quote(c, [id(c, 'CR-M35-34'), id(c, 'CR-E4')], '2027-03-15');
    expect(q.lines.map((l) => l.totalCents).sort((a, b) => b - a)).toEqual([6000, 2000]);
    expect(q.lines.filter((l) => l.discountReason === 'Extra entry in the same race')).toHaveLength(1);
  });

  it('keeps a cheaper extra entry at its base price', () => {
    const c = omnium();
    c.registration.sameRaceExtraEntryCents = 9000;
    expect(quote(c, [id(c, 'CR-M35-34'), id(c, 'CR-E4')], '2027-03-15').totalCents).toBe(12000);
  });
});

import { enforcesWindows, localNow, windowState } from '../src/shared/checkout';

describe('registration windows', () => {
  it('reads the clock in the event time zone, including daylight saving', () => {
    expect(localNow('America/Los_Angeles', new Date('2027-03-01T18:00:00Z'))).toBe('2027-03-01T10:00'); // PST
    expect(localNow('America/Los_Angeles', new Date('2027-04-22T03:30:00Z'))).toBe('2027-04-21T20:30'); // PDT
    expect(localNow('America/New_York', new Date('2027-01-01T04:59:00Z'))).toBe('2026-12-31T23:59');
  });

  it('opens at the opening minute and closes at the closing minute', () => {
    const cat = { registration: { opensAt: '2027-02-01T09:00', closesAt: '2027-04-22T20:00' } };
    expect(windowState(cat, '2027-02-01T08:59')).toBe('not_yet');
    expect(windowState(cat, '2027-02-01T09:00')).toBe('open');
    expect(windowState(cat, '2027-04-22T19:59')).toBe('open');
    expect(windowState(cat, '2027-04-22T20:00')).toBe('closed');
    expect(windowState({ registration: { opensAt: null, closesAt: null } }, '2030-01-01T00:00')).toBe('open');
  });

  it('only demo events can ignore windows, and real events always enforce them', () => {
    const c = demo();
    expect(enforcesWindows(c)).toBe(false);
    c.registration.demoIgnoreWindows = false;
    expect(enforcesWindows(c)).toBe(true);
    c.registration.demoIgnoreWindows = true;
    c.event.isDemo = false;
    expect(enforcesWindows(c)).toBe(true);
  });

  it('a real event refuses a selection outside its window with a plain message', () => {
    const c = demo();
    c.event.isDemo = false;
    const rider = profileOf({ racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null });
    const r = checkSelection(c, [id(c, 'RR-M35-34')], rider, { nowLocal: '2027-01-15T12:00' });
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toMatch(/opens Feb 1, 2027, 9:00 AM/);
    expect(checkSelection(c, [id(c, 'RR-M35-34')], rider, { nowLocal: '2027-03-01T12:00' }).ok).toBe(true);
  });
});


describe('Berkeley Omnium package', () => {
  it('discounts both races and nominates exactly the bundled entries for podium review', () => {
    const c = buildBerkeleyOmniumEvent().config;
    const ids = [id(c, 'RR-M35-34'), id(c, 'CR-M35-34')];
    const q = quote(c, ids, '2027-03-15');
    expect([q.subtotalCents, q.discountCents, q.totalCents]).toEqual([14000, 1000, 13000]);
    expect(q.bundle?.omnium).toEqual({ code: 'BERKELEY-OMNIUM', label: 'Berkeley Omnium podium', categoryIds: ids, status: 'needs_review' });
    for (const categoryId of ids) {
      const single = quote(c, [categoryId], '2027-03-15');
      expect(single.bundle).toBeNull();
      expect(single.discountCents).toBe(0);
    }
    const extra = quote(c, [...ids, id(c, 'CR-E4')], '2027-03-15');
    expect(extra.totalCents).toBe(15000);
    expect(extra.bundle?.omnium?.categoryIds).toHaveLength(2);
    expect(extra.lines.find((l) => l.categoryId === id(c, 'CR-E4'))?.totalCents).toBe(2000);
  });
});
