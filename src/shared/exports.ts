import { writeCsv } from './csv';
import type { Quote } from './pricing';
import { ACTIVE_REFUND_STATUSES, type RefundStatus } from './refunds';

/**
 * Organizer exports from the database (product.md data rules: entries and ledger exports
 * come from the database so a successor can take over without manual reconstruction).
 * Who may download each file is decided by role on the server. Contact, emergency, and
 * license-number details are left out of both files.
 * Payments are simulated or Stripe test mode, so no real money moves. The ledger records
 * what a real ledger would (payments, refunds, transfer differences) and says so on each row.
 */

export interface ExportEntry {
  /** Entry ID, used to match refunds to the entry. */
  id: string;
  categoryId: string;
  code: string;
  categoryName: string;
  raceName: string;
  status: string;
  amountPaidCents: number;
  /** Discount accepted on this entry at purchase. */
  discountCents: number;
  discountReason: string | null;
  licenseReviewed: boolean;
  changes: { kind: 'transfer' | 'withdraw'; fromCategoryName: string; toCategoryName: string | null; amountPaidCents: number; newPriceCents: number | null; differenceCents: number | null; reason: string; at: string }[];
}

export interface ExportOrder {
  id: string;
  orderNumber: string;
  status: string;
  createdAt: string;
  confirmedAt: string | null;
  rider: { firstName: string; lastName: string; team: string; racingAge: number; licenseCategory: string | null };
  waiver: { signatureName: string };
  quote: Quote;
  totalCents: number;
  couponCode: string | null;
  entries: ExportEntry[];
  /** Answers to per-category questions; exported on that category's entry row. */
  answers: { categoryId: string; label: string; answer: string }[];
  /** How the order was paid. Null: no payment recorded. Either way, no real money moved. */
  paidWith: 'simulated' | 'stripe_test' | null;
  /** Refunds, oldest first. */
  refunds: { entryId: string | null; amountCents: number; status: RefundStatus; at: string; duplicateCharge?: boolean }[];
}

/** Amounts are written as numbers, so the CSV writer leaves them unquoted and negative amounts work. */
const money = (cents: number) => Math.round(cents) / 100;

export const ENTRY_COLUMNS = ['order_number', 'rider_id', 'last_name', 'first_name', 'team', 'racing_age', 'license_category', 'category_code', 'category', 'race', 'entry_status', 'order_status', 'amount_paid', 'refunded', 'license_reviewed', 'waiver_signed_by', 'category_answers', 'discount', 'discount_reason', 'coupon_code'];

/**
 * One row per entry. Sorted by rider, then race, unless `keepOrder` is set: then the orders stay in the order given (a
 * Registrations view's row order) and each order's entries are sorted by race.
 * `amount_paid` is 0 until the order is confirmed: a held or unresolved order has not paid for a place.
 * `refunded` is the total of this entry's refunds that were asked for, are on their way, or are done.
 */
export function entriesCsv(orders: readonly ExportOrder[], riderKey: (orderId: string) => string, keepOrder = false): string {
  const rows: unknown[][] = [];
  const position = new Map<unknown, number>();
  for (const [index, o] of orders.entries()) {
    position.set(o.orderNumber, index);
    for (const e of o.entries) {
      rows.push([
        o.orderNumber,
        riderKey(o.id),
        o.rider.lastName,
        o.rider.firstName,
        o.rider.team,
        o.rider.racingAge,
        o.rider.licenseCategory ?? '',
        e.code,
        e.categoryName,
        e.raceName,
        e.status,
        o.status,
        money(o.status === 'confirmed' ? e.amountPaidCents : 0),
        money(o.refunds.filter((r) => r.entryId === e.id && ACTIVE_REFUND_STATUSES.includes(r.status)).reduce((sum, r) => sum + r.amountCents, 0)),
        e.licenseReviewed ? 'Y' : 'N',
        o.waiver.signatureName,
        o.answers
          .filter((a) => a.categoryId === e.categoryId)
          .map((a) => `${a.label}: ${a.answer}`)
          .join('; '),
        money(e.discountCents),
        e.discountCents ? (e.discountReason ?? 'Discount') : '',
        o.couponCode ?? '',
      ]);
    }
  }
  rows.sort(keepOrder
    ? (a, b) => position.get(a[0])! - position.get(b[0])! || String(a[9]).localeCompare(String(b[9]))
    : (a, b) => `${a[2]} ${a[3]} ${a[9]}`.localeCompare(`${b[2]} ${b[3]} ${b[9]}`));
  return writeCsv([ENTRY_COLUMNS, ...rows]);
}

export const LEDGER_COLUMNS = ['order_number', 'order_status', 'recorded_at', 'kind', 'description', 'category_code', 'amount', 'note'];

/**
 * Ledger rows for orders where money arrived (confirmed, or arrived late and needs attention):
 * each entry price, its discount (a coupon discount reads "Coupon CODE"), each fee, and an order total that equals the sum of the rows above it.
 * Logged transfer differences and withdrawals follow, then refunds. A transfer difference is never
 * settled by the transfer itself; money returned to the rider appears only as a refund row.
 */
export function ledgerCsv(orders: readonly ExportOrder[]): string {
  const rows: unknown[][] = [];
  for (const o of orders) {
    if (o.status !== 'confirmed' && o.status !== 'needs_attention') continue;
    const at = o.confirmedAt ?? o.createdAt;
    const how = o.paidWith === 'stripe_test' ? 'Stripe test mode: no real money moved' : 'Simulated payment: no money moved';
    const note = o.status === 'needs_attention' ? 'Payment arrived but no place was confirmed. Refund or place to be resolved by the organizer.' : how;
    for (const l of o.quote.lines) {
      rows.push([o.orderNumber, o.status, at, 'entry', l.name, l.code, money(l.priceCents), note]);
      if (l.discountCents > 0) rows.push([o.orderNumber, o.status, at, 'discount', l.discountReason ?? 'Discount', l.code, money(-l.discountCents), note]);
    }
    for (const f of o.quote.fees) rows.push([o.orderNumber, o.status, at, 'fee', f.label, '', money(f.cents), note]);
    rows.push([o.orderNumber, o.status, at, 'order_total', 'Order total', '', money(o.totalCents), note]);
    for (const e of o.entries) {
      for (const c of e.changes) {
        if (c.kind === 'transfer') {
          const d = c.differenceCents ?? 0;
          rows.push([
            o.orderNumber,
            o.status,
            c.at,
            'transfer_difference',
            `Transferred ${c.fromCategoryName} to ${c.toCategoryName}: ${c.reason}`,
            e.code,
            money(d),
            d > 0 ? `Rider owes this amount; not settled in the app. ${how}` : d < 0 ? `Refund due to the rider; not settled by the transfer. Any refund is a separate refund row. ${how}` : 'No difference',
          ]);
        } else {
          rows.push([o.orderNumber, o.status, c.at, 'withdrawal', `Withdrawn from ${c.fromCategoryName}: ${c.reason}`, e.code, '', `Entry amount paid ${money(c.amountPaidCents).toFixed(2)}; any refund is a separate refund row`]);
        }
      }
    }
    for (const r of o.refunds) {
      const code = r.entryId ? (o.entries.find((e) => e.id === r.entryId)?.code ?? '') : '';
      const counted = ACTIVE_REFUND_STATUSES.includes(r.status);
      rows.push([o.orderNumber, o.status, r.at, 'refund', `${r.duplicateCharge ? 'Refund of duplicate charge' : 'Refund'} (${r.status})`, code, counted ? money(-r.amountCents) : '', counted ? how : `Refund ${r.status}; no money returned`]);
    }
  }
  return writeCsv([LEDGER_COLUMNS, ...rows]);
}
