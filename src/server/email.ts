import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { newId } from '../shared/factory';
import type { Db } from './db';

/**
 * Outgoing email (ADR 0006: Amazon SES). Every message is written to `email_messages` first, so
 * an organizer can see what was sent, what failed, and what the local build only recorded.
 * A failed send never changes the membership, order, or payment it is about.
 *
 * The beta is test-only (owner, November 15, 2026): by default nothing leaves this computer.
 * `EMAIL_MODE=ses` sends through SES in the project's own AWS account; while that account is
 * in the SES sandbox, SES delivers only to addresses verified in it.
 */

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  /** `local`: recorded only, never sent. `ses`: sent through Amazon SES. */
  mode: 'local' | 'ses';
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

/**
 * SES with credentials from a named AWS profile. The profile is required so the SDK never falls
 * back to whatever AWS_PROFILE the shell happens to have.
 */
function sesEmail(opts: { region: string; from: string; profile: string; configurationSet?: string }): EmailSender {
  const client = new SESv2Client({ region: opts.region, profile: opts.profile });
  return {
    mode: 'ses',
    async send(m) {
      const out = await client.send(
        new SendEmailCommand({
          FromEmailAddress: opts.from,
          Destination: { ToAddresses: [m.to] },
          Content: { Simple: { Subject: { Data: m.subject, Charset: 'UTF-8' }, Body: { Text: { Data: m.text, Charset: 'UTF-8' } } } },
          ConfigurationSetName: opts.configurationSet,
        }),
      );
      return out.MessageId ?? '';
    },
  };
}

/** Local unless `EMAIL_MODE=ses`, which needs SES_REGION, EMAIL_FROM, and SES_AWS_PROFILE and is refused in production. */
export function emailFromEnv(env: Record<string, string | undefined> = process.env): EmailSender {
  if (env.EMAIL_MODE !== 'ses') return localEmail();
  if (env.NODE_ENV === 'production') throw new Error('EMAIL_MODE=ses is for the test-only beta and cannot run with NODE_ENV=production.');
  const region = env.SES_REGION?.trim();
  const from = env.EMAIL_FROM?.trim();
  const profile = env.SES_AWS_PROFILE?.trim();
  if (!region || !from || !profile) throw new Error('EMAIL_MODE=ses needs SES_REGION, EMAIL_FROM, and SES_AWS_PROFILE. See docs/runbooks/local-setup.md.');
  return sesEmail({ region, from, profile, configurationSet: env.SES_CONFIGURATION_SET?.trim() || undefined });
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
