import { DEFAULT_REGISTRATION_SETTINGS, type Category, type CreateEventInput, type EligibilityPath, type EventConfig, type Race, type Template } from './schema';

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function blankPath(label = ''): EligibilityPath {
  return {
    id: newId('path'),
    label,
    licenseCategories: [],
    licenseTypes: ['annual', 'one_day'],
    minAge: null,
    maxAge: null,
    genderClass: 'any',
    collegiateRequired: false,
    collegiateDivisions: [],
  };
}

const TEMPLATE_RACES: Record<Template, { dayOffset: number; label: string; name: string; discipline: Race['discipline'] }[]> = {
  road_race: [{ dayOffset: 0, label: 'Race day', name: 'Road race', discipline: 'road_race' }],
  criterium: [{ dayOffset: 0, label: 'Race day', name: 'Criterium', discipline: 'criterium' }],
  weekend: [
    { dayOffset: 0, label: 'Saturday', name: 'Saturday road race', discipline: 'road_race' },
    { dayOffset: 1, label: 'Sunday', name: 'Sunday criterium', discipline: 'criterium' },
  ],
};

/** A new draft from a template: days, races, and one display group per race. No categories. */
export function configFromTemplate(input: CreateEventInput): EventConfig {
  const plan = TEMPLATE_RACES[input.template];
  const days = plan.map((p) => ({ id: newId('day'), date: addDays(input.startDate, p.dayOffset), label: p.label }));
  const races = plan.map((p, i) => ({ id: newId('race'), dayId: days[i].id, name: p.name, discipline: p.discipline, course: '' }));
  return {
    schemaVersion: 1,
    event: { name: input.name, timeZone: input.timeZone, venue: input.venue ?? '', isDemo: false, demoNotice: '' },
    ruleSet: { source: '', season: Number(input.startDate.slice(0, 4)) },
    registration: structuredClone(DEFAULT_REGISTRATION_SETTINGS),
    days,
    races,
    displayGroups: races.map((r, i) => ({ id: newId('dg'), name: r.name, sortOrder: i })),
    startGroups: [],
    categories: [],
    capacityPools: [],
  };
}

export function defaultLength(discipline: Race['discipline']): Category['length'] {
  return discipline === 'criterium' ? { kind: 'duration', minutes: 40, plusLaps: null } : { kind: 'unset' };
}

export function newCategory(config: EventConfig, raceId: string): Category {
  const race = config.races.find((r) => r.id === raceId);
  const siblings = config.categories.filter((c) => c.raceId === raceId);
  const dg = config.displayGroups.find((g) => g.name === race?.name) ?? null;
  return {
    id: newId('cat'),
    raceId,
    name: 'New category',
    timingCode: '',
    description: '',
    displayGroupId: dg?.id ?? null,
    sortOrder: siblings.length ? Math.max(...siblings.map((c) => c.sortOrder)) + 1 : 0,
    status: 'active',
    eligibility: { paths: [blankPath()], organizerReview: false, guardianRequired: false },
    length: defaultLength(race?.discipline ?? 'road_race'),
    pricing: { baseCents: 0, dayOfSurchargeCents: 0, priceChanges: [] },
    registration: { opensAt: null, closesAt: null },
    cap: null,
    startGroupId: null,
    classifications: [{ code: '', label: '' }],
    dualScoringApproved: false,
    prizeText: '',
    needsReview: false,
    reviewReason: '',
  };
}

/**
 * Duplicate a category with a new ID. Inherited times, prices, rules, and
 * capacity links are flagged for review (product.md, Setup workflow).
 */
export function duplicateCategory(config: EventConfig, categoryId: string): EventConfig {
  const src = config.categories.find((c) => c.id === categoryId);
  if (!src) return config;
  const copy: Category = structuredClone(src);
  copy.id = newId('cat');
  copy.name = `${src.name} (copy)`;
  copy.timingCode = src.timingCode ? `${src.timingCode}-COPY` : '';
  copy.classifications = src.classifications.map((k) => ({ code: k.code ? `${k.code}-COPY` : '', label: k.label }));
  copy.eligibility.paths = copy.eligibility.paths.map((p) => ({ ...p, id: newId('path') }));
  copy.status = 'active';
  copy.needsReview = true;
  copy.reviewReason = `Copied from "${src.name}". Check the name, timing code, eligibility, price, start group, and capacity before publishing.`;
  copy.sortOrder = src.sortOrder + 1;
  const categories = config.categories.map((c) =>
    c.raceId === src.raceId && c.sortOrder > src.sortOrder ? { ...c, sortOrder: c.sortOrder + 1 } : c,
  );
  const pools = config.capacityPools.map((p) =>
    p.memberCategoryIds.includes(src.id) ? { ...p, memberCategoryIds: [...p.memberCategoryIds, copy.id] } : p,
  );
  return { ...config, categories: [...categories, copy], capacityPools: pools };
}

/** Move a category up or down within its race and display group. */
export function moveCategory(config: EventConfig, categoryId: string, direction: -1 | 1): EventConfig {
  const cat = config.categories.find((c) => c.id === categoryId);
  if (!cat) return config;
  const peers = config.categories
    .filter((c) => c.raceId === cat.raceId && c.displayGroupId === cat.displayGroupId && c.status !== 'archived')
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const i = peers.findIndex((c) => c.id === categoryId);
  const j = i + direction;
  if (j < 0 || j >= peers.length) return config;
  const other = peers[j];
  return {
    ...config,
    categories: config.categories.map((c) => {
      if (c.id === cat.id) return { ...c, sortOrder: other.sortOrder === cat.sortOrder ? cat.sortOrder + direction : other.sortOrder };
      if (c.id === other.id) return { ...c, sortOrder: cat.sortOrder };
      return c;
    }),
  };
}

export function updateCategory(config: EventConfig, categoryId: string, patch: (c: Category) => Category): EventConfig {
  return { ...config, categories: config.categories.map((c) => (c.id === categoryId ? patch(c) : c)) };
}
