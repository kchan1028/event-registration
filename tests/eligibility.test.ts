import { describe, expect, it } from 'vitest';
import { buildDemoEvent } from '../src/shared/demo';
import { evaluateCategory, formatLicenseSet, summarizePath, type RiderProfile } from '../src/shared/eligibility';
import { blankPath, newCategory } from '../src/shared/factory';

const { config } = buildDemoEvent();
const byCode = (code: string) => config.categories.find((c) => c.timingCode === code)!;
const rider = (p: Partial<RiderProfile>): RiderProfile => ({ racingAge: null, licenseCategory: null, licenseType: 'annual', competitionClass: null, collegiateDivision: null, ...p });

describe('eligibility: structured rules from the product.md fixtures', () => {
  it('Masters 35+ Cat 3/4 needs the age threshold AND an allowed license category', () => {
    const cat = byCode('RR-M35-34');
    expect(evaluateCategory(cat, rider({ racingAge: 41, licenseCategory: '3' })).status).toBe('eligible');
    expect(evaluateCategory(cat, rider({ racingAge: 41, licenseCategory: '2' })).status).toBe('ineligible');
    expect(evaluateCategory(cat, rider({ racingAge: 30, licenseCategory: '3' })).status).toBe('ineligible');
  });

  it('does not treat category numbers as a ladder', () => {
    // A Cat 2 rider is not "good enough" for a Cat 3/4 field, and a Cat 5 is not allowed in Pro/1/2.
    expect(evaluateCategory(byCode('RR-M35-34'), rider({ racingAge: 50, licenseCategory: '2' })).status).toBe('ineligible');
    expect(evaluateCategory(byCode('RR-P12'), rider({ licenseCategory: '5', competitionClass: 'men' })).status).toBe('ineligible');
  });

  it('Elite P/1/2 allows Pro, Cat 1, and Cat 2 explicitly', () => {
    const cat = byCode('RR-P12');
    for (const lic of ['PRO', '1', '2'] as const) expect(evaluateCategory(cat, rider({ licenseCategory: lic, competitionClass: 'men' })).status).toBe('eligible');
    expect(evaluateCategory(cat, rider({ licenseCategory: '3', competitionClass: 'men' })).status).toBe('ineligible');
  });

  it('unknown data produces a review status, never automatic clearance', () => {
    const r = evaluateCategory(byCode('RR-M35-34'), rider({ racingAge: 45 }));
    expect(r.status).toBe('needs_review');
    expect(r.reasons).toContain('license category unknown');
  });

  it('always reports license verification as pending', () => {
    expect(evaluateCategory(byCode('RR-M35-34'), rider({ racingAge: 45, licenseCategory: '3' })).licenseVerification).toBe('pending');
  });

  it("women's combined criterium keeps explicit class and category per registration category", () => {
    const w123 = byCode('CR-W123');
    const w45 = byCode('CR-W45');
    const womanCat4 = rider({ licenseCategory: '4', competitionClass: 'women' });
    expect(evaluateCategory(w45, womanCat4).status).toBe('eligible');
    expect(evaluateCategory(w123, womanCat4).status).toBe('ineligible');
    expect(evaluateCategory(w45, rider({ licenseCategory: '4', competitionClass: 'men' })).status).toBe('ineligible');
    expect(evaluateCategory(w45, rider({ licenseCategory: '4', competitionClass: 'other' })).status).toBe('needs_review');
  });

  it('junior age bands are configurable and exclusive', () => {
    expect(evaluateCategory(byCode('RR-J1516'), rider({ racingAge: 16 })).status).toBe('eligible');
    expect(evaluateCategory(byCode('RR-J1718'), rider({ racingAge: 16 })).status).toBe('ineligible');
    expect(byCode('RR-J1516').eligibility.guardianRequired).toBe(true);
  });

  it('collegiate and domestic paths are separate', () => {
    const cma = byCode('RR-CMA');
    const d23 = byCode('RR-D23');
    const collegian = rider({ collegiateDivision: 'A', competitionClass: 'men', licenseCategory: '4' });
    expect(evaluateCategory(cma, collegian).status).toBe('eligible');
    expect(evaluateCategory(d23, collegian).status).toBe('ineligible');
    expect(evaluateCategory(cma, rider({ competitionClass: 'men', licenseCategory: '2' })).status).toBe('ineligible');
    expect(evaluateCategory(cma, rider({ collegiateDivision: 'B', competitionClass: 'men' })).status).toBe('ineligible');
  });

  it('qualifies through any one path (OR) and explains the closest failure', () => {
    const cat = newCategory(config, config.races[0].id);
    cat.eligibility.paths = [
      { ...blankPath(), licenseCategories: ['1', '2'] },
      { ...blankPath(), minAge: 60 },
    ];
    expect(evaluateCategory(cat, rider({ racingAge: 62, licenseCategory: '4' })).status).toBe('eligible');
    expect(evaluateCategory(cat, rider({ racingAge: 40, licenseCategory: '1' })).status).toBe('eligible');
    const no = evaluateCategory(cat, rider({ racingAge: 40, licenseCategory: '4' }));
    expect(no.status).toBe('ineligible');
    expect(no.reasons.length).toBeGreaterThan(0);
  });

  it('organizer review is an explicit exception that holds eligible riders for review', () => {
    const cat = structuredClone(byCode('RR-M50'));
    cat.eligibility.organizerReview = true;
    expect(evaluateCategory(cat, rider({ racingAge: 55 })).status).toBe('needs_review');
  });

  it('respects license type restrictions', () => {
    const cat = newCategory(config, config.races[0].id);
    cat.eligibility.paths = [{ ...blankPath(), licenseTypes: ['annual'] }];
    expect(evaluateCategory(cat, rider({ licenseType: 'one_day' })).status).toBe('ineligible');
    expect(evaluateCategory(cat, rider({ licenseType: null })).status).toBe('needs_review');
  });

  it('summarizes paths in plain organizer language', () => {
    expect(summarizePath(byCode('RR-P12').eligibility.paths[0])).toBe('Pro/1/2 · men');
    expect(summarizePath(byCode('RR-M35-34').eligibility.paths[0])).toBe('Cat 3/4 · age 35+');
    expect(summarizePath(byCode('RR-J1516').eligibility.paths[0])).toBe('age 15–16');
    expect(formatLicenseSet(['4', '3'])).toBe('Cat 3/4');
  });
});
