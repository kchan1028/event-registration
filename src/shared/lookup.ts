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

export interface Searchable {
  orderNumber: string;
  checkInCode: string | null;
  rider: { firstName: string; lastName: string; email: string; team: string; guardian?: { name: string; email: string } | null };
}

/**
 * True when the query finds this registration by rider name (every word, any order),
 * email, team, order number (with or without the DEMO- prefix), or check-in code
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
  const code = compact(q);
  if (code.length >= 4) {
    const orderNumber = compact(o.orderNumber);
    if (orderNumber.includes(code) || orderNumber.replace(/^DEMO/, '').includes(code)) return true;
    if (o.checkInCode && compact(o.checkInCode).includes(code)) return true;
  }
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
    const before = correctableValue(rider, field);
    if (after === before) continue;
    if (field === 'emergencyContactName') next.emergencyContact.name = after;
    else if (field === 'emergencyContactPhone') next.emergencyContact.phone = after;
    else next[field] = after;
    changes.push({ field, label: CORRECTABLE_FIELDS[field], before, after });
  }
  return { rider: next, changes };
}
