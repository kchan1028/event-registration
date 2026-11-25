import { createHmac } from 'node:crypto';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { EmailRefusal, EmailUncertain, localEmail, type EmailSender } from '../src/server/email';
import { INVITATION_DAYS } from '../src/shared/roles';
import { as, fakeAuth } from './support/auth';
import { testApp, testDatabaseUrl } from './support/db';

/**
 * A bounce or a complaint stops later invitation mail in that organization until an owner allows a send.
 * The allowed send does not add days. Delivery events still store no address or bounce text.
 */

const SECRET = `whsec_${Buffer.from('suppression-webhook-secret').toString('base64')}`;
const NOW = new Date('2027-05-02T15:00:00.000Z');
const DAY = 86_400_000;
const OWNER = 'owner.stop@example.test';
const ADDRESS = 'finance.stop@example.test';
const OPEN = 'This address bounced or a complaint was received. Mail to it stays stopped until an owner sends the invitation again without extending it.';
const NEW_INVITE = 'This address bounced or a complaint was received. Mail stays stopped until an owner allows one new invitation.';
const NOT_STOPPED = 'This address is not stopped. Add the person from Team and roles.';
const STILL_OPEN = 'This invitation is still open. Send it again without extending it.';
const CHANGED = 'This invitation changed, so this request sent no email.';
const ENDED = `This invitation has ended. Allow one new invitation. That starts ${INVITATION_DAYS} days from now.`;

type Invitation = {
  email: string;
  role: string;
  expiresAt: string;
  revision: string;
  earlierEmail: boolean;
  suppressed: 'bounced' | 'complained' | null;
  lastEmail: { attemptId: string; status: string } | null;
};
type Team = { invitations: Invitation[]; stoppedEmails: { email: string; reason: string }[]; history: { action: string; email: string }[]; members: { email: string; role: string }[] };

function sign(body: string, id: string, timestamp: string): string {
  return `v1,${createHmac('sha256', Buffer.from(SECRET.slice('whsec_'.length), 'base64')).update(`${id}.${timestamp}.${body}`).digest('base64')}`;
}

function eventBody(type: string, emailId: string, createdAt: string): string {
  return JSON.stringify({
    type,
    created_at: createdAt,
    data: { email_id: emailId, bounce: { message: 'bounce-diagnostic-do-not-store hidden-recipient@example.test' } },
  });
}

async function postBounce(app: { inject: (opts: object) => Promise<{ statusCode: number }> }, providerId: string, eventId: string, type = 'email.bounced', createdAt = '2027-05-02T16:00:00.000Z') {
  const body = eventBody(type, providerId, createdAt);
  const timestamp = String(Math.floor(NOW.getTime() / 1000));
  const res = await app.inject({
    method: 'POST',
    url: '/api/email/resend/webhook',
    headers: { 'content-type': 'application/json', 'svix-id': eventId, 'svix-timestamp': timestamp, 'svix-signature': sign(body, eventId, timestamp) },
    payload: body,
  });
  expect(res.statusCode).toBe(200);
}

async function harness(email: EmailSender = localEmail()) {
  const databaseUrl = await testDatabaseUrl();
  const { app, access } = await testApp({ databaseUrl, auth: fakeAuth(), email, now: () => NOW, emailWebhookSecret: SECRET });
  const call = (method: 'GET' | 'POST', url: string, payload?: object, who = OWNER) => app.inject({ method, url, headers: as(who), payload });
  const created = await call('POST', '/api/organizations', { name: 'Stop Club' });
  expect(created.statusCode).toBe(201);
  const orgId = (created.json() as { id: string }).id;
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const team = async () => (await call('GET', `/api/organizations/${orgId}/members`)).json() as Team;
  return { app, access, call, orgId, client, team };
}

async function invite(call: (method: 'POST', url: string, payload?: object) => Promise<{ statusCode: number; json: () => unknown }>, orgId: string, email = ADDRESS, role = 'finance') {
  const res = await call('POST', `/api/organizations/${orgId}/members`, { email, role });
  expect(res.statusCode).toBe(200);
  return ((res.json() as Team).invitations.find((row) => row.email === email && row.role === role))!;
}

async function stop(app: { inject: (opts: object) => Promise<{ statusCode: number }> }, client: pg.Client, attemptId: string, providerId: string, eventId: string, type?: string) {
  await client.query(`UPDATE email_messages SET provider_message_id = $2, to_email = '  ' || to_email || '  ' WHERE id = $1`, [attemptId, providerId]);
  await postBounce(app, providerId, eventId, type);
}

describe('invitation mail stops', () => {
  it('keeps the first bounce or complaint, and only in that organization', async () => {
    const { app, client, call, orgId, team } = await harness();
    try {
      const row = await invite(call, orgId);
      await stop(app, client, row.lastEmail!.attemptId, 're_stop_1', 'evt_bounce');
      const stopped = await team();
      expect(stopped.invitations[0]).toMatchObject({ suppressed: 'bounced', expiresAt: row.expiresAt, revision: row.revision });
      expect(stopped.stoppedEmails).toEqual([{ email: ADDRESS, reason: 'bounced' }]);
      await postBounce(app, 're_stop_1', 'evt_complaint', 'email.complained', '2027-05-02T17:00:00.000Z');
      expect((await client.query<{ reason: string; email: string }>(`SELECT email, reason FROM email_suppressions WHERE cleared_at IS NULL`)).rows).toEqual([{ email: ADDRESS, reason: 'bounced' }]);
      const leaked = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM email_suppressions WHERE email ILIKE '%bounce-diagnostic%' OR email ILIKE '%hidden-recipient%' OR reason ILIKE '%bounce-diagnostic%'`,
      );
      expect(leaked.rows[0].n).toBe(0);

      const otherOwner = 'owner.other.stop@example.test';
      const other = await call('POST', '/api/organizations', { name: 'Other Club' }, otherOwner);
      const otherId = (other.json() as { id: string }).id;
      const across = await call('POST', `/api/organizations/${otherId}/members`, { email: ADDRESS, role: 'finance' }, otherOwner);
      expect(across.statusCode).toBe(200);
      expect((across.json() as Team).stoppedEmails).toEqual([]);
      expect((across.json() as Team).invitations[0].suppressed).toBeNull();
    } finally {
      await client.end();
    }
  });

  it('refuses a renewing resend and a retry before the deadline changes', async () => {
    const email: EmailSender = {
      mode: 'resend',
      async send() {
        throw new EmailUncertain('Send outcome unknown after a timeout.');
      },
    };
    const { app, client, call, orgId } = await harness(email);
    try {
      const row = await invite(call, orgId);
      await stop(app, client, row.lastEmail!.attemptId, 're_retry', 'evt_retry_bounce');
      const renew = await call('POST', `/api/organizations/${orgId}/invitations/resend`, { email: ADDRESS, role: 'finance', revision: row.revision });
      expect(renew.statusCode).toBe(409);
      expect(renew.json()).toEqual({ error: OPEN });
      const retry = await call('POST', `/api/organizations/${orgId}/members`, { email: ADDRESS, role: 'finance', retryAttempt: row.lastEmail!.attemptId });
      expect(retry.statusCode).toBe(409);
      expect(retry.json()).toEqual({ error: OPEN });
      const stored = await client.query<{ expires_at: Date; revision: string; renewed: number }>(
        `SELECT i.expires_at, i.revision, (SELECT count(*)::int FROM membership_changes WHERE action = 'invitation_renewed') AS renewed
         FROM organization_invitations i`,
      );
      expect(stored.rows).toEqual([{ expires_at: new Date(row.expiresAt), revision: row.revision, renewed: 0 }]);
    } finally {
      await client.end();
    }
  });

  it('sends an open invitation again without adding days, and clears only after an accepted attempt', async () => {
    let mode: 'accept' | 'refuse' | 'unknown' = 'accept';
    const email: EmailSender = {
      mode: 'resend',
      async send() {
        if (mode === 'refuse') throw new EmailRefusal('Resend returned HTTP 403.');
        if (mode === 'unknown') throw new EmailUncertain('Send outcome unknown after a timeout.');
        return 'msg-allowed';
      },
    };
    const { app, client, call, orgId, team } = await harness(email);
    try {
      const row = await invite(call, orgId);
      const plain = await call('POST', `/api/organizations/${orgId}/invitations/send-without-extending`, { email: ADDRESS, role: 'finance', revision: row.revision });
      expect(plain.statusCode).toBe(409);
      expect(plain.json()).toEqual({ error: NOT_STOPPED });
      await stop(app, client, row.lastEmail!.attemptId, 're_safe', 'evt_safe');
      mode = 'refuse';
      const failed = await call('POST', `/api/organizations/${orgId}/invitations/send-without-extending`, { email: ADDRESS, role: 'finance', revision: row.revision });
      expect(failed.statusCode).toBe(200);
      expect((failed.json() as Team).invitations[0]).toMatchObject({ expiresAt: row.expiresAt, suppressed: 'bounced', lastEmail: { status: 'failed' } });
      expect((await client.query(`SELECT count(*)::int AS n FROM email_suppressions WHERE cleared_at IS NULL`)).rows[0].n).toBe(1);
      mode = 'unknown';
      const uncertain = await call('POST', `/api/organizations/${orgId}/invitations/send-without-extending`, { email: ADDRESS, role: 'finance', revision: row.revision });
      expect(uncertain.statusCode).toBe(200);
      const cleared = await team();
      expect(cleared.invitations[0]).toMatchObject({ expiresAt: row.expiresAt, revision: row.revision, suppressed: null, lastEmail: { status: 'uncertain' } });
      expect(cleared.stoppedEmails).toEqual([]);
      expect(cleared.history.filter((item) => item.email === ADDRESS).map((item) => item.action)).toEqual(['invited']);
      const audit = await client.query<{ cleared_by: string; cleared_email_id: string }>(`SELECT cleared_by, cleared_email_id FROM email_suppressions WHERE cleared_at IS NOT NULL`);
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0].cleared_email_id).toBe(cleared.invitations[0].lastEmail!.attemptId);

      await client.query(`UPDATE email_messages SET provider_message_id = 're_again' WHERE id = $1`, [cleared.invitations[0].lastEmail!.attemptId]);
      await postBounce(app, 're_again', 'evt_again');
      expect((await team()).invitations[0].suppressed).toBe('bounced');
    } finally {
      await client.end();
    }
  });

  it('does not send an ended invitation, and allow starts a new 14 days', async () => {
    const { app, client, call, orgId } = await harness();
    try {
      const row = await invite(call, orgId);
      await stop(app, client, row.lastEmail!.attemptId, 're_ended', 'evt_ended');
      await client.query(`UPDATE organization_invitations SET expires_at = $2 WHERE email = $1`, [ADDRESS, '2027-05-01T15:00:00.000Z']);
      const current = (await client.query<{ revision: string }>(`SELECT revision FROM organization_invitations WHERE email = $1`, [ADDRESS])).rows[0].revision;
      const before = (await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM email_messages`)).rows[0].n;
      const sent = await call('POST', `/api/organizations/${orgId}/invitations/send-without-extending`, { email: ADDRESS, role: 'finance', revision: current });
      expect(sent.statusCode).toBe(409);
      expect(sent.json()).toEqual({ error: ENDED });
      const held = await client.query<{ expires_at: Date; n: number; active: number }>(
        `SELECT i.expires_at, (SELECT count(*)::int FROM email_messages) AS n, (SELECT count(*)::int FROM email_suppressions WHERE cleared_at IS NULL) AS active
         FROM organization_invitations i WHERE i.email = $1`,
        [ADDRESS],
      );
      expect(held.rows).toEqual([{ expires_at: new Date('2027-05-01T15:00:00.000Z'), n: before, active: 1 }]);
      const allowed = await call('POST', `/api/organizations/${orgId}/invitations/allow`, { email: ADDRESS, role: 'finance' });
      expect(allowed.statusCode).toBe(200);
      const opened = (allowed.json() as Team).invitations.find((item) => item.email === ADDRESS && item.role === 'finance')!;
      expect(opened).toMatchObject({ suppressed: null, lastEmail: { status: 'recorded' } });
      expect(Date.parse(opened.expiresAt) - NOW.getTime()).toBe(INVITATION_DAYS * DAY);
      expect(opened.revision).not.toBe(row.revision);
      expect((allowed.json() as Team).history.filter((item) => item.action === 'invitation_renewed')).toEqual([]);
      expect((allowed.json() as Team).stoppedEmails).toEqual([]);
    } finally {
      await client.end();
    }
  });

  it('allows one new invitation after cancel, and a grant does not clear the stop', async () => {
    const { app, access, client, call, orgId, team } = await harness();
    try {
      const row = await invite(call, orgId);
      await stop(app, client, row.lastEmail!.attemptId, 're_allow', 'evt_allow');
      const tooSoon = await call('POST', `/api/organizations/${orgId}/invitations/allow`, { email: ADDRESS, role: 'finance' });
      expect(tooSoon.statusCode).toBe(409);
      expect(tooSoon.json()).toEqual({ error: STILL_OPEN });
      const missing = await call('POST', `/api/organizations/${orgId}/invitations/send-without-extending`, { email: 'absent.stop@example.test', role: 'finance', revision: row.revision });
      expect(missing.statusCode).toBe(409);
      expect(missing.json()).toEqual({ error: CHANGED });
      expect((await call('POST', `/api/organizations/${orgId}/invitations/cancel`, { email: ADDRESS, role: 'finance', revision: row.revision })).statusCode).toBe(200);
      const blockedAdd = await call('POST', `/api/organizations/${orgId}/members`, { email: ADDRESS, role: 'finance' });
      expect(blockedAdd.statusCode).toBe(409);
      expect(blockedAdd.json()).toEqual({ error: NEW_INVITE });
      await access.addMember(orgId, ADDRESS, 'timer_export', null);
      const seeded = await team();
      expect(seeded.invitations).toEqual([expect.objectContaining({ email: ADDRESS, role: 'timer_export', suppressed: 'bounced', lastEmail: null })]);
      expect((await call('POST', `/api/organizations/${orgId}/invitations/cancel`, { email: ADDRESS, role: 'timer_export', revision: seeded.invitations[0].revision })).statusCode).toBe(200);

      const allowed = await call('POST', `/api/organizations/${orgId}/invitations/allow`, { email: ADDRESS, role: 'finance' });
      expect(allowed.statusCode).toBe(200);
      const opened = (allowed.json() as Team).invitations[0];
      expect(opened).toMatchObject({ email: ADDRESS, role: 'finance', suppressed: null, lastEmail: { status: 'recorded' } });
      expect(Date.parse(opened.expiresAt) - NOW.getTime()).toBe(INVITATION_DAYS * DAY);
      expect((allowed.json() as Team).history.filter((item) => item.action === 'invitation_renewed')).toEqual([]);
      expect((allowed.json() as Team).stoppedEmails).toEqual([]);

      await client.query(`UPDATE email_messages SET provider_message_id = 're_grant' WHERE id = $1`, [opened.lastEmail!.attemptId]);
      await postBounce(app, 're_grant', 'evt_grant');
      expect((await call('GET', '/api/me', undefined, ADDRESS)).statusCode).toBe(200);
      const beforeGrant = (await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM email_messages`)).rows[0].n;
      const granted = await call('POST', `/api/organizations/${orgId}/members`, { email: ADDRESS, role: 'check_in_volunteer' });
      expect(granted.statusCode).toBe(200);
      const afterGrant = granted.json() as Team;
      expect(afterGrant.members.map((member) => member.role).sort()).toEqual(['check_in_volunteer', 'finance', 'owner']);
      expect(afterGrant.stoppedEmails).toEqual([{ email: ADDRESS, reason: 'bounced' }]);
      expect((await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM email_messages`)).rows[0].n).toBe(beforeGrant);
    } finally {
      await client.end();
    }
  });
});
