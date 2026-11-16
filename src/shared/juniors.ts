/** A junior a guardian manages (src/server/juniors.ts). One guardian per junior. */
export interface JuniorProfile {
  id: string;
  firstName: string;
  lastName: string;
  /** Email that may view this junior's registrations (the junior's own login), or null. */
  viewerEmail: string | null;
}
