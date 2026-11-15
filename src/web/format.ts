import { refundableCents, type RefundStatus } from '../shared/refunds';
import type { Category, EventConfig } from '../shared/schema';

/** Time zones an event can be set in. */
export const TIME_ZONES = ['America/Los_Angeles', 'America/Denver', 'America/Phoenix', 'America/Chicago', 'America/New_York', 'America/Anchorage', 'Pacific/Honolulu'];

/** A timestamp as "Mar 1, 2027, 9:00 AM" in the viewer's own time zone. */
export function formatDateTime(at: string | Date): string {
  return new Date(at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

/** "Mar 1" from a stored "YYYY-MM-DD" date. */
export function formatMonthDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/**
 * Categories under their display group headings, in heading order, with ungrouped ones last under `restLabel`.
 * Display groups only arrange the list; they never set a limit.
 */
export function byDisplayGroup(config: EventConfig, cats: Category[], restLabel: string): { id: string | null; name: string; cats: Category[] }[] {
  return [...[...config.displayGroups].sort((a, b) => a.sortOrder - b.sortOrder).map((g) => ({ id: g.id as string | null, name: g.name })), { id: null, name: restLabel }]
    .map((g) => ({ ...g, cats: cats.filter((c) => c.displayGroupId === g.id) }))
    .filter((g) => g.cats.length > 0);
}

/**
 * How much of an amount has been refunded or is on its way back (active refunds only).
 * A refund of a duplicate charge returned a second payment, so it does not reduce what the rider paid for the order.
 */
export function refundedCents(paidCents: number, refunds: readonly { amountCents: number; status: RefundStatus; duplicateCharge?: boolean }[]): number {
  return paidCents - refundableCents(paidCents, refunds.filter((r) => !r.duplicateCharge));
}
