import { createHmac } from 'node:crypto';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/server/app';
import { checkedWebhookSecret, emailWebhookSecretFromEnv, localEmail } from '../src/server/email';
import { as, fakeAuth } from './support/auth';
import { testApp, testDatabaseUrl } from './support/db';

/**
 * Resend delivery webhooks (ADR 0007). Signatures are checked in process.
 * No message is sent, and a delivery outcome does not change the invitation or the send.
 */

const SECRET = `whsec_${Buffer.from('test-webhook-secret-key').toString('base64')}`;
const NOW = new Date('2027-03-15T18:00:00.000Z');
const PROVIDER_ID = 're_delivery_1';
const BOUNCE_TEXT = 'bounce-diagnostic-do-not-store';
const HIDDEN_ADDRESS = 'hidden-recipient@example.test';
const HIDDEN_SUBJECT = 'hidden-subject-do-not-store';
const SIGNATURE_ERROR = 'Resend signature did not verify.';
const BODY_ERROR = 'Resend webhook could not be read.';

type Invitation = {
  email: string;
  role: string;
  expiresAt: string;
  revision: string;
  lastEmail: { attemptId: string; status: string; delivery: string | null } | null;
  suppressed?: 'bounced' | 'complained' | null;
};

function sign(body: string, id: string, timestamp: string, secret = SECRET): string {
  const mac = createHmac('sha256', Buffer.from(secret.slice('whsec_'.length), 'base64')).update(`${id}.${timestamp}.${body}`).digest('base64');
  return `v1,${mac}`;
}

function eventBody(type: string, emailId: string, createdAt: string): string {
  return JSON.stringify({
    type,
    created_at: createdAt,
    data: {
      email_id: emailId,
      created_at: '2020-01-01T00:00:00.000Z',
      from: 'hidden-from@example.test',
      to: [HIDDEN_ADDRESS],
      subject: HIDDEN_SUBJECT,
      bounce: { message: `${BOUNCE_TEXT} ${HIDDEN_ADDRESS}`, subType: 'General', type: 'Permanent' },
    },
  });
}

function headersFor(body: string, id: string, when = NOW, secret = SECRET) {
  const timestamp = String(Math.floor(when.getTime() / 1000));
  return {
    'content-type': 'application/json',
    'svix-id': id,
    'svix-timestamp': timestamp,
    'svix-signature': `v2,ignored ${sign(body, id, timestamp, secret)}`,
  };
}

async function post(app: { inject: (opts: { method: 'POST'; url: string; headers: Record<string, string>; payload: string }) => Promise<{ statusCode: number; json: () => unknown }> }, body: string, id: string, when = NOW) {
  return app.inject({ method: 'POST', url: '/api/email/resend/webhook', headers: headersFor(body, id, when), payload: body });
}

async function setup() {
  const databaseUrl = await testDatabaseUrl();
  const { app } = await testApp({ databaseUrl, auth: fakeAuth(), email: localEmail(), now: () => NOW, emailWebhookSecret: SECRET });
  const created = await app.inject({ method: 'POST', url: '/api/organizations', headers: as('owner.delivery@example.test'), payload: { name: 'Delivery Club' } });
  expect(created.statusCode).toBe(201);
  const orgId = (created.json() as { id: string }).id;
  const invited = await app.inject({ method: 'POST', url: `/api/organizations/${orgId}/members`, headers: as('owner.delivery@example.test'), payload: { email: 'finance.delivery@example.test', role: 'finance' } });
  expect(invited.statusCode).toBe(200);
  const invitation = (invited.json() as { invitations: Invitation[] }).invitations[0];
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  await client.query(`UPDATE email_messages SET provider_message_id = $2, status = 'sent', sent_at = created_at WHERE id = $1`, [invitation.lastEmail!.attemptId, PROVIDER_ID]);
  return { app, orgId, invitation, client };
}

describe('Resend webhook secret', () => {
  it('stays off until a test secret is set, and production refuses one', () => {
    expect(emailWebhookSecretFromEnv({})).toBeNull();
    expect(emailWebhookSecretFromEnv({ RESEND_WEBHOOK_SECRET: '  ' })).toBeNull();
    expect(emailWebhookSecretFromEnv({ RESEND_WEBHOOK_SECRET: ` ${SECRET} ` })).toBe(SECRET);
    expect(() => checkedWebhookSecret('whsec_!!!!')).toThrow(/whsec_/);
    expect(() => checkedWebhookSecret(SECRET, { NODE_ENV: 'production' })).toThrow(/NODE_ENV=production/);
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() => buildApp({ databaseUrl: 'postgres://127.0.0.1:1/unused', auth: fakeAuth(), email: localEmail(), emailWebhookSecret: SECRET })).toThrow(/NODE_ENV=production/);
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });
});

describe('Resend delivery webhook', () => {
  it('is absent until a secret is configured', async () => {
    const { app } = await testApp({ email: localEmail(), emailWebhookSecret: null });
    const res = await app.inject({ method: 'POST', url: '/api/email/resend/webhook', headers: { 'content-type': 'application/json' }, payload: '{}' });
    expect(res.statusCode).toBe(404);
  });

  it('records a newer outcome only, and leaves the invitation and send alone', async () => {
    const { app, orgId, invitation, client } = await setup();
    try {
      const delivered = eventBody('email.delivered', PROVIDER_ID, '2027-03-15T17:00:00.000Z');
      const bad = await app.inject({
        method: 'POST',
        url: '/api/email/resend/webhook',
        headers: { ...headersFor(delivered, 'evt_bad'), 'svix-signature': 'v1,not-the-signature' },
        payload: delivered,
      });
      expect(bad.statusCode).toBe(400);
      expect(bad.json()).toEqual({ error: SIGNATURE_ERROR });
      const stale = await post(app, delivered, 'evt_stale', new Date(NOW.getTime() - 301_000));
      const future = await post(app, delivered, 'evt_future', new Date(NOW.getTime() + 301_000));
      expect(stale.statusCode).toBe(400);
      expect(future.statusCode).toBe(400);
      expect(stale.json()).toEqual({ error: SIGNATURE_ERROR });
      const broken = await post(app, '{', 'evt_broken');
      const missing = await post(app, JSON.stringify({ type: 'email.bounced', created_at: '2027-03-15T17:00:00.000Z', data: {} }), 'evt_missing');
      const undated = await post(app, JSON.stringify({ type: 'email.bounced', created_at: 'not-a-date', data: { email_id: PROVIDER_ID } }), 'evt_undated');
      const hugeId = 'evt_huge_' + 'x'.repeat(260);
      const huge = await post(app, delivered, hugeId);
      expect([broken, missing, undated, huge].map((res) => res.statusCode)).toEqual([400, 400, 400, 400]);
      expect(huge.json()).toEqual({ error: BODY_ERROR });
      expect(JSON.stringify(huge.json())).not.toContain(BOUNCE_TEXT);

      const accepted = await post(app, delivered, 'evt_delivered', new Date(NOW.getTime() - 300_000));
      expect(accepted.statusCode).toBe(200);
      expect(accepted.json()).toEqual({ received: true });
      const sameTime = await post(app, eventBody('email.bounced', PROVIDER_ID, '2027-03-15T17:00:00.000Z'), 'evt_same');
      const older = await post(app, eventBody('email.bounced', PROVIDER_ID, '2027-03-15T16:00:00.000Z'), 'evt_older');
      const replay = await post(app, delivered, 'evt_delivered', new Date(NOW.getTime() - 300_000));
      expect([sameTime, older, replay].map((res) => res.statusCode)).toEqual([200, 200, 200]);

      const shown = (await app.inject({ method: 'GET', url: `/api/organizations/${orgId}/members`, headers: as('owner.delivery@example.test') })).json() as { members: { role: string }[]; invitations: Invitation[]; stoppedEmails: { email: string; reason: string }[] };
      expect(shown.members.map((member) => member.role)).toEqual(['owner']);
      expect(shown.invitations).toEqual([{
        email: invitation.email,
        role: 'finance',
        expiresAt: invitation.expiresAt,
        revision: invitation.revision,
        earlierEmail: false,
        suppressed: 'bounced',
        lastEmail: { attemptId: invitation.lastEmail!.attemptId, status: 'sent', at: expect.any(String), delivery: 'delivered' },
      }]);
      expect(shown.stoppedEmails).toEqual([{ email: invitation.email, reason: 'bounced' }]);

      const complained = await post(app, eventBody('email.complained', PROVIDER_ID, '2027-03-15T17:30:00.000Z'), 'evt_complaint');
      const unknown = await post(app, eventBody('email.bounced', 're_missing', '2027-03-15T18:00:00.000Z'), 'evt_unknown');
      const opened = await post(app, eventBody('email.opened', PROVIDER_ID, '2027-03-15T19:00:00.000Z'), 'evt_opened');
      expect(complained.statusCode).toBe(200);
      expect(unknown.statusCode).toBe(200);
      expect(opened.statusCode).toBe(200);

      const after = (await app.inject({ method: 'GET', url: `/api/organizations/${orgId}/members`, headers: as('owner.delivery@example.test') })).json() as { invitations: Invitation[] };
      expect(after.invitations[0].expiresAt).toBe(invitation.expiresAt);
      expect(after.invitations[0].revision).toBe(invitation.revision);
      expect(after.invitations[0].lastEmail).toMatchObject({ status: 'sent', delivery: 'complained' });
      expect(after.invitations[0]).toMatchObject({ suppressed: 'bounced' });
      expect((await client.query<{ reason: string }>(`SELECT reason FROM email_suppressions WHERE cleared_at IS NULL`)).rows).toEqual([{ reason: 'bounced' }]);

      const events = await client.query<{ id: string; kind: string }>(`SELECT id, kind FROM email_delivery_events ORDER BY occurred_at, id`);
      expect(events.rows).toEqual([
        { id: 'evt_older', kind: 'bounced' },
        { id: 'evt_delivered', kind: 'delivered' },
        { id: 'evt_same', kind: 'bounced' },
        { id: 'evt_complaint', kind: 'complained' },
      ]);
      const saved = await client.query<{ status: string; delivery_status: string }>(`SELECT status, delivery_status FROM email_messages`);
      expect(saved.rows).toEqual([{ status: 'sent', delivery_status: 'complained' }]);
      const leaked = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM (
           SELECT subject AS t FROM email_messages
           UNION ALL SELECT body_text FROM email_messages
           UNION ALL SELECT COALESCE(error, '') FROM email_messages
           UNION ALL SELECT to_email FROM email_messages
           UNION ALL SELECT COALESCE(from_email, '') FROM email_messages
           UNION ALL SELECT COALESCE(provider_message_id, '') FROM email_messages
           UNION ALL SELECT id FROM email_delivery_events
           UNION ALL SELECT kind FROM email_delivery_events
           UNION ALL SELECT email FROM email_suppressions
           UNION ALL SELECT reason FROM email_suppressions
           UNION ALL SELECT id FROM email_suppressions
         ) s WHERE t ILIKE $1 OR t ILIKE $2 OR t ILIKE $3 OR t ILIKE '%hidden-from%'`,
        [`%${BOUNCE_TEXT}%`, `%${HIDDEN_SUBJECT}%`, `%${HIDDEN_ADDRESS}%`],
      );
      expect(leaked.rows[0].n).toBe(0);
      await expect(client.query(`UPDATE email_messages SET delivery_status = 'nope'`)).rejects.toMatchObject({ code: '23514' });
    } finally {
      await client.end();
    }
  });

  it('writes nothing when the provider id matches more than one message', async () => {
    const { app, client } = await setup();
    try {
      const second = await app.inject({ method: 'POST', url: `/api/organizations/${(await client.query<{ organization_id: string }>(`SELECT organization_id FROM email_messages`)).rows[0].organization_id}/members`, headers: as('owner.delivery@example.test'), payload: { email: 'timer.delivery@example.test', role: 'timer_export' } });
      expect(second.statusCode).toBe(200);
      await client.query(`UPDATE email_messages SET provider_message_id = $1, status = 'sent'`, [PROVIDER_ID]);
      const res = await post(app, eventBody('email.bounced', PROVIDER_ID, '2027-03-15T17:00:00.000Z'), 'evt_ambiguous');
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ received: true });
      expect((await client.query(`SELECT count(*)::int AS n FROM email_delivery_events`)).rows[0].n).toBe(0);
      expect((await client.query(`SELECT count(*)::int AS n FROM email_messages WHERE delivery_status IS NOT NULL`)).rows[0].n).toBe(0);
      expect((await client.query(`SELECT count(*)::int AS n FROM email_suppressions`)).rows[0].n).toBe(0);
    } finally {
      await client.end();
    }
  });
});
