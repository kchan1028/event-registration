/**
 * Organizer roles and what each one may do (product.md "Sign-in and account security",
 * "Participant management"). The server enforces these on every organizer route; the
 * browser uses the same table only to hide controls a person cannot use.
 *
 * A person can hold several roles in one organization. Roles never carry across
 * organizations: a role in one club gives no access to another club's events.
 */

export const ROLES = ['owner', 'registration_manager', 'check_in_volunteer', 'timer_export', 'finance'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  registration_manager: 'Registration manager',
  check_in_volunteer: 'Check-in volunteer',
  timer_export: 'Timer and exports',
  finance: 'Finance',
};

export type Permission =
  /** See the event's draft, published versions, and issues. */
  | 'event.view'
  /** Edit the draft, publish, add or clear test entries, load demo riders. */
  | 'event.edit'
  /** See registrations and orders (rider names, categories, payment state). */
  | 'orders.view'
  /** Transfers, withdrawals, license reviews, change resolutions, waitlist offers, rider identity links. */
  | 'entries.manage'
  /** Race-day check-in: look up readiness, check in, assign or change bibs, undo. */
  | 'checkin'
  /** Bib numbering settings. */
  | 'checkin.settings'
  /** Start lists: view, snapshot, lock, and download. */
  | 'startlists'
  /** Entries CSV (no contact or emergency details). */
  | 'export.entries'
  /** Ledger CSV (payments, discounts, fees, refunds). */
  | 'export.ledger'
  /** Refund money to a rider: part or all of an entry, or a payment that confirmed no place. */
  | 'payments.refund'
  /** Add and remove people and roles in the organization. */
  | 'members.manage';

const GRANTS: Record<Role, readonly Permission[]> = {
  owner: ['event.view', 'event.edit', 'orders.view', 'entries.manage', 'checkin', 'checkin.settings', 'startlists', 'export.entries', 'export.ledger', 'members.manage', 'payments.refund'],
  registration_manager: ['event.view', 'event.edit', 'orders.view', 'entries.manage', 'checkin', 'checkin.settings', 'startlists', 'export.entries'],
  check_in_volunteer: ['event.view', 'checkin'],
  timer_export: ['event.view', 'startlists', 'export.entries'],
  finance: ['event.view', 'orders.view', 'export.ledger', 'payments.refund'],
};

export function can(roles: readonly Role[], permission: Permission): boolean {
  return roles.some((r) => GRANTS[r].includes(permission));
}
