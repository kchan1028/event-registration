import { z } from 'zod';
import type { Role } from './roles';
import type { ReadinessItem } from './checkout';

/**
 * Race-day check-in rules shared by the server and the check-in screen.
 * A rider is ready only when payment is confirmed AND every readiness item for
 * that day's entries is done. Paying never clears a rider by itself, and an
 * unverified license means "needs review", never "cleared" (coding guide).
 */

/** "weekend": one bib per rider for the whole event. "day": a separate bib range and bib for each race day. */
export const BIB_SCOPES = ['weekend', 'day'] as const;

export const bibRangeSchema = z
  .object({
    scope: z.string().min(1).max(64), // "weekend" or a race day ID
    first: z.number().int().min(1).max(99999),
    last: z.number().int().min(1).max(99999),
  })
  .refine((r) => r.first <= r.last, { message: 'The first bib must not be higher than the last bib.' });
export type BibRange = z.infer<typeof bibRangeSchema>;

export const bibSettingsSchema = z.object({
  scope: z.enum(BIB_SCOPES),
  ranges: z.array(bibRangeSchema).max(7),
});
export type BibSettings = z.infer<typeof bibSettingsSchema>;

export const DEFAULT_BIB_SETTINGS: BibSettings = { scope: 'weekend', ranges: [] };

/** The bib scope key a day uses under the given settings. */
export function bibScopeKey(settings: BibSettings, dayId: string): string {
  return settings.scope === 'weekend' ? 'weekend' : dayId;
}

export function rangeFor(settings: BibSettings, dayId: string): BibRange | null {
  const key = bibScopeKey(settings, dayId);
  return settings.ranges.find((r) => r.scope === key) ?? null;
}

/** Lowest free bib in the range, or null when the range is full. */
export function nextFreeBib(range: BibRange, taken: ReadonlySet<number>): number | null {
  for (let b = range.first; b <= range.last; b++) if (!taken.has(b)) return b;
  return null;
}

export type PaymentState = 'confirmed' | 'not_complete';

export interface Blocker {
  key: 'payment' | 'no_entry' | ReadinessItem['key'];
  label: string;
  /** Who can clear it. Volunteers send riders to the registration desk; they do not override. */
  action: string;
}

export type CheckInResult = { ready: true; blockers: [] } | { ready: false; blockers: Blocker[] };

export function checkInResult(opts: { payment: PaymentState; entriesToday: number; readiness: ReadinessItem[] }): CheckInResult {
  const blockers: Blocker[] = [];
  if (opts.entriesToday === 0) blockers.push({ key: 'no_entry', label: 'No entry on this race day', action: 'Check the day, or send the rider to the registration desk to enter.' });
  if (opts.payment !== 'confirmed') blockers.push({ key: 'payment', label: 'Payment not complete', action: 'Send the rider to the registration desk to finish paying.' });
  for (const item of opts.readiness) {
    if (item.state === 'done') continue;
    if (item.key === 'license') blockers.push({ key: 'license', label: 'License needs review', action: 'Send the rider to the registration desk to have the license checked.' });
    else if (item.key === 'waiver') blockers.push({ key: 'waiver', label: 'Waiver not accepted', action: 'Send the rider to the registration desk to accept the waiver.' });
    else blockers.push({ key: 'guardian', label: 'Guardian has not accepted the waiver', action: 'A parent or guardian must accept the waiver at the registration desk.' });
  }
  return blockers.length === 0 ? { ready: true, blockers: [] } : { ready: false, blockers };
}

/** Merge readiness across a rider's entries for one day: an item is done only when it is done on every entry. */
export function mergeReadiness(lists: ReadinessItem[][]): ReadinessItem[] {
  const out = new Map<ReadinessItem['key'], ReadinessItem>();
  for (const list of lists) {
    for (const item of list) {
      const prev = out.get(item.key);
      if (!prev || (prev.state === 'done' && item.state !== 'done')) out.set(item.key, item);
    }
  }
  return [...out.values()];
}

/** Longest check-in that still counts as one standard check-in; longer ones are left out as interrupted. */
export const MAX_TIMED_CHECK_IN_MS = 10 * 60_000;

/** Median and 95th percentile (nearest rank) of measured check-in times, in whole seconds. */
export function checkInTiming(durationsMs: readonly number[]): { timed: number; medianSeconds: number | null; p95Seconds: number | null } {
  const xs = durationsMs.filter((d) => d > 0 && d <= MAX_TIMED_CHECK_IN_MS).sort((a, b) => a - b);
  if (xs.length === 0) return { timed: 0, medianSeconds: null, p95Seconds: null };
  const rank = (p: number) => xs[Math.min(xs.length - 1, Math.ceil(p * xs.length) - 1)];
  const median = xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2;
  return { timed: xs.length, medianSeconds: Math.round(median / 1000), p95Seconds: Math.round(rank(0.95) / 1000) };
}

export interface CheckInRider {
  orderId: string;
  checkInCode: string | null;
  name: string;
  team: string;
  racingAge: number;
  payment: PaymentState;
  entries: { id: string; categoryId: string; categoryName: string; code: string; raceName: string; startTime: string | null }[];
  readiness: ReadinessItem[];
  result: CheckInResult;
  bib: number | null;
  bibHistory: { bib: number; assignedAt: string; releasedAt: string | null; reason: string | null }[];
  checkedInAt: string | null;
  undoneCheckIns: { checkedInAt: string; undoneAt: string; bib: number | null; bibReleased: boolean; reason: string }[];
}

export interface CheckInList {
  eventId: string;
  eventName: string;
  isDemo: boolean;
  published: boolean;
  days: { id: string; label: string; date: string }[];
  dayId: string;
  settings: BibSettings;
  roles: Role[];
  races: { id: string; name: string }[];
  categories: { id: string; name: string; raceId: string }[];
  summary: { riders: number; checkedIn: number; blocked: number; bibsIssued: number; timing: ReturnType<typeof checkInTiming> };
  riders: CheckInRider[];
}

export const bibBatchSchema = z.object({
  dayId: z.string().min(1).max(64),
  orderIds: z.array(z.string().min(1).max(64)).min(1).max(1000),
  raceId: z.string().min(1).max(64).optional(),
  categoryId: z.string().min(1).max(64).optional(),
  sort: z.enum(['name', 'registration', 'start']).optional(),
});
export type BibBatch = z.infer<typeof bibBatchSchema>;
export interface BibPlan {
  dayId: string;
  raceId: string | null;
  categoryId: string | null;
  sort: NonNullable<BibBatch['sort']>;
  scope: string;
  assignments: { orderId: string; name: string; bib: number; range: { first: number; last: number } }[];
  fingerprint: string;
}

/** Assignment reserves a number; it does not clear or check in a rider. */
export function bibBatchExclusion(rider: Pick<CheckInRider, 'payment' | 'entries' | 'bib' | 'checkedInAt'>): string | null {
  if (rider.bib !== null) return 'Already has a bib';
  if (rider.checkedInAt !== null) return 'Already checked in';
  if (rider.payment !== 'confirmed') return 'Entry not confirmed';
  if (rider.entries.length === 0) return 'No entry on this day';
  return null;
}
