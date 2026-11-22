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
  | 'members.manage'
  /**
   * Look up one registration's emergency contact. Every organizer role has this.
   * It is a separate action: lists, rosters, and exports still omit the contact.
   */
  | 'emergency.view';

const GRANTS: Record<Role, readonly Permission[]> = {
  owner: ['event.view', 'event.edit', 'orders.view', 'entries.manage', 'checkin', 'checkin.settings', 'startlists', 'export.entries', 'export.ledger', 'members.manage', 'payments.refund', 'emergency.view'],
  registration_manager: ['event.view', 'event.edit', 'orders.view', 'entries.manage', 'checkin', 'checkin.settings', 'startlists', 'export.entries', 'emergency.view'],
  check_in_volunteer: ['event.view', 'checkin', 'emergency.view'],
  timer_export: ['event.view', 'startlists', 'export.entries', 'emergency.view'],
  finance: ['event.view', 'orders.view', 'export.ledger', 'payments.refund', 'emergency.view'],
};

export function can(roles: readonly Role[], permission: Permission): boolean {
  return roles.some((r) => GRANTS[r].includes(permission));
}

/** How long an invitation stays open. Adding the same invitation again starts the period over. */
export const INVITATION_DAYS = 14;

/** One entry in an organization's role history (newest first in the team panel). */
export type MembershipAction = 'granted' | 'invited' | 'invitation_renewed' | 'invitation_accepted' | 'invitation_expired' | 'removed' | 'invitation_cancelled' | 'ownership_transferred';

/** An invitation still waiting for that person's first sign-in. */
export interface Invitation {
  email: string;
  role: Role;
  expiresAt: string;
  /** The latest invitation email. `uncertain` means the provider may have accepted it. Null when none was made (seed scripts). */
  lastEmail: { attemptId: string; status: 'recorded' | 'sent' | 'failed' | 'uncertain'; at: string } | null;
}

export interface MembershipChange {
  action: MembershipAction;
  /** The person whose role changed. */
  email: string;
  role: Role;
  /** Who made the change; null when a seed script did. For an accepted or expired invitation, the person who signed in. */
  by: string | null;
  at: string;
}

/** Only the signed-in recipient's expired invitation, without the organization's team list. */
export interface ExpiredInvitationNotice {
  id: string;
  organizationName: string;
  role: Role;
  at: string;
}
