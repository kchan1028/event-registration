import { z } from 'zod';
import type { ReadinessItem } from './checkout';

/**
 * Race-day check-in rules shared by the server and the check-in screen.
 * A rider is ready only when payment is confirmed AND every readiness item for
 * that day's entries is done. Paying never clears a rider by itself, and an
 * unverified license means "needs review", never "cleared" (coding guide).
 */

/** "weekend": one bib per rider for the whole event. "day": a separate bib range and bib for each race day. */
export const BIB_SCOPES = ['weekend', 'day'] as const;
export type BibScope = (typeof BIB_SCOPES)[number];

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
