import type { Quote } from './pricing';
import { csvField } from './startlist';

/**
 * Organizer exports from the database (product.md data rules: entries and ledger exports
 * come from the database so a successor can take over without manual reconstruction).
 * Contact, emergency, and license-number details are left out until role-based access exists.
 * Payments are simulated, so the ledger records what a real ledger would, marked as simulated.
 */

export interface ExportEntry {
  code: string;
  categoryName: string;
  raceName: string;
  status: string;
  amountPaidCents: number;
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
  entries: ExportEntry[];
}

/** A CSV cell: numbers stay numbers (so negative amounts work); text is guarded against spreadsheet formulas. */
function cell(v: unknown): string {
  return typeof v === 'number' ? String(v) : csvField(v);
}

function toCsv(header: string[], rows: unknown[][]): string {
  return [header.join(','), ...rows.map((r) => r.map(cell).join(','))].join('\r\n') + '\r\n';
}

const money = (cents: number) => Math.round(cents) / 100;

export const ENTRY_COLUMNS = ['order_number', 'rider_id', 'last_name', 'first_name', 'team', 'racing_age', 'license_category', 'category_code', 'category', 'race', 'entry_status', 'order_status', 'amount_paid', 'license_reviewed', 'waiver_signed_by'];

/** One row per entry. Sorted by rider, then race. */
export function entriesCsv(orders: readonly ExportOrder[], riderKey: (orderId: string) => string): string {
  const rows: unknown[][] = [];
  for (const o of orders) {
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
        money(e.amountPaidCents),
        e.licenseReviewed ? 'Y' : 'N',
        o.waiver.signatureName,
      ]);
    }
  }
  rows.sort((a, b) => `${a[2]} ${a[3]} ${a[9]}`.localeCompare(`${b[2]} ${b[3]} ${b[9]}`));
  return toCsv(ENTRY_COLUMNS, rows);
}

export const LEDGER_COLUMNS = ['order_number', 'order_status', 'recorded_at', 'kind', 'description', 'category_code', 'amount', 'note'];

/**
 * Ledger rows for orders where money arrived (confirmed, or arrived late and needs attention):
 * each entry price, its discount, each fee, and an order total that equals the sum of the rows above it.
 * Logged transfer differences and withdrawals follow, marked as not settled.
 */
export function ledgerCsv(orders: readonly ExportOrder[]): string {
  const rows: unknown[][] = [];
  const simulated = 'Simulated payment: no money moved';
  for (const o of orders) {
    if (o.status !== 'confirmed' && o.status !== 'needs_attention') continue;
    const at = o.confirmedAt ?? o.createdAt;
    const note = o.status === 'needs_attention' ? 'Payment arrived after the hold ended; no place confirmed. Refund or place to be resolved by the organizer.' : simulated;
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
            d > 0 ? 'Rider owes this amount; not settled (payments simulated)' : d < 0 ? 'Refund due to the rider; not settled (payments simulated)' : 'No difference',
          ]);
        } else {
          rows.push([o.orderNumber, o.status, c.at, 'withdrawal', `Withdrawn from ${c.fromCategoryName}: ${c.reason}`, e.code, '', `Entry amount paid ${money(c.amountPaidCents).toFixed(2)}; any refund is decided and settled outside the app (payments simulated)`]);
        }
      }
    }
  }
  return toCsv(LEDGER_COLUMNS, rows);
}
