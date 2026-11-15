import { newId } from '../shared/factory';
import type { JuniorProfile } from '../shared/juniors';
import { normalizeText } from '../shared/lookup';
import type { Db } from './db';
import { HttpError } from './repo';

/**
 * Guardian access to juniors (product.md "Sign-in and account security"; owner decision,
 * November 15, 2026, from docs/discovery/guardian-accounts.md). A junior is a profile owned by
 * one guardian account, created the first time that guardian registers the junior. The junior
 * has no sign-in of their own unless the guardian names a viewer email: whoever signs in with
 * that email can see the junior's registrations, read-only. Another household sees nothing.
 */

/** The profile key: one profile per guardian and junior name. */
const nameKey = (firstName: string, lastName: string) => `${normalizeText(firstName)} ${normalizeText(lastName)}`;

export function createJuniors(db: Db, clock: () => Date) {
  /** The guardian's profile for this junior, created on first use. Call inside the order's transaction. */
  async function profileFor(guardianAccountId: string, rider: { firstName: string; lastName: string }): Promise<string> {
    const key = nameKey(rider.firstName, rider.lastName);
    await db.run(
      `INSERT INTO junior_profiles (id, guardian_account_id, name_key, first_name, last_name, created_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (guardian_account_id, name_key) DO NOTHING`,
      [newId('jun'), guardianAccountId, key, rider.firstName, rider.lastName, clock().toISOString()],
    );
    const row = await db.get<{ id: string }>(`SELECT id FROM junior_profiles WHERE guardian_account_id = $1 AND name_key = $2`, [guardianAccountId, key]);
    return row!.id;
  }

  async function list(guardianAccountId: string): Promise<JuniorProfile[]> {
    const rows = await db.all<{ id: string; first_name: string; last_name: string; viewer_email: string | null }>(
      `SELECT id, first_name, last_name, viewer_email FROM junior_profiles WHERE guardian_account_id = $1 ORDER BY created_at, seq`,
      [guardianAccountId],
    );
    return rows.map((r) => ({ id: r.id, firstName: r.first_name, lastName: r.last_name, viewerEmail: r.viewer_email }));
  }

  return {
    profileFor,
    list,

    /** Only the junior's guardian may name or clear the viewer email; anyone else gets 404. */
    async setViewer(guardian: { id: string; email: string }, profileId: string, email: string | null): Promise<JuniorProfile[]> {
      if (!(await db.get(`SELECT 1 FROM junior_profiles WHERE id = $1 AND guardian_account_id = $2`, [profileId, guardian.id]))) throw new HttpError(404, 'Junior not found.');
      const normalized = email?.trim().toLowerCase() || null;
      if (normalized && normalized === guardian.email.toLowerCase()) throw new HttpError(422, 'Use the junior’s own email. You already see their registrations.');
      await db.run(`UPDATE junior_profiles SET viewer_email = $1 WHERE id = $2`, [normalized, profileId]);
      return list(guardian.id);
    },

  };
}

export type Juniors = ReturnType<typeof createJuniors>;
