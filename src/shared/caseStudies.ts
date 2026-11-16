import { buildDemoEvent } from './demo';
import { buildCaseStudySources } from './caseStudySources';
import { eventConfigSchema, type EventConfig } from './schema';

export const CASE_STUDY_ORG_ID = 'org_demo_case_studies_v1';
export const CASE_STUDY_ORG_NAME = 'CycleReg generated case studies';
export const CASE_STUDY_REFERENCE_NOW = '2027-03-15T18:00:00.000Z';

export type CaseStudyKey = 'criterium' | 'road-shared-field' | 'omnium' | 'empty-event' | 'large-event';

export interface CaseStudyScenario {
  key: CaseStudyKey;
  eventId: string;
  title: string;
  purpose: string;
  config: EventConfig;
  entryPlan: Array<{ categoryId: string; count: number; riderRefs: string[] }>;
  publish: boolean;
}
const stableId = (scope: string, kind: string, index: number) => `${scope}_${kind}_${String(index + 1).padStart(3, '0')}`;

/** Replace factory-generated IDs with stable, readable IDs while preserving every relationship. */
function stabilize(source: EventConfig, scope: string): EventConfig {
  const config = structuredClone(source);
  config.event.demoNotice = 'Generated fictional case-study data. Payments, licenses, waivers, people, and contact details are simulated.';
  const maps = new Map<string, string>();
  const mapList = (kind: string, rows: Array<{ id: string }>) => rows.forEach((row, index) => maps.set(row.id, stableId(scope, kind, index)));
  mapList('day', config.days);
  mapList('race', config.races);
  mapList('display', config.displayGroups);
  mapList('start', config.startGroups);
  mapList('category', config.categories);
  mapList('pool', config.capacityPools);
  mapList('bundle', config.registration.bundles);
  config.categories.forEach((category, categoryIndex) =>
    category.eligibility.paths.forEach((path, pathIndex) => maps.set(path.id, `${scope}_path_${categoryIndex + 1}_${pathIndex + 1}`)),
  );
  const mapped = (value: string) => maps.get(value) ?? value;

  config.days.forEach((row) => (row.id = mapped(row.id)));
  config.races.forEach((row) => {
    row.id = mapped(row.id);
    row.dayId = mapped(row.dayId);
  });
  config.displayGroups.forEach((row) => (row.id = mapped(row.id)));
  config.startGroups.forEach((row) => {
    row.id = mapped(row.id);
    row.raceId = mapped(row.raceId);
  });
  config.categories.forEach((row) => {
    row.id = mapped(row.id);
    row.raceId = mapped(row.raceId);
    row.displayGroupId = row.displayGroupId ? mapped(row.displayGroupId) : null;
    row.startGroupId = row.startGroupId ? mapped(row.startGroupId) : null;
    row.eligibility.paths.forEach((path) => (path.id = mapped(path.id)));
  });
  config.capacityPools.forEach((row) => {
    row.id = mapped(row.id);
    row.memberCategoryIds = row.memberCategoryIds.map(mapped);
    row.memberStartGroupIds = row.memberStartGroupIds.map(mapped);
  });
  config.registration.bundles.forEach((row) => {
    row.id = mapped(row.id);
    row.raceIds = row.raceIds.map(mapped);
  });
  return eventConfigSchema.parse(config);
}

function planFor(config: EventConfig, requested: Array<{ timingCode: string; count: number }>, scope: string) {
  return requested.map(({ timingCode, count }) => {
    const category = config.categories.find((row) => row.timingCode === timingCode);
    if (!category) throw new Error(`Case study category ${timingCode} is missing.`);
    return {
      categoryId: category.id,
      count,
      riderRefs: Array.from({ length: count }, (_, index) => `test-rider-${scope}-${timingCode.toLowerCase()}-${String(index + 1).padStart(3, '0')}`),
    };
  });
}

function criterium(): CaseStudyScenario {
  const source = buildCaseStudySources()[0];
  const closed = structuredClone(source.categories[source.categories.length - 1]);
  closed.id = 'source-closed-category';
  closed.name = 'Closed demonstration field';
  closed.timingCode = 'DVC-CLOSED';
  closed.status = 'closed';
  closed.sortOrder += 1;
  closed.classifications = [{ code: 'DVC-CLOSED', label: 'Closed field' }];
  closed.eligibility.paths = closed.eligibility.paths.map((path, index) => ({ ...path, id: `source-closed-path-${index + 1}` }));
  source.categories.push(closed);
  const config = stabilize(source, 'crit');
  const full = config.categories.find((row) => row.name === 'Masters 35+ Cat 3/4')!;
  const nearlyFull = config.categories.find((row) => row.name === 'Women Cat 3/4/5')!;
  return {
    key: 'criterium',
    eventId: 'evt_demo_case_criterium',
    title: 'Single-day criterium',
    purpose: 'Multiple eligibility paths, junior guardian rules, same-day discounts, pricing boundaries, schedule conflicts, and full fields.',
    config,
    entryPlan: [
      { categoryId: full.id, count: full.cap!, riderRefs: Array.from({ length: full.cap! }, (_, i) => `test-rider-crit-full-${String(i + 1).padStart(3, '0')}`) },
      { categoryId: nearlyFull.id, count: Math.max(0, (nearlyFull.cap ?? 2) - 1), riderRefs: Array.from({ length: Math.max(0, (nearlyFull.cap ?? 2) - 1) }, (_, i) => `test-rider-crit-near-${String(i + 1).padStart(3, '0')}`) },
    ],
    publish: true,
  };
}

function roadSharedField(): CaseStudyScenario {
  const source = buildDemoEvent().config;
  const roadDayId = source.days[0].id;
  const roadRaceIds = new Set(source.races.filter((race) => race.dayId === roadDayId).map((race) => race.id));
  source.event.name = 'Demo Sierra Road Race: shared field lab';
  source.event.venue = 'Fictional Sierra Loop, Example County, CA';
  source.days = source.days.filter((day) => day.id === roadDayId);
  source.races = source.races.filter((race) => roadRaceIds.has(race.id));
  source.startGroups = source.startGroups.filter((group) => roadRaceIds.has(group.raceId));
  source.categories = source.categories.filter((category) => roadRaceIds.has(category.raceId));
  const categoryIds = new Set(source.categories.map((category) => category.id));
  const startIds = new Set(source.startGroups.map((group) => group.id));
  source.capacityPools = source.capacityPools
    .map((pool) => ({ ...pool, memberCategoryIds: pool.memberCategoryIds.filter((id) => categoryIds.has(id)), memberStartGroupIds: pool.memberStartGroupIds.filter((id) => startIds.has(id)) }))
    .filter((pool) => pool.memberCategoryIds.length > 0 || pool.memberStartGroupIds.length > 0);
  source.registration.bundles = [];
  const config = stabilize(source, 'road');
  const first = config.categories[0];
  return {
    key: 'road-shared-field',
    eventId: 'evt_demo_case_road',
    title: 'Road race with shared starts',
    purpose: 'Shared start-group and capacity-pool limits, classification tags, closed fields, and atomic final-place reservations.',
    config,
    entryPlan: first ? planFor(config, [{ timingCode: first.timingCode, count: Math.min(3, first.cap ?? 3) }], 'road') : [],
    publish: true,
  };
}

function omnium(): CaseStudyScenario {
  const source = buildCaseStudySources()[1];
  const config = stabilize(source, 'omnium');
  return {
    key: 'omnium',
    eventId: 'evt_demo_case_omnium',
    title: 'Two-day omnium',
    purpose: 'Individual entries, one same-event weekend package, savings, missing package selections, and all-or-none capacity.',
    config,
    entryPlan: [],
    publish: true,
  };
}

function emptyEvent(): CaseStudyScenario {
  const source = buildCaseStudySources()[0];
  source.event.name = 'Demo Empty Event';
  source.event.venue = '';
  source.categories = [];
  source.startGroups = [];
  source.displayGroups = [];
  source.capacityPools = [];
  source.registration.bundles = [];
  return {
    key: 'empty-event',
    eventId: 'evt_demo_case_empty',
    title: 'Empty draft event',
    purpose: 'Organizer empty states and first-category setup without pretending an empty event is rider-ready.',
    config: stabilize(source, 'empty'),
    entryPlan: [],
    publish: false,
  };
}

function largeEvent(): CaseStudyScenario {
  const source = buildCaseStudySources()[0];
  source.event.name = 'Demo Grand Prix with an intentionally long but valid event name for layout and performance review';
  source.event.venue = 'Velódromo de Prueba José Example, 123 Long Demonstration Boulevard, Sample City, CA';
  source.races[0].name = 'Large field criterium';
  const base = source.categories[0];
  source.startGroups = source.startGroups.filter((group) => group.id === base.startGroupId);
  source.categories = Array.from({ length: 120 }, (_, index) => ({
    ...structuredClone(base),
    id: `source-large-category-${index + 1}`,
    name: index === 0 ? 'Élite women, novice riders, collegiate riders, and open field with a deliberately long category name' : `Open demonstration field ${String(index + 1).padStart(3, '0')}`,
    timingCode: `LG${String(index + 1).padStart(3, '0')}`,
    classifications: [{ code: `LG${String(index + 1).padStart(3, '0')}`, label: `Field ${String(index + 1).padStart(3, '0')}` }],
    sortOrder: index,
    cap: 250,
    eligibility: { ...structuredClone(base.eligibility), paths: base.eligibility.paths.map((path, pathIndex) => ({ ...path, id: `source-large-path-${index + 1}-${pathIndex + 1}` })) },
  }));
  source.capacityPools = [];
  source.registration.bundles = [];
  const config = stabilize(source, 'large');
  const entryPlan = config.categories.slice(0, 100).map((category, index) => ({
    categoryId: category.id,
    count: 10,
    riderRefs: Array.from({ length: 10 }, (_, rider) => `test-rider-large-${String(index + 1).padStart(3, '0')}-${String(rider + 1).padStart(2, '0')}`),
  }));
  return {
    key: 'large-event',
    eventId: 'evt_demo_case_large',
    title: 'Large event and text extremes',
    purpose: 'One hundred twenty categories, one thousand simulated entries, long labels, accented characters, and missing optional venue data in a separate empty case.',
    config: eventConfigSchema.parse(config),
    entryPlan,
    publish: true,
  };
}

export function buildCaseStudyScenarios(): CaseStudyScenario[] {
  return [criterium(), roadSharedField(), omnium(), emptyEvent(), largeEvent()];
}
