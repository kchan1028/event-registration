import { newId } from '../shared/factory';
import type { JuniorProfile } from '../shared/juniors';
import { normalizeText } from '../shared/lookup';
import type { Db } from './db';
import { HttpError } from './repo';

/**
 * Guardian access to juniors (product.md "Sign-in and account security"; owner decision,
 * November 15, 2026, from docs/discovery/guardian-accounts.md). A junior is a profile owned by
 * one guardian account, created the first time that guardian registers the junior (or, for
 * registrations made before profiles existed, the next time the guardian registers or opens
 * their juniors). The junior
 * has no sign-in of their own unless the guardian names a viewer email: whoever signs in with
 * that email can see the junior's registrations, read-only. Another household sees nothing.
 */

/** The profile key: one profile per guardian and junior name. */
const nameKey = (firstName: string, lastName: string) => `${normalizeText(firstName)} ${normalizeText(lastName)}`;

export function createJuniors(db: Db, clock: () => Date) {
  /** The guardian's profile for this junior, created on first use. */
  async function profileFor(guardianAccountId: string, rider: { firstName: string; lastName: string }): Promise<string> {
    const key = nameKey(rider.firstName, rider.lastName);
    await db.run(
      `INSERT INTO junior_profiles (id, guardian_account_id, name_key, first_name, last_name, created_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (guardian_account_id, name_key) DO NOTHING`,
      [newId('jun'), guardianAccountId, key, rider.firstName, rider.lastName, clock().toISOString()],
    );
    const row = await db.get<{ id: string }>(`SELECT id FROM junior_profiles WHERE guardian_account_id = $1 AND name_key = $2`, [guardianAccountId, key]);
    return row!.id;
  }

  /**
   * Links every junior order this account placed that has no profile yet: one profile per junior
   * name, one update per junior. Covers the order just placed and any placed before profiles existed.
   */
  async function adopt(guardianAccountId: string): Promise<void> {
    const orders = await db.all<{ id: string; rider_json: { firstName: string; lastName: string } }>(
      `SELECT id, rider_json FROM orders WHERE account_id = $1 AND junior_profile_id IS NULL AND jsonb_typeof(rider_json->'guardian') = 'object'`,
      [guardianAccountId],
    );
    const byJunior = new Map<string, { rider: { firstName: string; lastName: string }; ids: string[] }>();
    for (const o of orders) {
      const key = nameKey(o.rider_json.firstName, o.rider_json.lastName);
      byJunior.set(key, { rider: o.rider_json, ids: [...(byJunior.get(key)?.ids ?? []), o.id] });
    }
    for (const { rider, ids } of byJunior.values()) await db.run(`UPDATE orders SET junior_profile_id = $1 WHERE id = ANY($2)`, [await profileFor(guardianAccountId, rider), ids]);
  }

  async function list(guardianAccountId: string): Promise<JuniorProfile[]> {
    await adopt(guardianAccountId);
    const rows = await db.all<{ id: string; first_name: string; last_name: string; viewer_email: string | null }>(
      `SELECT id, first_name, last_name, viewer_email FROM junior_profiles WHERE guardian_account_id = $1 ORDER BY created_at, seq`,
      [guardianAccountId],
    );
    return rows.map((r) => ({ id: r.id, firstName: r.first_name, lastName: r.last_name, viewerEmail: r.viewer_email }));
  }

  return {
    adopt,
    list,

    /**
     * An organizer corrected a junior's name on one order. The profile takes the corrected name so
     * the next registration finds it. If the guardian already has a profile under that name, the two
     * are the same junior: every order moves to that profile, it keeps its viewer email (or takes
     * this one's), and this profile is removed. Returns the order's profile.
     */
    async renamed(profileId: string, guardianAccountId: string, rider: { firstName: string; lastName: string }): Promise<string> {
      const key = nameKey(rider.firstName, rider.lastName);
      const existing = await db.get<{ id: string }>(`SELECT id FROM junior_profiles WHERE guardian_account_id = $1 AND name_key = $2`, [guardianAccountId, key]);
      if (existing && existing.id !== profileId) {
        await db.run(`UPDATE orders SET junior_profile_id = $1 WHERE junior_profile_id = $2`, [existing.id, profileId]);
        await db.run(`UPDATE junior_profiles d SET viewer_email = COALESCE(d.viewer_email, s.viewer_email) FROM junior_profiles s WHERE d.id = $1 AND s.id = $2`, [existing.id, profileId]);
        await db.run(`DELETE FROM junior_profiles WHERE id = $1`, [profileId]);
        return existing.id;
      }
      await db.run(`UPDATE junior_profiles SET name_key = $1, first_name = $2, last_name = $3 WHERE id = $4`, [key, rider.firstName, rider.lastName, profileId]);
      return profileId;
    },

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
