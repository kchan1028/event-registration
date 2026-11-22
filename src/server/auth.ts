import { createClerkClient, verifyToken } from '@clerk/backend';
import type { FastifyRequest } from 'fastify';
import { newId } from '../shared/factory';
import { can, INVITATION_DAYS, ROLE_LABELS, type Invitation, type MembershipAction, type MembershipChange, type Permission, type Role, type ExpiredInvitationNotice } from '../shared/roles';
import type { Db } from './db';
import type { Mailer } from './email';
import { listenHost } from './listen';
import { HttpError } from './repo';
import { juniorViewerSql, orderManagerSql } from './juniors';

/**
 * Sign-in (ADR 0003 as amended: Phase 2 passwordless email sign-in on Clerk's free plan).
 *
 * The identity provider proves who is calling; CycleReg decides what they may do. An
 * `AuthProvider` turns a request into a provider user ID (or null when not signed in).
 * The app uses Clerk session tokens sent as `Authorization: Bearer <token>`. API tests use
 * a fake provider; the browser tests, and local development without Clerk keys, use the
 * local-only test provider below.
 */

export interface SignedIn {
  providerUserId: string;
  /** The verified email, when the provider includes it; otherwise looked up once with `email()`. */
  email?: string;
}

export interface AuthProvider {
  /** Who is calling, or null when the request carries no valid session. Never throws for a bad token. */
  verify(req: FastifyRequest): Promise<SignedIn | null>;
  /** The verified primary email of a provider user (used the first time an account is created). */
  email(providerUserId: string): Promise<string>;
}

export interface Account {
  id: string;
  email: string;
}

function bearer(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

/**
 * Clerk session tokens. `authorizedParties` lists the origins allowed to hold a session
 * (Clerk recommends it against subdomain cookie leaking and CSRF). A session that is still
 * `pending` (sign-up tasks unfinished) counts as signed out. Clerk applies sign-in attempt
 * rate limits and lockout itself.
 */
function clerkAuth(opts: { secretKey: string; authorizedParties?: string[] }): AuthProvider {
  const client = createClerkClient({ secretKey: opts.secretKey });
  return {
    async verify(req) {
      const token = bearer(req);
      if (!token) return null;
      try {
        const claims = await verifyToken(token, { secretKey: opts.secretKey, authorizedParties: opts.authorizedParties });
        if (!claims.sub || (claims as { sts?: string }).sts === 'pending') return null;
        return { providerUserId: claims.sub };
      } catch {
        return null;
      }
    },
    async email(providerUserId) {
      const user = await client.users.getUser(providerUserId);
      const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
      if (!primary || primary.verification?.status !== 'verified') throw new HttpError(403, 'Verify your email address to continue.');
      return primary.emailAddress;
    },
  };
}

const TEST_TOKEN = /^test:([a-z0-9._+-]+@[a-z0-9.-]+\.test)$/;

/**
 * Local development and browser tests only: `Authorization: Bearer test:<name>@<domain>.test`
 * signs in as that fictional address. Only `.test` addresses are accepted, and `authProviderFromEnv`
 * refuses to start it in production or on a network address.
 */
export function testAuth(): AuthProvider {
  return {
    async verify(req) {
      const match = TEST_TOKEN.exec(bearer(req)?.toLowerCase() ?? '');
      return match ? { providerUserId: `test|${match[1]}`, email: match[1] } : null;
    },
    async email(providerUserId) {
      return providerUserId.replace(/^test\|/, '');
    },
  };
}

/**
 * Local seed scripts only (src/server/seed-cli.ts, case-study-cli.ts): every request acts as a
 * fixed script account that no person can sign in as (Clerk user IDs never start with `cli|`).
 * Never used by the server.
 */
export function scriptAuth(): AuthProvider {
  const signedIn = { providerUserId: 'cli|seed-script', email: 'seed-script@cyclereg.invalid' };
  return { verify: async () => signedIn, email: async () => signedIn.email };
}

/** `--owner you@example.com` or SEED_OWNER_EMAIL: who gets the owner role on seeded organizations. */
export function seedOwner(argv: string[], env: Record<string, string | undefined> = process.env): string | null {
  const at = argv.indexOf('--owner');
  const value = (at >= 0 ? argv[at + 1] : env.SEED_OWNER_EMAIL)?.trim().toLowerCase();
  return value && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) ? value : null;
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);

/**
 * Picks the provider from the environment. With `CLERK_SECRET_KEY`, Clerk (unless
 * `AUTH_MODE=test`). Without it, or with `AUTH_MODE=test`, the local test provider, which is
 * refused in production or when the server listens beyond this computer: there Clerk is required.
 */
export function authProviderFromEnv(env: Record<string, string | undefined> = process.env): AuthProvider {
  const secretKey = env.CLERK_SECRET_KEY?.trim();
  if (env.AUTH_MODE === 'test' || !secretKey) {
    const host = listenHost(env);
    if (env.NODE_ENV !== 'production' && LOOPBACK.has(host)) {
      if (env.AUTH_MODE !== 'test') console.warn('Clerk keys are not set: using the local test sign-in (fictional .test addresses, no email). See docs/runbooks/local-setup.md.');
      return testAuth();
    }
    if (env.AUTH_MODE === 'test') throw new Error(`AUTH_MODE=test is local only; refusing it with NODE_ENV=${env.NODE_ENV ?? 'unset'} on ${host}.`);
    throw new Error('CLERK_SECRET_KEY is not set. Outside local development, sign-in needs Clerk; see docs/runbooks/local-setup.md.');
  }
  const parties = env.CLERK_AUTHORIZED_PARTIES?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
  return clerkAuth({ secretKey, authorizedParties: parties.length ? parties : undefined });
}

/** How many of the most recent role changes the team panel shows. */
const HISTORY_LIMIT = 50;

/** Accounts, organization roles, and the checks every organizer route makes. `appUrl`: where invitation emails send people to sign in; empty when email is only recorded. */
const INVITATION_CHANGED = 'This invitation changed, so this request sent no email.';

export function createAccess(db: Db, provider: AuthProvider, clock: () => Date, mailer: Mailer, appUrl: string) {
  const nowIso = () => clock().toISOString();

  /** Finds or creates the caller's account, then turns any open invitations for their email into roles and drops expired ones. */
  async function accountFor(signedIn: SignedIn): Promise<Account> {
    const existing = await db.get<Account>(`SELECT id, email FROM accounts WHERE provider_user_id = $1`, [signedIn.providerUserId]);
    if (existing) return existing;
    const email = (signedIn.email ?? (await provider.email(signedIn.providerUserId))).trim().toLowerCase();
    return db.transaction(async () => {
      await db.lock(`account:${email}`);
      const raced = await db.get<Account>(`SELECT id, email FROM accounts WHERE provider_user_id = $1`, [signedIn.providerUserId]);
      if (raced) return raced;
      // One account per person: an email already tied to another sign-in identity is refused.
      const taken = await db.get(`SELECT 1 FROM accounts WHERE lower(email) = $1`, [email]);
      if (taken) throw new HttpError(409, 'This email already belongs to another account. Sign in with that account instead.');
      const id = newId('acct');
      const t = nowIso();
      await db.run(`INSERT INTO accounts (id, provider_user_id, email, created_at) VALUES ($1, $2, $3, $4)`, [id, signedIn.providerUserId, email, t]);
      const invitations = await db.all<{ organization_id: string; role: Role; open: boolean }>(
        `SELECT organization_id, role, expires_at > $2 AS open FROM organization_invitations WHERE email = $1`,
        [email, t],
      );
      for (const i of invitations) await record(i.organization_id, i.open ? 'invitation_accepted' : 'invitation_expired', email, i.role, id);
      await db.run(
        `INSERT INTO organization_members (organization_id, account_id, role, granted_by, created_at)
         SELECT organization_id, $1, role, invited_by, $2 FROM organization_invitations WHERE email = $3 AND expires_at > $2 ON CONFLICT DO NOTHING`,
        [id, t, email],
      );
      // Every invitation for this email goes: the person now has an account, so an owner adds them directly.
      await db.run(`DELETE FROM organization_invitations WHERE email = $1`, [email]);
      return { id, email };
    });
  }

  /** Appends one row to the organization's role history. */
  async function record(organizationId: string, action: MembershipAction, email: string, role: Role, actorId: string | null) {
    await db.run(`INSERT INTO membership_changes (id, organization_id, action, email, role, actor_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
      newId('mch'),
      organizationId,
      action,
      email,
      role,
      actorId,
      nowIso(),
    ]);
  }

  async function rolesIn(accountId: string, organizationId: string): Promise<Role[]> {
    const rows = await db.all<{ role: Role }>(`SELECT role FROM organization_members WHERE account_id = $1 AND organization_id = $2 ORDER BY role`, [accountId, organizationId]);
    return rows.map((r) => r.role);
  }

  /**
   * Allows the call only when the account holds a role in the organization that grants the
   * permission. Not a member at all: 404, so organization and event IDs cannot be probed.
   * A member without the right role: 403.
   */
  async function requireOrg(account: Account, organizationId: string, permission: Permission, notFound = 'Organization not found.'): Promise<Role[]> {
    const roles = await rolesIn(account.id, organizationId);
    if (roles.length === 0) throw new HttpError(404, notFound);
    if (!can(roles, permission)) throw new HttpError(403, 'Your role in this organization does not allow this.');
    return roles;
  }

  async function orgOfEvent(eventId: string): Promise<string> {
    const row = await db.get<{ organization_id: string }>(`SELECT organization_id FROM events WHERE id = $1`, [eventId]);
    if (!row) throw new HttpError(404, 'Event not found.');
    return row.organization_id;
  }

  async function requireEvent(account: Account, eventId: string, permission: Permission): Promise<Role[]> {
    return requireOrg(account, await orgOfEvent(eventId), permission, 'Event not found.');
  }

  /**
   * The one check for routes that act on an order or on one of its entries.
   * `rider`: the placing account for an adult order, or an active guardian/approved claimed rider for a linked profile order. `juniorViewer`: so may the junior's own
   * login, when the order is a junior's and the guardian named that email. `permission`: so may a member of the
   * event's organization whose role grants it. Someone who is neither the rider nor a member gets
   * 404, so order and entry IDs cannot be probed. A member who lacks the permission, or who tries
   * a rider-only action (paying, cancelling), gets 403: they can already see the order exists.
   */
  async function requireOrderAccess(
    account: Account,
    target: { orderId: string } | { entryId: string },
    allow: { rider?: boolean; juniorViewer?: boolean; permission?: Permission },
  ): Promise<'rider' | 'organizer'> {
    const byEntry = 'entryId' in target;
    const notFound = byEntry ? 'Entry not found.' : 'Order not found.';
    const row = await db.get<{ can_manage: boolean | null; organization_id: string; can_view: boolean | null }>(
      byEntry
        ? `SELECT ${orderManagerSql('$2')} AS can_manage,e.organization_id,${juniorViewerSql('$3')} AS can_view FROM order_entries oe JOIN orders o ON o.id = oe.order_id JOIN events e ON e.id = o.event_id LEFT JOIN junior_profiles j ON j.id = o.junior_profile_id WHERE oe.id = $1`
        : `SELECT ${orderManagerSql('$2')} AS can_manage,e.organization_id,${juniorViewerSql('$3')} AS can_view FROM orders o JOIN events e ON e.id = o.event_id LEFT JOIN junior_profiles j ON j.id = o.junior_profile_id WHERE o.id = $1`,
      [byEntry ? target.entryId : target.orderId, account.id, account.email.toLowerCase()],
    );
    if (!row) throw new HttpError(404, notFound);
    if (allow.rider && row.can_manage) return 'rider';
    // The junior's own login may look, never act.
    if (allow.juniorViewer && row.can_view) return 'rider';
    const roles = await rolesIn(account.id, row.organization_id);
    // A member who may not view orders learns nothing about whether this one exists.
    if (roles.length === 0 || (!allow.permission && !can(roles, 'orders.view'))) throw new HttpError(404, notFound);
    if (!allow.permission) throw new HttpError(403, 'Only the rider or a current authorized guardian can do this.');
    if (!can(roles, allow.permission)) throw new HttpError(403, 'Your role in this organization does not allow this.');
    return 'organizer';
  }

  /** The organizations the account belongs to, with its roles in each. */
  async function memberships(accountId: string) {
    const rows = await db.all<{ organization_id: string; name: string; role: Role }>(
      `SELECT m.organization_id, o.name, m.role FROM organization_members m JOIN organizations o ON o.id = m.organization_id WHERE m.account_id = $1 ORDER BY o.created_at, o.seq, m.role`,
      [accountId],
    );
    const byOrg = new Map<string, { organizationId: string; name: string; roles: Role[] }>();
    for (const r of rows) {
      const m = byOrg.get(r.organization_id) ?? { organizationId: r.organization_id, name: r.name, roles: [] };
      m.roles.push(r.role);
      byOrg.set(r.organization_id, m);
    }
    return [...byOrg.values()];
  }

  /** Gives an account a role and records who granted it. Granting a role the account already holds changes nothing. */
  async function grant(organizationId: string, target: Account, role: Role, grantedBy: string | null) {
    const added = await db.run(`INSERT INTO organization_members (organization_id, account_id, role, granted_by, created_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`, [
      organizationId,
      target.id,
      role,
      grantedBy,
      nowIso(),
    ]);
    if (added) await record(organizationId, 'granted', target.email, role, grantedBy);
  }

  async function listMembers(organizationId: string) {
    const members = await db.all<{ account_id: string; email: string; role: Role }>(
      `SELECT m.account_id, a.email, m.role FROM organization_members m JOIN accounts a ON a.id = m.account_id WHERE m.organization_id = $1 ORDER BY a.email, m.role`,
      [organizationId],
    );
    const invitations = await db.all<{ email: string; role: Role; expires_at: string; email_id: string | null; email_status: 'recorded' | 'sent' | 'failed' | 'uncertain' | null; email_at: string | null }>(
      `SELECT i.email, i.role, i.expires_at, m.id AS email_id, m.status AS email_status, m.created_at AS email_at FROM organization_invitations i
       LEFT JOIN email_messages m ON m.id = i.email_attempt_id
       WHERE i.organization_id = $1 ORDER BY i.email, i.role`,
      [organizationId],
    );
    const history = await db.all<{ action: MembershipAction; email: string; role: Role; actor_email: string | null; created_at: string }>(
      `SELECT c.action, c.email, c.role, a.email AS actor_email, c.created_at FROM membership_changes c LEFT JOIN accounts a ON a.id = c.actor_id
       WHERE c.organization_id = $1 ORDER BY c.created_at DESC, c.seq DESC LIMIT ${HISTORY_LIMIT}`,
      [organizationId],
    );
    return {
      members: members.map((m) => ({ accountId: m.account_id, email: m.email, role: m.role })),
      invitations: invitations.map(
        (i): Invitation => ({ email: i.email, role: i.role, expiresAt: i.expires_at, lastEmail: i.email_id && i.email_status && i.email_at ? { attemptId: i.email_id, status: i.email_status, at: i.email_at } : null }),
      ),
      history: history.map((h): MembershipChange => ({ action: h.action, email: h.email, role: h.role, by: h.actor_email, at: h.created_at })),
    };
  }

  /**
   * Grants a role to an email: straight away when the person has an account, otherwise as an
   * invitation open for INVITATION_DAYS. Adding an invitation that already exists renews it,
   * including one that has expired. A person who invites or renews also sends the invitation email;
   * a seed script (no person) sends none. An email the provider may already have accepted is reserved
   * with the invitation and retried in place. It does not renew the invitation.
   */
  async function addMember(organizationId: string, email: string, role: Role, by: Account | null) {
    const normalized = email.trim().toLowerCase();
    const target = await db.get<Account>(`SELECT id, email FROM accounts WHERE lower(email) = $1`, [normalized]);
    if (target) await grant(organizationId, target, role, by?.id ?? null);
    else {
      const ref = `${organizationId}:${normalized}:${role}`;
      const decision = await db.transaction(async () => {
        await db.lock(`org-members:${organizationId}`);
        const extant = await db.get<{ email_attempt_id: string | null }>(
          `SELECT email_attempt_id FROM organization_invitations WHERE organization_id = $1 AND email = $2 AND role = $3`,
          [organizationId, normalized, role],
        );
        // Only the attempt stored on this invitation counts. A cancelled row is gone, so a re-add starts over.
        if (extant?.email_attempt_id) {
          const attempt = await db.get<{ id: string; status: string }>(`SELECT id, status FROM email_messages WHERE id = $1`, [extant.email_attempt_id]);
          if (attempt?.status === 'uncertain') return by ? { action: 'send' as const, id: attempt.id } : { action: 'none' as const };
        }
        const t = clock();
        const expiresAt = new Date(t.getTime() + INVITATION_DAYS * 86_400_000).toISOString();
        const renewed = await db.run(`UPDATE organization_invitations SET expires_at = $4, invited_by = $5 WHERE organization_id = $1 AND email = $2 AND role = $3`, [
          organizationId,
          normalized,
          role,
          expiresAt,
          by?.id ?? null,
        ]);
        const invited = renewed
          ? 0
          : await db.run(`INSERT INTO organization_invitations (organization_id, email, role, invited_by, created_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`, [
              organizationId,
              normalized,
              role,
              by?.id ?? null,
              t.toISOString(),
              expiresAt,
            ]);
        if (renewed + invited) await record(organizationId, renewed ? 'invitation_renewed' : 'invited', normalized, role, by?.id ?? null);
        if (!(by && renewed + invited)) return { action: 'none' as const };
        const id = await mailer.reserve('organizer_invitation', ref, organizationId, await invitationMessage(organizationId, normalized, role, by, expiresAt));
        await db.run(`UPDATE organization_invitations SET email_attempt_id = $1 WHERE organization_id = $2 AND email = $3 AND role = $4`, [id, organizationId, normalized, role]);
        return { action: 'send' as const, id };
      });
      if (decision.action === 'send') await dispatchInvitation(decision.id);
    }
    return listMembers(organizationId);
  }

  /** Retries one attempt while it is still the invitation's own. Unlike addMember, it never invites, renews, or grants. */
  async function retryInvitation(organizationId: string, email: string, role: Role, attemptId: string) {
    const current = await db.get(`SELECT 1 FROM organization_invitations WHERE organization_id = $1 AND email = $2 AND role = $3 AND email_attempt_id = $4`, [
      organizationId,
      email.trim().toLowerCase(),
      role,
      attemptId,
    ]);
    if (!current) throw new HttpError(409, INVITATION_CHANGED);
    await dispatchInvitation(attemptId);
    return listMembers(organizationId);
  }

  async function dispatchInvitation(attemptId: string) {
    const outcome = await mailer.dispatch(attemptId);
    if (outcome === 'withheld') throw new HttpError(409, 'The earlier invitation email might have been sent. It was not sent again, and the invitation was not extended. To send a new email, cancel the invitation and invite again.');
    if (outcome === 'changed') throw new HttpError(409, INVITATION_CHANGED);
  }

  async function invitationMessage(organizationId: string, email: string, role: Role, by: Account, expiresAt: string) {
    const org = await db.get<{ name: string }>(`SELECT name FROM organizations WHERE id = $1`, [organizationId]);
    const until = new Date(expiresAt).toLocaleDateString('en-US', { dateStyle: 'long', timeZone: 'UTC' });
    return {
      to: email,
      subject: `You are invited to ${org!.name} on CycleReg`,
      text: [
        `${by.email} added you to ${org!.name} as ${ROLE_LABELS[role]}.`,
        '',
        `To take up the role, sign in${appUrl ? ` at ${appUrl}` : ' to CycleReg'} with this email address (${email}) by ${until} (UTC). After that, ask an owner to resend the invitation.`,
        '',
        'If you did not expect this, you can ignore this email.',
      ].join('\n'),
    };
  }

  /** Removes one role (or invitation). The last owner cannot be removed, so an organization is never orphaned. */
  async function removeMember(organizationId: string, email: string, role: Role, by: Account) {
    const normalized = email.trim().toLowerCase();
    return db.transaction(async () => {
      await db.lock(`org-members:${organizationId}`);
      const target = await db.get<{ id: string }>(`SELECT id FROM accounts WHERE lower(email) = $1`, [normalized]);
      if (target && role === 'owner') {
        const owners = await db.all<{ account_id: string }>(`SELECT account_id FROM organization_members WHERE organization_id = $1 AND role = 'owner'`, [organizationId]);
        if (owners.length === 1 && owners[0].account_id === target.id) throw new HttpError(409, 'An organization needs at least one owner. Add another owner first.');
      }
      const removed = target ? await db.run(`DELETE FROM organization_members WHERE organization_id = $1 AND account_id = $2 AND role = $3`, [organizationId, target.id, role]) : 0;
      const cancelled = await db.run(`DELETE FROM organization_invitations WHERE organization_id = $1 AND email = $2 AND role = $3`, [organizationId, normalized, role]);
      if (removed + cancelled === 0) throw new HttpError(404, 'That person does not hold this role here.');
      if (removed) await record(organizationId, 'removed', normalized, role, by.id);
      if (cancelled) await record(organizationId, 'invitation_cancelled', normalized, role, by.id);
      return listMembers(organizationId);
    });
  }

  /**
   * An owner hands their owner role to a signed-in teammate in one step: the
   * successor becomes an owner and the caller stops being one (other roles stay). Recorded as
   * one change so the history shows who handed over to whom.
   */
  async function transferOwnership(organizationId: string, email: string, by: Account) {
    const normalized = email.trim().toLowerCase();
    return db.transaction(async () => {
      await db.lock(`org-members:${organizationId}`);
      // Checked again under the lock: a second hand-over sent at the same time finds the caller is no longer an owner.
      if (!(await rolesIn(by.id, organizationId)).includes('owner')) throw new HttpError(403, 'Only an owner can hand over ownership.');
      const target = await db.get<Account>(`SELECT id, email FROM accounts WHERE lower(email) = $1`, [normalized]);
      if (!target) throw new HttpError(422, 'That person has not signed in yet. Ask them to sign in once with this email, then hand over ownership.');
      if (target.id === by.id) throw new HttpError(422, 'Choose someone else to take ownership.');
      const targetRoles = await rolesIn(target.id, organizationId);
      if (targetRoles.length === 0) throw new HttpError(422, 'Add this person to your team before handing over ownership.');
      if (targetRoles.includes('owner')) throw new HttpError(409, 'That person is already an owner. Remove your own owner role instead.');
      await db.run(`INSERT INTO organization_members (organization_id, account_id, role, granted_by, created_at) VALUES ($1, $2, 'owner', $3, $4)`, [organizationId, target.id, by.id, nowIso()]);
      await db.run(`DELETE FROM organization_members WHERE organization_id = $1 AND account_id = $2 AND role = 'owner'`, [organizationId, by.id]);
      await record(organizationId, 'ownership_transferred', target.email, 'owner', by.id);
      return listMembers(organizationId);
    });
  }

  async function expiredInvitations(account: Account): Promise<ExpiredInvitationNotice[]> {
    return db.all<ExpiredInvitationNotice>(
      `SELECT c.id, o.name AS "organizationName", c.role, c.created_at AS at
       FROM (SELECT DISTINCT ON (organization_id, role) id, organization_id, role, action, created_at
         FROM membership_changes WHERE email = $1 ORDER BY organization_id, role, created_at DESC, seq DESC) c
       JOIN organizations o ON o.id = c.organization_id
       WHERE c.action = 'invitation_expired' ORDER BY c.created_at DESC, c.id`,
      [account.email.toLowerCase()],
    );
  }

  return { accountFor, requireOrg, requireEvent, requireOrderAccess, memberships, grant, listMembers, addMember, retryInvitation, removeMember, transferOwnership, expiredInvitations };
}

export type Access = ReturnType<typeof createAccess>;
