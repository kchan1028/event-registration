import { awaitsLicenseReview } from './checkout';
import type { ExportOrder } from './exports';
import { ACTIVE_REFUND_STATUSES } from './refunds';
import type { WaitlistStatus } from './waitlist';

/**
 * Event summary for organizers (product.md "Reporting"). Built from the same live orders as the
 * entries and ledger exports, so its money lines equal the ledger's rows summed by kind.
 * Payments are simulated or Stripe test mode: no real money moved.
 */

export interface CategoryCount {
  categoryId: string;
  code: string;
  categoryName: string;
  raceName: string;
  /** Paid entries still racing in this category (a transferred entry counts in the category it moved to). */
  entries: number;
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
  entries: { confirmed: number; held: number; withdrawn: number };
  byCategory: CategoryCount[];
  /** Paid entries still racing whose license no organizer has reviewed. */
  licenseReviews: number;
  /** Waitlist entries by current status; an offer whose time ran out counts as expired. */
  waitlist: Record<WaitlistStatus, number>;
  /** Null for a role that may not see the ledger. */
  money: MoneySummary | null;
}

export function eventSummary(orders: readonly ExportOrder[], riderKey: (orderId: string) => string, waitlistStatuses: readonly WaitlistStatus[], withMoney: boolean): EventSummary {
  const riders = new Set<string>();
  const counts = { confirmed: 0, held: 0, paymentFailed: 0, needsAttention: 0 };
  const entries = { confirmed: 0, held: 0, withdrawn: 0 };
  const byCategory = new Map<string, CategoryCount>();
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
      else if (o.status === 'confirmed' && e.status === 'confirmed') {
        entries.confirmed++;
        riders.add(riderKey(o.id));
        const c = byCategory.get(e.categoryId) ?? { categoryId: e.categoryId, code: e.code, categoryName: e.categoryName, raceName: e.raceName, entries: 0 };
        c.entries++;
        byCategory.set(e.categoryId, c);
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
    byCategory: [...byCategory.values()].sort((a, b) => a.raceName.localeCompare(b.raceName) || a.code.localeCompare(b.code)),
    licenseReviews,
    waitlist,
    money: withMoney ? money : null,
  };
}
