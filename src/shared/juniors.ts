import { z } from 'zod';

/** A junior managed by up to two explicitly authorized guardians (src/server/juniors.ts). */
export interface JuniorProfile {
  id: string;
  firstName: string;
  lastName: string;
  /** Email that may view this junior's registrations (the junior's own login), or null. */
  viewerEmail: string | null;
}

/** Private invitation history; only explicit recipient acceptance grants access. */
export interface GuardianInvitation {
  id: string;
  email: string;
  invitedBy: string;
  createdAt: string;
  expiresAt: string;
  cancelledBy: string | null;
  cancelledAt: string | null;
  cancellationReason: 'replaced' | 'cancelled' | 'profile_merged' | 'profile_claimed' | null;
  acceptedBy: string | null;
  acceptedAt: string | null;
  status: 'pending' | 'expired' | 'cancelled' | 'accepted';
}

export interface ReceivedGuardianInvitation {
  id: string;
  firstName: string;
  lastName: string;
  invitedByEmail: string;
  expiresAt: string;
}

/** Placing an order and having current authority to manage it are separate facts. */
export interface RegistrationAccess {
  placedByYou: boolean;
  canManage: boolean;
  canViewParticipantHistory?: true;
}

/** Private relationship history visible only to a current guardian. */
export interface GuardianRelationship {
  id: string;
  accountId: string;
  email: string;
  grantedBy: string | null;
  grantedAt: string;
  revokedBy: string | null;
  revokedAt: string | null;
  removalReason: string | null;
  removalAcknowledgedAt: string | null;
}

/** Shared validation for the guardian removal screen and server. */
export const guardianRemovalSchema = z.object({
  reason: z.string().trim().refine((value) => { const length = Array.from(value).length; return length >= 3 && length <= 300; }, 'Write a reason of 3 to 300 characters for removing guardian access.'),
  acknowledge: z.literal(true),
});

/** Relationship display identity derived from the authenticated account on the server. */
export interface GuardianAccess extends GuardianRelationship {
  isYou: boolean;
}
