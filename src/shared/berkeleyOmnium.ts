import { blankPath, newId } from './factory';
import { SAMPLE_WAIVER } from './demo';
import type { Category, CollegiateDivision, EligibilityPath, EventConfig, GenderClass, LicenseCategory, StartGroup } from './schema';

/**
 * The Berkeley Omnium (Berkeley Hills Road Race and Berkeley Streets Criterium), used with the promoter's
 * permission as the working demo event. Fields, distances, staging and start times, race lengths and field limits
 * come from the 2026 Berkeley Omnium race information; dates and the registration window are the 2027 edition's.
 * Organizer-set standard entry fees: $80 road race, $60 criterium, $130 package; junior, collegiate and women rates are configured separately; the $15 day-of surcharge and $20 second criterium race are the 2026 rules. Riders and entries stay simulated.
 */

export const OMNIUM_ORG_NAME = 'Berkeley Bicycle Club';

export const OMNIUM_NOTICE =
  'Berkeley Omnium demo, April 17–18, 2027; 2026 fields and times. Road/crit/package: standard $80/$60/$130; junior $30/$20/$40; collegiate $60/$40/$90; women $40/$20/$50. Lowest eligible rate applies. Second crit: $10 reduced, $20 standard. Entries are simulated. Eligibility and podium nominations require organizer review.';

const PRICES = { standard: [8000, 6000, 13000, 2000], juniors: [3000, 2000, 4000, 1000], collegiate: [6000, 4000, 9000, 1000], women: [4000, 2000, 5000, 1000] } as const;

const ALL: LicenseCategory[] = ['1', '2', '3', '4', '5'];

const GROUPS = {
  novice: 'New racers',
  elite: 'Elite and Pro/1/2',
  masters: 'Masters',
  women: 'Women',
  collegiate: 'Collegiate',
  juniors: 'Juniors',
} as const;
type Group = keyof typeof GROUPS;

interface FieldSpec {
  name: string;
  code: string;
  group: Group;
  license?: LicenseCategory[];
  minAge?: number;
  maxAge?: number;
  gender?: GenderClass;
  collegiate?: CollegiateDivision[];
  guardian?: boolean;
  description?: string;
}

const WOMEN_SPLIT_NOTE = 'The race information does not split the long and short races by license category. Set the categories before opening registration.';

function eligibility(f: FieldSpec): EligibilityPath {
  return {
    ...blankPath(),
    licenseCategories: f.license ?? [],
    minAge: f.minAge ?? null,
    maxAge: f.maxAge ?? null,
    genderClass: f.gender ?? 'any',
    collegiateRequired: Boolean(f.collegiate),
    collegiateDivisions: f.collegiate ?? [],
  };
}

const junior = (name: string, code: string, minAge: number | undefined, maxAge: number, gender: GenderClass = 'any'): FieldSpec => ({
  name,
  code,
  group: 'juniors',
  minAge,
  maxAge,
  gender,
  guardian: true,
});

export function buildBerkeleyOmniumEvent(): { config: EventConfig; entryPlan: { categoryId: string; count: number }[] } {
  const sat = { id: newId('day'), date: '2027-04-17', label: 'Saturday' };
  const sun = { id: newId('day'), date: '2027-04-18', label: 'Sunday' };
  const rr = {
    id: newId('race'),
    dayId: sat.id,
    name: 'Berkeley Hills Road Race',
    discipline: 'road_race' as const,
    course: 'Three Bears loop on Bear Creek Road near Orinda, 18.76 mi and 759 ft per lap',
  };
  const crit = { id: newId('race'), dayId: sun.id, name: 'Berkeley Streets Criterium', discipline: 'criterium' as const, course: 'Downtown Berkeley circuit' };

  const displayGroups = Object.values(GROUPS).map((name, sortOrder) => ({ id: newId('dg'), name, sortOrder }));
  const dgId = (g: Group) => displayGroups.find((d) => d.name === GROUPS[g])!.id;

  // Online pre-registration opens March 1 and closes 3 days before the road race.
  const registration = { opensAt: '2027-03-01T00:15', closesAt: '2027-04-14T23:59' };

  const startGroups: StartGroup[] = [];
  const categories: Category[] = [];

  function addStart(raceId: string, name: string, times: { start: string; staging: string | null }, fieldLimit: number | null, length: Category['length'], fields: FieldSpec[]) {
    const sg: StartGroup = { id: newId('sg'), raceId, name, startTime: times.start, stagingTime: times.staging, fieldLimit };
    startGroups.push(sg);
    for (const f of fields) {
      categories.push({
        id: newId('cat'),
        raceId,
        name: f.name,
        timingCode: f.code,
        description: f.description ?? (fields.length > 1 ? `Starts with the rest of "${name}" and is scored separately.` : ''),
        displayGroupId: dgId(f.group),
        sortOrder: categories.length,
        status: 'active',
        eligibility: { paths: [eligibility(f)], organizerReview: false, guardianRequired: f.guardian ?? false },
        length,
        pricing: { baseCents: PRICES[f.group === 'juniors' || f.group === 'collegiate' || f.group === 'women' ? f.group : 'standard'][raceId === rr.id ? 0 : 1], dayOfSurchargeCents: 1500, priceChanges: [] },
        registration,
        cap: null,
        startGroupId: sg.id,
        classifications: [{ code: f.code, label: f.name }],
        dualScoringApproved: false,
        prizeText: '',
        needsReview: false,
        reviewReason: '',
      });
    }
  }

  // Berkeley Hills Road Race. The race information gives a staging time and distance per field, not individual
  // start times or lap counts, so each field starts at its staging time until the officials set the start order.
  const miles = (distance: number) => ({ kind: 'distance' as const, distance, unit: 'mi' as const, laps: null, partialFinalLap: false });
  const rrField = (name: string, t: string, distance: number, fields: FieldSpec[]) => addStart(rr.id, name, { start: t, staging: t }, null, miles(distance), fields);

  rrField('P/1/2 and Collegiate P/1/2', '08:00', 90, [
    { name: 'Pro/1/2', code: 'RR-P12', group: 'elite', license: ['PRO', '1', '2'] },
    { name: 'Collegiate men A', code: 'RR-CA', group: 'collegiate', collegiate: ['A'], gender: 'men' },
  ]);
  rrField('Elite 3 and Collegiate 3', '08:00', 71, [
    { name: 'Elite 3', code: 'RR-E3', group: 'elite', license: ['3'] },
    { name: 'Collegiate men B', code: 'RR-CB', group: 'collegiate', collegiate: ['B'], gender: 'men' },
  ]);
  rrField('Masters 35+ 1/2/3', '08:00', 71, [{ name: 'Masters 35+ 1/2/3', code: 'RR-M35-123', group: 'masters', license: ['1', '2', '3'], minAge: 35 }]);
  rrField("Women's Long Race", '08:00', 71, [{ name: "Women's Long Race", code: 'RR-WL', group: 'women', gender: 'women', description: WOMEN_SPLIT_NOTE }]);
  rrField('Elite 4 and Collegiate 4', '08:15', 52, [
    { name: 'Elite 4', code: 'RR-E4', group: 'elite', license: ['4'] },
    { name: 'Collegiate men C', code: 'RR-CC', group: 'collegiate', collegiate: ['C'], gender: 'men' },
  ]);
  rrField('Masters 35+ 3/4', '08:15', 52, [{ name: 'Masters 35+ 3/4', code: 'RR-M35-34', group: 'masters', license: ['3', '4'], minAge: 35 }]);
  rrField('Masters 50+ 1/2/3', '08:15', 52, [{ name: 'Masters 50+ 1/2/3', code: 'RR-M50-123', group: 'masters', license: ['1', '2', '3'], minAge: 50 }]);
  rrField('Masters 50+ 3/4', '08:15', 52, [{ name: 'Masters 50+ 3/4', code: 'RR-M50-34', group: 'masters', license: ['3', '4'], minAge: 50 }]);
  rrField('Masters 60+ 1/2/3/4/5', '08:15', 52, [{ name: 'Masters 60+ 1/2/3/4/5', code: 'RR-M60', group: 'masters', license: ALL, minAge: 60 }]);
  rrField('Masters 65+ 1/2/3/4/5', '08:15', 52, [{ name: 'Masters 65+ 1/2/3/4/5', code: 'RR-M65', group: 'masters', license: ALL, minAge: 65 }]);
  rrField('Novice and Collegiate Novice', '08:30', 33, [
    { name: 'Novice', code: 'RR-NOV', group: 'novice', license: ['5'] },
    { name: 'Collegiate men D', code: 'RR-CD', group: 'collegiate', collegiate: ['D'], gender: 'men' },
  ]);
  rrField("Women's Short Race", '08:30', 33, [{ name: "Women's Short Race", code: 'RR-WS', group: 'women', gender: 'women', description: WOMEN_SPLIT_NOTE }]);
  rrField('Juniors 15-16 and 17-18 (boys)', '08:30', 33, [junior('Junior boys 15-16', 'RR-JB1516', 15, 16, 'men'), junior('Junior boys 17-18', 'RR-JB1718', 17, 18, 'men')]);
  rrField('Juniors 15-16 and 17-18 (girls)', '08:30', 33, [junior('Junior girls 15-16', 'RR-JG1516', 15, 16, 'women'), junior('Junior girls 17-18', 'RR-JG1718', 17, 18, 'women')]);
  rrField('Juniors 10 and under, 11-12 and 13-14 (boys)', '08:30', 16, [
    junior('Junior boys 10 and under', 'RR-JB10', undefined, 10, 'men'),
    junior('Junior boys 11-12', 'RR-JB1112', 11, 12, 'men'),
    junior('Junior boys 13-14', 'RR-JB1314', 13, 14, 'men'),
  ]);
  rrField('Juniors 10 and under, 11-12 and 13-14 (girls)', '08:30', 16, [
    junior('Junior girls 10 and under', 'RR-JG10', undefined, 10, 'women'),
    junior('Junior girls 11-12', 'RR-JG1112', 11, 12, 'women'),
    junior('Junior girls 13-14', 'RR-JG1314', 13, 14, 'women'),
  ]);

  // Berkeley Streets Criterium: timed races with a field limit per start.
  const crField = (name: string, start: string, minutes: number, fieldLimit: number, fields: FieldSpec[]) =>
    addStart(crit.id, name, { start, staging: null }, fieldLimit, { kind: 'duration', minutes, plusLaps: null }, fields);

  crField('Open Novice and Collegiate Novice', '07:30', 30, 75, [
    { name: 'Novice', code: 'CR-NOV', group: 'novice', license: ['5'] },
    { name: 'Collegiate men D', code: 'CR-CD', group: 'collegiate', collegiate: ['D'], gender: 'men' },
  ]);
  crField("Women's 4/Novice and Women's Collegiate 4/Novice", '08:05', 30, 75, [
    { name: "Women's 4/Novice", code: 'CR-W45', group: 'women', license: ['4', '5'], gender: 'women' },
    { name: "Women's Collegiate C/D", code: 'CR-WCCD', group: 'collegiate', collegiate: ['C', 'D'], gender: 'women' },
  ]);
  crField('Juniors 10 and under, 11-12 and 13-14', '08:40', 30, 50, [
    junior('Junior 10 and under', 'CR-J10', undefined, 10),
    junior('Junior 11-12', 'CR-J1112', 11, 12),
    junior('Junior 13-14', 'CR-J1314', 13, 14),
  ]);
  crField('Juniors 15-16 and 17-18', '09:15', 40, 50, [junior('Junior 15-16', 'CR-J1516', 15, 16), junior('Junior 17-18', 'CR-J1718', 17, 18)]);
  crField('Masters 35+/50+ 3/4', '10:10', 40, 100, [
    { name: 'Masters 35+ 3/4', code: 'CR-M35-34', group: 'masters', license: ['3', '4'], minAge: 35 },
    { name: 'Masters 50+ 3/4', code: 'CR-M50-34', group: 'masters', license: ['3', '4'], minAge: 50 },
  ]);
  crField('Elite 4 and Collegiate 4', '11:00', 40, 100, [
    { name: 'Elite 4', code: 'CR-E4', group: 'elite', license: ['4'] },
    { name: 'Collegiate men C', code: 'CR-CC', group: 'collegiate', collegiate: ['C'], gender: 'men' },
  ]);
  crField('Masters 50+ 1/2/3, 60+ and 65+ 1/2/3/4/5', '12:15', 50, 100, [
    { name: 'Masters 50+ 1/2/3', code: 'CR-M50-123', group: 'masters', license: ['1', '2', '3'], minAge: 50 },
    { name: 'Masters 60+ 1/2/3/4/5', code: 'CR-M60', group: 'masters', license: ALL, minAge: 60 },
    { name: 'Masters 65+ 1/2/3/4/5', code: 'CR-M65', group: 'masters', license: ALL, minAge: 65 },
  ]);
  crField("Women's 3, Collegiate B, Masters 40+/50+/60+", '13:10', 40, 75, [
    { name: "Women's 3", code: 'CR-W3', group: 'women', license: ['3'], gender: 'women' },
    { name: "Women's Collegiate B", code: 'CR-WCB', group: 'collegiate', collegiate: ['B'], gender: 'women' },
    { name: "Women's Masters 40+", code: 'CR-WM40', group: 'women', minAge: 40, gender: 'women' },
    { name: "Women's Masters 50+", code: 'CR-WM50', group: 'women', minAge: 50, gender: 'women' },
    { name: "Women's Masters 60+", code: 'CR-WM60', group: 'women', minAge: 60, gender: 'women' },
  ]);
  crField('Elite 3 and Collegiate 3', '14:05', 45, 100, [
    { name: 'Elite 3', code: 'CR-E3', group: 'elite', license: ['3'] },
    { name: 'Collegiate men B', code: 'CR-CB', group: 'collegiate', collegiate: ['B'], gender: 'men' },
  ]);
  crField('Masters 35+ 1/2/3', '14:55', 50, 100, [{ name: 'Masters 35+ 1/2/3', code: 'CR-M35-123', group: 'masters', license: ['1', '2', '3'], minAge: 35 }]);
  crField("Women's Pro/1/2/3 and Collegiate Pro/1/2/3", '16:00', 60, 100, [
    { name: "Women's Pro/1/2/3", code: 'CR-WP123', group: 'women', license: ['PRO', '1', '2', '3'], gender: 'women' },
    { name: "Women's Collegiate A", code: 'CR-WCA', group: 'collegiate', collegiate: ['A'], gender: 'women' },
  ]);
  crField('Pro/1/2 and Collegiate Pro/1/2', '17:05', 60, 100, [
    { name: 'Pro/1/2', code: 'CR-P12', group: 'elite', license: ['PRO', '1', '2'] },
    { name: 'Collegiate men A', code: 'CR-CA', group: 'collegiate', collegiate: ['A'], gender: 'men' },
  ]);

  const find = (code: string) => categories.find((c) => c.timingCode === code)!.id;

  const config: EventConfig = {
    schemaVersion: 1,
    event: {
      name: 'Berkeley Omnium 2027',
      timeZone: 'America/Los_Angeles',
      venue: 'Bear Creek Road near Orinda (Saturday) and downtown Berkeley (Sunday), California',
      isDemo: true,
      demoNotice: OMNIUM_NOTICE,
    },
    ruleSet: { source: '2026 Berkeley Omnium race information. Eligibility drafted from field names; check against current USA Cycling rules.', season: 2027 },
    registration: {
      riderRates: (['juniors', 'collegiate', 'women'] as const).map((group) => ({
        eligibility: { ...blankPath(group === 'juniors' ? 'Junior (18 and under)' : group === 'collegiate' ? 'Collegiate' : 'Women'), ...(group === 'juniors' ? { maxAge: 18 } : group === 'collegiate' ? { collegiateRequired: true } : { genderClass: 'women' as const }) },
        categoryGenderClass: group === 'women' ? 'women' as const : 'any' as const,
        racePrices: [{ raceId: rr.id, cents: PRICES[group][0], extraEntryCents: PRICES.standard[3] }, { raceId: crit.id, cents: PRICES[group][1], extraEntryCents: PRICES[group][3] }],
        bundlePriceCents: PRICES[group][2],
      })),
      bundles: [{
        id: newId('bundle'),
        name: 'Berkeley Omnium package + podium nomination',
        raceIds: [rr.id, crit.id],
        discountCents: 0,
        priceCents: PRICES.standard[2],
        omnium: { code: 'BERKELEY-OMNIUM', label: 'Berkeley Omnium podium' },
      }],
      additionalRaceDiscountCents: 0,
      additionalRaceDiscountMode: 'each_additional_entry',
      // Berkeley Omnium rule (2026 race information): a second criterium race costs $20, flat, on race day too.
      sameRaceExtraEntryCents: PRICES.standard[3],
      // Registration opens March 1, 2027; let the demo take entries before then.
      demoIgnoreWindows: true,
      platformFeeCents: 0,
      platformFeeLabel: 'Platform fee',
      processingFeeBasisPoints: 0,
      processingFeeLabel: 'Processing fee',
      recoveryMinutes: 15,
      refundRules: null,
      refundPolicy: '',
      waiverText: SAMPLE_WAIVER,
      waiverVersion: 'sample-2027.1',
    },
    days: [sat, sun],
    races: [rr, crit],
    displayGroups,
    startGroups,
    categories,
    capacityPools: [],
  };

  // Simulated entries so capacity and the registrations view have something to show. No rider data.
  const entryPlan = [
    { categoryId: find('RR-P12'), count: 48 },
    { categoryId: find('RR-M35-34'), count: 31 },
    { categoryId: find('RR-WL'), count: 22 },
    { categoryId: find('RR-NOV'), count: 26 },
    { categoryId: find('CR-NOV'), count: 52 },
    { categoryId: find('CR-CD'), count: 14 },
    { categoryId: find('CR-E4'), count: 71 },
    { categoryId: find('CR-M35-34'), count: 38 },
    { categoryId: find('CR-M50-34'), count: 19 },
    { categoryId: find('CR-WP123'), count: 33 },
    { categoryId: find('CR-P12'), count: 87 },
  ];
  return { config, entryPlan };
}
