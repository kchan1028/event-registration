import { z } from 'zod';
import type { RiderDetails } from './checkout';

/**
 * Registration lookup and manual corrections (product.md 4, Organizer workspace:
 * "Search by rider ... or order" and "Allow authorized corrections with a reason and an audit trail").
 * The same matching runs in the organizer's browser and on the server.
 */

/** Lower case, accents removed, spaces collapsed. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Letters and digits only, upper case: `demo-ab12` and `AB12` compare equal to the stored forms. */
const compact = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

export const staffReleaseReasonSchema = z.string().trim().refine((reason) => {
  const length = [...reason].length;
  return length >= 3 && length <= 280 && !/[\0\p{Cs}]/u.test(reason);
}, 'Enter a reason of 3 to 280 characters.');

/** Order numbers start with one of these: DEMO- for demo events, CR- for real ones. */
export const ORDER_NUMBER_PREFIXES = ['DEMO-', 'CR-'] as const;

/** A typed code or stored order number without its prefix, so the prefix alone never matches every order. */
function withoutOrderPrefix(compacted: string): string {
  const prefix = ORDER_NUMBER_PREFIXES.map(compact).find((p) => compacted.startsWith(p));
  return prefix ? compacted.slice(prefix.length) : compacted;
}

export interface Searchable {
  orderNumber: string;
  checkInCode: string | null;
  rider: { firstName: string; lastName: string; email: string; team: string; guardian?: { name: string; email: string } | null };
}

/**
 * True when the query finds this registration by rider name (every word, any order),
 * email, team, order number (with or without its DEMO- or CR- prefix), or check-in code
 * (hyphens and case ignored). An empty query matches everything.
 */
export function matchesRegistration(o: Searchable, query: string): boolean {
  const q = normalizeText(query);
  if (!q) return true;
  const r = o.rider;
  const name = normalizeText(`${r.firstName} ${r.lastName} ${r.guardian?.name ?? ''}`);
  if (q.split(' ').every((word) => name.includes(word))) return true;
  if (normalizeText(r.email).includes(q) || (r.guardian?.email && normalizeText(r.guardian.email).includes(q))) return true;
  if (r.team && normalizeText(r.team).includes(q)) return true;
  // Codes: the order-number prefix is dropped from both sides, so "demo" alone does not match every order.
  // A check-in code has no prefix, so it is compared with everything the organizer typed.
  const typed = compact(q);
  const code = withoutOrderPrefix(typed);
  if (code.length >= 4 && withoutOrderPrefix(compact(o.orderNumber)).includes(code)) return true;
  if (typed.length >= 4 && o.checkInCode && compact(o.checkInCode).includes(typed)) return true;
  return false;
}

/**
 * Rider details an organizer may correct. Fields that decide eligibility (racing age,
 * license category and type, competition class, collegiate division) are not here: changing
 * them could make a paid entry ineligible, so that goes through a transfer or a new registration.
 * The waiver signature is a record of what was signed and is never corrected.
 */
export const CORRECTABLE_FIELDS = {
  firstName: 'First name',
  lastName: 'Last name',
  email: 'Email',
  phone: 'Phone',
  team: 'Team',
  licenseNumber: 'License number',
  emergencyContactName: 'Emergency contact name',
  emergencyContactPhone: 'Emergency contact phone',
} as const;
export type CorrectableField = keyof typeof CORRECTABLE_FIELDS;

const text = (max: number) => z.string().trim().max(max);
export const riderCorrectionSchema = z
  .object({
    firstName: text(60),
    lastName: text(60),
    email: text(120),
    phone: text(24),
    team: text(80),
    licenseNumber: text(30),
    emergencyContactName: text(120),
    emergencyContactPhone: text(24),
  })
  .partial()
  .strict();
export type RiderCorrection = z.infer<typeof riderCorrectionSchema>;

export interface FieldChange {
  field: CorrectableField;
  label: string;
  before: string;
  after: string;
}

export function correctableValue(rider: RiderDetails, field: CorrectableField): string {
  if (field === 'emergencyContactName') return rider.emergencyContact.name;
  if (field === 'emergencyContactPhone') return rider.emergencyContact.phone;
  return rider[field] ?? '';
}

/**
 * The corrected rider and the list of fields that actually changed. Unchanged fields are
 * dropped, so a save with nothing new records nothing. The caller validates the result
 * with `riderDetailsSchema` so a correction cannot store details checkout would refuse.
 */
export function applyCorrection(rider: RiderDetails, patch: RiderCorrection): { rider: RiderDetails; changes: FieldChange[] } {
  const next: RiderDetails = { ...rider, emergencyContact: { ...rider.emergencyContact } };
  const changes: FieldChange[] = [];
  for (const field of Object.keys(CORRECTABLE_FIELDS) as CorrectableField[]) {
    const after = patch[field];
    if (after === undefined) continue;
    // Staff cannot see the current contact, so a blank emergency field means "leave it", not "clear it".
    if ((field === 'emergencyContactName' || field === 'emergencyContactPhone') && after === '') continue;
    const before = correctableValue(rider, field);
    if (after === before) continue;
    if (field === 'emergencyContactName') next.emergencyContact.name = after;
    else if (field === 'emergencyContactPhone') next.emergencyContact.phone = after;
    else next[field] = after;
    changes.push({ field, label: CORRECTABLE_FIELDS[field], before, after });
  }
  return { rider: next, changes };
}

/** Same display reference on receipts and finance exports. */
export function formatOrderNumber(orderId: string, isDemo: boolean): string {
  return `${isDemo ? 'DEMO-' : 'CR-'}${orderId.slice(4, 12).toUpperCase()}`;
}
