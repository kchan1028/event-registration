import { newId } from '../shared/factory';
import type { GuardianAccess, GuardianInvitation, GuardianRelationship, JuniorProfile, ReceivedGuardianInvitation } from '../shared/juniors';
import { normalizeText } from '../shared/lookup';
import { INVITATION_DAYS } from '../shared/roles';
import type { Account } from './auth';
import type { Db } from './db';
import { HttpError } from './repo';

// SQL fragments take trusted parameter placeholders, never request text. Callers alias profiles as j and orders as o.
export const juniorManagerSql = (account: string) => `(j.merged_into_id IS NULL AND EXISTS (SELECT 1 FROM junior_guardians g WHERE g.junior_profile_id = j.id AND g.account_id = ${account} AND g.revoked_at IS NULL))`;
export const orderManagerSql = (account: string) => `(CASE WHEN o.junior_profile_id IS NULL THEN o.account_id = ${account} ELSE (${juniorManagerSql(account)} OR (j.merged_into_id IS NULL AND EXISTS (SELECT 1 FROM junior_profile_claims c WHERE c.junior_profile_id = j.id AND c.rider_account_id = ${account}))) END)`;
export const juniorViewerSql = (email: string) => `(j.merged_into_id IS NULL AND j.viewer_email = ${email} AND NOT EXISTS (SELECT 1 FROM junior_profile_claims c WHERE c.junior_profile_id = j.id))`;

/** The tab preserves the first/last name boundary after normalization. */
const nameKey = (firstName: string, lastName: string) => `${normalizeText(firstName)}\t${normalizeText(lastName)}`;
// Shared profiles can be changed by either guardian across events. Order writers take the event lock first.
export const FAMILY_LOCK = 'junior-access';
type Profile = { id: string; name_key: string; first_name: string; last_name: string; viewer_email: string | null };

export function createJuniors(db: Db, clock: () => Date) {
  const at = () => clock().toISOString();
  async function requireGuardian(accountId: string, profileId: string) {
    const profile = await db.get<Profile>(`SELECT j.id,j.name_key,j.first_name,j.last_name,j.viewer_email FROM junior_profiles j WHERE j.id = $1 AND ${juniorManagerSql('$2')}`, [profileId, accountId]);
    if (!profile) throw new HttpError(404, 'Junior not found.');
    return profile;
  }
  async function guardians(profileId: string) {
    return db.all<{ account_id: string; email: string }>(`SELECT g.account_id,a.email FROM junior_guardians g JOIN accounts a ON a.id = g.account_id WHERE g.junior_profile_id = $1 AND g.revoked_at IS NULL ORDER BY g.account_id`, [profileId]);
  }
  async function relationshipRows(profileId: string): Promise<GuardianRelationship[]> {
    return db.all<GuardianRelationship>(`SELECT g.id,g.account_id AS "accountId",a.email,g.granted_by AS "grantedBy",g.granted_at AS "grantedAt",
      g.revoked_by AS "revokedBy",g.revoked_at AS "revokedAt",g.removal_reason AS "removalReason",g.removal_acknowledged_at AS "removalAcknowledgedAt"
      FROM junior_guardians g JOIN accounts a ON a.id = g.account_id WHERE g.junior_profile_id = $1 ORDER BY g.granted_at,g.id`, [profileId]);
  }
  async function invitationRows(profileId: string): Promise<GuardianInvitation[]> {
    return db.all<GuardianInvitation>(`SELECT id,email,invited_by AS "invitedBy",created_at AS "createdAt",expires_at AS "expiresAt",
      cancelled_by AS "cancelledBy",cancelled_at AS "cancelledAt",cancellation_reason AS "cancellationReason",accepted_by AS "acceptedBy",accepted_at AS "acceptedAt",
      CASE WHEN accepted_at IS NOT NULL THEN 'accepted' WHEN cancelled_at IS NOT NULL THEN 'cancelled' WHEN expires_at <= $2 THEN 'expired' ELSE 'pending' END AS status
      FROM junior_guardian_invitations WHERE junior_profile_id = $1 ORDER BY created_at DESC,id`, [profileId, at()]);
  }
  async function cancelInvitations(profileId: string, by: string, reason: NonNullable<GuardianInvitation['cancellationReason']>, invitationId: string | null) {
    await db.run(`UPDATE junior_guardian_invitations SET cancelled_by = $1,cancelled_at = $2,cancellation_reason = $3
      WHERE junior_profile_id = $4 AND cancelled_at IS NULL AND accepted_at IS NULL AND ($5::text IS NULL OR id = $5)`, [by, at(), reason, profileId, invitationId]);
  }
  /** Rewrite older space-joined keys under the family lock before a name lookup. */
  async function rekey(accountIds: string[]): Promise<void> {
    const old = await db.all<{ id: string; first_name: string; last_name: string }>(`SELECT DISTINCT j.id,j.first_name,j.last_name FROM junior_profiles j JOIN junior_guardians g ON g.junior_profile_id = j.id WHERE j.merged_into_id IS NULL AND g.account_id = ANY($1::text[]) AND g.revoked_at IS NULL AND strpos(j.name_key, E'\\t') = 0`, [accountIds]);
    if (old.length) await db.run(`UPDATE junior_profiles p SET name_key = v.key FROM unnest($1::text[], $2::text[]) AS v(id,key) WHERE p.id = v.id`, [old.map((p) => p.id), old.map((p) => nameKey(p.first_name, p.last_name))]);
  }
  /** Called under the family lock: reuse only an explicitly managed, unmerged profile. */
  async function profileFor(accountId: string, rider: { firstName: string; lastName: string }): Promise<string> {
    const key = nameKey(rider.firstName, rider.lastName);
    const found = await db.all<{ id: string }>(`SELECT j.id FROM junior_profiles j WHERE j.name_key = $1 AND ${juniorManagerSql('$2')} LIMIT 2`, [key, accountId]);
    if (found.length > 1) throw new HttpError(409, 'More than one managed profile has this name. Contact support before registering.');
    if (found.length) return found[0].id;
    const id = newId('jun');
    await db.run(`WITH created AS (
      INSERT INTO junior_profiles(id,created_by_account_id,name_key,first_name,last_name,created_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,created_at
    ) INSERT INTO junior_guardians(id,junior_profile_id,account_id,granted_by,granted_at) SELECT $7,id,$2,$2,created_at FROM created`, [id, accountId, key, rider.firstName, rider.lastName, at(), newId('jgd')]);
    return id;
  }
  /** Link legacy unlinked orders before sharing, so a different household cannot be silently adopted later. */
  async function adopt(accountId: string): Promise<void> {
    await db.transaction(async () => {
      await db.lock(FAMILY_LOCK);
      await rekey([accountId]);
      const orders = await db.all<{ id: string; rider_json: { firstName: string; lastName: string } }>(`SELECT id,rider_json FROM orders WHERE account_id = $1 AND junior_profile_id IS NULL AND jsonb_typeof(rider_json->'guardian') = 'object'`, [accountId]);
      const groups = new Map<string, { rider: { firstName: string; lastName: string }; ids: string[] }>();
      for (const order of orders) {
        const key = nameKey(order.rider_json.firstName, order.rider_json.lastName);
        const group = groups.get(key) ?? { rider: order.rider_json, ids: [] };
        group.ids.push(order.id); groups.set(key, group);
      }
      for (const { rider, ids } of groups.values()) await db.run(`UPDATE orders SET junior_profile_id = $1 WHERE id = ANY($2)`, [await profileFor(accountId, rider), ids]);
    });
  }
  async function list(accountId: string): Promise<JuniorProfile[]> {
    await adopt(accountId);
    return db.all<JuniorProfile>(`SELECT j.id,j.first_name AS "firstName",j.last_name AS "lastName",j.viewer_email AS "viewerEmail" FROM junior_profiles j WHERE ${juniorManagerSql('$1')} ORDER BY j.created_at,j.seq`, [accountId]);
  }

  return {
    adopt,
    list,
    lockProfiles: () => db.lock(FAMILY_LOCK),
    async relationships(account: Account, profileId: string): Promise<GuardianAccess[]> {
      await requireGuardian(account.id, profileId);
      return (await relationshipRows(profileId)).map((relationship) => ({ ...relationship, isYou: relationship.accountId === account.id }));
    },
    async removeGuardian(account: Account, profileId: string, relationshipId: string, reason: string): Promise<GuardianRelationship[]> {
      return db.transaction(async () => {
        await db.lock(FAMILY_LOCK);
        await requireGuardian(account.id, profileId);
        const relationship = (await relationshipRows(profileId)).find((g) => g.id === relationshipId);
        if (!relationship) throw new HttpError(404, 'Guardian relationship not found.');
        if (relationship.accountId === account.id) throw new HttpError(422, 'You can only remove the other guardian.');
        if (relationship.revokedAt) {
          if (relationship.revokedBy !== account.id || relationship.removalReason !== reason) throw new HttpError(409, 'This relationship is already inactive.');
          return relationshipRows(profileId);
        }
        const removedAt = at();
        await db.run(`UPDATE junior_guardians SET revoked_by = $1,revoked_at = $2,removal_reason = $3,removal_acknowledged_at = $2 WHERE id = $4`, [account.id, removedAt, reason, relationshipId]);
        return relationshipRows(profileId);
      });
    },
    async invitations(account: Account, profileId: string): Promise<GuardianInvitation[]> {
      await requireGuardian(account.id, profileId);
      return invitationRows(profileId);
    },
    async receivedInvitations(account: Account): Promise<ReceivedGuardianInvitation[]> {
      return db.all<ReceivedGuardianInvitation>(`SELECT i.id,j.first_name AS "firstName",j.last_name AS "lastName",a.email AS "invitedByEmail",i.expires_at AS "expiresAt"
        FROM junior_guardian_invitations i JOIN junior_profiles j ON j.id = i.junior_profile_id JOIN accounts a ON a.id = i.invited_by
        WHERE i.email = $1 AND i.cancelled_at IS NULL AND i.accepted_at IS NULL AND i.expires_at > $2 AND j.viewer_email IS DISTINCT FROM $1
          AND ${juniorManagerSql('i.invited_by')} ORDER BY i.created_at,i.id`, [account.email.toLowerCase(), at()]);
    },
    async invite(account: Account, profileId: string, email: string): Promise<GuardianInvitation[]> {
      return db.transaction(async () => {
        await db.lock(FAMILY_LOCK);
        const profile = await requireGuardian(account.id, profileId);
        await adopt(account.id);
        const members = await guardians(profileId);
        if (members.length >= 2) throw new HttpError(409, 'This junior already has two guardians.');
        const normalized = email.trim().toLowerCase();
        if (members.some((g) => g.email.toLowerCase() === normalized) || normalized === profile.viewer_email) throw new HttpError(422, 'Use a different guardian email, not an existing guardian’s or the junior’s viewer email.');
        const now = clock();
        const current = await db.get<{ email: string; expires_at: string }>(`SELECT email,expires_at FROM junior_guardian_invitations WHERE junior_profile_id = $1 AND cancelled_at IS NULL AND accepted_at IS NULL`, [profileId]);
        if (current?.email === normalized && current.expires_at > now.toISOString()) return invitationRows(profileId);
        await cancelInvitations(profileId, account.id, 'replaced', null);
        await db.run(`INSERT INTO junior_guardian_invitations(id,junior_profile_id,email,invited_by,created_at,expires_at) VALUES ($1,$2,$3,$4,$5,$6)`, [newId('jinv'), profileId, normalized, account.id, now.toISOString(), new Date(now.getTime() + INVITATION_DAYS * 86_400_000).toISOString()]);
        return invitationRows(profileId);
      });
    },
    async cancelInvitation(account: Account, profileId: string, invitationId: string): Promise<GuardianInvitation[]> {
      return db.transaction(async () => {
        await db.lock(FAMILY_LOCK);
        await requireGuardian(account.id, profileId);
        const invitation = await db.get<{ accepted_at: string | null }>(`SELECT accepted_at FROM junior_guardian_invitations WHERE id = $1 AND junior_profile_id = $2`, [invitationId, profileId]);
        if (!invitation) throw new HttpError(404, 'Guardian invitation not found.');
        if (invitation.accepted_at) throw new HttpError(409, 'This invitation was accepted. Cancelling an invitation cannot remove guardian access.');
        await cancelInvitations(profileId, account.id, 'cancelled', invitationId);
        return invitationRows(profileId);
      });
    },
    async accept(account: Account, invitationId: string): Promise<JuniorProfile[]> {
      return db.transaction(async () => {
        await db.lock(FAMILY_LOCK);
        const invite = await db.get<{ junior_profile_id: string; invited_by: string; expires_at: string; cancelled_at: string | null; accepted_by: string | null; accepted_at: string | null }>(`SELECT junior_profile_id,invited_by,expires_at,cancelled_at,accepted_by,accepted_at FROM junior_guardian_invitations WHERE id = $1 AND email = $2`, [invitationId, account.email.toLowerCase()]);
        if (!invite) throw new HttpError(404, 'Guardian invitation not found.');
        if (invite.accepted_by === account.id && invite.accepted_at) return list(account.id);
        if (invite.cancelled_at || invite.expires_at <= at()) throw new HttpError(409, 'This invitation is no longer open. Ask a current guardian for a new invitation.');
        await adopt(invite.invited_by);
        const profile = await requireGuardian(invite.invited_by, invite.junior_profile_id);
        const members = await guardians(profile.id);
        if (members.length >= 2) throw new HttpError(409, 'This junior already has two guardians.');
        if (profile.viewer_email === account.email.toLowerCase()) throw new HttpError(422, 'The junior’s viewer login cannot accept a guardian role.');
        await adopt(account.id);
        if (await db.get(`SELECT 1 FROM junior_profiles j WHERE j.id <> $1 AND j.name_key = $2 AND ${juniorManagerSql('$3')}`, [profile.id, profile.name_key, account.id])) throw new HttpError(409, 'You already manage another profile with this name. Contact support rather than merging households automatically.');
        const acceptedAt = at();
        await db.run(`INSERT INTO junior_guardians(id,junior_profile_id,account_id,granted_by,granted_at) VALUES ($1,$2,$3,$4,$5)`, [newId('jgd'), profile.id, account.id, invite.invited_by, acceptedAt]);
        await db.run(`UPDATE junior_guardian_invitations SET accepted_by = $1,accepted_at = $2 WHERE id = $3`, [account.id, acceptedAt, invitationId]);
        return list(account.id);
      });
    },
    /** Correct only profiles with identical active guardian sets; retain original access evidence on a soft merge. */
    async renamed(profileId: string, rider: { firstName: string; lastName: string }, by: string): Promise<string> {
      await db.lock(FAMILY_LOCK);
      const sourceGuardians = await guardians(profileId);
      await rekey(sourceGuardians.map((g) => g.account_id));
      const source = await db.get<Profile>(`SELECT id,name_key,first_name,last_name,viewer_email FROM junior_profiles WHERE id = $1 AND merged_into_id IS NULL`, [profileId]);
      if (!source) throw new HttpError(404, 'Junior not found.');
      const key = nameKey(rider.firstName, rider.lastName);
      const candidates = await db.all<Profile>(`SELECT j.id,j.name_key,j.first_name,j.last_name,j.viewer_email FROM junior_profiles j WHERE j.id <> $1 AND j.name_key = $2 AND j.merged_into_id IS NULL AND EXISTS (
        SELECT 1 FROM junior_guardians s JOIN junior_guardians d ON d.account_id = s.account_id WHERE s.junior_profile_id = $1 AND d.junior_profile_id = j.id AND s.revoked_at IS NULL AND d.revoked_at IS NULL) LIMIT 2`, [profileId, key]);
      if (candidates.length > 1) throw new HttpError(409, 'This correction matches more than one managed profile. Contact support.');
      const target = candidates[0];
      if (target) {
        const targetGuardians = await guardians(target.id);
        if (sourceGuardians.map((g) => g.account_id).join() !== targetGuardians.map((g) => g.account_id).join()) throw new HttpError(409, 'These profiles have different guardians. Contact support before merging them.');
        if (source.viewer_email && target.viewer_email && source.viewer_email !== target.viewer_email) throw new HttpError(409, 'These profiles have different junior viewer emails. Resolve that before merging them.');
        await cancelInvitations(profileId, by, 'profile_merged', null);
        await db.run(`UPDATE junior_guardian_invitations SET junior_profile_id = $1 WHERE junior_profile_id = $2`, [target.id, profileId]);
        await db.run(`UPDATE orders SET junior_profile_id = $1 WHERE junior_profile_id = $2`, [target.id, profileId]);
        await db.run(`UPDATE junior_profiles SET viewer_email = COALESCE(viewer_email,$1) WHERE id = $2`, [source.viewer_email, target.id]);
        const mergedAt = at();
        await db.run(`UPDATE junior_guardians SET revoked_by = $1,revoked_at = $2 WHERE junior_profile_id = $3 AND revoked_at IS NULL`, [by, mergedAt, profileId]);
        await db.run(`UPDATE junior_profiles SET merged_into_id = $1,merged_by = $2,merged_at = $3 WHERE id = $4`, [target.id, by, mergedAt, profileId]);
        return target.id;
      }
      await db.run(`UPDATE junior_profiles SET name_key = $1,first_name = $2,last_name = $3 WHERE id = $4`, [key, rider.firstName, rider.lastName, profileId]);
      return profileId;
    },
    async setViewer(guardian: Account, profileId: string, email: string | null): Promise<JuniorProfile[]> {
      return db.transaction(async () => {
        await db.lock(FAMILY_LOCK);
        await requireGuardian(guardian.id, profileId);
        const normalized = email?.trim().toLowerCase() || null;
        if (normalized && (await guardians(profileId)).some((g) => g.email.toLowerCase() === normalized)) throw new HttpError(422, 'Use the junior’s own email. Guardians already see their registrations.');
        await db.run(`UPDATE junior_profiles SET viewer_email = $1 WHERE id = $2`, [normalized, profileId]);
        return list(guardian.id);
      });
    },
  };
}

export type Juniors = ReturnType<typeof createJuniors>;
