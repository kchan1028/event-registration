import { createClerkClient, verifyToken } from '@clerk/backend';
import type { FastifyRequest } from 'fastify';
import { newId } from '../shared/factory';
import { can, type Permission, type Role } from '../shared/roles';
import type { Db } from './db';
import { HttpError } from './repo';

/**
 * Sign-in (ADR 0003 as amended: Phase 2 passwordless email sign-in on Clerk's free plan).
 *
 * The identity provider proves who is calling; CycleReg decides what they may do. An
 * `AuthProvider` turns a request into a provider user ID (or null when not signed in).
 * The app uses Clerk session tokens sent as `Authorization: Bearer <token>`. API tests use
 * a fake provider and the browser tests use the local-only test provider below, so neither
 * needs Clerk keys.
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
export function clerkAuth(opts: { secretKey: string; authorizedParties?: string[] }): AuthProvider {
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
 * Local browser tests only: `Authorization: Bearer test:<name>@<domain>.test` signs in as
 * that fictional address. Only `.test` addresses are accepted, and `authProviderFromEnv`
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
 * Picks the provider from the environment. `AUTH_MODE=test` is for the local browser tests
 * and is refused in production or when the server listens beyond this computer.
 * Otherwise Clerk is required: without `CLERK_SECRET_KEY` the server does not start.
 */
export function authProviderFromEnv(env: Record<string, string | undefined> = process.env): AuthProvider {
  if (env.AUTH_MODE === 'test') {
    const host = env.HOST?.trim() || '127.0.0.1';
    if (env.NODE_ENV === 'production') throw new Error('AUTH_MODE=test is for local browser tests only and cannot run with NODE_ENV=production.');
    if (!LOOPBACK.has(host)) throw new Error(`AUTH_MODE=test is for local browser tests only; refusing to listen on ${host}.`);
    return testAuth();
  }
  const secretKey = env.CLERK_SECRET_KEY?.trim();
  if (!secretKey) throw new Error('CLERK_SECRET_KEY is not set. Sign-in needs a Clerk development instance; see docs/runbooks/local-setup.md.');
  const parties = env.CLERK_AUTHORIZED_PARTIES?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
  return clerkAuth({ secretKey, authorizedParties: parties.length ? parties : undefined });
}

/** Accounts, organization roles, and the checks every organizer route makes. */
export function createAccess(db: Db, provider: AuthProvider, clock: () => Date) {
  const nowIso = () => clock().toISOString();

  /** Finds or creates the caller's account, then turns any invitations for their email into roles. */
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
      await db.run(
        `INSERT INTO organization_members (organization_id, account_id, role, granted_by, created_at)
         SELECT organization_id, $1, role, invited_by, $2 FROM organization_invitations WHERE email = $3 ON CONFLICT DO NOTHING`,
        [id, t, email],
      );
      await db.run(`DELETE FROM organization_invitations WHERE email = $1`, [email]);
      return { id, email };
    });
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

  /** Organizer action on one order entry: checked against the entry's own event. */
  async function requireOrderEntry(account: Account, entryId: string, permission: Permission): Promise<void> {
    const row = await db.get<{ organization_id: string }>(`SELECT e.organization_id FROM order_entries oe JOIN events e ON e.id = oe.event_id WHERE oe.id = $1`, [entryId]);
    if (!row) throw new HttpError(404, 'Entry not found.');
    await requireOrg(account, row.organization_id, permission, 'Entry not found.');
  }

  /** Organizer action on a whole order (for example correcting rider details): checked against the order's event. */
  async function requireOrderOrganizer(account: Account, orderId: string, permission: Permission): Promise<void> {
    const row = await db.get<{ organization_id: string }>(`SELECT e.organization_id FROM orders o JOIN events e ON e.id = o.event_id WHERE o.id = $1`, [orderId]);
    if (!row) throw new HttpError(404, 'Order not found.');
    await requireOrg(account, row.organization_id, permission, 'Order not found.');
  }

  /**
   * An order is visible to the account that placed it and to organizers of its event who may
   * see orders. `ownerOnly` (paying, cancelling) allows only the account that placed it.
   */
  async function requireOrder(account: Account, orderId: string, ownerOnly = false): Promise<void> {
    const row = await db.get<{ account_id: string | null; organization_id: string }>(
      `SELECT o.account_id, e.organization_id FROM orders o JOIN events e ON e.id = o.event_id WHERE o.id = $1`,
      [orderId],
    );
    if (!row) throw new HttpError(404, 'Order not found.');
    if (row.account_id === account.id) return;
    if (!ownerOnly && can(await rolesIn(account.id, row.organization_id), 'orders.view')) return;
    throw new HttpError(404, 'Order not found.');
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

  async function grant(organizationId: string, accountId: string, role: Role, grantedBy: string | null) {
    await db.run(`INSERT INTO organization_members (organization_id, account_id, role, granted_by, created_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`, [
      organizationId,
      accountId,
      role,
      grantedBy,
      nowIso(),
    ]);
  }

  async function listMembers(organizationId: string) {
    const members = await db.all<{ account_id: string; email: string; role: Role }>(
      `SELECT m.account_id, a.email, m.role FROM organization_members m JOIN accounts a ON a.id = m.account_id WHERE m.organization_id = $1 ORDER BY a.email, m.role`,
      [organizationId],
    );
    const invitations = await db.all<{ email: string; role: Role }>(`SELECT email, role FROM organization_invitations WHERE organization_id = $1 ORDER BY email, role`, [organizationId]);
    return { members: members.map((m) => ({ accountId: m.account_id, email: m.email, role: m.role })), invitations };
  }

  /** Grants a role to an email: straight away when the person has an account, otherwise as an invitation. */
  async function addMember(organizationId: string, email: string, role: Role, by: Account | null) {
    const normalized = email.trim().toLowerCase();
    const target = await db.get<{ id: string }>(`SELECT id FROM accounts WHERE lower(email) = $1`, [normalized]);
    if (target) await grant(organizationId, target.id, role, by?.id ?? null);
    else
      await db.run(`INSERT INTO organization_invitations (organization_id, email, role, invited_by, created_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`, [
        organizationId,
        normalized,
        role,
        by?.id ?? null,
        nowIso(),
      ]);
    return listMembers(organizationId);
  }

  /** Removes one role (or invitation). The last owner cannot be removed, so an organization is never orphaned. */
  async function removeMember(organizationId: string, email: string, role: Role) {
    const normalized = email.trim().toLowerCase();
    return db.transaction(async () => {
      await db.lock(`org-members:${organizationId}`);
      const target = await db.get<{ id: string }>(`SELECT id FROM accounts WHERE lower(email) = $1`, [normalized]);
      if (target && role === 'owner') {
        const owners = await db.all<{ account_id: string }>(`SELECT account_id FROM organization_members WHERE organization_id = $1 AND role = 'owner'`, [organizationId]);
        if (owners.length === 1 && owners[0].account_id === target.id) throw new HttpError(409, 'An organization needs at least one owner. Add another owner first.');
      }
      const removed =
        (target ? await db.run(`DELETE FROM organization_members WHERE organization_id = $1 AND account_id = $2 AND role = $3`, [organizationId, target.id, role]) : 0) +
        (await db.run(`DELETE FROM organization_invitations WHERE organization_id = $1 AND email = $2 AND role = $3`, [organizationId, normalized, role]));
      if (removed === 0) throw new HttpError(404, 'That person does not hold this role here.');
      return listMembers(organizationId);
    });
  }

  return { accountFor, rolesIn, requireOrg, requireEvent, requireOrderEntry, requireOrderOrganizer, requireOrder, memberships, grant, listMembers, addMember, removeMember };
}

export type Access = ReturnType<typeof createAccess>;
