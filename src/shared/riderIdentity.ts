/**
 * Rider identity across orders. A rider may buy in several orders; the organizer links
 * them so check-in, bibs, and start lists treat them as one rider. Policy (decided by the
 * project owner, November 14, 2026): the app only suggests likely matches; the organizer
 * confirms each link. Nothing is merged automatically, so two real riders who share a name
 * are never combined by mistake (product.md: flag duplicates without preventing entries).
 */

export interface IdentityOrder {
  id: string;
  createdAt: string;
  firstName: string;
  lastName: string;
  email: string;
  licenseNumber: string;
}

export interface MatchSuggestion {
  a: string;
  b: string;
  reasons: string[];
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const normLicense = (s: string) => s.trim().toUpperCase().replace(/[\s-]/g, '');

/** Stable key for a pair of orders, independent of order. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Likely same-rider pairs: same license number, or same full name and email.
 * Pairs already in one rider (same key) or dismissed by the organizer are skipped.
 */
export function suggestMatches(orders: readonly IdentityOrder[], keyOf: (orderId: string) => string, dismissed: ReadonlySet<string>): MatchSuggestion[] {
  const out: MatchSuggestion[] = [];
  const sorted = [...orders].sort((x, y) => x.createdAt.localeCompare(y.createdAt) || x.id.localeCompare(y.id));
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      if (keyOf(a.id) === keyOf(b.id) || dismissed.has(pairKey(a.id, b.id))) continue;
      const reasons: string[] = [];
      const la = normLicense(a.licenseNumber);
      if (la && la === normLicense(b.licenseNumber)) reasons.push('Same license number');
      const sameName = norm(a.firstName) === norm(b.firstName) && norm(a.lastName) === norm(b.lastName);
      if (sameName && norm(a.email) && norm(a.email) === norm(b.email)) reasons.push('Same name and email');
      if (reasons.length > 0) out.push({ a: a.id, b: b.id, reasons });
    }
  }
  return out;
}
