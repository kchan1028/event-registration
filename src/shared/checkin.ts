import { z } from 'zod';
import { bibNumberSchema } from './schema';
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
    first: bibNumberSchema,
    last: bibNumberSchema,
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
  summary: { riders: number; checkedIn: number; blocked: number; bibsAssigned: number; timing: ReturnType<typeof checkInTiming> };
  riders: (CheckInRider & { checkedInScope: boolean })[];
}

export const MAX_BIB_BATCH_SIZE = 1000;

export const bibBatchSchema = z.object({
  dayId: z.string().min(1).max(64),
  orderIds: z.array(z.string().min(1).max(64)).min(1).max(MAX_BIB_BATCH_SIZE),
  raceId: z.string().min(1).max(64).optional(),
  categoryId: z.string().min(1).max(64).optional(),
  sort: z.enum(['name', 'registration', 'start']).optional(),
});
export type BibBatch = z.infer<typeof bibBatchSchema>;
export const BIB_SORT_LABELS = {
  name: 'Surname, then given name',
  registration: 'Registration time',
  start: 'Category / start order',
} as const;
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
export function bibBatchExclusion(rider: Pick<CheckInRider, 'payment' | 'entries' | 'bib' | 'checkedInAt'>, operation: 'unassigned' | 'reassign'): string | null {
  if (rider.payment !== 'confirmed') return 'Entry not confirmed';
  if (rider.entries.length === 0) return 'No entry on this day';
  if (operation === 'reassign') return rider.bib === null ? 'No existing bib; use Assign bibs' : null;
  if (rider.bib !== null) return 'Already has a bib';
  if (rider.checkedInAt !== null) return 'Already checked in';
  return null;
}

export const automaticBibInputSchema = z.object({ sort: bibBatchSchema.shape.sort.unwrap() });
export type AutomaticBibInput = z.infer<typeof automaticBibInputSchema>;
export interface AutomaticBibJob {
  id: string;
  sort: AutomaticBibInput['sort'];
  configuredBy: string;
  createdAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  lastAttemptAt: string | null;
  message: string | null;
  assigned: number | null;
}


export const bibFingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const bibChangeSchema = z.object({
  dayId: bibBatchSchema.shape.dayId,
  bib: bibNumberSchema,
  reason: z.string().trim().min(3, 'Say why the bib changed.').max(200),
  acknowledgeCheckedIn: z.boolean(),
});
export type BibChange = z.infer<typeof bibChangeSchema>;
const reassignmentScope = bibBatchSchema.pick({ dayId: true, raceId: true, categoryId: true }).extend({ reason: bibChangeSchema.shape.reason, acknowledgeCheckedIn: bibChangeSchema.shape.acknowledgeCheckedIn });
export const bibReassignmentSchema = z.discriminatedUnion('mode', [
  reassignmentScope.extend({ mode: z.literal('manual'), assignments: z.array(z.object({ orderId: bibBatchSchema.shape.orderIds.element, bib: bibNumberSchema })).min(1).max(MAX_BIB_BATCH_SIZE) }),
  reassignmentScope.extend({ mode: z.literal('sequence'), orderIds: bibBatchSchema.shape.orderIds, sort: bibBatchSchema.shape.sort.unwrap() }),
]);
export type BibReassignment = z.infer<typeof bibReassignmentSchema>;
export interface BibReassignmentPlan {
  dayId: string;
  scope: string;
  scopeLabel: string;
  reason: string;
  publishedVersion: number;
  races: { id: string; name: string }[];
  assignments: { orderId: string; name: string; currentBib: number; bib: number; previousAssignmentId: string; range: { first: number; last: number }; checkedInDays: string[] }[];
  fingerprint: string;
}
export interface BibReassignmentResult extends BibReassignmentPlan {
  id: string | null;
  applied: number;
  snapshots: { raceId: string; version: number }[];
}

export function changedBibAssignments(plan: Pick<BibReassignmentPlan, 'assignments'>) {
  return plan.assignments.filter((a) => a.currentBib !== a.bib);
}
