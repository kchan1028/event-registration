import { blankPath, newId } from './factory';
import type { Category, EligibilityPath, EventConfig, LicenseCategory, RegistrationSettings } from './schema';
import { FIXTURE_NOTICE, FIXTURE_WAIVER_TEXT, FIXTURE_WAIVER_VERSION } from './fixtures';

const FEES: Pick<RegistrationSettings, 'platformFeeCents' | 'platformFeeLabel' | 'processingFeeBasisPoints' | 'processingFeeLabel'> = {
  platformFeeCents: 300,
  platformFeeLabel: 'Demo platform fee',
  processingFeeBasisPoints: 300,
  processingFeeLabel: 'Demo processing fee (simulated)',
};

interface CaseStudyCategory {
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

const CRITERIUM_FIELDS: CaseStudyCategory[] = [
  { code: 'DVC-M45', name: 'Men Cat 4/5', startTime: '09:00', priceCents: 3500, cap: 75, confirmed: 60, length: timed(35, 2), path: { genderClass: 'men', licenseCategories: cats('4', '5') } },
  { code: 'DVC-W345', name: 'Women Cat 3/4/5', startTime: '09:50', priceCents: 3500, cap: 50, confirmed: 18, length: timed(30, 2), path: { genderClass: 'women', licenseCategories: cats('3', '4', '5') } },
  { code: 'DVC-M35', name: 'Masters 35+ Cat 3/4', startTime: '10:40', priceCents: 4000, cap: 60, confirmed: 60, length: timed(40, 3), path: { minAge: 35, licenseCategories: cats('3', '4') } },
  { code: 'DVC-J1014', name: 'Juniors 10-14', startTime: '11:40', priceCents: 1500, cap: 40, confirmed: 6, length: timed(20, 1), path: { minAge: 10, maxAge: 14 }, guardian: true },
  { code: 'DVC-O45E', name: 'Open Cat 4/5 Evening', startTime: '17:30', priceCents: 3000, cap: 60, confirmed: 12, length: timed(30, 2), path: { licenseCategories: cats('4', '5') } },
];

const ROAD_FIELDS: CaseStudyCategory[] = [
  { code: 'DRW-RR-M35', name: 'Masters 35+ Cat 3/4 Road Race', startTime: '08:30', priceCents: 5000, cap: 80, confirmed: 41, length: distance(64, 4), path: { minAge: 35, licenseCategories: cats('3', '4') } },
  { code: 'DRW-RR-45', name: 'Cat 4/5 Road Race', startTime: '10:00', priceCents: 4500, cap: 80, confirmed: 55, length: distance(48, 3), path: { licenseCategories: cats('4', '5') } },
];
const WEEKEND_CRITERIUM_FIELDS: CaseStudyCategory[] = [
  { code: 'DRW-CR-M35', name: 'Masters 35+ Cat 3/4 Criterium', startTime: '09:00', priceCents: 3500, cap: 60, confirmed: 33, length: timed(40, 3), path: { minAge: 35, licenseCategories: cats('3', '4') } },
  { code: 'DRW-CR-45', name: 'Cat 4/5 Criterium', startTime: '10:00', priceCents: 3500, cap: 60, confirmed: 47, length: timed(35, 2), path: { licenseCategories: cats('4', '5') } },
];

function build(
  name: string,
  venue: string,
  days: { date: string; label: string; race: string; discipline: 'road_race' | 'criterium'; categories: CaseStudyCategory[] }[],
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
      sameRaceExtraEntryCents: null,
      recoveryMinutes: 15,
      refundRules: null,
      refundPolicy: 'Demo policy for usability testing: no real money is charged, so nothing is refunded.',
      waiverText: FIXTURE_WAIVER_TEXT,
      waiverVersion: FIXTURE_WAIVER_VERSION,
      ...FEES,
      ...registration,
      demoIgnoreWindows: registration.demoIgnoreWindows ?? true,
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

export function buildCaseStudySources() {
  const criterium = build(
    'Demo Harbor Criterium: pricing and eligibility lab',
    'Example Harbor Circuit, Sample City, CA',
    [{ date: '2027-04-17', label: 'Saturday', race: 'Demo Harbor Criterium: pricing and eligibility lab', discipline: 'criterium', categories: CRITERIUM_FIELDS }],
    { additionalRaceDiscountCents: 1000, additionalRaceDiscountMode: 'once_same_day' },
  );
  const weekend = build(
    'Demo Redwood Omnium Weekend',
    'Example Road Loop and Civic Circuit, Redwood, CA',
    [
      { date: '2027-05-15', label: 'Saturday', race: 'Saturday road race', discipline: 'road_race', categories: ROAD_FIELDS },
      { date: '2027-05-16', label: 'Sunday', race: 'Sunday criterium', discipline: 'criterium', categories: WEEKEND_CRITERIUM_FIELDS },
    ],
    {},
  );
  weekend.config.registration.bundles = [
    { id: newId('bundle'), name: 'Weekend bundle (one road race + one criterium)', raceIds: weekend.config.races.map((r) => r.id), discountCents: 0, priceCents: 7500 },
  ];
  return [criterium, weekend];
}
