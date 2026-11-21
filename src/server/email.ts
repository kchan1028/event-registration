import { newId } from '../shared/factory';
import type { Db } from './db';

/** Outgoing email is recorded before sending. Send failures leave the underlying action intact. */
export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  /** `local`: recorded only, never sent. `resend`: sent through Resend. */
  mode: 'local' | 'resend';
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
          body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text }),
          signal: AbortSignal.timeout(10_000),
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
  async function finish(id: string, message: OutgoingEmail, firstAttempt: boolean): Promise<EmailStatus> {
    try {
      const providerId = await sender.send(message, id);
      const saved = await db.run(
        `UPDATE email_messages SET status = 'sent', provider_message_id = $1, sent_at = $2, error = NULL WHERE id = $3 AND status = 'uncertain'`,
        [providerId, clock().toISOString(), id],
      );
      return saved ? 'sent' : 'uncertain';
    } catch (err) {
      const safe = storedError(err);
      // A later refusal or local block does not prove the first request failed to complete.
      if (firstAttempt && (err instanceof EmailRefusal || err instanceof EmailNotSent)) {
        await db.run(`UPDATE email_messages SET status = 'failed', error = $1 WHERE id = $2 AND status = 'uncertain'`, [safe, id]);
        return 'failed';
      }
      await db.run(`UPDATE email_messages SET error = $1 WHERE id = $2 AND status = 'uncertain'`, [safe, id]);
      return 'uncertain';
    }
  }

  return {
    /** Inserts the durable attempt and does not call the provider. Local mode is recorded and never sent. */
    async reserve(kind: 'organizer_invitation', ref: string, organizationId: string, message: OutgoingEmail): Promise<string> {
      const id = newId('eml');
      const status = sender.mode === 'local' ? 'recorded' : 'uncertain';
      await db.run(
        `INSERT INTO email_messages (id, organization_id, kind, ref, to_email, subject, body_text, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [id, organizationId, kind, ref, message.to, message.subject, message.text, status, clock().toISOString()],
      );
      return id;
    },

    /**
     * Sends one reserved attempt after its row has committed.
     * The attempt lock is held for the provider call, so a second dispatch of the same id waits
     * and then reads the committed status. A refusal cannot land while another call can still succeed.
     * `withheld` means a retry can no longer prove the 24-hour provider window, so nothing is sent.
     */
    async dispatch(id: string, firstAttempt: boolean): Promise<EmailStatus | 'withheld'> {
      return db.transaction(async () => {
        await db.lock(`email-attempt:${id}`);
        const row = await db.get<{ created_at: string; to_email: string; subject: string; body_text: string; status: EmailStatus }>(
          `SELECT created_at, to_email, subject, body_text, status FROM email_messages WHERE id = $1`,
          [id],
        );
        if (!row || row.status === 'recorded') return row?.status ?? 'uncertain';
        if (row.status !== 'uncertain') return row.status;
        if (!firstAttempt) {
          const created = Date.parse(row.created_at);
          if (!Number.isFinite(created) || clock().getTime() - created >= RESEND_IDEMPOTENCY_WINDOW_MS) return 'withheld';
        }
        return finish(id, { to: row.to_email, subject: row.subject, text: row.body_text }, firstAttempt);
      });
    },
  };
}

export type Mailer = ReturnType<typeof createMailer>;
