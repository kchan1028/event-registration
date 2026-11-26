import { createHmac, timingSafeEqual } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { newId } from '../shared/factory';
import { can, ROLES } from '../shared/roles';
import type { Db } from './db';

/** Outgoing email is recorded before sending. Send failures leave the underlying action intact. */
export interface OutgoingEmail {
  to: string;
  /** The sender saved with the attempt. A retry must repeat it under the same idempotency key. */
  from?: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  /** `local`: recorded only, never sent. `resend`: sent through Resend. */
  mode: 'local' | 'resend';
  /** The configured sender address, saved with each attempt. */
  from?: string;
  /**
   * Sends one message and returns the provider's message ID.
   * Throws `EmailRefusal` when the provider confirms it did not accept the message,
   * `EmailNotSent` when this app never called the provider, and `EmailUncertain` when the outcome is unknown.
   * `idempotencyKey` is the saved message id. Resend replays the first success for that key for 24 hours.
   */
  send(message: OutgoingEmail, idempotencyKey: string): Promise<string>;
}

/** Confirmed provider refusal. The request was not accepted. */
export class EmailRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailRefusal';
  }
}

/** This app did not call the provider. */
export class EmailNotSent extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailNotSent';
  }
}

/** The provider may have accepted the message. The saved response does not prove it. */
export class EmailUncertain extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailUncertain';
  }
}

/**
 * Resend keeps an idempotency key for 24 hours and replays the first successful response.
 * A retry at or after this age is not sent: the key may already be a new delivery.
 * https://resend.com/docs/dashboard/emails/idempotency-keys
 */
export const RESEND_IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000;

const SEND_TIMEOUT_MS = 10_000;
/** Longer than the provider timeout, so a lease only runs out when the process that took it is gone. */
const SEND_LEASE_SECONDS = SEND_TIMEOUT_MS / 1000 + 5;
const LEASE_POLL_MS = 200;
/** The roles that may retry an invitation email. */
const TEAM_MANAGER_ROLES = ROLES.filter((role) => can([role], 'members.manage'));

export type EmailStatus = 'recorded' | 'sent' | 'failed' | 'uncertain';

/** Records every message and sends nothing. */
export function localEmail(): EmailSender {
  return {
    mode: 'local',
    async send() {
      throw new Error('The local email sender never sends.');
    },
  };
}

function resendEmail(from: string, apiKey: string, testRecipients: Set<string>): EmailSender {
  return {
    mode: 'resend',
    from,
    async send(message, idempotencyKey) {
      if (!testRecipients.has(message.to.trim().toLowerCase())) {
        throw new EmailNotSent('Recipient is outside the configured email test list.');
      }
      if (idempotencyKey.length < 1 || idempotencyKey.length > 256) {
        throw new EmailUncertain('Send outcome unknown. The retry key is not valid.');
      }
      let response: Response;
      try {
        response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          redirect: 'error',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
          body: JSON.stringify({ from: message.from ?? from, to: [message.to], subject: message.subject, text: message.text }),
          signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        });
      } catch (err) {
        const name = err instanceof Error ? err.name : '';
        throw new EmailUncertain(name === 'TimeoutError' || name === 'AbortError' ? 'Send outcome unknown after a timeout.' : 'Send outcome unknown after a network failure.');
      }
      if (response.status === 409 || response.status === 408 || response.status === 429 || response.status >= 500) {
        throw new EmailUncertain(`Send outcome unknown after HTTP ${response.status}.`);
      }
      if (!response.ok) throw new EmailRefusal(`Resend returned HTTP ${response.status}.`);
      let result: { id?: unknown } | null;
      try {
        result = await response.json() as { id?: unknown } | null;
      } catch {
        throw new EmailUncertain('Send outcome unknown. The provider response could not be read.');
      }
      if (typeof result?.id !== 'string' || !result.id) throw new EmailUncertain('Send outcome unknown. The provider response had no message ID.');
      return result.id;
    },
  };
}

/** Local by default. Resend is enabled only for allowlisted test recipients outside production. */
export function emailFromEnv(env: Record<string, string | undefined> = process.env): EmailSender {
  if (!env.EMAIL_MODE || env.EMAIL_MODE === 'local') return localEmail();
  if (env.EMAIL_MODE !== 'resend') throw new Error('EMAIL_MODE must be local or resend. See docs/runbooks/local-setup.md.');
  if (env.NODE_ENV === 'production') throw new Error('EMAIL_MODE=resend is for the test-only beta and cannot run with NODE_ENV=production.');
  const from = env.EMAIL_FROM?.trim();
  const apiKey = env.RESEND_API_KEY?.trim();
  const testRecipients = new Set(env.EMAIL_TEST_RECIPIENTS?.split(',').map((address) => address.trim().toLowerCase()).filter(Boolean));
  if (!from || !apiKey || !testRecipients.size) {
    throw new Error('EMAIL_MODE=resend needs EMAIL_FROM, RESEND_API_KEY, and EMAIL_TEST_RECIPIENTS. See docs/runbooks/local-setup.md.');
  }
  return resendEmail(from, apiKey, testRecipients);
}

/** Called in the transaction that confirms the order. No provider call is made. */
export async function recordRegistrationConfirmation(db: Db, orderId: string, confirmedAt: string) {
  await db.run(
    `INSERT INTO email_messages (id, organization_id, kind, ref, order_id, to_email, subject, body_text, status, created_at, keyed)
     SELECT $1, e.organization_id, 'registration_confirmation', o.id, o.id, a.email, $2, $3, 'recorded', $4, true
     FROM orders o JOIN events e ON e.id = o.event_id JOIN accounts a ON a.id = o.account_id
     WHERE o.id = $5
     ON CONFLICT (order_id) DO NOTHING`,
    [newId('eml'), 'Registration confirmed', 'Your registration is confirmed. Sign in and open My registrations to see your order and receipt.', confirmedAt, orderId],
  );
}

/** `until` is also the token that proves the caller still holds the lease. */
interface Lease {
  first: boolean;
  until: string;
}

const UNKNOWN_OUTCOME = 'Send outcome unknown.';

function storedError(err: unknown): string {
  if (err instanceof EmailRefusal || err instanceof EmailNotSent || err instanceof EmailUncertain) return err.message.slice(0, 500);
  return UNKNOWN_OUTCOME;
}

/**
 * Reserves an attempt, then records what the provider did. Never throws for a send failure.
 * Call `reserve` inside the invitation transaction. Call `dispatch` only after that transaction commits.
 */
export function createMailer(db: Db, sender: EmailSender, clock: () => Date) {
  async function finish(id: string, message: OutgoingEmail, lease: Lease): Promise<EmailStatus> {
    try {
      const providerId = await sender.send(message, id);
      // An acceptance is final whoever holds the lease by now: every send of an attempt shares one key.
      const saved = await db.run(
        `UPDATE email_messages SET status = 'sent', provider_message_id = $1, sent_at = $2, error = NULL, sending_until = NULL WHERE id = $3 AND status = 'uncertain'`,
        [providerId, clock().toISOString(), id],
      );
      return saved ? 'sent' : 'uncertain';
    } catch (err) {
      // Only the call that first committed started_at may record a definite refusal, and only while it holds the lease.
      const status = lease.first && (err instanceof EmailRefusal || err instanceof EmailNotSent) ? 'failed' : 'uncertain';
      const saved = await db.run(
        `UPDATE email_messages SET status = $1, error = $2, sending_until = NULL WHERE id = $3 AND status = 'uncertain' AND sending_until = $4::timestamptz`,
        [status, storedError(err), id, lease.until],
      );
      return saved ? status : 'uncertain';
    }
  }

  return {
    /** Inserts the durable attempt and does not call the provider. Local mode is recorded and never sent. */
    async reserve(kind: 'organizer_invitation', ref: string, organizationId: string, message: OutgoingEmail): Promise<string> {
      const id = newId('eml');
      const status = sender.mode === 'local' ? 'recorded' : 'uncertain';
      await db.run(
        `INSERT INTO email_messages (id, organization_id, kind, ref, to_email, subject, body_text, status, created_at, from_email, keyed) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)`,
        [id, organizationId, kind, ref, message.to, message.subject, message.text, status, clock().toISOString(), sender.from ?? null],
      );
      return id;
    },

    /**
     * Sends one reserved attempt after its row has committed.
     * The caller leases the row and commits `started_at` before the provider call, and holds no connection
     * during it. Other callers wait for the lease, then read the committed status.
     * `withheld` means the send cannot be repeated safely (local mode, or past the 24-hour provider window).
     * `changed` means no invitation pointed at the attempt at the last check before the call, so nothing is sent.
     * A cancellation after that check cannot recall the send.
     * `refused` means the account retrying it no longer manages the team at that last check, so nothing is sent.
     */
    async dispatch(id: string, retriedBy?: string): Promise<EmailStatus | 'withheld' | 'changed' | 'refused'> {
      for (;;) {
        const row = await db.get<{ created_at: string; to_email: string; from_email: string | null; subject: string; body_text: string; status: EmailStatus; current: boolean; sending: boolean }>(
          `SELECT created_at, to_email, from_email, subject, body_text, status,
             EXISTS (SELECT 1 FROM organization_invitations WHERE email_attempt_id = email_messages.id AND NOT earlier_email) AS current,
             COALESCE(sending_until > now(), false) AS sending
           FROM email_messages WHERE id = $1`,
          [id],
        );
        if (!row) return 'changed';
        if (row.status !== 'uncertain') return row.status;
        if (row.sending) {
          await sleep(LEASE_POLL_MS);
          continue;
        }
        if (!row.current) return 'changed';
        const created = Date.parse(row.created_at);
        const pastWindow = () => !Number.isFinite(created) || clock().getTime() - created >= RESEND_IDEMPOTENCY_WINDOW_MS;
        if (sender.mode === 'local' || pastWindow()) return 'withheld';
        // Checked again in the claim: another caller or a cancellation may have committed since the read.
        const lease = await db.get<Lease>(
          `UPDATE email_messages m
           SET started_at = COALESCE(m.started_at, $2), sending_until = now() + make_interval(secs => $3)
           FROM (SELECT id, started_at FROM email_messages WHERE id = $1 FOR UPDATE) was
           WHERE m.id = was.id AND m.status = 'uncertain' AND (m.sending_until IS NULL OR m.sending_until <= now())
             AND EXISTS (SELECT 1 FROM organization_invitations WHERE email_attempt_id = m.id AND NOT earlier_email)
           RETURNING was.started_at IS NULL AS first, m.sending_until::text AS until`,
          [id, clock().toISOString(), SEND_LEASE_SECONDS],
        );
        if (!lease) continue;
        // The claim took time, so check the lease, the invitation, the retrying account and the window again, in one
        // query with nothing awaited between it and the call.
        const last = await db.get<{ ready: boolean; allowed: boolean }>(
          `SELECT COALESCE(
               m.status = 'uncertain' AND m.sending_until = $2::timestamptz
               AND m.sending_until > now() + make_interval(secs => $3)
               AND EXISTS (SELECT 1 FROM organization_invitations WHERE email_attempt_id = m.id AND NOT earlier_email),
             false) AS ready,
             ($4::text IS NULL OR EXISTS (
               SELECT 1 FROM organization_members
               WHERE organization_id = m.organization_id AND account_id = $4 AND role IN (SELECT jsonb_array_elements_text($5::jsonb))
             )) AS allowed
           FROM email_messages m WHERE m.id = $1`,
          [id, lease.until, SEND_TIMEOUT_MS / 1000, retriedBy ?? null, JSON.stringify(TEAM_MANAGER_ROLES)],
        );
        if (last?.ready && last.allowed && !pastWindow()) return finish(id, { to: row.to_email, from: row.from_email ?? undefined, subject: row.subject, text: row.body_text }, lease);
        // No provider call was made, so give the lease back and let the loop report why.
        await db.run(
          `UPDATE email_messages SET sending_until = NULL, started_at = CASE WHEN $3::boolean THEN NULL ELSE started_at END
           WHERE id = $1 AND status = 'uncertain' AND sending_until = $2::timestamptz`,
          [id, lease.until, lease.first],
        );
        if (last && !last.allowed) return 'refused';
      }
    },
  };
}

export type Mailer = ReturnType<typeof createMailer>;

/** What a verified Resend webhook recorded. Independent of whether the send was accepted. */
export type EmailDelivery = 'delivered' | 'bounced' | 'complained';

const SIGNATURE_REJECTED = 'Resend signature did not verify.';
const WEBHOOK_UNREADABLE = 'Resend webhook could not be read.';
const WEBHOOK_TOLERANCE_SECONDS = 300;
const MAX_WEBHOOK_ID_LENGTH = 256;

const DELIVERY_KINDS: Record<string, EmailDelivery> = {
  'email.delivered': 'delivered',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
};

/** The webhook was signed, or its body could not be used. The message is safe to show. */
export class ResendWebhookRejected extends Error {
  constructor(message: typeof SIGNATURE_REJECTED | typeof WEBHOOK_UNREADABLE) {
    super(message);
    this.name = 'ResendWebhookRejected';
  }
}

/**
 * Signing secret for the Resend delivery webhook. Unset leaves the route off.
 * A secret in production is refused: recording stays test-only until a live launch is approved.
 */
export function emailWebhookSecretFromEnv(env: Record<string, string | undefined> = process.env): string | null {
  const raw = env.RESEND_WEBHOOK_SECRET?.trim() ?? '';
  if (!raw) return null;
  return checkedWebhookSecret(raw, env);
}

/** Checks one secret. Production refuses it even when the caller passes it in directly. */
export function checkedWebhookSecret(secret: string, env: Record<string, string | undefined> = process.env): string {
  if (env.NODE_ENV === 'production') {
    throw new Error('RESEND_WEBHOOK_SECRET is for the test-only beta and cannot run with NODE_ENV=production.');
  }
  const trimmed = secret.trim();
  const encoded = trimmed.startsWith('whsec_') ? trimmed.slice('whsec_'.length) : '';
  if (!trimmed.startsWith('whsec_') || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
    throw new Error('RESEND_WEBHOOK_SECRET must be a whsec_ value with valid base64. See docs/runbooks/local-setup.md.');
  }
  const key = Buffer.from(encoded, 'base64');
  if (key.length === 0 || key.toString('base64') !== encoded) {
    throw new Error('RESEND_WEBHOOK_SECRET must be a whsec_ value with valid base64. See docs/runbooks/local-setup.md.');
  }
  return trimmed;
}

function headerValue(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

/** Svix signatures: `v1,<base64>` over `${id}.${timestamp}.${rawBody}`, key after `whsec_`. */
export function verifyResendWebhook(secret: string, rawBody: string, headers: { id?: string; timestamp?: string; signature?: string }, now: Date): void {
  const id = headers.id ?? '';
  const timestamp = headers.timestamp ?? '';
  const signature = headers.signature ?? '';
  const seconds = Number(timestamp);
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const fresh = /^\d{1,15}$/.test(timestamp) && Number.isSafeInteger(seconds) && Math.abs(nowSeconds - seconds) <= WEBHOOK_TOLERANCE_SECONDS;
  const encoded = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : '';
  const expected = Buffer.from(createHmac('sha256', Buffer.from(encoded, 'base64')).update(`${id}.${timestamp}.${rawBody}`).digest('base64'));
  let matches = false;
  if (id && fresh) {
    for (const part of signature.split(' ')) {
      if (!part.startsWith('v1,')) continue;
      const given = Buffer.from(part.slice('v1,'.length));
      if (given.length !== expected.length) continue;
      if (timingSafeEqual(given, expected)) matches = true;
    }
  }
  if (!matches) throw new ResendWebhookRejected(SIGNATURE_REJECTED);
}

/**
 * Records one verified delivery, bounce, or complaint for the matching sent message.
 * An older event does not replace a newer outcome. An unknown or ambiguous provider id is ignored.
 * Nothing here changes the invitation, the role, the send status, or payment, and nothing is sent.
 * A bounce or complaint also stops later operational mail to that address in the message's organization.
 * The first active stop is kept. Delivery events still store no address, subject, or bounce text.
 */
export async function recordResendDelivery(
  db: Db,
  secret: string,
  rawBody: string,
  headers: { id?: string | string[]; timestamp?: string | string[]; signature?: string | string[] },
  now: Date,
): Promise<void> {
  const id = headerValue(headers.id);
  verifyResendWebhook(secret, rawBody, { id, timestamp: headerValue(headers.timestamp), signature: headerValue(headers.signature) }, now);
  if (id.length > MAX_WEBHOOK_ID_LENGTH) throw new ResendWebhookRejected(WEBHOOK_UNREADABLE);
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody) as unknown;
  } catch {
    throw new ResendWebhookRejected(WEBHOOK_UNREADABLE);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new ResendWebhookRejected(WEBHOOK_UNREADABLE);
  const body = parsed as { type?: unknown; created_at?: unknown; data?: { email_id?: unknown } | null };
  if (typeof body.type !== 'string') throw new ResendWebhookRejected(WEBHOOK_UNREADABLE);
  const kind = DELIVERY_KINDS[body.type];
  if (!kind) return;
  const emailId = body.data && typeof body.data === 'object' ? body.data.email_id : undefined;
  if (typeof emailId !== 'string' || emailId.length < 1 || emailId.length > MAX_WEBHOOK_ID_LENGTH) throw new ResendWebhookRejected(WEBHOOK_UNREADABLE);
  if (typeof body.created_at !== 'string') throw new ResendWebhookRejected(WEBHOOK_UNREADABLE);
  const occurred = new Date(body.created_at);
  if (Number.isNaN(occurred.getTime())) throw new ResendWebhookRejected(WEBHOOK_UNREADABLE);
  await db.transaction(async () => {
    const rows = await db.all<{ id: string }>(`SELECT id FROM email_messages WHERE provider_message_id = $1 FOR UPDATE`, [emailId]);
    if (rows.length !== 1) return;
    const inserted = await db.run(
      `INSERT INTO email_delivery_events (id, email_id, kind, occurred_at) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
      [id, rows[0].id, kind, occurred.toISOString()],
    );
    if (!inserted) return;
    await db.run(
      `UPDATE email_messages SET delivery_status = $2, delivery_at = $3
       WHERE id = $1 AND (delivery_at IS NULL OR delivery_at < $3::timestamptz)`,
      [rows[0].id, kind, occurred.toISOString()],
    );
    if (kind === 'bounced' || kind === 'complained') {
      await db.run(
        `INSERT INTO email_suppressions (id, organization_id, email, reason, email_id, created_at)
         SELECT $1, organization_id, lower(btrim(to_email)), $2, id, $3
         FROM email_messages WHERE id = $4
         ON CONFLICT (organization_id, email) WHERE cleared_at IS NULL DO NOTHING`,
        [newId('sup'), kind, occurred.toISOString(), rows[0].id],
      );
    }
  });
}
