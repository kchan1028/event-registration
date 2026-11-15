import type { Blocker, CheckInResult } from './checkin';

/**
 * Printable race-day fallback roster (product.md section 5). Used when check-in
 * cannot be restored quickly. It carries only what a volunteer needs at the table:
 * no email, phone, emergency contact, license number, or payment amount.
 */

export interface RosterRiderInput {
  orderId: string;
  name: string;
  team: string;
  racingAge: number;
  entries: { code: string; categoryName: string; startTime: string | null }[];
  result: CheckInResult;
  bib: number | null;
  checkedInAt: string | null;
}

export type RosterStatus = 'checked_in' | 'ready' | 'blocked';

export interface RosterRow {
  orderId: string;
  name: string;
  team: string;
  racingAge: number;
  entries: { code: string; categoryName: string; startTime: string | null }[];
  bib: number | null;
  status: RosterStatus;
  blockers: Blocker[];
}

export interface Roster {
  rows: RosterRow[];
  /** Blocked riders, for the exception checklist the registration desk works through. */
  exceptions: RosterRow[];
  counts: { riders: number; checkedIn: number; ready: number; blocked: number };
}

/** Surname sort key: the last word of the display name. Good enough for a paper list; ties fall back to the full name. */
function surnameKey(name: string): string {
  const parts = name.trim().split(/\s+/);
  return `${parts[parts.length - 1] ?? ''} ${name}`.toLocaleLowerCase();
}

export function buildRoster(riders: readonly RosterRiderInput[]): Roster {
  const rows: RosterRow[] = riders
    .map((r) => ({
      orderId: r.orderId,
      name: r.name,
      team: r.team,
      racingAge: r.racingAge,
      entries: [...r.entries].sort((a, b) => (a.startTime ?? '99:99').localeCompare(b.startTime ?? '99:99')),
      bib: r.bib,
      // A blocked rider is listed as blocked even if a check-in exists; paper must never show them as cleared.
      status: (!r.result.ready ? 'blocked' : r.checkedInAt ? 'checked_in' : 'ready') as RosterStatus,
      blockers: r.result.ready ? [] : r.result.blockers,
    }))
    .sort((a, b) => surnameKey(a.name).localeCompare(surnameKey(b.name)));
  const exceptions = rows.filter((r) => r.status === 'blocked');
  return {
    rows,
    exceptions,
    counts: {
      riders: rows.length,
      checkedIn: rows.filter((r) => r.status === 'checked_in').length,
      ready: rows.filter((r) => r.status === 'ready').length,
      blocked: exceptions.length,
    },
  };
}
