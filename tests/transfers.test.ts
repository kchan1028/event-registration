import { describe, expect, it, vi } from 'vitest';
import { openDb } from '../src/server/db';
import { createMailer, entryChangeNoticeText, type EmailSender } from '../src/server/email';
import { formatOrderNumber } from '../src/shared/lookup';
import { parseCsv } from '../src/shared/csv';
import { blankPath } from '../src/shared/factory';
import type { EventConfig } from '../src/shared/schema';
import type { StartLists } from '../src/server/startlists';
import { DEFAULT_TEST_ORGANIZER } from './support/auth';
import { testApp, testDatabaseUrl } from './support/db';
import { publishReviewed } from './support/publish';

/* Organizer transfers and withdrawals (product.md acceptance: "Category change"). */

const RIDER = { firstName: 'Test', lastName: 'Rider', email: 'test.rider@example.test', team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Test Contact', phone: '555-555-0199' } };

type Change = { kind: string; amountPaidCents: number; newPriceCents: number | null; differenceCents: number | null; reason: string };
type Entry = { id: string; categoryId: string; status: string; amountPaidCents: number; changes: Change[] };
type Order = { id: string; status: string; totalCents: number; entries: Entry[] };

async function setup() {
  const now = new Date('2027-03-01T18:00:00Z');
  const { app } = await testApp({ now: () => now, holdMinutes: 10 });
  const { eventId } = (await app.inject({ method: 'POST', url: '/api/demo' })).json() as { eventId: string };
  await publishReviewed(app, `/api/events/${eventId}`, { acknowledgeWarnings: true });
  const get = async () => (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json() as { config: EventConfig; revision: number; entries: { categoryId: string }[] };
  const ev = await get();
  const code = (c: string) => ev.config.categories.find((x) => x.timingCode === c)!.id;
  const waiver = { version: ev.config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Test Rider', signerRole: 'rider' };
  let n = 0;
  const buy = async (codes: string[]) => {
    const created = await app.inject({ method: 'POST', url: `/api/rider/events/${eventId}/orders`, payload: { clientRequestId: `req-${++n}-xxxxxxxx`, categoryIds: codes.map(code), rider: RIDER, waiver } });
    expect(created.statusCode).toBe(201);
    const o = created.json() as Order;
    const paid = await app.inject({ method: 'POST', url: `/api/orders/${o.id}/payment`, payload: { attemptId: `attempt-${n}-xxxx`, outcome: 'success' } });
    expect(paid.statusCode).toBe(200);
    return paid.json() as Order;
  };
  const transfer = (entryId: string, to: string, reason = 'Moved at rider request') => app.inject({ method: 'POST', url: `/api/order-entries/${entryId}/transfer`, payload: { toCategoryId: code(to), reason } });
  const withdraw = (entryId: string, reason = 'Injured, asked to withdraw') => app.inject({ method: 'POST', url: `/api/order-entries/${entryId}/withdraw`, payload: { reason } });
  const used = async (c: string) => (await get()).entries.filter((e) => e.categoryId === code(c)).length;
  return { app, eventId, get, code, buy, transfer, withdraw, used };
}

describe('organizer transfers', () => {
  it('reports a field transfer as a revision to a locked timer list', async () => {
    const s = await setup();
    const from = 'RR-M35-34';
    const to = 'RR-D23';
    const order = await s.buy([from]);
    const [entry] = order.entries;
    const config = (await s.get()).config;
    const source = config.categories.find((category) => category.id === s.code(from))!;
    const destination = config.categories.find((category) => category.id === s.code(to))!;
    expect(destination.raceId).toBe(source.raceId);
    const listsUrl = `/api/events/${s.eventId}/start-lists`;
    const raceUrl = `${listsUrl}/${source.raceId}`;
    const lock = await s.app.inject({ method: 'POST', url: `${raceUrl}/lock` });
    expect(lock.statusCode).toBe(201);
    const lockedUrl = `${raceUrl}/csv?snapshot=${lock.json().version}`;
    const csv = async (url: string) => {
      const downloaded = await s.app.inject({ method: 'GET', url });
      expect(downloaded.statusCode).toBe(200);
      return downloaded.body;
    };
    const exportedEntries = (body: string) => {
      const [header, ...rows] = parseCsv(body);
      return rows.filter((row) => row[header.indexOf('entry_id')] === entry.id)
        .map((row) => ({
          field: row[header.indexOf('category_code')],
          riderId: row[header.indexOf('rider_id')],
        }));
    };
    const locked = await csv(lockedUrl);
    const lockedEntries = exportedEntries(locked);
    expect(lockedEntries).toEqual([{ field: from, riderId: expect.stringMatching(/\S/) }]);
    const [{ riderId }] = lockedEntries;

    expect((await s.transfer(entry.id, to)).statusCode).toBe(200);
    expect(exportedEntries(await csv(`${raceUrl}/csv`))).toEqual([{ field: to, riderId }]);
    expect(await csv(lockedUrl)).toBe(locked);

    const response = await s.app.inject({ method: 'GET', url: listsUrl });
    expect(response.statusCode).toBe(200);
    const lists: Awaited<ReturnType<StartLists['overview']>> = response.json();
    const race = lists.races.find((candidate) => candidate.raceId === source.raceId);
    expect(race?.changesSinceLock).toMatchObject({
      added: [],
      removed: [],
      changed: [{
        before: { entryId: entry.id, riderId, classificationCode: from, categoryName: source.name },
        after: { entryId: entry.id, riderId, classificationCode: to, categoryName: destination.name },
        fields: expect.arrayContaining(['classificationCode', 'categoryName', 'startGroup']),
      }],
    });
  });

  it('compares transfers using the rider rate without changing the paid total', async () => {
    const s = await setup();
    const ev = await s.get();
    ev.config.registration.riderRates = [{ eligibility: blankPath(), categoryGenderClass: 'any', racePrices: [{ raceId: ev.config.races[0].id, cents: 3000, extraEntryCents: 1000 }], bundlePriceCents: 4000 }];
    expect((await s.app.inject({ method: 'PUT', url: `/api/events/${s.eventId}/config`, payload: { config: ev.config, revision: ev.revision } })).statusCode).toBe(200);
    expect((await publishReviewed(s.app, `/api/events/${s.eventId}`, { acknowledgeWarnings: true, acknowledgeImpact: true })).statusCode).toBe(200);
    const order = await s.buy(['RR-M35-34']);
    const res = await s.transfer(order.entries[0].id, 'RR-D23');
    expect(res.statusCode).toBe(200);
    const moved = res.json() as Order;
    expect(moved.totalCents).toBe(order.totalCents);
    expect(moved.entries[0].changes[0]).toMatchObject({ newPriceCents: 3000, differenceCents: 0 });
  });

  it('moves a paid entry, keeps the price paid, logs the difference, and moves the place', async () => {
    const s = await setup();
    const order = await s.buy(['RR-M35-34']);
    expect(order.status).toBe('confirmed');
    const entry = order.entries[0];
    const [fromBefore, toBefore] = [await s.used('RR-M35-34'), await s.used('RR-D23')];

    const res = await s.transfer(entry.id, 'RR-D23', 'Prefers the domestic field');
    expect(res.statusCode).toBe(200);
    const after = res.json() as Order;
    const moved = after.entries[0];
    expect(moved.categoryId).toBe(s.code('RR-D23'));
    expect(after.totalCents).toBe(order.totalCents); // never repriced
    expect(moved.amountPaidCents).toBe(entry.amountPaidCents);
    expect(moved.changes).toHaveLength(1);
    expect(moved.changes[0]).toMatchObject({ kind: 'transfer', amountPaidCents: entry.amountPaidCents, reason: 'Prefers the domestic field' });
    expect(moved.changes[0].differenceCents).toBe((moved.changes[0].newPriceCents ?? 0) - entry.amountPaidCents);
    expect([await s.used('RR-M35-34'), await s.used('RR-D23')]).toEqual([fromBefore - 1, toBefore + 1]);
  });

  it('rechecks eligibility and refuses the same category or a missing reason', async () => {
    const s = await setup();
    const order = await s.buy(['RR-M35-34']);
    const ineligible = await s.transfer(order.entries[0].id, 'RR-45'); // Cat 3 is not Cat 4/5
    expect(ineligible.statusCode).toBe(422);
    expect((ineligible.json() as { error: string }).error).toContain('Not eligible');
    expect((await s.transfer(order.entries[0].id, 'RR-M35-34')).statusCode).toBe(422);
    expect((await s.app.inject({ method: 'POST', url: `/api/order-entries/${order.entries[0].id}/transfer`, payload: { toCategoryId: s.code('RR-D23'), reason: '' } })).statusCode).toBe(400);
  });

  it('refuses a full target category', async () => {
    const s = await setup();
    const order = await s.buy(['RR-M35-34']);
    await s.app.inject({ method: 'POST', url: `/api/events/${s.eventId}/test-entries`, payload: { categoryId: s.code('RR-D23'), count: 1 } });
    const ev = await s.get();
    const config = structuredClone(ev.config);
    const target = config.categories.find((c) => c.id === s.code('RR-D23'))!;
    target.cap = ev.entries.filter((e) => e.categoryId === target.id).length;
    expect((await s.app.inject({ method: 'PUT', url: `/api/events/${s.eventId}/config`, payload: { revision: ev.revision, config } })).statusCode).toBe(200);
    expect((await publishReviewed(s.app, `/api/events/${s.eventId}`, { acknowledgeWarnings: true, acknowledgeImpact: true })).statusCode).toBe(200);
    const res = await s.transfer(order.entries[0].id, 'RR-D23');
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: string }).error).toContain('full');
  });
});

describe('organizer withdrawals', () => {
  it('withdraws one entry: place freed, price paid recorded, check-in drops it', async () => {
    const s = await setup();
    const order = await s.buy(['RR-M35-34', 'CR-M35-34']);
    const sat = order.entries.find((e) => e.categoryId === s.code('RR-M35-34'))!;
    const before = await s.used('RR-M35-34');

    const res = await s.withdraw(sat.id);
    expect(res.statusCode).toBe(200);
    const after = res.json() as Order;
    const w = after.entries.find((e) => e.id === sat.id)!;
    expect(w.status).toBe('withdrawn');
    expect(w.changes[0]).toMatchObject({ kind: 'withdraw', amountPaidCents: sat.amountPaidCents });
    expect(after.totalCents).toBe(order.totalCents);
    expect(after.entries.find((e) => e.id !== sat.id)!.status).toBe('confirmed');
    expect(await s.used('RR-M35-34')).toBe(before - 1);

    // Saturday check-in: a search still finds the rider, who has no entry that day any more.
    type CheckInList = { days: { id: string; label: string }[]; riders: { orderId: string; result: { ready: boolean; blockers: { key: string }[] } }[] };
    const list = (await s.app.inject({ method: 'GET', url: `/api/events/${s.eventId}/check-in?q=` })).json() as CheckInList;
    const saturday = list.days.find((d) => d.label === 'Saturday')!;
    const satList = (await s.app.inject({ method: 'GET', url: `/api/events/${s.eventId}/check-in?day=${saturday.id}&q=Test%20Rider` })).json() as CheckInList;
    const rider = satList.riders.find((r) => r.orderId === order.id)!;
    expect(rider.result.ready).toBe(false);
    expect(rider.result.blockers.map((b) => b.key)).toContain('no_entry');

    // A withdrawn entry cannot be withdrawn or transferred again.
    expect((await s.withdraw(sat.id)).statusCode).toBe(409);
    expect((await s.transfer(sat.id, 'RR-D23')).statusCode).toBe(409);
  });
});

describe('license review', () => {
  it('refuses a withdrawn entry in plain words and leaves it unreviewed', async () => {
    const s = await setup();
    const order = await s.buy(['RR-M35-34', 'CR-M35-34']);
    const [gone, kept] = order.entries;
    expect((await s.withdraw(gone.id)).statusCode).toBe(200);
    const review = (entryId: string) => s.app.inject({ method: 'POST', url: `/api/order-entries/${entryId}/license-review`, payload: { note: 'License card seen' } });
    const refused = await review(gone.id);
    expect(refused.statusCode).toBe(409);
    expect((refused.json() as { error: string }).error).toBe('This entry was withdrawn, so its license cannot be reviewed.');
    const ok = await review(kept.id);
    expect(ok.statusCode).toBe(200);
    const after = (ok.json() as { entries: { id: string; licenseReviewed: boolean }[] }).entries;
    expect(after.find((e) => e.id === gone.id)?.licenseReviewed).toBe(false);
    expect(after.find((e) => e.id === kept.id)?.licenseReviewed).toBe(true);
  });
});

describe('entry change notices', () => {
  it('records one notice for a transfer and one for a withdrawal, and does not send them', async () => {
    const send = vi.fn(async () => 're_unused');
    const sender: EmailSender = { mode: 'resend', from: 'sender@example.test', send };
    const now = new Date('2027-03-01T18:00:00Z');
    const databaseUrl = await testDatabaseUrl();
    const { app } = await testApp({ databaseUrl, now: () => now, holdMinutes: 10, email: sender });
    const { eventId } = (await app.inject({ method: 'POST', url: '/api/demo' })).json() as { eventId: string };
    await publishReviewed(app, `/api/events/${eventId}`, { acknowledgeWarnings: true });
    const ev = (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json() as { config: EventConfig };
    const category = (code: string) => ev.config.categories.find((item) => item.timingCode === code)!;
    const from = category('RR-M35-34');
    const to = category('RR-D23');
    const waiver = { version: ev.config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Test Rider', signerRole: 'rider' };
    const rider = { firstName: 'Test', lastName: 'Rider', email: 'test.rider@example.test', team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Test Contact', phone: '555-555-0199' } };
    const created = await app.inject({ method: 'POST', url: `/api/rider/events/${eventId}/orders`, payload: { clientRequestId: 'req-change-notice', categoryIds: [from.id], rider, waiver } });
    expect(created.statusCode).toBe(201);
    const order = created.json() as { id: string; entries: { id: string }[] };
    expect((await app.inject({ method: 'POST', url: `/api/orders/${order.id}/payment`, payload: { attemptId: 'attempt-change-notice', outcome: 'success' } })).statusCode).toBe(200);
    const db = openDb(databaseUrl);
    try {
      const reason = 'Moved at rider request';
      expect((await app.inject({ method: 'POST', url: `/api/order-entries/${order.entries[0].id}/transfer`, payload: { toCategoryId: to.id, reason } })).statusCode).toBe(200);
      const withdrawReason = 'Injured, asked to withdraw';
      expect((await app.inject({ method: 'POST', url: `/api/order-entries/${order.entries[0].id}/withdraw`, payload: { reason: withdrawReason } })).statusCode).toBe(200);
      const notices = await db.all<{ entry_change_id: string; ref: string; order_id: string | null; status: string; from_email: string | null; subject: string; body_text: string; to_email: string }>(
        `SELECT entry_change_id, ref, order_id, status, from_email, subject, body_text, to_email FROM email_messages WHERE kind = 'entry_change_notice' ORDER BY created_at, seq`,
      );
      const orderNumber = formatOrderNumber(order.id, true);
      expect(notices).toEqual([
        {
          entry_change_id: expect.any(String),
          ref: expect.any(String),
          order_id: null,
          status: 'recorded',
          from_email: 'sender@example.test',
          subject: 'Your entry change',
          body_text: entryChangeNoticeText(orderNumber, `moved from ${from.name} to ${to.name}`, true),
          to_email: DEFAULT_TEST_ORGANIZER,
        },
        {
          entry_change_id: expect.any(String),
          ref: expect.any(String),
          order_id: null,
          status: 'recorded',
          from_email: 'sender@example.test',
          subject: 'Your entry change',
          body_text: entryChangeNoticeText(orderNumber, `withdrawn from ${to.name}`, true),
          to_email: DEFAULT_TEST_ORGANIZER,
        },
      ]);
      expect(notices[0].ref).toBe(notices[0].entry_change_id);
      expect(notices[1].ref).toBe(notices[1].entry_change_id);
      for (const notice of notices) {
        expect(notice.body_text).not.toContain(reason);
        expect(notice.body_text).not.toContain(withdrawReason);
        expect(notice.body_text).not.toContain(rider.email);
        expect(notice.body_text).not.toContain(rider.emergencyContact.name);
        expect(notice.body_text).not.toContain(rider.firstName);
      }
      expect(send).not.toHaveBeenCalled();
    } finally {
      await db.close();
    }
  });

  it('dispatches a transfer notice and a withdrawal notice once, and skips a stopped address', async () => {
    const send = vi.fn()
      .mockResolvedValueOnce('re_confirmation')
      .mockResolvedValueOnce('re_receipt')
      .mockResolvedValueOnce('re_transfer')
      .mockResolvedValueOnce('re_withdraw');
    const sender: EmailSender = { mode: 'resend', from: 'sender@example.test', send };
    const now = new Date('2027-03-01T18:00:00Z');
    const databaseUrl = await testDatabaseUrl();
    const { app } = await testApp({ databaseUrl, now: () => now, holdMinutes: 10, email: sender });
    const { eventId } = (await app.inject({ method: 'POST', url: '/api/demo' })).json() as { eventId: string };
    await publishReviewed(app, `/api/events/${eventId}`, { acknowledgeWarnings: true });
    const ev = (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json() as { config: EventConfig };
    const category = (code: string) => ev.config.categories.find((item) => item.timingCode === code)!;
    const from = category('RR-M35-34');
    const to = category('RR-D23');
    const waiver = { version: ev.config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Test Rider', signerRole: 'rider' };
    const rider = { firstName: 'Test', lastName: 'Rider', email: 'test.rider@example.test', team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Test Contact', phone: '555-555-0199' } };
    const created = await app.inject({ method: 'POST', url: `/api/rider/events/${eventId}/orders`, payload: { clientRequestId: 'req-change-dispatch', categoryIds: [from.id], rider, waiver } });
    expect(created.statusCode).toBe(201);
    const order = created.json() as { id: string; entries: { id: string }[] };
    expect((await app.inject({ method: 'POST', url: `/api/orders/${order.id}/payment`, payload: { attemptId: 'attempt-change-dispatch', outcome: 'success' } })).statusCode).toBe(200);
    const db = openDb(databaseUrl);
    const atRecorded = () => now;
    try {
      expect((await app.inject({ method: 'POST', url: `/api/order-entries/${order.entries[0].id}/transfer`, payload: { toCategoryId: to.id, reason: 'Moved at rider request' } })).statusCode).toBe(200);
      const transferNotice = await db.get<{ id: string }>(`SELECT id FROM email_messages WHERE kind = 'entry_change_notice'`);
      const localSend = vi.fn().mockResolvedValue('local-should-not-send');
      await createMailer(db, { mode: 'local', send: localSend }, atRecorded).dispatchNextRiderEmail();
      expect(localSend).not.toHaveBeenCalled();
      await db.run(`UPDATE email_messages SET from_email = NULL WHERE id = $1`, [transferNotice!.id]);
      const mailer = createMailer(db, sender, atRecorded);
      await mailer.dispatchNextRiderEmail();
      await mailer.dispatchNextRiderEmail();
      expect(send.mock.calls.map((call) => call[0].subject)).toEqual(['Registration confirmed', 'Your receipt']);
      expect(await db.get(`SELECT status FROM email_messages WHERE id = $1`, [transferNotice!.id])).toEqual({ status: 'recorded' });
      await db.run(`UPDATE email_messages SET from_email = $2 WHERE id = $1`, [transferNotice!.id, 'sender@example.test']);
      await db.run(`UPDATE accounts SET email = 'moved@example.test' WHERE email = $1`, [DEFAULT_TEST_ORGANIZER]);
      await mailer.dispatchNextRiderEmail();
      expect(send).toHaveBeenCalledTimes(2);
      await db.run(`UPDATE accounts SET email = $1 WHERE email = 'moved@example.test'`, [DEFAULT_TEST_ORGANIZER]);
      await mailer.dispatchNextRiderEmail();
      expect(send).toHaveBeenCalledTimes(3);
      const orderNumber = formatOrderNumber(order.id, true);
      expect(send.mock.calls[2][1]).toBe(transferNotice!.id);
      expect(send.mock.calls[2][0]).toMatchObject({
        from: sender.from,
        to: DEFAULT_TEST_ORGANIZER,
        subject: 'Your entry change',
        text: entryChangeNoticeText(orderNumber, `moved from ${from.name} to ${to.name}`, true),
      });
      await mailer.dispatchNextRiderEmail();
      expect(send).toHaveBeenCalledTimes(3);

      await db.run(
        `INSERT INTO email_delivery_events (id, email_id, kind, occurred_at) VALUES ('entry-change-bounce', $1, 'bounced', $2)`,
        [transferNotice!.id, now.toISOString()],
      );
      expect((await app.inject({ method: 'POST', url: `/api/order-entries/${order.entries[0].id}/withdraw`, payload: { reason: 'Injured, asked to withdraw' } })).statusCode).toBe(200);
      const withdrawal = await db.get<{ id: string; status: string }>(
        `SELECT id, status FROM email_messages WHERE kind = 'entry_change_notice' AND status = 'recorded'`,
      );
      await mailer.dispatchNextRiderEmail();
      expect(send).toHaveBeenCalledTimes(3);
      expect(await db.get(`SELECT status FROM email_messages WHERE id = $1`, [withdrawal!.id])).toEqual({ status: 'recorded' });
      await db.run(`DELETE FROM email_delivery_events WHERE id = 'entry-change-bounce'`);
      await mailer.dispatchNextRiderEmail();
      expect(send).toHaveBeenCalledTimes(4);
      expect(send.mock.calls[3][1]).toBe(withdrawal!.id);
      expect(send.mock.calls[3][0]).toMatchObject({
        from: sender.from,
        to: DEFAULT_TEST_ORGANIZER,
        subject: 'Your entry change',
        text: entryChangeNoticeText(orderNumber, `withdrawn from ${to.name}`, true),
      });
      await mailer.dispatchNextRiderEmail();
      expect(send).toHaveBeenCalledTimes(4);
    } finally {
      await db.close();
    }
  });
});
