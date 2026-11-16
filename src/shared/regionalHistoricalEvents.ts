import { configFromTemplate, newCategory, newId } from './factory';
import { SAMPLE_WAIVER } from './demo';
import type { EventConfig, GenderClass, LicenseCategory, RaceLength } from './schema';

interface HistoricalField {
  name: string;
  time: string;
  length: RaceLength;
  categories: Array<{ name: string; license: LicenseCategory[]; age: number; gender: GenderClass }>;
}

function historicalEvent(name: string, date: string, venue: string, notice: string, source: string): EventConfig {
  const config = configFromTemplate({ name, startDate: date, venue, template: 'road_race', timeZone: 'America/Los_Angeles' });
  config.event.isDemo = true;
  config.event.demoNotice = notice;
  config.ruleSet.source = source;
  config.registration.waiverText = SAMPLE_WAIVER;
  config.registration.waiverVersion = 'regional-historical-demo-v1';
  config.registration.refundPolicy = 'Fictional demonstration only. No money is charged.';
  config.days = [];
  config.races = [];
  config.displayGroups = [];
  return config;
}

function addProgram(config: EventConfig, code: string, date: string, name: string, discipline: 'road_race' | 'criterium', course: string, fields: HistoricalField[]) {
  let day = config.days.find((d) => d.date === date);
  if (!day) {
    day = { id: newId('day'), date, label: date };
    config.days.push(day);
  }
  const race = { id: newId('race'), dayId: day.id, name, discipline, course };
  const display = { id: newId('dg'), name, sortOrder: config.displayGroups.length };
  config.races.push(race);
  config.displayGroups.push(display);
  for (const field of fields) {
    const start = { id: newId('sg'), raceId: race.id, name: field.name, startTime: field.time, stagingTime: null, fieldLimit: 60 };
    config.startGroups.push(start);
    for (const member of field.categories) {
      const category = newCategory(config, race.id);
      category.name = member.name;
      category.timingCode = `${code}-${config.categories.length + 1}`;
      category.classifications = [{ code: category.timingCode, label: category.name }];
      category.displayGroupId = display.id;
      category.startGroupId = start.id;
      category.length = structuredClone(field.length);
      category.pricing.baseCents = 4000;
      category.description = 'Historical setup demo. $40 entry, shared 60-rider limit, annual licenses and adult-only eligibility are test assumptions. Event notice and case study distinguish sourced schedule/length values from synthetic ones. Organizer and license review required.';
      category.eligibility.organizerReview = true;
      category.eligibility.paths[0] = { ...category.eligibility.paths[0], licenseCategories: member.license, licenseTypes: ['annual'], minAge: member.age, genderClass: member.gender };
      config.categories.push(category);
    }
  }
}

const distance = (miles: number): RaceLength => ({ kind: 'distance', distance: miles, unit: 'mi', laps: null, partialFinalLap: false });
const duration = (minutes: number): RaceLength => ({ kind: 'duration', minutes, plusLaps: null });

function wente(): EventConfig {
  const config = historicalEvent('Wente Vineyards Classic Road Race (historical setup sample)', '2018-04-29', 'Livermore, California',
    'Historical 2018 event identity only; full field matrix was not verified. Three synthetic fields use test start times and 60/45/30-mile distances, $40 entries and 60-rider limits. Draft adult annual-license eligibility requires review. No upcoming race or official course is implied. Simulated payments.',
    'BikeReg event 38137 identifies April 29, 2018, Livermore. Field matrix, times, distances, prices, caps and eligibility are test assumptions.');
  addProgram(config, 'WENTE', '2018-04-29', 'Wente Vineyards Classic Road Race', 'road_race', 'Historical Livermore road-race identity; exact course unverified. Distances are test values.', [
    { name: 'Open Cat 3/4 (test field)', time: '09:00', length: distance(60), categories: [{ name: 'Open Cat 3/4 (test field)', license: ['3', '4'], age: 18, gender: 'any' }] },
    { name: 'Women Pro/1/2/3 (test field)', time: '09:10', length: distance(45), categories: [{ name: 'Women Pro/1/2/3 (test field)', license: ['PRO', '1', '2', '3'], age: 18, gender: 'women' }] },
    { name: 'Masters 35+ 3/4 (test field)', time: '09:20', length: distance(30), categories: [{ name: 'Masters 35+ 3/4 (test field)', license: ['3', '4'], age: 35, gender: 'any' }] },
  ]);
  return config;
}

function mountHamilton(): EventConfig {
  const config = historicalEvent('Mount Hamilton Classic Road Race (historical demo)', '2019-05-26', 'San Jose to Livermore, California',
    'Historical 2019 full-course schedule: 9 starts, 14 categories, 63.5 miles. The shorter Race to the Observatory is not included. Test assumptions: $40 entry, shared 60-rider caps and draft adult annual-license eligibility. Organizer/license review required. No upcoming race announced; payments simulated.',
    '2019 OnTheDay Hamilton schedule and San Jose Bicycle Club Hamilton course page. Price, caps and structured eligibility are demo assumptions.');
  const length = distance(63.5);
  addProgram(config, 'MHC', '2019-05-26', 'Mount Hamilton Classic Road Race', 'road_race', 'Historical 63.5-mile point-to-point route via Mt. Hamilton to Mines Road near Livermore; not the shorter Observatory event.', [
    { name: 'Pro/1/2', time: '08:00', length, categories: [{ name: 'Pro/1/2', license: ['PRO', '1', '2'], age: 18, gender: 'any' }] },
    { name: 'Elite 2', time: '08:10', length, categories: [{ name: 'Elite 2', license: ['2'], age: 18, gender: 'any' }] },
    { name: 'Masters 35+ 1/2/3', time: '08:20', length, categories: [{ name: 'Masters 35+ 1/2/3', license: ['1', '2', '3'], age: 35, gender: 'any' }] },
    { name: 'Elite 3', time: '08:30', length, categories: [{ name: 'Elite 3', license: ['3'], age: 18, gender: 'any' }] },
    { name: 'Masters 45+/55+ 1/2/3', time: '08:40', length, categories: [
      { name: 'Masters 45+ 1/2/3', license: ['1', '2', '3'], age: 45, gender: 'any' },
      { name: 'Masters 55+ 1/2/3', license: ['1', '2', '3'], age: 55, gender: 'any' },
    ] },
    { name: 'Women P/1/2, 35+ 1/2/3 and 3', time: '08:50', length, categories: [
      { name: 'Women Pro/1/2', license: ['PRO', '1', '2'], age: 18, gender: 'women' },
      { name: 'Women 35+ 1/2/3', license: ['1', '2', '3'], age: 35, gender: 'women' },
      { name: 'Women Cat 3', license: ['3'], age: 18, gender: 'women' },
    ] },
    { name: 'Masters 35+/45+ Cat 3', time: '09:00', length, categories: [
      { name: 'Masters 35+ Cat 3', license: ['3'], age: 35, gender: 'any' },
      { name: 'Masters 45+ Cat 3', license: ['3'], age: 45, gender: 'any' },
    ] },
    { name: 'Elite 4', time: '09:10', length, categories: [{ name: 'Elite 4', license: ['4'], age: 18, gender: 'any' }] },
    { name: 'Masters 35+/45+ Cat 4', time: '09:20', length, categories: [
      { name: 'Masters 35+ Cat 4', license: ['4'], age: 35, gender: 'any' },
      { name: 'Masters 45+ Cat 4', license: ['4'], age: 45, gender: 'any' },
    ] },
  ]);
  return config;
}

function chico(): EventConfig {
  const config = historicalEvent('Chico Stage Race (historical road/crit sample)', '2018-03-17', 'Paskenta and downtown Chico, California',
    'Limited 2018 sample: only Pro/1 and Women Pro/1/2/3 road-race and criterium components. Circuit race, time trial, other fields, stage progression and GC are not implemented. Component checkout is test-only, not official stage-race admission. $40 entries and 60-rider caps are test values. Eligibility needs review; payments simulated.',
    '2018 Chico technical guide, March 16-18, pages 11 and 17: selected RR/crit times and lengths. This sample excludes TT, circuit and GC.');
  addProgram(config, 'CHICO', '2018-03-17', 'Chico Paskenta road race (selected fields)', 'road_race', 'Selected 2018 Paskenta road-race components; 90-mile total. Not standalone historical admission.', [
    { name: 'Women Pro/1/2/3', time: '08:00', length: distance(90), categories: [{ name: 'Women Pro/1/2/3', license: ['PRO', '1', '2', '3'], age: 18, gender: 'women' }] },
    { name: 'Men Pro/1', time: '09:30', length: distance(90), categories: [{ name: 'Men Pro/1', license: ['PRO', '1'], age: 18, gender: 'men' }] },
  ]);
  addProgram(config, 'CHICO', '2018-03-18', 'Chico downtown criterium (selected fields)', 'criterium', 'Selected 2018 Steve Harrison Memorial Downtown Criterium components; not a complete stage race.', [
    { name: 'Men Pro/1', time: '15:25', length: duration(70), categories: [{ name: 'Men Pro/1', license: ['PRO', '1'], age: 18, gender: 'men' }] },
    { name: 'Women Pro/1/2/3', time: '16:45', length: duration(60), categories: [{ name: 'Women Pro/1/2/3', license: ['PRO', '1', '2', '3'], age: 18, gender: 'women' }] },
  ]);
  return config;
}

function sunset(): EventConfig {
  const config = historicalEvent('San Rafael Sunset Criterium (historical geared sample)', '2017-07-29', 'Downtown San Rafael, California',
    'Historical 2017 geared-race sample: one synthetic amateur field plus Pro Women and Pro Men. Kids ride and fixed-gear program are not included. Test assumptions: $40 entries, 60-rider caps, 40-minute races and draft adult annual-license eligibility. Organizer/license review required. No upcoming event implied; payments simulated.',
    'Marin County Bicycle Coalition announcement, July 20, 2017: July 29 program slots. Field matrix, durations, price, caps and eligibility need review.');
  addProgram(config, 'SUNSET', '2017-07-29', 'San Rafael Sunset Criterium (geared sample)', 'criterium', 'Historical downtown San Rafael criterium. Equipment-specific fixed-gear racing and kids ride are excluded.', [
    { name: 'Amateur open (test field)', time: '13:30', length: duration(40), categories: [{ name: 'Amateur open (test field)', license: ['3', '4', '5'], age: 18, gender: 'any' }] },
    { name: 'Pro Women (simulation)', time: '19:00', length: duration(40), categories: [{ name: 'Pro Women (simulation)', license: ['PRO', '1', '2', '3'], age: 18, gender: 'women' }] },
    { name: 'Pro Men (simulation)', time: '20:15', length: duration(40), categories: [{ name: 'Pro Men (simulation)', license: ['PRO', '1', '2'], age: 18, gender: 'men' }] },
  ]);
  return config;
}

export const regionalHistoricalDemos = [
  { key: 'wente', eventId: 'evt_b03622e39c2c', organizationId: 'org_9213b4ba99b5', organizationName: 'Wente historical setup sample (local demo)', build: wente },
  { key: 'mount-hamilton', eventId: 'evt_166bbfa9ebbd', organizationId: 'org_f8584ef11999', organizationName: 'Mount Hamilton historical case study (local demo)', build: mountHamilton },
  { key: 'chico-stage-race', eventId: 'evt_82e9e8444fa2', organizationId: 'org_38b17a676a0c', organizationName: 'Chico historical road/crit sample (local demo)', build: chico },
  { key: 'sunset-criterium', eventId: 'evt_1dfab6b61ce2', organizationId: 'org_4ce505ab7cec', organizationName: 'Sunset historical geared sample (local demo)', build: sunset },
] as const;
