import { describe, expect, it } from 'vitest';
import { applyImport, autoMap, CSV_FIELDS, exportCategoriesCsv, planImport, templateCsv } from '../src/shared/categoryCsv';
import { parseCsv, writeCsv } from '../src/shared/csv';
import { buildDemoEvent } from '../src/shared/demo';
import { configFromTemplate } from '../src/shared/factory';
import { validateConfig } from '../src/shared/validation';

const weekend = () => configFromTemplate({ name: 'Import target', template: 'weekend', startDate: '2027-04-24', timeZone: 'America/Los_Angeles', venue: '' });
const header = CSV_FIELDS.map((f) => f.key);
const row = (v: Partial<Record<string, string>>) =>
  header.map((k) => v[k] ?? ({ race: 'Saturday road race', start_group: v.category ?? 'G', start_time: '09:00', length_type: 'distance', distance: '50', price: '40' } as Record<string, string>)[k] ?? '');

describe('CSV reading and writing', () => {
  it('handles quoted commas, escaped quotes, line breaks inside quotes, CRLF, a BOM, and blank lines', () => {
    const text = '﻿a,b,c\r\n"x, y","say ""hi""","two\nlines"\r\n\r\n1,2,3';
    expect(parseCsv(text)).toEqual([
      ['a', 'b', 'c'],
      ['x, y', 'say "hi"', 'two\nlines'],
      ['1', '2', '3'],
    ]);
  });

  it('writes values that read back unchanged', () => {
    const rows = [['plain', 'comma, here', 'quote "q"', ' padded ', 'line\nbreak', '']];
    expect(parseCsv(writeCsv(rows))).toEqual(rows);
  });

  it('matches columns by key or by label, ignoring case and punctuation', () => {
    const m = autoMap(['Category Name', 'TIMING_CODE', 'race', 'Price (dollars)', 'unrelated']);
    expect(m.category).toBe(0);
    expect(m.timing_code).toBe(1);
    expect(m.race).toBe(2);
    expect(m.price).toBe(3);
    expect(m.cap).toBeNull();
  });

  it('the template has every column and one example row', () => {
    const t = parseCsv(templateCsv());
    expect(t[0]).toEqual(header);
    expect(t).toHaveLength(2);
  });
});

describe('planning an import', () => {
  it('turns valid rows into categories with explicit eligibility, length, price, and windows', () => {
    const c = weekend();
    const plan = planImport(c, [header, row({ category: 'Masters 35+ Cat 3/4', timing_code: 'm35', license_categories: '3;4', min_age: '35', laps: '5', distance: '62.5', price: '45.50', day_of_surcharge: '15', cap: '60', opens_at: '2027-02-01 09:00', closes_at: '2027-04-22T20:00' })], autoMap(header));
    expect(plan.errorCount).toBe(0);
    const cat = plan.rows[0].category!;
    expect(cat.timingCode).toBe('M35');
    expect(cat.eligibility.paths[0].licenseCategories).toEqual(['3', '4']);
    expect(cat.eligibility.paths[0].minAge).toBe(35);
    expect(cat.length).toEqual({ kind: 'distance', distance: 62.5, unit: 'km', laps: 5, partialFinalLap: false });
    expect(cat.pricing).toMatchObject({ baseCents: 4550, dayOfSurchargeCents: 1500 });
    expect(cat.registration).toEqual({ opensAt: '2027-02-01T09:00', closesAt: '2027-04-22T20:00' });
  });

  it('reports every problem on its row and never infers eligibility from a name', () => {
    const c = weekend();
    const plan = planImport(
      c,
      [
        header,
        row({ category: 'Ghost race field', timing_code: 'A', race: 'Monday hill climb' }),
        row({ category: 'Bad time', timing_code: 'B', start_time: '9am' }),
        row({ category: 'Elite P/1/2', timing_code: 'C', license_categories: 'P12' }),
        row({ category: 'Cat 4/5', timing_code: 'D' }),
        row({ category: 'Dupe', timing_code: 'D' }),
        row({ category: 'Shared A', timing_code: 'E', start_group: 'Shared', start_time: '10:00' }),
        row({ category: 'Shared B', timing_code: 'F', start_group: 'Shared', start_time: '10:05' }),
      ],
      autoMap(header),
    );
    const msgs = (i: number) => plan.rows[i].errors.join(' | ');
    expect(msgs(0)).toMatch(/Race "Monday hill climb" does not exist/);
    expect(msgs(1)).toMatch(/not a 24-hour time/);
    expect(msgs(2)).toMatch(/"P12" is not one of PRO, 1, 2, 3, 4, 5/);
    expect(plan.rows[3].errors).toEqual([]);
    expect(plan.rows[3].warnings.join(' ')).toMatch(/Nothing is inferred from the name/);
    expect(plan.rows[3].category!.eligibility.paths[0].licenseCategories).toEqual([]);
    expect(msgs(4)).toMatch(/repeats line 5/);
    expect(msgs(6)).toMatch(/Rows in one start group must agree/);
    expect(plan.validCount).toBe(2);
  });

  it('refuses a timing code that already exists in the race, and lists unmatched required columns', () => {
    const { config } = buildDemoEvent();
    const plan = planImport(config, [header, row({ category: 'Again', timing_code: 'RR-P12' })], autoMap(header));
    expect(plan.rows[0].errors.join(' ')).toMatch(/already used/);
    const noPrice = planImport(weekend(), [['race', 'category'], ['Saturday road race', 'X']], autoMap(['race', 'category']));
    expect(noPrice.missingRequired).toEqual(expect.arrayContaining(['Timing code', 'Start group', 'Start time', 'Length type', 'Price (dollars)']));
  });
});

describe('export and re-import', () => {
  it('round-trips the demonstration weekend into an empty weekend with the same categories and no new errors', () => {
    const { config: demo } = buildDemoEvent();
    const csv = exportCategoriesCsv(demo);
    const table = parseCsv(csv);
    const target = weekend();
    const plan = planImport(target, table, autoMap(table[0]));
    expect(plan.errorCount).toBe(0);
    const { config: imported, added } = applyImport(target, plan);
    expect(added).toBe(demo.categories.length);

    const key = (c: (typeof demo.categories)[number], cfg: typeof demo) => ({
      race: cfg.races.find((r) => r.id === c.raceId)!.name,
      name: c.name,
      code: c.timingCode,
      start: cfg.startGroups.find((g) => g.id === c.startGroupId)!.startTime,
      group: cfg.startGroups.find((g) => g.id === c.startGroupId)!.name,
      limit: cfg.startGroups.find((g) => g.id === c.startGroupId)!.fieldLimit,
      lic: c.eligibility.paths[0].licenseCategories,
      age: [c.eligibility.paths[0].minAge, c.eligibility.paths[0].maxAge],
      cls: c.eligibility.paths[0].genderClass,
      coll: [c.eligibility.paths[0].collegiateRequired, c.eligibility.paths[0].collegiateDivisions],
      guardian: c.eligibility.guardianRequired,
      length: c.length,
      price: c.pricing.baseCents,
      cap: c.cap,
      window: c.registration,
    });
    const sortByCode = <T extends { code: string }>(a: T[]) => [...a].sort((x, y) => x.code.localeCompare(y.code));
    expect(sortByCode(imported.categories.map((c) => key(c, imported)))).toEqual(sortByCode(demo.categories.map((c) => key(c, demo))));
    // Capacity pools and scheduled price changes are not in the CSV format; validation still passes structurally.
    expect(validateConfig(imported).filter((i) => i.level === 'error')).toEqual([]);
  });
});
