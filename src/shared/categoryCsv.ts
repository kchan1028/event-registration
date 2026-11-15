import { writeCsv } from './csv';
import { blankPath, newId } from './factory';
import { COLLEGIATE_DIVISIONS, LICENSE_CATEGORIES, LICENSE_TYPES, type Category, type CollegiateDivision, type EventConfig, type LicenseCategory, type LicenseType } from './schema';
import { validateConfig } from './validation';

/**
 * CSV import and export of category schedules (product.md 1a: "CSV import of
 * category schedules is P0"). Rules: every eligibility rule comes from an
 * explicit column, never from a category label; invalid rows are reported per
 * row; an import only ever adds to the draft, which still has to pass
 * validation and be published by a person. Column reference:
 * docs/csv-category-format.md.
 */

export interface CsvField {
  key: string;
  label: string;
  required: boolean;
  help: string;
  example: string;
}

export const CSV_FIELDS: CsvField[] = [
  { key: 'race', label: 'Race', required: true, help: 'Name of an existing race in this event', example: 'Saturday road race' },
  { key: 'category', label: 'Category name', required: true, help: 'What riders buy', example: 'Masters 35+ Cat 3/4' },
  { key: 'timing_code', label: 'Timing code', required: true, help: 'Short code, unique in the race', example: 'RR-M35-34' },
  { key: 'display_group', label: 'Display group', required: false, help: 'Heading on the schedule; never a limit', example: 'Masters' },
  { key: 'start_group', label: 'Start group', required: true, help: 'Rows with the same start group start together', example: 'Masters 35+ Cat 3/4' },
  { key: 'start_time', label: 'Start time', required: true, help: '24-hour HH:MM', example: '09:30' },
  { key: 'staging_time', label: 'Staging time', required: false, help: '24-hour HH:MM', example: '09:15' },
  { key: 'field_limit', label: 'Start group field limit', required: false, help: 'Whole number, shared by the start group', example: '' },
  { key: 'license_categories', label: 'License categories', required: false, help: 'Explicit list separated by ; using PRO, 1, 2, 3, 4, 5. Blank means any', example: '3;4' },
  { key: 'license_types', label: 'License types', required: false, help: 'annual;one_day. Blank means both', example: '' },
  { key: 'min_age', label: 'Minimum racing age', required: false, help: 'Whole number', example: '35' },
  { key: 'max_age', label: 'Maximum racing age', required: false, help: 'Whole number', example: '' },
  { key: 'competition_class', label: 'Competition class', required: false, help: 'any, women, or men. Blank means any', example: 'any' },
  { key: 'collegiate_divisions', label: 'Collegiate divisions', required: false, help: 'A;B;C;D, or "any". Blank means collegiate is not required', example: '' },
  { key: 'guardian_required', label: 'Guardian required', required: false, help: 'yes or no', example: 'no' },
  { key: 'organizer_review', label: 'Organizer reviews every entry', required: false, help: 'yes or no', example: 'no' },
  { key: 'length_type', label: 'Length type', required: true, help: 'distance, duration, or laps', example: 'distance' },
  { key: 'distance', label: 'Distance', required: false, help: 'Number, for distance races', example: '62.5' },
  { key: 'distance_unit', label: 'Distance unit', required: false, help: 'km or mi (default km)', example: 'km' },
  { key: 'laps', label: 'Laps', required: false, help: 'Whole number', example: '5' },
  { key: 'minutes', label: 'Minutes', required: false, help: 'Whole number, for timed races', example: '' },
  { key: 'plus_laps', label: 'Plus laps', required: false, help: 'Whole number after the time, for timed races', example: '' },
  { key: 'price', label: 'Price (dollars)', required: true, help: 'For example 45 or 45.00; 0 is free', example: '50' },
  { key: 'day_of_surcharge', label: 'Race-day surcharge (dollars)', required: false, help: 'For example 15', example: '15' },
  { key: 'cap', label: 'Category cap', required: false, help: 'Whole number; blank means no cap of its own', example: '60' },
  { key: 'opens_at', label: 'Registration opens', required: false, help: 'YYYY-MM-DD HH:MM in the event time zone', example: '2027-02-01 09:00' },
  { key: 'closes_at', label: 'Registration closes', required: false, help: 'YYYY-MM-DD HH:MM in the event time zone', example: '2027-04-22 20:00' },
  { key: 'classification_code', label: 'Timer classification code', required: false, help: 'Defaults to the timing code', example: '' },
  { key: 'description', label: 'Description for riders', required: false, help: 'Plain text', example: 'Racing age 35+ AND Cat 3 or 4.' },
  { key: 'prize', label: 'Prize text', required: false, help: 'Shown as written', example: '' },
];

const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Match CSV headers to fields by key or label, ignoring case and punctuation. */
export function autoMap(headers: string[]): Record<string, number | null> {
  const map: Record<string, number | null> = {};
  for (const f of CSV_FIELDS) {
    const idx = headers.findIndex((h) => norm(h) === norm(f.key) || norm(h) === norm(f.label));
    map[f.key] = idx >= 0 ? idx : null;
  }
  return map;
}

export interface RowResult {
  line: number; // 1-based line in the file, counting the header as line 1
  name: string;
  errors: string[];
  warnings: string[];
  category: Category | null;
  startGroup: { raceId: string; name: string; startTime: string | null; stagingTime: string | null; fieldLimit: number | null };
  displayGroup: string;
}

export interface ImportPlan {
  rows: RowResult[];
  missingRequired: string[];
  validCount: number;
  errorCount: number;
}

const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const DATETIME = /^(\d{4}-\d{2}-\d{2})[ T]([01]\d|2[0-3]):([0-5]\d)$/;

function listOf<T extends string>(raw: string, allowed: readonly T[], what: string, errors: string[]): T[] {
  if (!raw.trim()) return [];
  const out: T[] = [];
  for (const part of raw.split(/[;|]/).map((p) => p.trim()).filter(Boolean)) {
    const bare = part.replace(/^cat\s*/i, '');
    const v = allowed.find((x) => x.toLowerCase() === bare.toLowerCase()) as T | undefined;
    if (!v) errors.push(`${what}: "${part}" is not one of ${allowed.join(', ')}. List each value explicitly.`);
    else if (!out.includes(v)) out.push(v);
  }
  return out;
}

export function planImport(config: EventConfig, table: string[][], mapping: Record<string, number | null>): ImportPlan {
  const missingRequired = CSV_FIELDS.filter((f) => f.required && (mapping[f.key] === null || mapping[f.key] === undefined)).map((f) => f.label);
  const rows: RowResult[] = [];
  const seenCodes = new Map<string, number>(); // raceId|CODE -> line
  for (const c of config.categories) if (c.status !== 'archived') seenCodes.set(`${c.raceId}|${c.timingCode.trim().toUpperCase()}`, 0);
  const groupTimes = new Map<string, { line: number; start: string | null; staging: string | null; limit: number | null }>();

  table.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const get = (key: string) => {
      const idx = mapping[key];
      return idx === null || idx === undefined ? '' : (cells[idx] ?? '').trim();
    };
    const errors: string[] = [];
    const warnings: string[] = [];
    const int = (key: string, label: string, min = 0): number | null => {
      const v = get(key);
      if (!v) return null;
      const n = Number(v);
      if (!Number.isInteger(n) || n < min) {
        errors.push(`${label}: "${v}" is not a whole number${min > 0 ? ` of at least ${min}` : ''}.`);
        return null;
      }
      return n;
    };
    const money = (key: string, label: string): number | null => {
      const v = get(key).replace(/^\$/, '');
      if (!v) return null;
      if (!/^\d{1,5}(\.\d{1,2})?$/.test(v)) {
        errors.push(`${label}: "${get(key)}" is not an amount like 45 or 45.00.`);
        return null;
      }
      return Math.round(Number(v) * 100);
    };
    const yesNo = (key: string, label: string): boolean => {
      const v = get(key).toLowerCase();
      if (!v || v === 'no' || v === 'n' || v === 'false') return false;
      if (v === 'yes' || v === 'y' || v === 'true') return true;
      errors.push(`${label}: "${get(key)}" should be yes or no.`);
      return false;
    };
    const time = (key: string, label: string): string | null => {
      const v = get(key);
      if (!v) return null;
      const m = v.match(TIME);
      if (!m) {
        errors.push(`${label}: "${v}" is not a 24-hour time like 09:30.`);
        return null;
      }
      return `${m[1].padStart(2, '0')}:${m[2]}`;
    };
    const dateTime = (key: string, label: string): string | null => {
      const v = get(key);
      if (!v) return null;
      const m = v.match(DATETIME);
      if (!m) {
        errors.push(`${label}: "${v}" is not a date and time like 2027-02-01 09:00.`);
        return null;
      }
      return `${m[1]}T${m[2]}:${m[3]}`;
    };

    const name = get('category');
    if (!name) errors.push('Category name is empty.');
    const raceName = get('race');
    const race = config.races.find((r) => norm(r.name) === norm(raceName));
    if (!race) errors.push(raceName ? `Race "${raceName}" does not exist in this event. Add it in Event setup or fix the name.` : 'Race is empty.');
    const code = get('timing_code').toUpperCase();
    if (!code) errors.push('Timing code is empty.');
    else if (race) {
      const key = `${race.id}|${code}`;
      const prev = seenCodes.get(key);
      if (prev !== undefined) errors.push(prev === 0 ? `Timing code ${code} is already used in ${race.name}.` : `Timing code ${code} repeats line ${prev}.`);
      else seenCodes.set(key, line);
    }

    const sgName = get('start_group') || name;
    const startTime = time('start_time', 'Start time');
    if (!get('start_time')) errors.push('Start time is empty.');
    const stagingTime = time('staging_time', 'Staging time');
    const fieldLimit = int('field_limit', 'Field limit', 1);
    if (race && sgName) {
      const gkey = `${race.id}|${norm(sgName)}`;
      const prev = groupTimes.get(gkey);
      if (prev && (prev.start !== startTime || prev.staging !== stagingTime || prev.limit !== fieldLimit)) {
        errors.push(`Start group "${sgName}" has a different start time, staging time, or field limit on line ${prev.line}. Rows in one start group must agree.`);
      } else if (!prev) groupTimes.set(gkey, { line, start: startTime, staging: stagingTime, limit: fieldLimit });
    }

    const licenseCategories = listOf<LicenseCategory>(get('license_categories'), LICENSE_CATEGORIES, 'License categories', errors);
    const licenseTypesRaw = listOf<LicenseType>(get('license_types'), LICENSE_TYPES, 'License types', errors);
    const minAge = int('min_age', 'Minimum racing age');
    const maxAge = int('max_age', 'Maximum racing age');
    const cls = (get('competition_class') || 'any').toLowerCase();
    if (!['any', 'women', 'men'].includes(cls)) errors.push(`Competition class: "${get('competition_class')}" should be any, women, or men.`);
    const collRaw = get('collegiate_divisions');
    const collegiateRequired = collRaw !== '';
    const collegiateDivisions = collRaw.toLowerCase() === 'any' ? [] : listOf<CollegiateDivision>(collRaw.toUpperCase(), COLLEGIATE_DIVISIONS, 'Collegiate divisions', errors);
    if (!get('license_categories') && /(\bcat\b|p\/1|pro\/|\d\/\d)/i.test(name)) {
      warnings.push(`The name "${name}" looks like it implies license categories, but none are listed. Nothing is inferred from the name; add a license_categories value if the field is restricted.`);
    }

    let length: Category['length'] = { kind: 'unset' };
    const lt = get('length_type').toLowerCase();
    const laps = int('laps', 'Laps', 1);
    if (lt === 'distance') {
      const d = Number(get('distance'));
      if (!get('distance') || !(d > 0)) errors.push('Distance races need a distance greater than 0.');
      const unit = (get('distance_unit') || 'km').toLowerCase();
      if (unit !== 'km' && unit !== 'mi') errors.push(`Distance unit: "${get('distance_unit')}" should be km or mi.`);
      length = { kind: 'distance', distance: d > 0 ? d : 1, unit: unit === 'mi' ? 'mi' : 'km', laps, partialFinalLap: false };
    } else if (lt === 'duration') {
      const minutes = int('minutes', 'Minutes', 1);
      if (minutes === null) errors.push('Timed races need minutes.');
      length = { kind: 'duration', minutes: minutes ?? 1, plusLaps: int('plus_laps', 'Plus laps') };
    } else if (lt === 'laps') {
      if (laps === null) errors.push('Lap races need a number of laps.');
      length = { kind: 'laps', laps: laps ?? 1 };
    } else errors.push(lt ? `Length type: "${get('length_type')}" should be distance, duration, or laps.` : 'Length type is empty.');

    const price = money('price', 'Price');
    if (!get('price')) errors.push('Price is empty. Use 0 for a free entry.');

    const category: Category | null = race
      ? {
          id: newId('cat'),
          raceId: race.id,
          name,
          timingCode: code,
          description: get('description'),
          displayGroupId: null,
          sortOrder: 0,
          status: 'active',
          eligibility: {
            paths: [
              {
                ...blankPath(),
                licenseCategories,
                licenseTypes: licenseTypesRaw.length ? licenseTypesRaw : ['annual', 'one_day'],
                minAge,
                maxAge,
                genderClass: (['any', 'women', 'men'].includes(cls) ? cls : 'any') as 'any' | 'women' | 'men',
                collegiateRequired,
                collegiateDivisions,
              },
            ],
            organizerReview: yesNo('organizer_review', 'Organizer review'),
            guardianRequired: yesNo('guardian_required', 'Guardian required'),
          },
          length,
          pricing: { baseCents: price ?? 0, dayOfSurchargeCents: money('day_of_surcharge', 'Race-day surcharge') ?? 0, priceChanges: [] },
          registration: { opensAt: dateTime('opens_at', 'Registration opens'), closesAt: dateTime('closes_at', 'Registration closes') },
          cap: int('cap', 'Category cap', 1),
          startGroupId: null,
          classifications: [{ code: (get('classification_code') || code).toUpperCase(), label: name }],
          dualScoringApproved: false,
          prizeText: get('prize'),
          needsReview: false,
          reviewReason: '',
        }
      : null;

    rows.push({
      line,
      name: name || '(no name)',
      errors,
      warnings,
      category: errors.length ? null : category,
      startGroup: { raceId: race?.id ?? '', name: sgName, startTime, stagingTime, fieldLimit },
      displayGroup: get('display_group'),
    });
  });

  const errorCount = rows.filter((r) => r.errors.length).length;
  return { rows, missingRequired, validCount: rows.length - errorCount, errorCount };
}

/** Add every valid row to the draft. Start groups and display groups are matched by name or created. */
export function applyImport(config: EventConfig, plan: ImportPlan): { config: EventConfig; added: number } {
  const next: EventConfig = structuredClone(config);
  let added = 0;
  for (const row of plan.rows) {
    if (!row.category) continue;
    const cat = structuredClone(row.category);
    let sg = next.startGroups.find((g) => g.raceId === cat.raceId && norm(g.name) === norm(row.startGroup.name));
    if (!sg) {
      sg = { id: newId('sg'), raceId: cat.raceId, name: row.startGroup.name, startTime: row.startGroup.startTime, stagingTime: row.startGroup.stagingTime, fieldLimit: row.startGroup.fieldLimit };
      next.startGroups.push(sg);
    }
    cat.startGroupId = sg.id;
    if (row.displayGroup) {
      let dg = next.displayGroups.find((g) => norm(g.name) === norm(row.displayGroup));
      if (!dg) {
        dg = { id: newId('dg'), name: row.displayGroup, sortOrder: Math.max(-1, ...next.displayGroups.map((g) => g.sortOrder)) + 1 };
        next.displayGroups.push(dg);
      }
      cat.displayGroupId = dg.id;
    }
    const siblings = next.categories.filter((c) => c.raceId === cat.raceId);
    cat.sortOrder = siblings.length ? Math.max(...siblings.map((c) => c.sortOrder)) + 1 : 0;
    next.categories.push(cat);
    added++;
  }
  return { config: next, added };
}

/** Problems the draft would have after the import, so the organizer sees them before saving. */
export function issuesAfterImport(config: EventConfig, plan: ImportPlan) {
  return validateConfig(applyImport(config, plan).config).filter((i) => i.level === 'error');
}

const yn = (b: boolean) => (b ? 'yes' : 'no');
const dollars = (cents: number) => (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));
const localOut = (v: string | null) => (v ? v.replace('T', ' ') : '');

/** Export the schedule in the same format, one row per category, for review or re-import. */
export function exportCategoriesCsv(config: EventConfig): string {
  const rows: (string | number | null)[][] = [CSV_FIELDS.map((f) => f.key)];
  const races = new Map(config.races.map((r) => [r.id, r]));
  const sgs = new Map(config.startGroups.map((g) => [g.id, g]));
  const dgs = new Map(config.displayGroups.map((g) => [g.id, g]));
  const ordered = [...config.categories].filter((c) => c.status !== 'archived').sort((a, b) => config.races.findIndex((r) => r.id === a.raceId) - config.races.findIndex((r) => r.id === b.raceId) || a.sortOrder - b.sortOrder);
  for (const c of ordered) {
    const p = c.eligibility.paths[0] ?? blankPath();
    const sg = c.startGroupId ? sgs.get(c.startGroupId) : undefined;
    const len = c.length;
    const extraPaths = c.eligibility.paths.length > 1 ? ` [Exported only the first of ${c.eligibility.paths.length} eligibility paths; edit others in the app.]` : '';
    const v: Record<string, string | number | null> = {
      race: races.get(c.raceId)?.name ?? '',
      category: c.name,
      timing_code: c.timingCode,
      display_group: c.displayGroupId ? (dgs.get(c.displayGroupId)?.name ?? '') : '',
      start_group: sg?.name ?? '',
      start_time: sg?.startTime ?? '',
      staging_time: sg?.stagingTime ?? '',
      field_limit: sg?.fieldLimit ?? '',
      license_categories: p.licenseCategories.join(';'),
      license_types: p.licenseTypes.length === 2 ? '' : p.licenseTypes.join(';'),
      min_age: p.minAge,
      max_age: p.maxAge,
      competition_class: p.genderClass,
      collegiate_divisions: p.collegiateRequired ? (p.collegiateDivisions.length ? p.collegiateDivisions.join(';') : 'any') : '',
      guardian_required: yn(c.eligibility.guardianRequired),
      organizer_review: yn(c.eligibility.organizerReview),
      length_type: len.kind === 'unset' ? '' : len.kind,
      distance: len.kind === 'distance' ? len.distance : '',
      distance_unit: len.kind === 'distance' ? len.unit : '',
      laps: len.kind === 'distance' ? len.laps : len.kind === 'laps' ? len.laps : '',
      minutes: len.kind === 'duration' ? len.minutes : '',
      plus_laps: len.kind === 'duration' ? len.plusLaps : '',
      price: dollars(c.pricing.baseCents),
      day_of_surcharge: c.pricing.dayOfSurchargeCents ? dollars(c.pricing.dayOfSurchargeCents) : '',
      cap: c.cap,
      opens_at: localOut(c.registration.opensAt),
      closes_at: localOut(c.registration.closesAt),
      classification_code: c.classifications[0]?.code ?? '',
      description: c.description + extraPaths,
      prize: c.prizeText,
    };
    rows.push(CSV_FIELDS.map((f) => v[f.key] ?? ''));
  }
  return writeCsv(rows);
}

/** Header plus one clearly labeled example row. */
export function templateCsv(): string {
  return writeCsv([CSV_FIELDS.map((f) => f.key), CSV_FIELDS.map((f) => (f.key === 'description' ? 'EXAMPLE ROW: replace or delete. ' + f.example : f.example))]);
}
