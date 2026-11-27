import pg from 'pg';
import { describe, expect, it, vi } from 'vitest';
import type { GuardianInvitation } from '../src/shared/juniors';
import type { EventConfig } from '../src/shared/schema';
import { as, fakeAuth } from './support/auth';
import { testApp, testDatabaseUrl } from './support/db';
import { createMailer, guardianInvitationText, type EmailSender } from '../src/server/email';
import { openDb } from '../src/server/db';
import { createJuniors } from '../src/server/juniors';
import { publishReviewed } from './support/publish';

// Guardian access to juniors (owner decision, November 15, 2026; docs/discovery/guardian-accounts.md):
// one guardian per junior, and an optional read-only login for the junior. Sessions are faked.

const ORGANIZER = 'owner@valley.test';
const PARENT = 'parent@family-a.test';
const OTHER_PARENT = 'parent@family-b.test';
const JUNIOR = 'sam@family-a.test';

type Method = 'GET' | 'POST';

async function setup(now?: () => Date, email?: EmailSender) {
  const databaseUrl = await testDatabaseUrl();
  const { app } = await testApp({ auth: fakeAuth(), databaseUrl, now, email });
  const call = (who: string, method: Method, url: string, payload?: object) => app.inject({ method, url, headers: as(who), payload });
  const { eventId } = (await call(ORGANIZER, 'POST', '/api/demo')).json() as { eventId: string };
  await publishReviewed(app, `/api/events/${eventId}`, { acknowledgeWarnings: true }, as(ORGANIZER));
  const { config } = (await call(ORGANIZER, 'GET', `/api/events/${eventId}`)).json() as { config: EventConfig };
  const juniorCat = config.categories.find((c) => c.timingCode === 'RR-J1516')!.id;
  let n = 0;
  const registerJunior = async (who: string, firstName: string, lastName = 'Example') => {
    const rider = {
      firstName,
      lastName,
      email: '',
      team: '',
      racingAge: 16,
      licenseCategory: null,
      licenseType: 'annual',
      competitionClass: 'men',
      collegiateDivision: null,
      guardian: { name: 'Pat Example', relationship: 'Parent', email: who, phone: '' },
      emergencyContact: { name: 'Pat Example', phone: '555-555-0199' },
    };
    const waiver = { version: config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Pat Example', signerRole: 'guardian' };
    const res = await call(who, 'POST', `/api/rider/events/${eventId}/orders`, { clientRequestId: `junior-${++n}-xxxxxx`, categoryIds: [juniorCat], rider, waiver });
    expect(res.statusCode, res.body).toBe(201);
    return (res.json() as { id: string }).id;
  };
  return { call, registerJunior, databaseUrl, eventId, config };
}

describe('guardian and junior access', () => {
  it('records one initial guardian grant per profile without sharing access or duplicating it on reuse', async () => {
    const { call, registerJunior, databaseUrl } = await setup();
    await registerJunior(PARENT, 'Sam');
    await registerJunior(PARENT, 'Sam');
    await registerJunior(OTHER_PARENT, 'Sam');
    const parent = (await call(PARENT, 'GET', '/api/me')).json().account;
    const other = (await call(OTHER_PARENT, 'GET', '/api/me')).json().account;
    const [profile] = (await call(PARENT, 'GET', '/api/rider/juniors')).json();
    const [otherProfile] = (await call(OTHER_PARENT, 'GET', '/api/rider/juniors')).json();
    expect(profile.id).not.toBe(otherProfile.id);
    const client = new pg.Client({ connectionString: databaseUrl }); await client.connect();
    try {
      const grants = (await client.query(`SELECT junior_profile_id,account_id,granted_by,granted_at=p.created_at AS original_time,revoked_at FROM junior_guardians g JOIN junior_profiles p ON p.id=g.junior_profile_id ORDER BY account_id`)).rows;
      expect(grants).toEqual([
        { junior_profile_id: profile.id, account_id: parent.id, granted_by: parent.id, original_time: true, revoked_at: null },
        { junior_profile_id: otherProfile.id, account_id: other.id, granted_by: other.id, original_time: true, revoked_at: null },
      ].sort((a, b) => a.account_id.localeCompare(b.account_id)));
    } finally { await client.end(); }
  });

  it('records the authenticated waiver signer and declared age without rewriting them after a correction', async () => {
    const { call, registerJunior, databaseUrl } = await setup();
    const orderId = await registerJunior(PARENT, 'Sam');
    const account = (await call(PARENT, 'GET', '/api/me')).json().account;
    const original = (await call(PARENT, 'GET', `/api/orders/${orderId}`)).json();
    expect(original.waiverEvidence).toEqual({ signerAccountId: account.id, riderRacingAge: 16, acceptedAt: original.createdAt });
    expect((await call(ORGANIZER, 'POST', `/api/orders/${orderId}/rider-corrections`, { changes: { firstName: 'Sammie' }, reason: 'Correct the fictional rider name' })).statusCode).toBe(200);
    const corrected = (await call(PARENT, 'GET', `/api/orders/${orderId}`)).json();
    expect(corrected.rider.firstName).toBe('Sammie');
    expect(corrected.waiver).toEqual(original.waiver);
    expect(corrected.waiverEvidence).toEqual(original.waiverEvidence);
    const legacy = new pg.Client({ connectionString: databaseUrl });
    await legacy.connect();
    try { await legacy.query('UPDATE orders SET waiver_evidence_json = NULL WHERE id = $1', [orderId]); }
    finally { await legacy.end(); }
    expect((await call(PARENT, 'GET', `/api/orders/${orderId}`)).json().waiverEvidence).toBeNull();
  });

  it('keeps one profile per junior for the guardian who registers them, and hides it from other households', async () => {
    const { call, registerJunior } = await setup();
    const first = await registerJunior(PARENT, 'Sam');
    await registerJunior(PARENT, 'sam '); // the same junior, typed differently
    await registerJunior(PARENT, 'Alex');
    // Same letters, different first/last split: two juniors.
    await registerJunior(PARENT, 'Sam Example', 'Jones');
    await registerJunior(PARENT, 'Sam', 'Example Jones');
    const juniors = (await call(PARENT, 'GET', '/api/rider/juniors')).json() as { id: string; firstName: string; viewerEmail: string | null }[];
    expect(juniors.map((j) => j.firstName)).toEqual(['Sam', 'Alex', 'Sam Example', 'Sam']);
    expect(((await call(PARENT, 'GET', '/api/rider/registrations')).json() as { placedByYou: boolean }[]).map((o) => o.placedByYou)).toEqual([true, true, true, true, true]);

    // Another household sees none of it, and cannot name a login for this junior.
    expect((await call(OTHER_PARENT, 'GET', `/api/orders/${first}`)).statusCode).toBe(404);
    expect((await call(OTHER_PARENT, 'GET', '/api/rider/juniors')).json()).toEqual([]);
    expect((await call(OTHER_PARENT, 'GET', '/api/rider/registrations')).json()).toEqual([]);
    expect((await call(OTHER_PARENT, 'POST', `/api/rider/juniors/${juniors[0].id}/viewer`, { email: OTHER_PARENT })).statusCode).toBe(404);
  });

  it('lets the junior’s own login look at their registrations, never act, until the guardian stops sharing', async () => {
    const { call, registerJunior } = await setup();
    const orderId = await registerJunior(PARENT, 'Sam');
    const [sam] = (await call(PARENT, 'GET', '/api/rider/juniors')).json() as { id: string }[];

    expect((await call(JUNIOR, 'GET', `/api/orders/${orderId}`)).statusCode).toBe(404);
    expect((await call(PARENT, 'POST', `/api/rider/juniors/${sam.id}/viewer`, { email: PARENT })).statusCode).toBe(422);
    const shared = (await call(PARENT, 'POST', `/api/rider/juniors/${sam.id}/viewer`, { email: ' Sam@Family-A.test ' })).json() as { viewerEmail: string }[];
    expect(shared[0].viewerEmail).toBe(JUNIOR);

    expect((await call(JUNIOR, 'GET', `/api/orders/${orderId}`)).statusCode).toBe(200);
    const mine = (await call(JUNIOR, 'GET', '/api/rider/registrations')).json() as { id: string; placedByYou: boolean }[];
    expect(mine).toEqual([expect.objectContaining({ id: orderId, placedByYou: false })]);
    // Looking only: paying and cancelling stay with the guardian.
    expect((await call(JUNIOR, 'POST', `/api/orders/${orderId}/cancel`)).statusCode).toBe(404);
    expect((await call(JUNIOR, 'POST', `/api/orders/${orderId}/payment`, { attemptId: 'attempt-junior-1', outcome: 'success' })).statusCode).toBe(404);

    await call(PARENT, 'POST', `/api/rider/juniors/${sam.id}/viewer`, { email: null });
    expect((await call(JUNIOR, 'GET', `/api/orders/${orderId}`)).statusCode).toBe(404);
    expect((await call(JUNIOR, 'GET', '/api/rider/registrations')).json()).toEqual([]);
  });

  it('links junior orders placed before profiles existed when the guardian opens their juniors', async () => {
    const { call, registerJunior, databaseUrl } = await setup();
    const orderId = await registerJunior(PARENT, 'Sam');
    // As if the order predates migration 25: no profile link and no profile.
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query(`UPDATE orders SET junior_profile_id = NULL`);
    await client.query(`DELETE FROM junior_profiles`);
    await client.end();
    const [sam] = (await call(PARENT, 'GET', '/api/rider/juniors')).json() as { id: string; firstName: string }[];
    expect(sam.firstName).toBe('Sam');
    await call(PARENT, 'POST', `/api/rider/juniors/${sam.id}/viewer`, { email: JUNIOR });
    expect((await call(JUNIOR, 'GET', `/api/orders/${orderId}`)).statusCode).toBe(200);
  });

  it('keeps one profile when an organizer corrects the junior’s name', async () => {
    const { call, registerJunior } = await setup();
    const first = await registerJunior(PARENT, 'Sma');
    const [profile] = (await call(PARENT, 'GET', '/api/rider/juniors')).json() as { id: string }[];
    await call(PARENT, 'POST', `/api/rider/juniors/${profile.id}/viewer`, { email: JUNIOR });
    expect((await call(ORGANIZER, 'POST', `/api/orders/${first}/rider-corrections`, { changes: { firstName: 'Sam' }, reason: 'Typo at checkout' })).statusCode).toBe(200);
    const second = await registerJunior(PARENT, 'Sam');
    const juniors = (await call(PARENT, 'GET', '/api/rider/juniors')).json() as { id: string; firstName: string; viewerEmail: string | null }[];
    expect(juniors).toEqual([{ id: profile.id, firstName: 'Sam', lastName: 'Example', viewerEmail: JUNIOR }]);
    expect(((await call(JUNIOR, 'GET', '/api/rider/registrations')).json() as { id: string }[]).map((o) => o.id).sort()).toEqual([first, second].sort());
  });

  it('merges two profiles of the same junior when a correction makes their names match', async () => {
    const { call, registerJunior } = await setup();
    const typo1 = await registerJunior(PARENT, 'Sma');
    const typo2 = await registerJunior(PARENT, 'Sma');
    const right = await registerJunior(PARENT, 'Sam');
    const before = (await call(PARENT, 'GET', '/api/rider/juniors')).json() as { id: string; firstName: string }[];
    const typoProfile = before.find((j) => j.firstName === 'Sma')!;
    await call(PARENT, 'POST', `/api/rider/juniors/${typoProfile.id}/viewer`, { email: JUNIOR });
    expect((await call(ORGANIZER, 'POST', `/api/orders/${typo1}/rider-corrections`, { changes: { firstName: 'Sam' }, reason: 'Typo at checkout' })).statusCode).toBe(200);
    const after = (await call(PARENT, 'GET', '/api/rider/juniors')).json() as { firstName: string; viewerEmail: string | null }[];
    expect(after).toEqual([expect.objectContaining({ firstName: 'Sam', viewerEmail: JUNIOR })]);
    expect(((await call(JUNIOR, 'GET', '/api/rider/registrations')).json() as { id: string }[]).map((o) => o.id).sort()).toEqual([typo1, typo2, right].sort());
  });

  it('finds a profile saved with the earlier space-joined key, keeping its viewer access', async () => {
    const { call, registerJunior, databaseUrl } = await setup();
    const first = await registerJunior(PARENT, 'Sam');
    const [sam] = (await call(PARENT, 'GET', '/api/rider/juniors')).json() as { id: string }[];
    await call(PARENT, 'POST', `/api/rider/juniors/${sam.id}/viewer`, { email: JUNIOR });
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query(`UPDATE junior_profiles SET name_key = 'sam example'`);
    await client.end();
    const second = await registerJunior(PARENT, 'Sam');
    expect(((await call(PARENT, 'GET', '/api/rider/juniors')).json() as { id: string }[]).map((j) => j.id)).toEqual([sam.id]);
    expect(((await call(JUNIOR, 'GET', '/api/rider/registrations')).json() as { id: string }[]).map((o) => o.id).sort()).toEqual([first, second].sort());
  });
});


describe('guardian invitation records without access grants', () => {
  it('records one invitation email, preserves replay identity and grants no account access', async () => {
    let time = new Date('2027-01-01T12:00:00Z');
    const { call, registerJunior, databaseUrl } = await setup(() => time);
    const order = await registerJunior(PARENT, 'Sam');
    const [sam] = (await call(PARENT, 'GET', '/api/rider/juniors')).json();
    const parent = (await call(PARENT, 'GET', '/api/me')).json().account;
    await call(OTHER_PARENT, 'GET', '/api/me');
    const url = `/api/rider/juniors/${sam.id}/guardian-invitations`;
    const first = await call(PARENT, 'POST', url, { email: `  ${OTHER_PARENT.toUpperCase()}  ` });
    expect(first.statusCode, first.body).toBe(200);
    const [invite] = first.json() as GuardianInvitation[];
    expect(invite).toMatchObject({ email: OTHER_PARENT, invitedBy: parent.id, status: 'pending', createdAt: time.toISOString(), expiresAt: '2027-01-15T12:00:00.000Z', cancelledAt: null, cancelledBy: null, cancellationReason: null });
    time = new Date('2027-01-01T13:00:00Z');
    const repeated = await Promise.all([call(PARENT, 'POST', url, { email: OTHER_PARENT }), call(PARENT, 'POST', url, { email: OTHER_PARENT })]);
    for (const response of repeated) expect(response.json()).toEqual([invite]);
    expect((await call(OTHER_PARENT, 'GET', `/api/orders/${order}`)).statusCode).toBe(404);
    expect((await call(OTHER_PARENT, 'POST', `/api/orders/${order}/cancel`)).statusCode).toBe(404);
    expect((await call(OTHER_PARENT, 'POST', `/api/orders/${order}/payment`, { attemptId: 'invited-parent-payment', outcome: 'success' })).statusCode).toBe(404);
    expect((await call(OTHER_PARENT, 'GET', '/api/rider/registrations')).json()).toEqual([]);
    const client = new pg.Client({ connectionString: databaseUrl }); await client.connect();
    try {
      expect((await client.query(`SELECT id FROM junior_guardians`)).rowCount).toBe(1);
      const recorded = (await client.query(`SELECT kind, organization_id, ref, guardian_invitation_id, to_email, subject, body_text, status, from_email FROM email_messages`)).rows;
      expect(recorded).toEqual([{
        kind: 'guardian_invitation', organization_id: null, ref: invite.id, guardian_invitation_id: invite.id,
        to_email: OTHER_PARENT, subject: 'You are invited to CycleReg', status: 'recorded', from_email: null,
        body_text: `You have an invitation on CycleReg. It ends at ${invite.expiresAt}. Sign in with this address and open My registrations to accept it.`,
      }]);
      const replaced = await call(PARENT, 'POST', url, { email: 'second.guardian@example.test' });
      expect(replaced.statusCode, replaced.body).toBe(200);
      const [open] = replaced.json() as GuardianInvitation[];
      const both = (await client.query<{ ref: string; to_email: string; body_text: string }>(`SELECT ref, to_email, body_text FROM email_messages ORDER BY created_at, seq`)).rows;
      expect(both.map((row) => [row.ref, row.to_email])).toEqual([[invite.id, OTHER_PARENT], [open.id, 'second.guardian@example.test']]);
      for (const row of both) {
        expect(row.body_text).not.toContain('Sam');
        expect(row.body_text).not.toContain('Pat');
        expect(row.body_text).not.toContain(PARENT);
        expect(row.body_text).not.toContain(order);
        expect(row.body_text).not.toContain('@');
      }
    } finally { await client.end(); }
  });

  it('saves the test sender on a guardian invitation and does not send it', async () => {
    let sent = 0;
    const sender: EmailSender = { mode: 'resend', from: 'sender@example.test', async send() { sent += 1; return 're_unused'; } };
    const { call, registerJunior, databaseUrl } = await setup(undefined, sender);
    await registerJunior(PARENT, 'Sam');
    const [sam] = (await call(PARENT, 'GET', '/api/rider/juniors')).json();
    const res = await call(PARENT, 'POST', `/api/rider/juniors/${sam.id}/guardian-invitations`, { email: OTHER_PARENT });
    expect(res.statusCode, res.body).toBe(200);
    expect(sent).toBe(0);
    const client = new pg.Client({ connectionString: databaseUrl }); await client.connect();
    try {
      expect((await client.query(`SELECT status, from_email FROM email_messages`)).rows).toEqual([{ status: 'recorded', from_email: 'sender@example.test' }]);
    } finally { await client.end(); }
  });

  it('dispatches an open guardian invitation once and skips a closed or stopped address', async () => {
    const send = vi.fn().mockResolvedValue('re_guardian');
    const now = new Date('2027-01-01T12:00:00Z');
    const sender: EmailSender = { mode: 'resend', from: 'sender@example.test', send };
    const { call, registerJunior, databaseUrl } = await setup(() => now, sender);
    await call(OTHER_PARENT, 'GET', '/api/me');
    await registerJunior(PARENT, 'Sam');
    const [sam] = (await call(PARENT, 'GET', '/api/rider/juniors')).json();
    const url = `/api/rider/juniors/${sam.id}/guardian-invitations`;
    const pending = (rows: GuardianInvitation[]) => {
      const open = rows.filter((item) => item.status === 'pending');
      expect(open).toHaveLength(1);
      return open[0];
    };
    const invite = pending((await call(PARENT, 'POST', url, { email: OTHER_PARENT })).json() as GuardianInvitation[]);
    const db = openDb(databaseUrl);
    const mailer = createMailer(db, sender, () => now);
    try {
      expect(send).not.toHaveBeenCalled();
      const first = await db.get<{ id: string }>(`SELECT id FROM email_messages WHERE guardian_invitation_id = $1`, [invite.id]);
      const localSend = vi.fn().mockResolvedValue('local-should-not-send');
      await createMailer(db, { mode: 'local', send: localSend }, () => now).dispatchNextRiderEmail();
      expect(localSend).not.toHaveBeenCalled();
      await db.run(`UPDATE email_messages SET from_email = NULL WHERE id = $1`, [first!.id]);
      await mailer.dispatchNextRiderEmail();
      expect(send).not.toHaveBeenCalled();
      await db.run(`UPDATE email_messages SET from_email = $2 WHERE id = $1`, [first!.id, 'sender@example.test']);
      await mailer.dispatchNextRiderEmail();
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][1]).toBe(first!.id);
      expect(send.mock.calls[0][0]).toMatchObject({
        from: sender.from,
        to: OTHER_PARENT,
        subject: 'You are invited to CycleReg',
        text: guardianInvitationText(invite.expiresAt),
      });
      expect(send.mock.calls[0][0].text).not.toContain('Sam');
      expect(send.mock.calls[0][0].text).not.toContain('@');
      expect(await db.get(`SELECT status, organization_id FROM email_messages WHERE id = $1`, [first!.id])).toEqual({ status: 'sent', organization_id: null });
      await mailer.dispatchNextRiderEmail();
      expect(send).toHaveBeenCalledTimes(1);

      await db.run(
        `INSERT INTO email_delivery_events (id, email_id, kind, occurred_at) VALUES ('guardian-bounce', $1, 'bounced', $2)`,
        [first!.id, now.toISOString()],
      );
      expect((await call(PARENT, 'POST', `${url}/${invite.id}/cancel`)).statusCode).toBe(200);
      const retried = pending((await call(PARENT, 'POST', url, { email: OTHER_PARENT })).json() as GuardianInvitation[]);
      const stopped = await db.get<{ id: string; status: string }>(`SELECT id, status FROM email_messages WHERE guardian_invitation_id = $1`, [retried.id]);
      expect(stopped!.status).toBe('recorded');
      await mailer.dispatchNextRiderEmail();
      expect(send).toHaveBeenCalledTimes(1);
      await db.run(`DELETE FROM email_delivery_events WHERE id = 'guardian-bounce'`);
      await mailer.dispatchNextRiderEmail();
      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[1][1]).toBe(stopped!.id);
      expect((await call(PARENT, 'POST', `${url}/${retried.id}/cancel`)).statusCode).toBe(200);

      const second = pending((await call(PARENT, 'POST', url, { email: 'second.guardian@example.test' })).json() as GuardianInvitation[]);
      expect((await call(PARENT, 'POST', `${url}/${second.id}/cancel`)).statusCode).toBe(200);
      await mailer.dispatchNextRiderEmail();
      expect(send).toHaveBeenCalledTimes(2);
      expect(await db.get<{ status: string }>(`SELECT status FROM email_messages WHERE guardian_invitation_id = $1`, [second.id])).toEqual({ status: 'recorded' });

      const third = pending((await call(PARENT, 'POST', url, { email: 'third.guardian@example.test' })).json() as GuardianInvitation[]);
      await db.run(`UPDATE junior_guardian_invitations SET expires_at = '2020-01-01T00:00:00Z' WHERE id = $1`, [third.id]);
      await mailer.dispatchNextRiderEmail();
      expect(send).toHaveBeenCalledTimes(2);
      expect(await db.get<{ status: string }>(`SELECT status FROM email_messages WHERE guardian_invitation_id = $1`, [third.id])).toEqual({ status: 'recorded' });

      const open = pending((await call(PARENT, 'POST', url, { email: OTHER_PARENT })).json() as GuardianInvitation[]);
      expect((await call(OTHER_PARENT, 'POST', `/api/rider/guardian-invitations/${open.id}/accept`, { acknowledge: true })).statusCode).toBe(200);
      await mailer.dispatchNextRiderEmail();
      expect(send).toHaveBeenCalledTimes(2);
      expect(await db.get<{ status: string }>(`SELECT status FROM email_messages WHERE guardian_invitation_id = $1`, [open.id])).toEqual({ status: 'recorded' });
    } finally {
      await db.close();
    }
  });

  it('serializes replacements, keeps cancellation history and does not let an old cancellation close the new invitation', async () => {
    let time = new Date('2027-01-01T12:00:00Z');
    const { call, registerJunior } = await setup(() => time);
    await registerJunior(PARENT, 'Sam');
    const [sam] = (await call(PARENT, 'GET', '/api/rider/juniors')).json();
    const parent = (await call(PARENT, 'GET', '/api/me')).json().account;
    const url = `/api/rider/juniors/${sam.id}/guardian-invitations`;
    const [first] = (await call(PARENT, 'POST', url, { email: OTHER_PARENT })).json() as GuardianInvitation[];
    time = new Date('2027-01-02T12:00:00Z');
    const responses = await Promise.all(['one@invited.test', 'two@invited.test'].map((email) => call(PARENT, 'POST', url, { email })));
    for (const response of responses) expect(response.statusCode, response.body).toBe(200);
    let history = (await call(PARENT, 'GET', url)).json() as GuardianInvitation[];
    expect(history).toHaveLength(3);
    expect(history.filter((i) => i.status === 'pending')).toHaveLength(1);
    expect(history.find((i) => i.id === first.id)).toMatchObject({ status: 'cancelled', cancelledBy: parent.id, cancelledAt: time.toISOString(), cancellationReason: 'replaced' });
    await call(PARENT, 'POST', `${url}/${first.id}/cancel`);
    history = (await call(PARENT, 'GET', url)).json();
    const current = history.find((i) => i.status === 'pending')!;
    const cancelled = await call(PARENT, 'POST', `${url}/${current.id}/cancel`);
    expect(cancelled.statusCode).toBe(200);
    const snapshot = cancelled.json();
    time = new Date('2027-01-03T12:00:00Z');
    expect((await call(PARENT, 'POST', `${url}/${current.id}/cancel`)).json()).toEqual(snapshot);
    expect((await call(PARENT, 'GET', url)).json().filter((i: GuardianInvitation) => i.status === 'pending')).toEqual([]);
  });

  it('expires at the exact deadline and requires a new record rather than rewriting the original period', async () => {
    let time = new Date('2027-01-01T12:00:00Z');
    const { call, registerJunior } = await setup(() => time);
    await registerJunior(PARENT, 'Sam');
    const [sam] = (await call(PARENT, 'GET', '/api/rider/juniors')).json();
    const url = `/api/rider/juniors/${sam.id}/guardian-invitations`;
    const [original] = (await call(PARENT, 'POST', url, { email: OTHER_PARENT })).json() as GuardianInvitation[];
    time = new Date(original.expiresAt);
    expect((await call(PARENT, 'GET', url)).json()).toEqual([{ ...original, status: 'expired' }]);
    const renewed = (await call(PARENT, 'POST', url, { email: OTHER_PARENT })).json() as GuardianInvitation[];
    expect(renewed).toHaveLength(2);
    expect(renewed.find((i) => i.status === 'pending')!.id).not.toBe(original.id);
    expect(renewed.find((i) => i.id === original.id)).toMatchObject({ createdAt: original.createdAt, expiresAt: original.expiresAt, status: 'cancelled', cancellationReason: 'replaced' });
  });

  it('isolates household invitation history from other guardians, junior viewers and organizers', async () => {
    const { call, registerJunior } = await setup();
    await registerJunior(PARENT, 'Sam');
    await registerJunior(OTHER_PARENT, 'Alex');
    const [sam] = (await call(PARENT, 'GET', '/api/rider/juniors')).json();
    const [alex] = (await call(OTHER_PARENT, 'GET', '/api/rider/juniors')).json();
    await call(PARENT, 'POST', `/api/rider/juniors/${sam.id}/viewer`, { email: JUNIOR });
    const url = `/api/rider/juniors/${sam.id}/guardian-invitations`;
    const [invite] = (await call(PARENT, 'POST', url, { email: 'invited@fictional.test' })).json();
    for (const who of [OTHER_PARENT, JUNIOR, ORGANIZER]) {
      expect((await call(who, 'GET', url)).statusCode).toBe(404);
      expect((await call(who, 'POST', url, { email: 'intruder@fictional.test' })).statusCode).toBe(404);
      expect((await call(who, 'POST', `${url}/${invite.id}/cancel`)).statusCode).toBe(404);
    }
    expect((await call(OTHER_PARENT, 'POST', `/api/rider/juniors/${alex.id}/guardian-invitations/${invite.id}/cancel`)).statusCode).toBe(404);
    expect((await call(PARENT, 'GET', url)).json()).toEqual([invite]);
  });

  it('rejects invalid, self and junior-viewer addresses without replacing a valid invitation', async () => {
    const { call, registerJunior } = await setup();
    await registerJunior(PARENT, 'Sam');
    const [sam] = (await call(PARENT, 'GET', '/api/rider/juniors')).json();
    await call(PARENT, 'POST', `/api/rider/juniors/${sam.id}/viewer`, { email: JUNIOR });
    const url = `/api/rider/juniors/${sam.id}/guardian-invitations`;
    const snapshot = (await call(PARENT, 'POST', url, { email: OTHER_PARENT })).json();
    for (const email of ['invalid', '', `${'x'.repeat(250)}@fictional.test`]) expect((await call(PARENT, 'POST', url, { email })).statusCode).toBe(400);
    for (const email of [PARENT.toUpperCase(), JUNIOR.toUpperCase()]) expect((await call(PARENT, 'POST', url, { email })).statusCode).toBe(422);
    expect((await call(PARENT, 'GET', url)).json()).toEqual(snapshot);
  });

  it('cancels source-profile invitations on a name merge while retaining history and the target invitation', async () => {
    const { call, registerJunior, databaseUrl } = await setup();
    const typoOrder = await registerJunior(PARENT, 'Sma');
    await registerJunior(PARENT, 'Sam');
    const profiles = (await call(PARENT, 'GET', '/api/rider/juniors')).json() as { id: string; firstName: string }[];
    const source = profiles.find((p) => p.firstName === 'Sma')!;
    const target = profiles.find((p) => p.firstName === 'Sam')!;
    const url = (id: string) => `/api/rider/juniors/${id}/guardian-invitations`;
    const [old] = (await call(PARENT, 'POST', url(source.id), { email: 'source@invited.test' })).json();
    const [current] = (await call(PARENT, 'POST', url(target.id), { email: 'target@invited.test' })).json();
    const corrected = await call(ORGANIZER, 'POST', `/api/orders/${typoOrder}/rider-corrections`, { changes: { firstName: 'Sam' }, reason: 'Correct fictional name' });
    expect(corrected.statusCode, corrected.body).toBe(200);
    const actor = (await call(ORGANIZER, 'GET', '/api/me')).json().account;
    const history = (await call(PARENT, 'GET', url(target.id))).json() as GuardianInvitation[];
    expect(history).toHaveLength(2);
    expect(history.find((i) => i.id === old.id)).toMatchObject({ status: 'cancelled', cancellationReason: 'profile_merged', cancelledBy: actor.id, invitedBy: old.invitedBy, createdAt: old.createdAt });
    expect(history.find((i) => i.id === current.id)).toEqual(current);
    expect((await call(PARENT, 'GET', url(source.id))).statusCode).toBe(404);
    const client = new pg.Client({ connectionString: databaseUrl }); await client.connect();
    try {
      expect((await client.query(`SELECT junior_profile_id FROM junior_guardians WHERE revoked_at IS NULL`)).rows).toEqual([{ junior_profile_id: target.id }]);
    } finally { await client.end(); }
  });
});


describe('participant grouping across junior profile boundaries', () => {
  it.each(['adult order', 'second junior profile'] as const)('preserves separate participant groups for a linked %s', async (caseName) => {
    const { call, registerJunior, eventId, config } = await setup();
    const first = await registerJunior(PARENT, 'Sam');
    const secondBuyer = OTHER_PARENT;
    let second: string;
    if (caseName === 'adult order') {
      const category = config.categories.find((row) => row.timingCode === 'RR-M35-34')!;
      const created = await call(secondBuyer, 'POST', `/api/rider/events/${eventId}/orders`, {
        clientRequestId: 'participant-adult-order',
        categoryIds: [category.id],
        rider: {
          firstName: 'Sam', lastName: 'Example', email: secondBuyer, team: '',
          racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men',
          collegiateDivision: null, guardian: null,
          emergencyContact: { name: 'Pat Example', phone: '555-555-0199' },
        },
        waiver: {
          version: config.registration.waiverVersion, read: true, agreed: true,
          signatureName: 'Sam Example', signerRole: 'rider',
        },
      });
      expect(created.statusCode, created.body).toBe(201);
      second = created.json<{ id: string }>().id;
    } else {
      second = await registerJunior(secondBuyer, 'Sam');
    }
    for (const [buyer, orderId] of [[PARENT, first], [secondBuyer, second]]) {
      const paid = await call(buyer, 'POST', `/api/orders/${orderId}/payment`, {
        attemptId: `participant-payment-${orderId}`, outcome: 'success',
      });
      expect(paid.statusCode, paid.body).toBe(200);
    }

    const eventUrl = `/api/events/${eventId}`;
    const checkInUrl = `${eventUrl}/check-in?${new URLSearchParams({ day: config.days[0].id, q: 'Sam' })}`;
    const beforeLink = await call(ORGANIZER, 'GET', checkInUrl);
    expect(beforeLink.statusCode, beforeLink.body).toBe(200);
    expect(beforeLink.json().riders).toHaveLength(2);
    const linked = await call(ORGANIZER, 'POST', `${eventUrl}/rider-identity/link`, { orderIds: [first, second] });
    expect(linked.statusCode, linked.body).toBe(200);

    const checkIn = await call(ORGANIZER, 'GET', checkInUrl);
    expect(checkIn.statusCode, checkIn.body).toBe(200);
    expect(checkIn.json().riders).toHaveLength(1);

    const groups = await call(ORGANIZER, 'GET', `${eventUrl}/participant-groups`);
    expect(groups.statusCode, groups.body).toBe(200);
    expect(groups.json<{ orderIds: string[] }[]>()).toEqual(expect.arrayContaining([{ orderIds: [first] }, { orderIds: [second] }]));
    expect(groups.json()).toHaveLength(2);
    expect((await call(PARENT, 'GET', `/api/orders/${second}`)).statusCode).toBe(404);
    expect((await call(secondBuyer, 'GET', `/api/orders/${first}`)).statusCode).toBe(404);
  });
});

describe('explicit guardian acceptance and shared authority', () => {
  it('requires the invited account and acknowledgement, then shares only that junior while preserving purchase evidence', async () => {
    const { call, registerJunior, databaseUrl, eventId } = await setup();
    const orderId = await registerJunior(PARENT, 'Sam');
    const unrelated = await registerJunior(PARENT, 'Alex');
    const sam = (await call(PARENT, 'GET', '/api/rider/juniors')).json().find((p: { firstName: string }) => p.firstName === 'Sam');
    const original = (await call(PARENT, 'GET', `/api/orders/${orderId}`)).json();
    const invitationUrl = `/api/rider/juniors/${sam.id}/guardian-invitations`;
    const [invite] = (await call(PARENT, 'POST', invitationUrl, { email: OTHER_PARENT })).json();
    const acceptUrl = `/api/rider/guardian-invitations/${invite.id}/accept`;
    const received = (await call(OTHER_PARENT, 'GET', '/api/rider/guardian-invitations')).json();
    expect(received).toEqual([{ id: invite.id, firstName: 'Sam', lastName: 'Example', invitedByEmail: PARENT, expiresAt: invite.expiresAt }]);
    expect((await call(ORGANIZER, 'GET', '/api/rider/guardian-invitations')).json()).toEqual([]);
    expect((await call(OTHER_PARENT, 'GET', `/api/orders/${orderId}`)).statusCode).toBe(404);
    expect((await call(OTHER_PARENT, 'POST', acceptUrl, { acknowledge: false })).statusCode).toBe(400);
    expect((await call(ORGANIZER, 'POST', acceptUrl, { acknowledge: true })).statusCode).toBe(404);
    const accepted = await Promise.all([call(OTHER_PARENT, 'POST', acceptUrl, { acknowledge: true }), call(OTHER_PARENT, 'POST', acceptUrl, { acknowledge: true })]);
    for (const response of accepted) { expect(response.statusCode, response.body).toBe(200); expect(response.json()).toEqual([sam]); }
    const secondary = (await call(OTHER_PARENT, 'GET', '/api/me')).json().account;
    const [history] = (await call(PARENT, 'GET', invitationUrl)).json();
    expect(history).toMatchObject({ status: 'accepted', acceptedBy: secondary.id, acceptedAt: expect.any(String), cancelledAt: null });
    expect((await call(OTHER_PARENT, 'GET', '/api/rider/guardian-invitations')).json()).toEqual([]);
    expect((await call(OTHER_PARENT, 'GET', `/api/orders/${unrelated}`)).statusCode).toBe(404);
    expect((await call(OTHER_PARENT, 'GET', '/api/rider/registrations')).json()).toEqual([expect.objectContaining({ id: orderId, placedByYou: false, canManage: true })]);
    expect((await call(OTHER_PARENT, 'GET', `/api/orders/${orderId}`)).json()).toEqual(original);
    expect((await call(OTHER_PARENT, 'POST', `/api/orders/${orderId}/payment`, { attemptId: 'shared-guardian-payment', outcome: 'success' })).statusCode).toBe(200);
    const paid = (await call(PARENT, 'GET', `/api/orders/${orderId}`)).json();
    expect(paid.status).toBe('confirmed');
    expect(paid.waiverEvidence).toEqual(original.waiverEvidence);
    expect(paid.waiver).toEqual(original.waiver);
    expect(paid.quote).toEqual(original.quote);
    const secondOrder = await registerJunior(OTHER_PARENT, 'Sam');
    for (const [who, id] of [[PARENT, unrelated], [OTHER_PARENT, secondOrder]]) {
      const result = await call(who, 'POST', `/api/orders/${id}/payment`, { attemptId: `participant-group-${id}`, outcome: 'success' });
      expect(result.statusCode, result.body).toBe(200);
    }
    const groups = await call(ORGANIZER, 'GET', `/api/events/${eventId}/participant-groups`);
    expect(groups.statusCode).toBe(200);
    expect(groups.json()).toEqual([{ orderIds: [orderId, secondOrder] }, { orderIds: [unrelated] }]);
    expect((await call(PARENT, 'POST', `${invitationUrl}/${invite.id}/cancel`)).statusCode).toBe(409);
    expect((await call(OTHER_PARENT, 'POST', invitationUrl, { email: 'third@guardian.test' })).statusCode).toBe(409);
    const client = new pg.Client({ connectionString: databaseUrl }); await client.connect();
    try { expect((await client.query(`SELECT account_id FROM orders WHERE id=$1`, [orderId])).rows[0].account_id).toBe(original.waiverEvidence.signerAccountId); expect((await client.query(`SELECT id FROM junior_guardians WHERE junior_profile_id=$1 AND revoked_at IS NULL`, [sam.id])).rowCount).toBe(2); }
    finally { await client.end(); }
  });

  it('reuses the shared profile for either guardian’s new orders and leaves the junior viewer read-only', async () => {
    const { call, registerJunior } = await setup();
    const first = await registerJunior(PARENT, 'Sam');
    const [sam] = (await call(PARENT, 'GET', '/api/rider/juniors')).json();
    const [invite] = (await call(PARENT, 'POST', `/api/rider/juniors/${sam.id}/guardian-invitations`, { email: OTHER_PARENT })).json();
    expect((await call(OTHER_PARENT, 'POST', `/api/rider/guardian-invitations/${invite.id}/accept`, { acknowledge: true })).statusCode).toBe(200);
    const second = await registerJunior(OTHER_PARENT, 'Sam');
    expect((await call(OTHER_PARENT, 'GET', '/api/rider/juniors')).json()).toEqual([sam]);
    expect((await call(PARENT, 'GET', `/api/orders/${second}`)).statusCode).toBe(200);
    expect((await call(PARENT, 'POST', `/api/rider/juniors/${sam.id}/viewer`, { email: OTHER_PARENT })).statusCode).toBe(422);
    expect((await call(OTHER_PARENT, 'POST', `/api/rider/juniors/${sam.id}/viewer`, { email: PARENT })).statusCode).toBe(422);
    expect((await call(OTHER_PARENT, 'POST', `/api/rider/juniors/${sam.id}/viewer`, { email: JUNIOR })).statusCode).toBe(200);
    const viewed = (await call(JUNIOR, 'GET', '/api/rider/registrations')).json();
    expect(viewed.map((o: { id: string }) => o.id).sort()).toEqual([first, second].sort());
    expect(viewed.every((o: { canManage: boolean }) => o.canManage === false)).toBe(true);
    expect((await call(JUNIOR, 'POST', `/api/orders/${second}/payment`, { attemptId: 'viewer-must-not-pay', outcome: 'success' })).statusCode).toBe(404);
    expect((await call(JUNIOR, 'POST', `/api/orders/${second}/cancel`)).statusCode).toBe(404);
    expect((await call(PARENT, 'POST', `/api/orders/${second}/cancel`)).statusCode).toBe(200);
  });

  it('refuses cancelled, expired and junior-viewer invitations at acceptance time', async () => {
    let time = new Date('2027-01-01T12:00:00Z');
    const { call, registerJunior } = await setup(() => time);
    await registerJunior(PARENT, 'Sam');
    const [sam] = (await call(PARENT, 'GET', '/api/rider/juniors')).json();
    const url = `/api/rider/juniors/${sam.id}/guardian-invitations`;
    const accept = (id: string) => call(OTHER_PARENT, 'POST', `/api/rider/guardian-invitations/${id}/accept`, { acknowledge: true });
    const [old] = (await call(PARENT, 'POST', url, { email: OTHER_PARENT })).json();
    await call(PARENT, 'POST', `${url}/${old.id}/cancel`);
    expect((await accept(old.id)).statusCode).toBe(409);
    let history = (await call(PARENT, 'POST', url, { email: OTHER_PARENT })).json() as GuardianInvitation[];
    const expired = history.find((i) => i.status === 'pending')!;
    time = new Date(expired.expiresAt);
    expect((await accept(expired.id)).statusCode).toBe(409);
    history = (await call(PARENT, 'POST', url, { email: OTHER_PARENT })).json();
    const pending = history.find((i) => i.status === 'pending')!;
    await call(PARENT, 'POST', `/api/rider/juniors/${sam.id}/viewer`, { email: OTHER_PARENT });
    expect((await call(OTHER_PARENT, 'GET', '/api/rider/guardian-invitations')).json()).toEqual([]);
    expect((await accept(pending.id)).statusCode).toBe(422);
    expect((await call(OTHER_PARENT, 'GET', '/api/rider/juniors')).json()).toEqual([]);
  });

  it('adopts legacy orders before sharing but blocks a same-name acceptor household collision atomically', async () => {
    const { call, registerJunior, databaseUrl } = await setup();
    const shared = await registerJunior(PARENT, 'Sam');
    const legacy = await registerJunior(OTHER_PARENT, 'Sam');
    const [sam] = (await call(PARENT, 'GET', '/api/rider/juniors')).json();
    const client = new pg.Client({ connectionString: databaseUrl }); await client.connect();
    try {
      const profile = (await client.query(`SELECT junior_profile_id FROM orders WHERE id=$1`, [legacy])).rows[0].junior_profile_id;
      await client.query(`UPDATE orders SET junior_profile_id=NULL WHERE id=$1`, [legacy]);
      await client.query(`DELETE FROM junior_profiles WHERE id=$1`, [profile]);
      const [invite] = (await call(PARENT, 'POST', `/api/rider/juniors/${sam.id}/guardian-invitations`, { email: OTHER_PARENT })).json();
      const refused = await call(OTHER_PARENT, 'POST', `/api/rider/guardian-invitations/${invite.id}/accept`, { acknowledge: true });
      expect(refused.statusCode, refused.body).toBe(409);
      expect((await client.query(`SELECT junior_profile_id FROM orders WHERE id=$1`, [legacy])).rows[0].junior_profile_id).toBeNull();
      expect((await client.query(`SELECT id FROM junior_guardians`)).rowCount).toBe(1);
      expect((await call(PARENT, 'GET', `/api/orders/${legacy}`)).statusCode).toBe(404);
      expect((await call(OTHER_PARENT, 'GET', `/api/orders/${shared}`)).statusCode).toBe(404);
    } finally { await client.end(); }
  });

  it('links the inviter’s older unlinked orders before allowing acceptance', async () => {
    const { call, registerJunior, databaseUrl } = await setup();
    await registerJunior(PARENT, 'Sam');
    const older = await registerJunior(PARENT, 'Sam');
    const [sam] = (await call(PARENT, 'GET', '/api/rider/juniors')).json();
    const client = new pg.Client({ connectionString: databaseUrl }); await client.connect();
    try { await client.query(`UPDATE orders SET junior_profile_id=NULL WHERE id=$1`, [older]); } finally { await client.end(); }
    const [invite] = (await call(PARENT, 'POST', `/api/rider/juniors/${sam.id}/guardian-invitations`, { email: OTHER_PARENT })).json();
    expect((await call(OTHER_PARENT, 'POST', `/api/rider/guardian-invitations/${invite.id}/accept`, { acknowledge: true })).statusCode).toBe(200);
    expect((await call(OTHER_PARENT, 'GET', `/api/orders/${older}`)).statusCode).toBe(200);
  });

  it('blocks merges with differing guardian sets or conflicting viewer identities without changing orders', async () => {
    const { call, registerJunior } = await setup();
    const sourceOrder = await registerJunior(PARENT, 'Sma');
    await registerJunior(PARENT, 'Sam');
    const profiles = (await call(PARENT, 'GET', '/api/rider/juniors')).json() as { id: string; firstName: string }[];
    const source = profiles.find((p) => p.firstName === 'Sma')!;
    const target = profiles.find((p) => p.firstName === 'Sam')!;
    const share = async (id: string) => { const history = (await call(PARENT, 'POST', `/api/rider/juniors/${id}/guardian-invitations`, { email: OTHER_PARENT })).json() as GuardianInvitation[]; expect((await call(OTHER_PARENT, 'POST', `/api/rider/guardian-invitations/${history.find((i) => i.status === 'pending')!.id}/accept`, { acknowledge: true })).statusCode).toBe(200); };
    await share(source.id);
    const original = (await call(PARENT, 'GET', `/api/orders/${sourceOrder}`)).json();
    const correct = () => call(ORGANIZER, 'POST', `/api/orders/${sourceOrder}/rider-corrections`, { changes: { firstName: 'Sam' }, reason: 'Correct fictional name' });
    expect((await correct()).statusCode).toBe(409);
    expect((await call(PARENT, 'GET', `/api/orders/${sourceOrder}`)).json()).toEqual(original);
    await share(target.id);
    await call(PARENT, 'POST', `/api/rider/juniors/${source.id}/viewer`, { email: JUNIOR });
    await call(PARENT, 'POST', `/api/rider/juniors/${target.id}/viewer`, { email: 'other.junior@fictional.test' });
    expect((await correct()).statusCode).toBe(409);
    await call(PARENT, 'POST', `/api/rider/juniors/${target.id}/viewer`, { email: null });
    expect((await correct()).statusCode).toBe(200);
    const [canonical] = (await call(OTHER_PARENT, 'GET', '/api/rider/juniors')).json();
    expect(canonical).toMatchObject({ id: target.id, firstName: 'Sam', viewerEmail: JUNIOR });
    expect((await call(PARENT, 'GET', `/api/orders/${sourceOrder}`)).json().waiverEvidence).toEqual(original.waiverEvidence);
  });

  it('uses current grants for linked orders and nonce replay, and accepted replay never restores a revoked grant', async () => {
    const { call, registerJunior, databaseUrl, eventId } = await setup();
    const orderId = await registerJunior(PARENT, 'Sam');
    const [sam] = (await call(PARENT, 'GET', '/api/rider/juniors')).json();
    const parent = (await call(PARENT, 'GET', '/api/me')).json().account;
    const [invite] = (await call(PARENT, 'POST', `/api/rider/juniors/${sam.id}/guardian-invitations`, { email: OTHER_PARENT })).json();
    await call(OTHER_PARENT, 'POST', `/api/rider/guardian-invitations/${invite.id}/accept`, { acknowledge: true });
    const secondary = (await call(OTHER_PARENT, 'GET', '/api/me')).json().account;
    const original = (await call(PARENT, 'GET', `/api/orders/${orderId}`)).json();
    const client = new pg.Client({ connectionString: databaseUrl }); await client.connect();
    try {
      // Direct database invalidation tests the authorization boundary; no removal API is implemented here.
      await client.query(`UPDATE junior_guardians SET revoked_by=$1,revoked_at=now() WHERE junior_profile_id=$2 AND account_id=$3`, [parent.id, sam.id, secondary.id]);
      expect((await call(OTHER_PARENT, 'POST', `/api/rider/guardian-invitations/${invite.id}/accept`, { acknowledge: true })).statusCode).toBe(200);
      expect((await call(OTHER_PARENT, 'GET', `/api/orders/${orderId}`)).statusCode).toBe(404);
      expect((await client.query(`SELECT id FROM junior_guardians WHERE junior_profile_id=$1 AND account_id=$2 AND revoked_at IS NULL`, [sam.id, secondary.id])).rowCount).toBe(0);
      await client.query(`UPDATE junior_guardians SET revoked_by=$1,revoked_at=now() WHERE junior_profile_id=$2 AND revoked_at IS NULL`, [parent.id, sam.id]);
      expect((await call(PARENT, 'GET', `/api/orders/${orderId}`)).statusCode).toBe(404);
      expect((await call(PARENT, 'GET', '/api/rider/registrations')).json()).toEqual([]);
      expect((await call(PARENT, 'POST', `/api/orders/${orderId}/cancel`)).statusCode).toBe(404);
      const { client_request_id: requestId } = (await client.query(`SELECT client_request_id FROM orders WHERE id=$1`, [orderId])).rows[0];
      const replay = await call(PARENT, 'POST', `/api/rider/events/${eventId}/orders`, { clientRequestId: requestId, categoryIds: [original.entries[0].categoryId], rider: {}, waiver: {} });
      expect(replay.statusCode, replay.body).toBe(404);
    } finally { await client.end(); }
  });
});


it('serializes guardian acceptance against cancellation without a partial grant', async () => {
  const { call, registerJunior, databaseUrl } = await setup();
  await registerJunior(PARENT, 'Sam');
  const [sam] = (await call(PARENT, 'GET', '/api/rider/juniors')).json();
  const url = `/api/rider/juniors/${sam.id}/guardian-invitations`;
  const [invite] = (await call(PARENT, 'POST', url, { email: OTHER_PARENT })).json();
  const [accept, cancel] = await Promise.all([
    call(OTHER_PARENT, 'POST', `/api/rider/guardian-invitations/${invite.id}/accept`, { acknowledge: true }),
    call(PARENT, 'POST', `${url}/${invite.id}/cancel`),
  ]);
  const [history] = (await call(PARENT, 'GET', url)).json();
  expect([accept.statusCode, cancel.statusCode].sort()).toEqual([200, 409]);
  const client = new pg.Client({ connectionString: databaseUrl }); await client.connect();
  try {
    const count = (await client.query(`SELECT id FROM junior_guardians WHERE junior_profile_id=$1 AND revoked_at IS NULL`, [sam.id])).rowCount;
    if (history.status === 'accepted') { expect(accept.statusCode).toBe(200); expect(history.cancelledAt).toBeNull(); expect(count).toBe(2); }
    else { expect(history.status).toBe('cancelled'); expect(accept.statusCode).toBe(409); expect(history.acceptedAt).toBeNull(); expect(count).toBe(1); }
  } finally { await client.end(); }
});


describe('explicit guardian removal', () => {
  async function shared() {
    const context = await setup();
    const orderId = await context.registerJunior(PARENT, 'Sam');
    const [profile] = (await context.call(PARENT, 'GET', '/api/rider/juniors')).json();
    await context.call(PARENT, 'POST', `/api/rider/juniors/${profile.id}/viewer`, { email: JUNIOR });
    const [invitation] = (await context.call(PARENT, 'POST', `/api/rider/juniors/${profile.id}/guardian-invitations`, { email: OTHER_PARENT })).json();
    expect((await context.call(OTHER_PARENT, 'POST', `/api/rider/guardian-invitations/${invitation.id}/accept`, { acknowledge: true })).statusCode).toBe(200);
    const url = `/api/rider/juniors/${profile.id}/guardians`;
    const relationships = (await context.call(PARENT, 'GET', url)).json() as { id: string; email: string }[];
    return { ...context, orderId, profile, invitation, url, relationships };
  }

  it.each([PARENT, OTHER_PARENT])('lets %s remove the other guardian while retaining original order evidence', async (remaining) => {
    const { call, orderId, url, relationships, invitation, eventId, databaseUrl } = await shared();
    const removed = remaining === PARENT ? OTHER_PARENT : PARENT;
    const target = relationships.find((g) => g.email === removed)!;
    const endpoint = `${url}/${target.id}/remove`;
    const payload = { reason: 'End fictional shared access', acknowledge: true };
    const original = (await call(remaining, 'GET', `/api/orders/${orderId}`)).json();
    const result = await call(remaining, 'POST', endpoint, payload);
    expect(result.statusCode, result.body).toBe(200);
    const record = result.json().find((g: { id: string }) => g.id === target.id);
    expect(record).toMatchObject({ removalReason: payload.reason, revokedBy: (await call(remaining, 'GET', '/api/me')).json().account.id });
    expect(record.removalAcknowledgedAt).toBe(record.revokedAt);
    expect((await call(remaining, 'POST', endpoint, payload)).json()).toEqual(result.json());
    expect((await call(remaining, 'POST', endpoint, { ...payload, reason: 'Different removal reason' })).statusCode).toBe(409);
    expect((await call(remaining, 'GET', `/api/orders/${orderId}`)).json()).toEqual(original);
    expect((await call(removed, 'GET', `/api/orders/${orderId}`)).statusCode).toBe(404);
    expect((await call(removed, 'GET', '/api/rider/registrations')).json()).toEqual([]);
    expect((await call(removed, 'GET', url)).statusCode).toBe(404);
    expect((await call(removed, 'POST', `/api/orders/${orderId}/cancel`)).statusCode).toBe(404);
    expect((await call(removed, 'POST', `/api/orders/${orderId}/payment`, { attemptId: 'removed-guardian-attempt', outcome: 'success' })).statusCode).toBe(404);
    expect((await call(JUNIOR, 'GET', `/api/orders/${orderId}`)).statusCode).toBe(200);
    // Replaying an accepted invitation cannot restore the removed grant.
    expect((await call(OTHER_PARENT, 'POST', `/api/rider/guardian-invitations/${invitation.id}/accept`, { acknowledge: true })).statusCode).toBe(200);
    expect((await call(removed, 'GET', `/api/orders/${orderId}`)).statusCode).toBe(404);
    if (removed === PARENT) {
      const client = new pg.Client({ connectionString: databaseUrl }); await client.connect();
      let requestId: string;
      try { requestId = (await client.query('SELECT client_request_id FROM orders WHERE id=$1', [orderId])).rows[0].client_request_id; }
      finally { await client.end(); }
      expect((await call(removed, 'POST', `/api/rider/events/${eventId}/orders`, { clientRequestId: requestId!, rider: original.rider, waiver: original.waiver, categoryIds: [original.entries[0].categoryId] })).statusCode).toBe(404);
    }
  });

  it('requires acknowledgement and reason, hides family history and refuses self-removal', async () => {
    const { call, url, relationships, databaseUrl, profile } = await shared();
    const target = relationships.find((g) => g.email === OTHER_PARENT)!;
    const own = relationships.find((g) => g.email === PARENT)!;
    const current = (await call(PARENT, 'GET', url)).json();
    expect(current.find((g: { id: string }) => g.id === own.id).isYou).toBe(true);
    expect(current.find((g: { id: string }) => g.id === target.id).isYou).toBe(false);
    const account = (await call(PARENT, 'GET', '/api/me')).json().account;
    const identityDb = openDb(databaseUrl);
    try {
      const identity = await createJuniors(identityDb, () => new Date()).relationships({ ...account, email: OTHER_PARENT.toUpperCase() }, profile.id);
      expect(identity.find((g) => g.id === own.id)?.isYou).toBe(true);
      expect(identity.find((g) => g.id === target.id)?.isYou).toBe(false);
    } finally { await identityDb.close(); }
    const payload = { reason: 'End fictional shared access', acknowledge: true };
    for (const body of [{ reason: payload.reason }, { ...payload, acknowledge: false }, { ...payload, reason: '  ' }, { ...payload, reason: '😀😀' }, { ...payload, reason: 'x'.repeat(301) }]) {
      expect((await call(PARENT, 'POST', `${url}/${target.id}/remove`, body)).statusCode).toBe(400);
    }
    expect((await call(PARENT, 'POST', `${url}/${own.id}/remove`, payload)).statusCode).toBe(422);
    for (const outsider of [ORGANIZER, JUNIOR, 'unrelated@fictional.test']) {
      expect((await call(outsider, 'GET', url)).statusCode).toBe(404);
      expect((await call(outsider, 'POST', `${url}/${target.id}/remove`, payload)).statusCode).toBe(404);
    }
    expect((await call(PARENT, 'POST', `${url}/unknown/remove`, payload)).statusCode).toBe(404);
    expect((await call(PARENT, 'GET', url)).json().filter((g: { revokedAt: string | null }) => !g.revokedAt)).toHaveLength(2);
  });

  it('uses Unicode character counts for both reason boundaries with actionable validation errors', async () => {
    const { call, url, relationships } = await shared();
    const target = relationships.find((g) => g.email === OTHER_PARENT)!;
    for (const reason of ['😀😀', '😀'.repeat(301)]) {
      const response = await call(PARENT, 'POST', `${url}/${target.id}/remove`, { reason, acknowledge: true });
      expect(response.statusCode).toBe(400);
      expect(response.json().details).toContainEqual({ path: 'reason', message: 'Write a reason of 3 to 300 characters for removing guardian access.' });
    }
    const response = await call(PARENT, 'POST', `${url}/${target.id}/remove`, { reason: '😀'.repeat(300), acknowledge: true });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().find((g: { id: string }) => g.id === target.id).removalReason).toBe('😀'.repeat(300));
  });

  it('serializes competing removals so one guardian always remains', async () => {
    const { call, url, relationships, orderId } = await shared();
    const payload = { reason: 'End fictional shared access', acknowledge: true };
    const replies = await Promise.all(relationships.map((g) => call(g.email === PARENT ? OTHER_PARENT : PARENT, 'POST', `${url}/${g.id}/remove`, payload)));
    expect(replies.map((r) => r.statusCode).sort()).toEqual([200, 404]);
    const survivors = await Promise.all([PARENT, OTHER_PARENT].map((who) => call(who, 'GET', `/api/orders/${orderId}`)));
    expect(survivors.map((r) => r.statusCode).sort()).toEqual([200, 404]);
  });
});
