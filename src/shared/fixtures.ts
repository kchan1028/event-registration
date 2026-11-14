import { blankPath, newId } from './factory';
import type { Category, EligibilityPath, EventConfig, LicenseCategory, RegistrationSettings } from './schema';

/**
 * The clickable demo purchase flow fixtures (product.md 2a), transcribed from
 * docs/fixtures/demo-purchase-flow.yaml and docs/fixtures/sample-waiver.md.
 * FAKE DATA ONLY: fictional events, riders, prices, and fees.
 * tests/fixtures.test.ts checks this file against the YAML and the worked
 * order totals in docs/fixtures/README.md.
 */

export const FIXTURE_ORG_NAME = 'Demo purchase flow (fixtures)';

export const FIXTURE_NOTICE =
  'Demo fixtures: fictional events, riders, prices, and fees from docs/fixtures for the clickable demo. Not real events, real prices, or current USA Cycling rules.';

export const FIXTURE_WAIVER_VERSION = 'DEMO-WAIVER v1 (2026-11-14)';

export const FIXTURE_WAIVER_TEXT = `SAMPLE TEXT FOR THE CLICKABLE DEMO. NOT A REAL WAIVER.

This text is a placeholder for usability testing. It is not the USA Cycling waiver, it has not been reviewed by a lawyer, and a signature on it has no legal effect for any event. A sanctioned event must use the waiver its governing body requires, unmodified.

Participant agreement (sample)

1. Risk. I understand bicycle racing can cause injury, and I choose to take part in this demo event.
2. Fitness and equipment. I am fit to race, my bicycle is in safe working order, and I will wear an approved helmet at all times on the course.
3. Rules. I will follow the officials' instructions and the event rules.
4. Medical care. If I am hurt and cannot respond, I agree that event staff may arrange emergency medical care.
5. Photos. I understand I may appear in event photos.

Minors: a parent or guardian must sign for a rider under 18.`;

const FEES: Pick<RegistrationSettings, 'platformFeeCents' | 'platformFeeLabel' | 'processingFeeBasisPoints' | 'processingFeeLabel'> = {
  platformFeeCents: 300,
  platformFeeLabel: 'Demo platform fee',
  processingFeeBasisPoints: 300,
  processingFeeLabel: 'Demo processing fee (simulated)',
};

export interface FixtureCategory {
  code: string;
  name: string;
  startTime: string;
  priceCents: number;
  cap: number;
  confirmed: number;
  length: Category['length'];
  path: Partial<Omit<EligibilityPath, 'id'>>;
  guardian?: boolean;
}

const timed = (minutes: number, plusLaps: number): Category['length'] => ({ kind: 'duration', minutes, plusLaps });
const distance = (km: number, laps: number): Category['length'] => ({ kind: 'distance', distance: km, unit: 'km', laps, partialFinalLap: false });
const cats = (...list: LicenseCategory[]) => list;

export const VALLEY_CATEGORIES: FixtureCategory[] = [
  { code: 'DVC-M45', name: 'Men Cat 4/5', startTime: '09:00', priceCents: 3500, cap: 75, confirmed: 60, length: timed(35, 2), path: { genderClass: 'men', licenseCategories: cats('4', '5') } },
  { code: 'DVC-W345', name: 'Women Cat 3/4/5', startTime: '09:50', priceCents: 3500, cap: 50, confirmed: 18, length: timed(30, 2), path: { genderClass: 'women', licenseCategories: cats('3', '4', '5') } },
  { code: 'DVC-M35', name: 'Masters 35+ Cat 3/4', startTime: '10:40', priceCents: 4000, cap: 60, confirmed: 60, length: timed(40, 3), path: { minAge: 35, licenseCategories: cats('3', '4') } },
  { code: 'DVC-J1014', name: 'Juniors 10-14', startTime: '11:40', priceCents: 1500, cap: 40, confirmed: 6, length: timed(20, 1), path: { minAge: 10, maxAge: 14 }, guardian: true },
  { code: 'DVC-O45E', name: 'Open Cat 4/5 Evening', startTime: '17:30', priceCents: 3000, cap: 60, confirmed: 12, length: timed(30, 2), path: { licenseCategories: cats('4', '5') } },
];

export const RIDGE_SAT: FixtureCategory[] = [
  { code: 'DRW-RR-M35', name: 'Masters 35+ Cat 3/4 Road Race', startTime: '08:30', priceCents: 5000, cap: 80, confirmed: 41, length: distance(64, 4), path: { minAge: 35, licenseCategories: cats('3', '4') } },
  { code: 'DRW-RR-45', name: 'Cat 4/5 Road Race', startTime: '10:00', priceCents: 4500, cap: 80, confirmed: 55, length: distance(48, 3), path: { licenseCategories: cats('4', '5') } },
];
export const RIDGE_SUN: FixtureCategory[] = [
  { code: 'DRW-CR-M35', name: 'Masters 35+ Cat 3/4 Criterium', startTime: '09:00', priceCents: 3500, cap: 60, confirmed: 33, length: timed(40, 3), path: { minAge: 35, licenseCategories: cats('3', '4') } },
  { code: 'DRW-CR-45', name: 'Cat 4/5 Criterium', startTime: '10:00', priceCents: 3500, cap: 60, confirmed: 47, length: timed(35, 2), path: { licenseCategories: cats('4', '5') } },
];

export interface DemoRider {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  team: string;
  racingAge: number;
  competitionClass: 'women' | 'men';
  licenseCategory: LicenseCategory;
  licenseNumber: string;
  licenseCheck: 'simulated_valid' | 'simulated_unknown';
  guardian: { name: string; relationship: string; email: string; phone: string } | null;
  emergencyContact: { name: string; phone: string };
}

export const DEMO_RIDERS: DemoRider[] = [
  { id: 'rider-alex', firstName: 'Alex', lastName: 'Demo', email: 'alex.demo@example.com', phone: '555-555-0101', team: 'Demo Wheelers', racingAge: 29, competitionClass: 'men', licenseCategory: '4', licenseNumber: 'DEMO-100001', licenseCheck: 'simulated_valid', guardian: null, emergencyContact: { name: 'Robin Demo', phone: '555-555-0111' } },
  { id: 'rider-blake', firstName: 'Blake', lastName: 'Demo', email: 'blake.demo@example.com', phone: '555-555-0102', team: 'Sample Velo', racingAge: 38, competitionClass: 'women', licenseCategory: '3', licenseNumber: 'DEMO-100002', licenseCheck: 'simulated_valid', guardian: null, emergencyContact: { name: 'Taylor Demo', phone: '555-555-0112' } },
  { id: 'rider-casey', firstName: 'Casey', lastName: 'Demo', email: '', phone: '', team: '', racingAge: 13, competitionClass: 'men', licenseCategory: '5', licenseNumber: 'DEMO-100003', licenseCheck: 'simulated_valid', guardian: { name: 'Jordan Demo', relationship: 'Parent', email: 'jordan.demo@example.com', phone: '555-555-0103' }, emergencyContact: { name: 'Jordan Demo', phone: '555-555-0103' } },
  { id: 'rider-sam', firstName: 'Sam', lastName: 'Demo', email: 'sam.demo@example.com', phone: '555-555-0104', team: '', racingAge: 31, competitionClass: 'women', licenseCategory: '4', licenseNumber: 'DEMO-100004', licenseCheck: 'simulated_unknown', guardian: null, emergencyContact: { name: 'Morgan Demo', phone: '555-555-0114' } },
];

function build(
  name: string,
  venue: string,
  days: { date: string; label: string; race: string; discipline: 'road_race' | 'criterium'; categories: FixtureCategory[] }[],
  registration: Partial<RegistrationSettings>,
): { config: EventConfig; entryPlan: { categoryId: string; count: number }[] } {
  const dayRows = days.map((d) => ({ id: newId('day'), date: d.date, label: d.label }));
  const races = days.map((d, i) => ({ id: newId('race'), dayId: dayRows[i].id, name: d.race, discipline: d.discipline, course: venue }));
  const dg = races.map((r, i) => ({ id: newId('dg'), name: r.name, sortOrder: i }));
  const startGroups: EventConfig['startGroups'] = [];
  const categories: Category[] = [];
  const entryPlan: { categoryId: string; count: number }[] = [];
  let order = 0;
  days.forEach((d, i) => {
    const lastDay = new Date(`${d.date}T12:00:00Z`);
    lastDay.setUTCDate(lastDay.getUTCDate() - 1);
    for (const fc of d.categories) {
      const sg = { id: newId('sg'), raceId: races[i].id, name: fc.name, startTime: fc.startTime, stagingTime: null, fieldLimit: null };
      startGroups.push(sg);
      const id = newId('cat');
      categories.push({
        id,
        raceId: races[i].id,
        name: fc.name,
        timingCode: fc.code,
        description: '',
        displayGroupId: dg[i].id,
        sortOrder: order++,
        status: 'active',
        eligibility: { paths: [{ ...blankPath(), ...fc.path }], organizerReview: false, guardianRequired: !!fc.guardian },
        length: fc.length,
        pricing: { baseCents: fc.priceCents, dayOfSurchargeCents: 0, priceChanges: [] },
        registration: { opensAt: '2027-01-01T09:00', closesAt: `${lastDay.toISOString().slice(0, 10)}T20:00` },
        cap: fc.cap,
        startGroupId: sg.id,
        classifications: [{ code: fc.code, label: fc.name }],
        dualScoringApproved: false,
        prizeText: '',
        needsReview: false,
        reviewReason: '',
      });
      if (fc.confirmed > 0) entryPlan.push({ categoryId: id, count: fc.confirmed });
    }
  });
  const config: EventConfig = {
    schemaVersion: 1,
    event: { name, timeZone: 'America/Los_Angeles', venue, isDemo: true, demoNotice: FIXTURE_NOTICE },
    ruleSet: { source: 'Demo fixtures in docs/fixtures. Not a federation rulebook.', season: 2027 },
    registration: {
      bundles: [],
      additionalRaceDiscountCents: 0,
      additionalRaceDiscountMode: 'each_additional_entry',
      recoveryMinutes: 15,
      refundPolicy: 'Demo policy for usability testing: no real money is charged, so nothing is refunded.',
      waiverText: FIXTURE_WAIVER_TEXT,
      waiverVersion: FIXTURE_WAIVER_VERSION,
      ...FEES,
      ...registration,
    },
    days: dayRows,
    races,
    displayGroups: dg,
    startGroups,
    categories,
    capacityPools: [],
  };
  return { config, entryPlan };
}

export function buildFixtureEvents() {
  const valley = build(
    'Demo Valley Criterium',
    'Fictional Business Park, Demo City, CA',
    [{ date: '2027-04-17', label: 'Saturday', race: 'Demo Valley Criterium', discipline: 'criterium', categories: VALLEY_CATEGORIES }],
    { additionalRaceDiscountCents: 1000, additionalRaceDiscountMode: 'once_same_day' },
  );
  const ridge = build(
    'Demo Ridge Road Race Weekend',
    'Imaginary Ridge Loop, Sampleton, CA',
    [
      { date: '2027-05-15', label: 'Saturday', race: 'Saturday road race', discipline: 'road_race', categories: RIDGE_SAT },
      { date: '2027-05-16', label: 'Sunday', race: 'Sunday criterium', discipline: 'criterium', categories: RIDGE_SUN },
    ],
    {},
  );
  ridge.config.registration.bundles = [
    { id: newId('bundle'), name: 'Weekend bundle (one road race + one criterium)', raceIds: ridge.config.races.map((r) => r.id), discountCents: 0, priceCents: 7500 },
  ];
  return [valley, ridge];
}

export function demoRider(id: string | null | undefined): DemoRider | undefined {
  return DEMO_RIDERS.find((r) => r.id === id);
}
