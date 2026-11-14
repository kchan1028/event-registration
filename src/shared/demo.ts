import { blankPath, newId } from './factory';
import type { Category, EligibilityPath, EventConfig, LicenseCategory } from './schema';

export const DEMO_NOTICE =
  'Demonstration data. These categories, prices, limits, and times are examples for trying the builder. They are not an approved race schedule and do not describe current USA Cycling eligibility rules.';

export const SAMPLE_WAIVER =
  'SAMPLE WAIVER FOR THE PROTOTYPE. This is not USA Cycling\'s waiver and has no legal effect. A sanctioned event must use the federation\'s approved waiver text and signing process, which this prototype does not connect to.\n\nI understand that bicycle racing involves risk of injury. I will follow the officials\' instructions, ride within my ability, and wear an approved helmet at all times on the course.';

type PathSpec = Partial<Omit<EligibilityPath, 'id'>>;

function path(spec: PathSpec): EligibilityPath {
  return { ...blankPath(), ...spec };
}

const P12: LicenseCategory[] = ['PRO', '1', '2'];

/**
 * A two-day road race and criterium weekend covering elite, women's, masters,
 * junior, and collegiate fields, including the product.md category fixtures.
 * All names are fictional and labeled as examples.
 */
export function buildDemoEvent(): { config: EventConfig; entryPlan: { categoryId: string; count: number }[] } {
  const sat = { id: newId('day'), date: '2027-04-24', label: 'Saturday' };
  const sun = { id: newId('day'), date: '2027-04-25', label: 'Sunday' };
  const rr = { id: newId('race'), dayId: sat.id, name: 'Saturday road race', discipline: 'road_race' as const, course: 'Example 12.5 km rolling loop (fictional)' };
  const crit = { id: newId('race'), dayId: sun.id, name: 'Sunday criterium', discipline: 'criterium' as const, course: 'Example 1.1 km downtown circuit (fictional)' };

  const dg = {
    elite: { id: newId('dg'), name: 'Elite and open fields', sortOrder: 0 },
    women: { id: newId('dg'), name: "Women's fields", sortOrder: 1 },
    masters: { id: newId('dg'), name: 'Masters', sortOrder: 2 },
    collegiate: { id: newId('dg'), name: 'Collegiate', sortOrder: 3 },
    juniors: { id: newId('dg'), name: 'Juniors', sortOrder: 4 },
  };

  const sg = (raceId: string, name: string, startTime: string, stagingTime: string | null, fieldLimit: number | null) => ({
    id: newId('sg'),
    raceId,
    name,
    startTime,
    stagingTime,
    fieldLimit,
  });

  const rrElite = sg(rr.id, 'Elite men P/1/2', '08:00', '07:45', null);
  const rrWomen = sg(rr.id, "Women's P/1/2/3", '08:05', '07:50', null);
  const rrM35 = sg(rr.id, 'Masters 35+ Cat 3/4', '09:30', '09:15', null);
  const rrM50 = sg(rr.id, 'Masters 50+ and 60+', '09:35', '09:20', null);
  const rrColl = sg(rr.id, 'Collegiate A and domestic Cat 2/3', '10:15', '10:00', 80);
  const rrCat45 = sg(rr.id, 'Cat 4/5', '11:30', '11:15', null);
  const rrJr = sg(rr.id, 'Juniors 15–18', '11:35', '11:20', 50);
  const crElite = sg(crit.id, 'Elite men P/1/2', '15:30', '15:15', null);
  const crWomen = sg(crit.id, "Women's combined", '14:20', '14:05', 70);
  const crM35 = sg(crit.id, 'Masters 35+ Cat 3/4', '13:15', '13:00', null);
  const crCat45 = sg(crit.id, 'Cat 4/5', '12:20', '12:05', null);
  const crJr = sg(crit.id, 'Juniors 10–14', '11:45', '11:30', null);

  let order = 0;
  const regRR = { opensAt: '2027-02-01T09:00', closesAt: '2027-04-22T20:00' };
  const regCrit = { opensAt: '2027-02-01T09:00', closesAt: '2027-04-23T20:00' };

  const cat = (o: {
    raceId: string;
    name: string;
    code: string;
    dg: string;
    sg: string;
    paths: EligibilityPath[];
    length: Category['length'];
    price: number;
    cap: number | null;
    guardian?: boolean;
    review?: boolean;
    prize?: string;
    description?: string;
    priceChange?: number;
  }): Category => ({
    id: newId('cat'),
    raceId: o.raceId,
    name: o.name,
    timingCode: o.code,
    description: o.description ?? '',
    displayGroupId: o.dg,
    sortOrder: order++,
    status: 'active',
    eligibility: { paths: o.paths, organizerReview: o.review ?? false, guardianRequired: o.guardian ?? false },
    length: o.length,
    pricing: {
      baseCents: o.price,
      dayOfSurchargeCents: o.price === 0 ? 0 : 1500,
      priceChanges: o.priceChange ? [{ effectiveFrom: '2027-04-10', cents: o.priceChange }] : [],
    },
    registration: o.raceId === rr.id ? regRR : regCrit,
    cap: o.cap,
    startGroupId: o.sg,
    classifications: [{ code: o.code, label: o.name }],
    dualScoringApproved: false,
    prizeText: o.prize ?? '',
    needsReview: false,
    reviewReason: '',
  });

  const laps = (n: number) => ({ kind: 'distance' as const, distance: n * 12.5, unit: 'km' as const, laps: n, partialFinalLap: false });

  const categories: Category[] = [
    // Saturday road race
    cat({ raceId: rr.id, name: 'Elite men Pro/1/2', code: 'RR-P12', dg: dg.elite.id, sg: rrElite.id, paths: [path({ licenseCategories: P12, genderClass: 'men' })], length: laps(8), price: 5500, priceChange: 6500, cap: 75, prize: 'Example purse: $1,500 across 15 places' }),
    cat({ raceId: rr.id, name: 'Cat 4/5', code: 'RR-45', dg: dg.elite.id, sg: rrCat45.id, paths: [path({ licenseCategories: ['4', '5'] })], length: laps(3), price: 4000, priceChange: 4500, cap: 60 }),
    cat({ raceId: rr.id, name: "Women's Pro/1/2/3", code: 'RR-W123', dg: dg.women.id, sg: rrWomen.id, paths: [path({ licenseCategories: ['PRO', '1', '2', '3'], genderClass: 'women' })], length: laps(6), price: 5000, priceChange: 6000, cap: 50, prize: 'Example purse: $1,500 across 15 places (equal to elite men)' }),
    cat({ raceId: rr.id, name: 'Masters 35+ Cat 3/4', code: 'RR-M35-34', dg: dg.masters.id, sg: rrM35.id, paths: [path({ licenseCategories: ['3', '4'], minAge: 35 })], length: laps(5), price: 5000, priceChange: 5500, cap: 60, description: 'Racing age 35 or over AND a Cat 3 or Cat 4 license. Either condition alone does not qualify.' }),
    cat({ raceId: rr.id, name: 'Masters 50+', code: 'RR-M50', dg: dg.masters.id, sg: rrM50.id, paths: [path({ minAge: 50, maxAge: 59 })], length: laps(4), price: 5000, cap: 40, description: 'Starts with Masters 60+ and is scored separately.' }),
    cat({ raceId: rr.id, name: 'Masters 60+', code: 'RR-M60', dg: dg.masters.id, sg: rrM50.id, paths: [path({ minAge: 60 })], length: laps(4), price: 5000, cap: 40, description: 'Starts with Masters 50+ and is scored separately.' }),
    cat({ raceId: rr.id, name: 'Collegiate men A', code: 'RR-CMA', dg: dg.collegiate.id, sg: rrColl.id, paths: [path({ collegiateRequired: true, collegiateDivisions: ['A'], genderClass: 'men' })], length: laps(6), price: 3000, cap: null, description: 'Collegiate eligibility path. Shares a start and an 80-rider field limit with domestic Cat 2/3, scored separately.' }),
    cat({ raceId: rr.id, name: 'Domestic men Cat 2/3', code: 'RR-D23', dg: dg.collegiate.id, sg: rrColl.id, paths: [path({ licenseCategories: ['2', '3'], genderClass: 'men' })], length: laps(6), price: 5000, cap: null, description: 'Domestic license path in the shared collegiate start.' }),
    cat({ raceId: rr.id, name: 'Junior 15–16', code: 'RR-J1516', dg: dg.juniors.id, sg: rrJr.id, paths: [path({ minAge: 15, maxAge: 16 })], length: laps(3), price: 2000, cap: 30, guardian: true }),
    cat({ raceId: rr.id, name: 'Junior 17–18', code: 'RR-J1718', dg: dg.juniors.id, sg: rrJr.id, paths: [path({ minAge: 17, maxAge: 18 })], length: laps(3), price: 2000, cap: 30, guardian: true }),
    // Sunday criterium
    cat({ raceId: crit.id, name: 'Elite men Pro/1/2', code: 'CR-P12', dg: dg.elite.id, sg: crElite.id, paths: [path({ licenseCategories: P12, genderClass: 'men' })], length: { kind: 'duration', minutes: 75, plusLaps: null }, price: 5000, cap: 75 }),
    cat({ raceId: crit.id, name: 'Cat 4/5', code: 'CR-45', dg: dg.elite.id, sg: crCat45.id, paths: [path({ licenseCategories: ['4', '5'] })], length: { kind: 'duration', minutes: 30, plusLaps: null }, price: 3500, cap: 60 }),
    cat({ raceId: crit.id, name: "Women's Pro/1/2/3", code: 'CR-W123', dg: dg.women.id, sg: crWomen.id, paths: [path({ licenseCategories: ['PRO', '1', '2', '3'], genderClass: 'women' })], length: { kind: 'duration', minutes: 45, plusLaps: 3 }, price: 4500, cap: 50, description: "Combined start with Women's Cat 4/5; scored separately." }),
    cat({ raceId: crit.id, name: "Women's Cat 4/5", code: 'CR-W45', dg: dg.women.id, sg: crWomen.id, paths: [path({ licenseCategories: ['4', '5'], genderClass: 'women' })], length: { kind: 'duration', minutes: 45, plusLaps: 3 }, price: 3500, cap: 30, description: "Combined start with Women's Pro/1/2/3; scored separately." }),
    cat({ raceId: crit.id, name: 'Masters 35+ Cat 3/4', code: 'CR-M35-34', dg: dg.masters.id, sg: crM35.id, paths: [path({ licenseCategories: ['3', '4'], minAge: 35 })], length: { kind: 'duration', minutes: 40, plusLaps: null }, price: 4000, cap: 60 }),
    cat({ raceId: crit.id, name: 'Junior 10–14', code: 'CR-J1014', dg: dg.juniors.id, sg: crJr.id, paths: [path({ minAge: 10, maxAge: 14 })], length: { kind: 'duration', minutes: 20, plusLaps: null }, price: 0, cap: 40, guardian: true, description: 'Free entry in this example. A real event needs an explicit cost policy for free junior entries.' }),
  ];

  const find = (code: string) => categories.find((c) => c.timingCode === code)!.id;

  const config: EventConfig = {
    schemaVersion: 1,
    event: {
      name: 'Example Valley Omnium (demonstration)',
      timeZone: 'America/Los_Angeles',
      venue: 'Example Valley (fictional location)',
      isDemo: true,
      demoNotice: DEMO_NOTICE,
    },
    ruleSet: { source: 'Example only. Not taken from a federation rulebook.', season: 2027 },
    registration: {
      bundles: [{ id: newId('bundle'), name: 'Weekend omnium entry', raceIds: [rr.id, crit.id], discountCents: 1500, priceCents: null }],
      additionalRaceDiscountCents: 1000,
      additionalRaceDiscountMode: 'each_additional_entry',
      platformFeeCents: 0,
      platformFeeLabel: 'Platform fee',
      processingFeeBasisPoints: 0,
      processingFeeLabel: 'Processing fee',
      recoveryMinutes: 15,
      refundPolicy:
        'Example policy: full refund less a $5 processing fee until 7 days before the race; no refunds after that. Category transfers are free until registration closes.',
      waiverText: SAMPLE_WAIVER,
      waiverVersion: 'sample-2027.1',
    },
    days: [sat, sun],
    races: [rr, crit],
    displayGroups: Object.values(dg),
    startGroups: [rrElite, rrWomen, rrM35, rrM50, rrColl, rrCat45, rrJr, crElite, crWomen, crM35, crCat45, crJr],
    categories,
    capacityPools: [
      { id: newId('pool'), name: 'Masters 50+ and 60+ combined', limit: 60, memberCategoryIds: [find('RR-M50'), find('RR-M60')], memberStartGroupIds: [] },
    ],
  };

  const entryPlan = [
    { categoryId: find('RR-M50'), count: 35 },
    { categoryId: find('RR-P12'), count: 42 },
    { categoryId: find('RR-W123'), count: 18 },
    { categoryId: find('RR-M35-34'), count: 27 },
    { categoryId: find('RR-J1516'), count: 9 },
    { categoryId: find('RR-J1718'), count: 14 },
    { categoryId: find('CR-W123'), count: 21 },
    { categoryId: find('CR-W45'), count: 11 },
  ];
  return { config, entryPlan };
}
