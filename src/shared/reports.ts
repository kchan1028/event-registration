import { awaitsLicenseReview } from './checkout';
import type { ExportEntry, ExportOrder } from './exports';
import { ACTIVE_REFUND_STATUSES } from './refunds';
import type { WaitlistStatus } from './waitlist';

/**
 * Event summary for organizers (product.md "Reporting"). Built from the same live orders as the
 * entries and ledger exports, so its money lines equal the ledger's rows summed by kind.
 * Day and race counts use the entry's current category, not the quote line.
 * Payments are simulated or Stripe test mode: no real money moved.
 */

export interface CategoryCount {
  categoryId: string;
  code: string;
  categoryName: string;
  raceName: string;
  /** Paid entries still racing in this category (a transferred entry counts in the category it moved to). */
  entries: number;
  /** Distinct riders with a paid entry in this category. Orders linked as the same rider count once. */
  riders: number;
  /** Orders with at least one paid entry in this category. */
  orders: number;
}

/**
 * Paid entries still racing, grouped by the entry's current day or race.
 * A blank name is a day or race that is no longer in the published configuration.
 * These counts do not split money.
 */
export interface GroupCount {
  id: string;
  name: string;
  entries: number;
  riders: number;
  orders: number;
}

/** Sums over orders where money arrived (confirmed or needs attention), as in the ledger. */
export interface MoneySummary {
  entryPriceCents: number;
  discountCents: number;
  feeCents: number;
  /** Order totals: entry prices less discounts plus fees. */
  receivedCents: number;
  /** Active refunds of order money (asked for, on the way, or done). */
  refundedCents: number;
  /** Active refunds of a second, duplicate charge. They return extra money, not order money. */
  duplicateChargeRefundedCents: number;
  /** Received less refunded. */
  netCents: number;
  /** Payment arrived but no place was confirmed; included in the sums above. */
  needsAttention: { orders: number; cents: number };
}

export interface EventSummary {
  /** Distinct riders with a paid entry still racing. Orders linked as the same rider count once. */
  riders: number;
  orders: { confirmed: number; held: number; paymentFailed: number; needsAttention: number };
  entries: { confirmed: number; held: number; withdrawn: number; cancelled: number };
  byCategory: CategoryCount[];
  /** Paid entries by the current category's day, in published day order. */
  byDay: GroupCount[];
  /** Paid entries by the current category's race. Same-named races on different days stay separate. */
  byRace: GroupCount[];
  /** Paid entries still racing whose license no organizer has reviewed. */
  licenseReviews: number;
  /** Waitlist entries by current status; an offer whose time ran out counts as expired. */
  waitlist: Record<WaitlistStatus, number>;
  /** Null for a role that may not see the ledger. */
  money: MoneySummary | null;
}

type SummaryEntry = ExportEntry & { dayId?: string; dayName?: string; dayIndex?: number; raceId?: string };
type SummaryOrder = Omit<ExportOrder, 'entries'> & { entries: readonly SummaryEntry[] };

interface Tally {
  id: string;
  name: string;
  entries: number;
  riders: Set<string>;
  orders: Set<string>;
  sort: number;
  tie: string;
}

interface CategoryTally {
  categoryId: string;
  code: string;
  categoryName: string;
  raceName: string;
  entries: number;
  riders: Set<string>;
  orders: Set<string>;
}

function addGroup(map: Map<string, Tally>, key: string, seed: Pick<Tally, 'id' | 'name' | 'sort' | 'tie'>, rider: string, orderId: string) {
  const row = map.get(key) ?? { ...seed, entries: 0, riders: new Set<string>(), orders: new Set<string>() };
  if (seed.sort < row.sort) row.sort = seed.sort;
  row.entries++;
  row.riders.add(rider);
  row.orders.add(orderId);
  map.set(key, row);
}

function groups(map: Map<string, Tally>): GroupCount[] {
  return [...map.values()]
    .sort((a, b) => a.sort - b.sort || a.tie.localeCompare(b.tie) || a.id.localeCompare(b.id))
    .map(({ id, name, entries, riders, orders }) => ({ id, name, entries, riders: riders.size, orders: orders.size }));
}

export function eventSummary(orders: readonly SummaryOrder[], riderKey: (orderId: string) => string, waitlistStatuses: readonly WaitlistStatus[], withMoney: boolean): EventSummary {
  const riders = new Set<string>();
  const counts = { confirmed: 0, held: 0, paymentFailed: 0, needsAttention: 0 };
  const entries = { confirmed: 0, held: 0, withdrawn: 0, cancelled: 0 };
  const byCategory = new Map<string, CategoryTally>();
  const byDay = new Map<string, Tally>();
  const byRace = new Map<string, Tally>();
  let licenseReviews = 0;
  const waitlist: Record<WaitlistStatus, number> = { waiting: 0, offered: 0, expired: 0, accepted: 0, removed: 0 };
  for (const w of waitlistStatuses) waitlist[w]++;
  const money: MoneySummary = { entryPriceCents: 0, discountCents: 0, feeCents: 0, receivedCents: 0, refundedCents: 0, duplicateChargeRefundedCents: 0, netCents: 0, needsAttention: { orders: 0, cents: 0 } };

  for (const o of orders) {
    if (o.status === 'confirmed') counts.confirmed++;
    else if (o.status === 'held') counts.held++;
    else if (o.status === 'payment_failed') counts.paymentFailed++;
    else if (o.status === 'needs_attention') counts.needsAttention++;

    for (const e of o.entries) {
      if (awaitsLicenseReview(o.status, e)) licenseReviews++;
      if (e.status === 'withdrawn') entries.withdrawn++;
      else if (e.status === 'cancelled') entries.cancelled++;
      else if (o.status === 'confirmed' && e.status === 'confirmed') {
        entries.confirmed++;
        const rider = riderKey(o.id);
        riders.add(rider);
        const c = byCategory.get(e.categoryId) ?? { categoryId: e.categoryId, code: e.code, categoryName: e.categoryName, raceName: e.raceName, entries: 0, riders: new Set<string>(), orders: new Set<string>() };
        c.entries++;
        c.riders.add(rider);
        c.orders.add(o.id);
        byCategory.set(e.categoryId, c);
        const dayId = e.dayId ?? '';
        const dayName = e.dayName ?? '';
        const dayIndex = e.dayIndex ?? Number.MAX_SAFE_INTEGER;
        addGroup(byDay, dayId || `name:${dayName}`, { id: dayId || `name:${dayName}`, name: dayName, sort: dayIndex, tie: dayName }, rider, o.id);
        const raceId = e.raceId ?? '';
        addGroup(byRace, raceId || `name:${e.raceName}`, { id: raceId || `name:${e.raceName}`, name: e.raceName, sort: dayIndex, tie: e.raceName }, rider, o.id);
      } else if (e.status === 'held') entries.held++;
    }

    if (o.status !== 'confirmed' && o.status !== 'needs_attention') continue;
    for (const l of o.quote.lines) {
      money.entryPriceCents += l.priceCents;
      money.discountCents += l.discountCents;
    }
    for (const f of o.quote.fees) money.feeCents += f.cents;
    money.receivedCents += o.totalCents;
    for (const r of o.refunds) {
      if (!ACTIVE_REFUND_STATUSES.includes(r.status)) continue;
      if (r.duplicateCharge) money.duplicateChargeRefundedCents += r.amountCents;
      else money.refundedCents += r.amountCents;
    }
    if (o.status === 'needs_attention') {
      money.needsAttention.orders++;
      money.needsAttention.cents += o.totalCents;
    }
  }
  money.netCents = money.receivedCents - money.refundedCents;

  return {
    riders: riders.size,
    orders: counts,
    entries,
    byCategory: [...byCategory.values()]
      .sort((a, b) => a.raceName.localeCompare(b.raceName) || a.code.localeCompare(b.code))
      .map(({ riders: riderIds, orders: orderIds, ...c }) => ({ ...c, riders: riderIds.size, orders: orderIds.size })),
    byDay: groups(byDay),
    byRace: groups(byRace),
    licenseReviews,
    waitlist,
    money: withMoney ? money : null,
  };
}
