import { newId } from '../shared/factory';
import { claimCalendarAge, profileClaimApprovalSchema } from '../shared/profileClaims';
import type { Account } from './auth';
import type { Db } from './db';
import { FAMILY_LOCK } from './juniors';
import { HttpError } from './repo';

export interface ProfileClaimSettings { minimumAge?: number; supportAccountIds: readonly string[] }

export function profileClaimSettingsFromEnv(env: Record<string, string | undefined> = process.env): ProfileClaimSettings {
  return {
    minimumAge: env.PROFILE_CLAIM_MINIMUM_AGE?.trim() ? Number(env.PROFILE_CLAIM_MINIMUM_AGE) : undefined,
    supportAccountIds: env.PROFILE_CLAIM_SUPPORT_ACCOUNT_IDS?.split(',').map((s) => s.trim()).filter(Boolean) ?? [],
  };
}

export function validateProfileClaimSettings(settings: ProfileClaimSettings) {
  if (settings.minimumAge !== undefined && settings.minimumAge !== 18) throw new Error('PROFILE_CLAIM_MINIMUM_AGE must explicitly be 18, or unset to keep claims disabled.');
  if (settings.supportAccountIds.some((id) => !id || id.length > 64 || /\s/.test(id))) throw new Error('Profile-claim support account IDs must be explicit account IDs without whitespace.');
}

type Claim = { id: string; junior_profile_id: string; rider_account_id: string; approved_by: string; client_request_id: string; birth_date: string; time_zone: string; review_reference: string; minimum_age: number; approved_at: string };

export function createProfileClaims(db: Db, clock: () => Date, settings: ProfileClaimSettings) {
  const operators = new Set(settings.supportAccountIds);
  const minimumAge = settings.minimumAge;
  return {
    async approve(actor: Account, profileId: string, body: unknown) {
      if (!operators.has(actor.id)) throw new HttpError(403, 'Only an explicitly configured support operator may approve a profile claim.');
      if (minimumAge !== 18) throw new HttpError(503, 'Profile claims are disabled until the minimum calendar age is explicitly configured.');
      const input = profileClaimApprovalSchema.parse(body);
      // Preserve the reviewed name so an ICU canonical-name change cannot break identical replay.
      const zone = input.timeZone;
      return db.transaction(async () => {
        await db.lock(FAMILY_LOCK);
        const previous = await db.get<Claim>(`SELECT *,birth_date::text AS birth_date FROM junior_profile_claims WHERE client_request_id = $1`, [input.clientRequestId]);
        if (previous) {
          if (previous.junior_profile_id !== profileId || previous.rider_account_id !== input.riderAccountId || previous.birth_date !== input.birthDate || previous.time_zone !== zone || previous.review_reference !== input.reviewReference) throw new HttpError(409, 'This claim request was already used with different details.');
          return { claimId: previous.id, approvedAt: previous.approved_at };
        }
        const profile = await db.get(`SELECT 1 FROM junior_profiles WHERE id = $1 AND merged_into_id IS NULL`, [profileId]);
        if (!profile) throw new HttpError(404, 'Junior profile not found.');
        if (await db.get(`SELECT 1 FROM junior_profile_claims WHERE junior_profile_id = $1`, [profileId])) throw new HttpError(409, 'This profile has already been claimed.');
        if (actor.id === input.riderAccountId) throw new HttpError(422, 'Another support operator must approve your claim.');
        if (!await db.get(`SELECT 1 FROM accounts WHERE id = $1`, [input.riderAccountId])) throw new HttpError(422, 'The rider must sign in before support approves the claim.');
        if (await db.get(`SELECT 1 FROM junior_guardians WHERE junior_profile_id = $1 AND account_id = $2 AND revoked_at IS NULL`, [profileId, input.riderAccountId])) throw new HttpError(422, 'An active guardian cannot claim this profile as the rider.');
        const approved = clock();
        if (claimCalendarAge(input.birthDate, zone, approved).age < minimumAge) throw new HttpError(422, 'The rider has not reached the configured minimum calendar age.');
        const id = newId('clm'); const approvedAt = approved.toISOString();
        await db.run(`INSERT INTO junior_profile_claims(id,junior_profile_id,rider_account_id,approved_by,client_request_id,birth_date,time_zone,review_reference,minimum_age,approved_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [id, profileId, input.riderAccountId, actor.id, input.clientRequestId, input.birthDate, zone, input.reviewReference, minimumAge, approvedAt]);
        await db.run(`UPDATE junior_guardians SET revoked_by = $1,revoked_at = $2 WHERE junior_profile_id = $3 AND revoked_at IS NULL`, [actor.id, approvedAt, profileId]);
        await db.run(`UPDATE junior_guardian_invitations SET cancelled_by = $1,cancelled_at = $2,cancellation_reason = 'profile_claimed' WHERE junior_profile_id = $3 AND accepted_at IS NULL AND cancelled_at IS NULL`, [actor.id, approvedAt, profileId]);
        await db.run(`UPDATE junior_profiles SET viewer_email = NULL WHERE id = $1`, [profileId]);
        return { claimId: id, approvedAt };
      });
    },

    /** Lists approved unmerged claims. It does not choose one or change access. */
    async reviewDuplicates(actor: Account, riderAccountId: string) {
      if (!operators.has(actor.id)) throw new HttpError(403, 'Only an explicitly configured support operator may review duplicate profile claims.');
      if (minimumAge !== 18) throw new HttpError(503, 'Profile claims are disabled until the minimum calendar age is explicitly configured.');
      if (!await db.get(`SELECT 1 FROM accounts WHERE id = $1`, [riderAccountId])) throw new HttpError(404, 'Rider account not found.');
      const claims = await db.all<{ id: string; junior_profile_id: string; approved_at: string }>(
        `SELECT c.id, c.junior_profile_id, c.approved_at
         FROM junior_profile_claims c JOIN junior_profiles j ON j.id = c.junior_profile_id
         WHERE c.rider_account_id = $1 AND j.merged_into_id IS NULL
         ORDER BY c.approved_at, c.id`,
        [riderAccountId],
      );
      return {
        riderAccountId,
        resolutionRequired: claims.length > 1,
        claims: claims.map((claim) => ({
          claimId: claim.id,
          juniorProfileId: claim.junior_profile_id,
          approvedAt: new Date(claim.approved_at).toISOString(),
        })),
      };
    },
  };
}
