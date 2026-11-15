import { z } from 'zod';
import { EMAIL_PATTERN, MESSAGES, riderProfileFields } from './checkout';

/**
 * Organizer-managed waitlists (product.md: first release supports organizer-managed
 * waitlists; automated promotion and charging come later).
 *
 * Policy (decided November 14, 2026):
 * - The organizer turns a waitlist on per category. Off by default.
 * - While anyone is waiting or holds an offer, freed places go to the waitlist first:
 *   the category is not sold to the public until the list is empty.
 * - The organizer offers places in order. An offer reserves the place for 24 hours;
 *   the rider registers and pays through a private link, like any other order. An unused offer
 *   expires and the organizer offers the next rider.
 */

export const OFFER_HOURS = 24;

export type WaitlistStatus = 'waiting' | 'offered' | 'expired' | 'accepted' | 'removed';

/** Stored statuses; "expired" is derived from an offer whose time ran out, without a background job. */
export type StoredWaitlistStatus = 'waiting' | 'offered' | 'accepted' | 'removed';

export function effectiveWaitlistStatus(status: StoredWaitlistStatus, offerExpiresAt: string | null, nowIso: string): WaitlistStatus {
  if (status === 'offered' && offerExpiresAt !== null && offerExpiresAt <= nowIso) return 'expired';
  return status;
}

/** A waiting rider or a live offer keeps the category off public sale. */
export function blocksPublicSale(status: WaitlistStatus): boolean {
  return status === 'waiting' || status === 'offered';
}

/** What a rider gives to join a waitlist: enough to check eligibility and for the organizer to make contact. */
export const waitlistJoinSchema = z.object({
  categoryId: z.string().min(1).max(64),
  firstName: z.string().trim().min(1, 'Enter your first name.').max(60),
  lastName: z.string().trim().min(1, 'Enter your last name.').max(60),
  email: z.string().trim().min(1, 'Enter an email so the organizer can offer you a place.').max(120).regex(EMAIL_PATTERN, MESSAGES.emailFormat),
  ...riderProfileFields,
});

export type WaitlistJoin = z.infer<typeof waitlistJoinSchema>;
