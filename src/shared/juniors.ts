/** A junior a guardian manages (src/server/juniors.ts). One guardian per junior. */
export interface JuniorProfile {
  id: string;
  firstName: string;
  lastName: string;
  /** Email that may view this junior's registrations (the junior's own login), or null. */
  viewerEmail: string | null;
}

/** Private invitation record; pending never grants access. Acceptance is a separate workflow. */
export interface GuardianInvitation {
  id: string;
  email: string;
  invitedBy: string;
  createdAt: string;
  expiresAt: string;
  cancelledBy: string | null;
  cancelledAt: string | null;
  cancellationReason: 'replaced' | 'cancelled' | 'profile_merged' | null;
  status: 'pending' | 'expired' | 'cancelled';
}
