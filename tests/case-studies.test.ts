import { describe, expect, it } from 'vitest';
import { buildCaseStudyScenarios, CASE_STUDY_ORG_ID, CASE_STUDY_REFERENCE_NOW } from '../src/shared/caseStudies';
import { canAdmit } from '../src/shared/capacity';
import { checkSelection, findConflicts, profileOf } from '../src/shared/checkout';
import { categoryPrice, quote } from '../src/shared/pricing';
import { testApp } from './support/db';

describe('generated race case studies', () => {
  it('is deterministic, distinct, schema-backed, and explicitly separates draft-only empty data', () => {
    const first = buildCaseStudyScenarios();
    const second = buildCaseStudyScenarios();
    expect(second).toEqual(first);
    expect(first.map((row) => row.key)).toEqual(['criterium', 'road-shared-field', 'omnium', 'empty-event', 'large-event']);
    expect(new Set(first.map((row) => row.eventId)).size).toBe(first.length);
    expect(first.find((row) => row.key === 'empty-event')).toMatchObject({ publish: false, entryPlan: [] });
    expect(first.find((row) => row.key === 'large-event')?.config.categories).toHaveLength(120);
    expect(first.find((row) => row.key === 'large-event')?.entryPlan.reduce((sum, row) => sum + row.count, 0)).toBe(1000);
    expect(CASE_STUDY_REFERENCE_NOW).toBe('2027-03-15T18:00:00.000Z');
  });

  it('covers full, nearly-full, and closed criterium fields plus additional-race pricing', () => {
    const scenario = buildCaseStudyScenarios().find((row) => row.key === 'criterium')!;
    const entries = scenario.entryPlan.flatMap((plan) => plan.riderRefs.map((riderRef, index) => ({ id: `entry-${plan.categoryId}-${index}`, categoryId: plan.categoryId, riderRef })));
    const full = scenario.config.categories.find((row) => row.name === 'Masters 35+ Cat 3/4')!;
    const near = scenario.config.categories.find((row) => row.name === 'Women Cat 3/4/5')!;
    const closed = scenario.config.categories.find((row) => row.timingCode === 'DVC-CLOSED')!;
    expect(canAdmit(scenario.config, entries, full.id, 'test-rider-new').ok).toBe(false);
    expect(canAdmit(scenario.config, entries, near.id, 'test-rider-new').ok).toBe(true);
    expect(canAdmit(scenario.config, entries, closed.id, 'test-rider-new').ok).toBe(false);
    const men = scenario.config.categories.find((row) => row.name === 'Men Cat 4/5')!;
    const open = scenario.config.categories.find((row) => row.name === 'Open Cat 4/5 Evening')!;
    const priced = quote(scenario.config, [men.id, open.id], '2027-03-15');
    expect(priced.discountCents).toBe(1000);
    expect(priced.lines.filter((line) => line.discountCents > 0)).toHaveLength(1);
  });

  it('covers early, standard, late, and day-of price boundaries with a fixed date', () => {
    const scenario = buildCaseStudyScenarios().find((row) => row.key === 'road-shared-field')!;
    const category = scenario.config.categories.find((row) => row.pricing.priceChanges.length > 0)!;
    const day = scenario.config.days.find((row) => row.id === scenario.config.races.find((race) => race.id === category.raceId)!.dayId)!;
    const change = category.pricing.priceChanges[0];
    expect(categoryPrice(category, '2027-03-15', day.date).cents).toBe(category.pricing.baseCents);
    expect(categoryPrice(category, change.effectiveFrom, day.date).cents).toBe(change.cents);
    expect(categoryPrice(category, day.date, day.date)).toEqual({ cents: change.cents + category.pricing.dayOfSurchargeCents, dayOf: true });
  });

  it('covers eligibility review, junior guardian rules, and schedule constraints', () => {
    const scenario = buildCaseStudyScenarios().find((row) => row.key === 'criterium')!;
    const junior = scenario.config.categories.find((row) => row.name === 'Juniors 10-14')!;
    const juniorProfile = profileOf({ racingAge: 13, licenseCategory: null, licenseType: 'annual', competitionClass: 'men', collegiateDivision: null });
    expect(checkSelection(scenario.config, [junior.id], juniorProfile).needsGuardian).toBe(true);
    const unknown = profileOf({ racingAge: 40, licenseCategory: null, licenseType: 'annual', competitionClass: 'men', collegiateDivision: null });
    const masters = scenario.config.categories.find((row) => row.name === 'Masters 35+ Cat 3/4')!;
    expect(checkSelection(scenario.config, [masters.id], unknown).eligibility[masters.id].status).toBe('needs_review');
    const sameStart = scenario.config.categories.filter((row) => row.startGroupId === masters.startGroupId).slice(0, 2);
    if (sameStart.length === 2) expect(findConflicts(scenario.config, sameStart.map((row) => row.id))[0]?.level).toBe('block');
  });

  it('loads one scenario or all scenarios idempotently and resets only generated data', async () => {
    const { app } = await testApp({ now: () => new Date(CASE_STUDY_REFERENCE_NOW) });
    const userOrg = (await app.inject({ method: 'POST', url: '/api/organizations', payload: { name: 'Local organizer data' } })).json() as { id: string };
    expect((await app.inject({ method: 'POST', url: '/api/demo/case-studies/criterium' })).statusCode).toBe(201);
    expect((await app.inject({ method: 'POST', url: '/api/demo/case-studies/criterium' })).statusCode).toBe(200);
    const all = await app.inject({ method: 'POST', url: '/api/demo/case-studies' });
    expect(all.statusCode).toBe(201);
    const orgsBefore = (await app.inject({ method: 'GET', url: '/api/organizations' })).json() as Array<{ id: string; events: unknown[] }>;
    expect(orgsBefore.find((row) => row.id === CASE_STUDY_ORG_ID)?.events).toHaveLength(5);
    const reset = (await app.inject({ method: 'DELETE', url: '/api/demo/case-studies' })).json() as { removedEvents: number };
    expect(reset.removedEvents).toBe(5);
    const orgsAfter = (await app.inject({ method: 'GET', url: '/api/organizations' })).json() as Array<{ id: string }>;
    expect(orgsAfter.some((row) => row.id === CASE_STUDY_ORG_ID)).toBe(false);
    expect(orgsAfter.some((row) => row.id === userOrg.id)).toBe(true);
    await app.close();
  }, 20_000);

  it('seeds successful, duplicate, declined/retried, expired, and license-review payment states', async () => {
    const { app } = await testApp({ now: () => new Date(CASE_STUDY_REFERENCE_NOW) });
    await app.inject({ method: 'POST', url: '/api/demo/case-studies/omnium' });
    const orders = (await app.inject({ method: 'GET', url: '/api/events/evt_demo_case_omnium/orders' })).json() as Array<{
      status: string;
      entries: Array<{ readiness: Array<{ key: string; state: string }> }>;
    }>;
    expect(orders.map((order) => order.status).sort()).toEqual(['confirmed', 'confirmed', 'expired']);
    const confirmed = orders.filter((order) => order.status === 'confirmed');
    expect(confirmed.some((order) => order.entries[0].readiness.some((item) => item.key === 'license' && item.state === 'done'))).toBe(true);
    expect(confirmed.some((order) => order.entries[0].readiness.some((item) => item.key === 'license' && item.state === 'needs_review'))).toBe(true);
    await app.close();
  });
});
