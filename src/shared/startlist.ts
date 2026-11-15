/**
 * Start lists and the sample timer export.
 *
 * The column set is a SAMPLE for discussion with the timer and officials, not an
 * agreed format (product.md, section 5). Rows carry stable IDs so a timer can
 * match riders across revisions even when names, teams, or bibs change.
 * No email, phone, guardian, emergency contact, or payment data is exported.
 */

import { writeCsv } from './csv';
import { NO_START_TIME_SORT_KEY } from './format';

export interface StartListRow {
  entryId: string; // stable per entry
  riderId: string; // stable per rider: orders the organizer linked as one rider share it
  raceId: string;
  raceName: string;
  raceDate: string;
  startGroup: string;
  startTime: string | null; // 24-hour "08:05"
  classificationCode: string;
  categoryName: string;
  raceLength: string; // as configured, e.g. "45 min + 3 laps"; never an invented distance or finish time
  bib: number | null;
  firstName: string;
  lastName: string;
  team: string;
  licenseNumber: string;
  racingAge: number;
  competitionClass: string;
  licenseStatus: 'reviewed' | 'needs_review';
  checkedIn: boolean;
}

export const CSV_COLUMNS: { key: keyof StartListRow; header: string }[] = [
  { key: 'raceDate', header: 'race_date' },
  { key: 'raceName', header: 'race' },
  { key: 'startTime', header: 'start_time' },
  { key: 'startGroup', header: 'start_group' },
  { key: 'classificationCode', header: 'category_code' },
  { key: 'categoryName', header: 'category' },
  { key: 'raceLength', header: 'race_length' },
  { key: 'bib', header: 'bib' },
  { key: 'lastName', header: 'last_name' },
  { key: 'firstName', header: 'first_name' },
  { key: 'team', header: 'team' },
  { key: 'licenseNumber', header: 'license_number' },
  { key: 'racingAge', header: 'racing_age' },
  { key: 'competitionClass', header: 'competition_class' },
  { key: 'licenseStatus', header: 'license_status' },
  { key: 'checkedIn', header: 'checked_in' },
  { key: 'entryId', header: 'entry_id' },
  { key: 'riderId', header: 'rider_id' },
];

export function toCsv(rows: StartListRow[]): string {
  return writeCsv([CSV_COLUMNS.map((c) => c.header), ...rows.map((r) => CSV_COLUMNS.map((c) => r[c.key]))]);
}

/** Start order: start time, then category code, then bib (unassigned last), then name. */
export function sortRows(rows: StartListRow[]): StartListRow[] {
  return [...rows].sort(
    (a, b) =>
      (a.startTime ?? NO_START_TIME_SORT_KEY).localeCompare(b.startTime ?? NO_START_TIME_SORT_KEY) ||
      a.classificationCode.localeCompare(b.classificationCode) ||
      (a.bib ?? Number.MAX_SAFE_INTEGER) - (b.bib ?? Number.MAX_SAFE_INTEGER) ||
      a.lastName.localeCompare(b.lastName) ||
      a.firstName.localeCompare(b.firstName),
  );
}

/** Fields whose change matters to a timer between two revisions. */
const TRACKED: (keyof StartListRow)[] = ['bib', 'classificationCode', 'categoryName', 'startGroup', 'startTime', 'firstName', 'lastName', 'team', 'licenseNumber'];

export interface StartListDiff {
  added: StartListRow[];
  removed: StartListRow[]; // withdrawn, cancelled, or moved out of this race
  changed: { before: StartListRow; after: StartListRow; fields: (keyof StartListRow)[] }[];
}

export function diffRows(before: StartListRow[], after: StartListRow[]): StartListDiff {
  const prev = new Map(before.map((r) => [r.entryId, r]));
  const next = new Map(after.map((r) => [r.entryId, r]));
  const added = after.filter((r) => !prev.has(r.entryId));
  const removed = before.filter((r) => !next.has(r.entryId));
  const changed: StartListDiff['changed'] = [];
  for (const r of after) {
    const p = prev.get(r.entryId);
    if (!p) continue;
    const fields = TRACKED.filter((k) => p[k] !== r[k]);
    if (fields.length) changed.push({ before: p, after: r, fields });
  }
  return { added, removed, changed };
}

export const FIELD_LABELS: Partial<Record<keyof StartListRow, string>> = {
  bib: 'bib',
  classificationCode: 'category code',
  categoryName: 'category',
  startGroup: 'start group',
  startTime: 'start time',
  firstName: 'first name',
  lastName: 'last name',
  team: 'team',
  licenseNumber: 'license number',
};
