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
  /** Sends one message and returns the provider's message ID. Throws when the provider refuses it. */
  send(message: OutgoingEmail): Promise<string>;
}

export type EmailStatus = 'recorded' | 'sent' | 'failed';

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
    async send(message) {
      if (!testRecipients.has(message.to.trim().toLowerCase())) {
        throw new Error('Recipient is outside the configured email test list.');
      }
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        redirect: 'error',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...message, from, to: [message.to] }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Resend returned HTTP ${response.status}.`);
      const result = await response.json() as { id?: unknown } | null;
      if (typeof result?.id !== 'string' || !result.id) throw new Error('Resend returned no message ID.');
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

/** Writes the message, tries to send it, and records the outcome. Never throws for a send failure. */
export function createMailer(db: Db, sender: EmailSender, clock: () => Date) {
  return {
    async deliver(kind: 'organizer_invitation', ref: string, organizationId: string, message: OutgoingEmail): Promise<EmailStatus> {
      const id = newId('eml');
      await db.run(
        `INSERT INTO email_messages (id, organization_id, kind, ref, to_email, subject, body_text, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, 'recorded', $8)`,
        [id, organizationId, kind, ref, message.to, message.subject, message.text, clock().toISOString()],
      );
      if (sender.mode === 'local') return 'recorded';
      try {
        const providerId = await sender.send(message);
        await db.run(`UPDATE email_messages SET status = 'sent', provider_message_id = $1, sent_at = $2 WHERE id = $3`, [providerId, clock().toISOString(), id]);
        return 'sent';
      } catch (err) {
        await db.run(`UPDATE email_messages SET status = 'failed', error = $1 WHERE id = $2`, [String((err as Error).message ?? err).slice(0, 500), id]);
        return 'failed';
      }
    },
  };
}

export type Mailer = ReturnType<typeof createMailer>;
