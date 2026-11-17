import { newId } from '../shared/factory';
import type { GuardianInvitation, JuniorProfile } from '../shared/juniors';
import { normalizeText } from '../shared/lookup';
import { INVITATION_DAYS } from '../shared/roles';
import type { Account } from './auth';
import type { Db } from './db';
import { HttpError } from './repo';

/**
 * Guardian access to juniors (product.md "Sign-in and account security"; owner decision,
 * November 15, 2026, from docs/research/guardian-accounts.md). A junior is a profile owned by
 * one guardian account, created the first time that guardian registers the junior (or, for
 * registrations made before profiles existed, the next time the guardian registers or opens
 * their juniors). The junior
 * has no sign-in of their own unless the guardian names a viewer email: whoever signs in with
 * that email can see the junior's registrations, read-only. Another household sees nothing.
 */

/**
 * The profile key: one profile per guardian and junior name. A tab separates the names; normalized
 * names never contain one, so "Ann Marie / Smith" and "Ann / Marie Smith" stay apart.
 */
const nameKey = (firstName: string, lastName: string) => `${normalizeText(firstName)}\t${normalizeText(lastName)}`;

/** Serializes creating, linking, and renaming one guardian's junior profiles across events. */
const guardianLock = (guardianAccountId: string) => `juniors:${guardianAccountId}`;

export function createJuniors(db: Db, clock: () => Date) {
  async function requireGuardian(accountId: string, profileId: string) {
    const profile = await db.get<{ viewer_email: string | null }>(`SELECT viewer_email FROM junior_profiles WHERE id = $1 AND guardian_account_id = $2`, [profileId, accountId]);
    if (!profile) throw new HttpError(404, 'Junior not found.');
    return profile;
  }

  async function invitationRows(profileId: string): Promise<GuardianInvitation[]> {
    return db.all<GuardianInvitation>(`SELECT id,email,invited_by AS "invitedBy",created_at AS "createdAt",expires_at AS "expiresAt",
      cancelled_by AS "cancelledBy",cancelled_at AS "cancelledAt",cancellation_reason AS "cancellationReason",
      CASE WHEN cancelled_at IS NOT NULL THEN 'cancelled' WHEN expires_at <= $2 THEN 'expired' ELSE 'pending' END AS status
      FROM junior_guardian_invitations WHERE junior_profile_id = $1 ORDER BY created_at DESC,id`, [profileId, clock().toISOString()]);
  }

  async function cancelInvitations(profileId: string, by: string, reason: NonNullable<GuardianInvitation['cancellationReason']>, invitationId: string | null) {
    await db.run(`UPDATE junior_guardian_invitations SET cancelled_by = $1,cancelled_at = $2,cancellation_reason = $3
      WHERE junior_profile_id = $4 AND cancelled_at IS NULL AND ($5::text IS NULL OR id = $5)`, [by, clock().toISOString(), reason, profileId, invitationId]);
  }

  /**
   * Profiles saved before the tab-separated key (first and last name joined by a space) get the
   * current key, in one statement. Call under the guardian lock, before any lookup by key.
   */
  async function rekey(guardianAccountId: string): Promise<void> {
    const old = await db.all<{ id: string; first_name: string; last_name: string }>(
      `SELECT id, first_name, last_name FROM junior_profiles WHERE guardian_account_id = $1 AND strpos(name_key, E'\\t') = 0`,
      [guardianAccountId],
    );
    if (old.length === 0) return;
    await db.run(`UPDATE junior_profiles p SET name_key = v.key FROM unnest($1::text[], $2::text[]) AS v(id, key) WHERE p.id = v.id`, [
      old.map((p) => p.id),
      old.map((p) => nameKey(p.first_name, p.last_name)),
    ]);
  }

  /** The guardian's profile for this junior, created on first use. */
  async function profileFor(guardianAccountId: string, rider: { firstName: string; lastName: string }): Promise<string> {
    const key = nameKey(rider.firstName, rider.lastName);
    await db.run(
      `WITH created AS (
        INSERT INTO junior_profiles (id, guardian_account_id, name_key, first_name, last_name, created_at)
        VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (guardian_account_id, name_key) DO NOTHING RETURNING id, created_at
      ) INSERT INTO junior_guardians(id,junior_profile_id,account_id,granted_by,granted_at)
        SELECT $7,id,$2,$2,created_at FROM created`,
      [newId('jun'), guardianAccountId, key, rider.firstName, rider.lastName, clock().toISOString(), newId('jgd')],
    );
    const row = await db.get<{ id: string }>(`SELECT id FROM junior_profiles WHERE guardian_account_id = $1 AND name_key = $2`, [guardianAccountId, key]);
    return row!.id;
  }

  /**
   * Links every junior order this account placed that has no profile yet: one profile per junior
   * name, one update per junior. Covers the order just placed and any placed before profiles existed.
   */
  async function adopt(guardianAccountId: string): Promise<void> {
    await db.transaction(async () => {
      await db.lock(guardianLock(guardianAccountId));
      await rekey(guardianAccountId);
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
    });
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

    async invitations(account: Account, profileId: string): Promise<GuardianInvitation[]> {
      await requireGuardian(account.id, profileId);
      return invitationRows(profileId);
    },

    async invite(account: Account, profileId: string, email: string): Promise<GuardianInvitation[]> {
      return db.transaction(async () => {
        await db.lock(guardianLock(account.id));
        const profile = await requireGuardian(account.id, profileId);
        const normalized = email.trim().toLowerCase();
        if (normalized === account.email.toLowerCase() || normalized === profile.viewer_email) throw new HttpError(422, 'Use a different guardian email, not your own or the junior’s viewer email.');
        const now = clock();
        const current = await db.get<{ email: string; expires_at: string }>(`SELECT email,expires_at FROM junior_guardian_invitations WHERE junior_profile_id = $1 AND cancelled_at IS NULL`, [profileId]);
        if (current?.email === normalized && current.expires_at > now.toISOString()) return invitationRows(profileId);
        await cancelInvitations(profileId, account.id, 'replaced', null);
        await db.run(`INSERT INTO junior_guardian_invitations(id,junior_profile_id,email,invited_by,created_at,expires_at) VALUES ($1,$2,$3,$4,$5,$6)`,
          [newId('jinv'), profileId, normalized, account.id, now.toISOString(), new Date(now.getTime() + INVITATION_DAYS * 86_400_000).toISOString()]);
        return invitationRows(profileId);
      });
    },

    async cancelInvitation(account: Account, profileId: string, invitationId: string): Promise<GuardianInvitation[]> {
      return db.transaction(async () => {
        await db.lock(guardianLock(account.id));
        await requireGuardian(account.id, profileId);
        if (!(await db.get(`SELECT 1 FROM junior_guardian_invitations WHERE id = $1 AND junior_profile_id = $2`, [invitationId, profileId]))) throw new HttpError(404, 'Guardian invitation not found.');
        await cancelInvitations(profileId, account.id, 'cancelled', invitationId);
        return invitationRows(profileId);
      });
    },

    /** Take the guardian's lock inside the caller's transaction, before it changes any of the guardian's junior orders (event lock first, then this). */
    lockGuardian: (guardianAccountId: string) => db.lock(guardianLock(guardianAccountId)),

    /**
     * An organizer corrected a junior's name on one order. The profile takes the corrected name so
     * the next registration finds it. If the guardian already has a profile under that name, the two
     * are the same junior: every order moves to that profile, it keeps its viewer email (or takes
     * this one's), and this profile is removed. Returns the order's profile.
     */
    async renamed(profileId: string, guardianAccountId: string, rider: { firstName: string; lastName: string }, by: string): Promise<string> {
      // Called inside the correction's transaction; the guardian lock keeps a registration at another event from creating the same name meanwhile.
      await db.lock(guardianLock(guardianAccountId));
      await rekey(guardianAccountId);
      const key = nameKey(rider.firstName, rider.lastName);
      const existing = await db.get<{ id: string }>(`SELECT id FROM junior_profiles WHERE guardian_account_id = $1 AND name_key = $2`, [guardianAccountId, key]);
      if (existing && existing.id !== profileId) {
        await cancelInvitations(profileId, by, 'profile_merged', null);
        await db.run(`UPDATE junior_guardian_invitations SET junior_profile_id = $1 WHERE junior_profile_id = $2`, [existing.id, profileId]);
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
      await requireGuardian(guardian.id, profileId);
      const normalized = email?.trim().toLowerCase() || null;
      if (normalized && normalized === guardian.email.toLowerCase()) throw new HttpError(422, 'Use the junior’s own email. You already see their registrations.');
      await db.run(`UPDATE junior_profiles SET viewer_email = $1 WHERE id = $2`, [normalized, profileId]);
      return list(guardian.id);
    },

  };
}

export type Juniors = ReturnType<typeof createJuniors>;
