import { describe, expect, it, vi } from 'vitest';
import { as, DEFAULT_TEST_ORGANIZER } from './support/auth';
import { testApp, testDatabaseUrl } from './support/db';
import { openDb } from '../src/server/db';
import { createMailer, EmailUncertain, type EmailSender } from '../src/server/email';
import type { EventConfig } from '../src/shared/schema';
import { blocksPublicSale, effectiveWaitlistStatus, waitlistJoinSchema } from '../src/shared/waitlist';
import { publishReviewed } from './support/publish';

/* Organizer-managed waitlists: waitlist first, 24-hour offers, organizer turns it on per category. */

const RIDER = { firstName: 'Test', lastName: 'Rider', email: 'test.rider@example.test', team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Test Contact', phone: '555-555-0199' } };
const joiner = (n: number) => ({ firstName: 'Wait', lastName: `Rider${n}`, email: `wait${n}@example.test`, racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null });

type Entry = { id: string; status: string; position: number | null; offerToken: string | null; orderId: string | null };

async function setup(email?: EmailSender) {
  let now = new Date('2027-03-01T18:00:00Z');
  const databaseUrl = await testDatabaseUrl();
  const { app } = await testApp({ databaseUrl, now: () => now, holdMinutes: 10, email, appUrl: 'https://registration.example.test' });
  const { eventId } = (await app.inject({ method: 'POST', url: '/api/demo' })).json() as { eventId: string };
  const get = async () => (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json() as { config: EventConfig; revision: number; entries: { categoryId: string }[] };
  let ev = await get();
  const cat = ev.config.categories.find((c) => c.timingCode === 'RR-M35-34')!;

  // Fill the category exactly: at least one test entry, then cap = entries, waitlist on.
  if (!ev.entries.some((e) => e.categoryId === cat.id)) await app.inject({ method: 'POST', url: `/api/events/${eventId}/test-entries`, payload: { categoryId: cat.id, count: 1 } });
  ev = await get();
  const used = ev.entries.filter((e) => e.categoryId === cat.id).length;
  const setCap = async (cap: number, waitlistEnabled = true) => {
    const cur = await get();
    const config = structuredClone(cur.config);
    const c = config.categories.find((x) => x.id === cat.id)!;
    c.cap = cap;
    c.waitlistEnabled = waitlistEnabled;
    // Keep the start group and pools from limiting below the cap.
    const sg = config.startGroups.find((g) => g.id === c.startGroupId);
    if (sg) sg.fieldLimit = null;
    config.capacityPools = config.capacityPools.filter((p) => !p.memberCategoryIds.includes(c.id) && !(c.startGroupId && p.memberStartGroupIds.includes(c.startGroupId)));
    const saved = await app.inject({ method: 'PUT', url: `/api/events/${eventId}/config`, payload: { revision: cur.revision, config } });
    expect(saved.statusCode).toBe(200);
    const pub = await publishReviewed(app, `/api/events/${eventId}`, { acknowledgeWarnings: true, acknowledgeImpact: true });
    expect(pub.statusCode).toBe(200);
  };
  await setCap(used);

  const waiver = { version: ev.config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Test Rider', signerRole: 'rider' };
  let n = 0;
  const order = (extra: Record<string, unknown> = {}, headers?: Record<string, string>) =>
    app.inject({ method: 'POST', url: `/api/rider/events/${eventId}/orders`, headers, payload: { clientRequestId: `req-${++n}-xxxxxxxx`, categoryIds: [cat.id], rider: RIDER, waiver, ...extra } });
  const pay = (orderId: string) => app.inject({ method: 'POST', url: `/api/orders/${orderId}/payment`, payload: { attemptId: `att-${Math.random().toString(36).slice(2)}`, outcome: 'success' } });
  const join = (body: Record<string, unknown>) => app.inject({ method: 'POST', url: `/api/rider/events/${eventId}/waitlist`, payload: { categoryId: cat.id, ...body } });
  const list = async () => ((await app.inject({ method: 'GET', url: `/api/events/${eventId}/waitlist` })).json() as { entries: Entry[] }).entries;
  const offer = (id: string) => app.inject({ method: 'POST', url: `/api/events/${eventId}/waitlist/${id}/offer` });
  const remove = (id: string) => app.inject({ method: 'POST', url: `/api/events/${eventId}/waitlist/${id}/remove` });
  const publicEvent = async () => (await app.inject({ method: 'GET', url: `/api/public/events/${eventId}` })).json() as { remaining: Record<string, number | null>; waitlist: Record<string, { waiting: number }> };
  const advanceHours = (h: number) => (now = new Date(now.getTime() + h * 3_600_000));
  return { app, databaseUrl, now: () => now, eventId, cat, used, setCap, order, pay, join, list, offer, remove, publicEvent, advanceHours };
}

describe('waitlist rules', () => {
  it('derives an expired offer without a background job, and only waiting or live offers block sale', () => {
    expect(effectiveWaitlistStatus('offered', '2027-03-02T18:00:00.000Z', '2027-03-02T17:59:59.000Z')).toBe('offered');
    expect(effectiveWaitlistStatus('offered', '2027-03-02T18:00:00.000Z', '2027-03-02T18:00:00.000Z')).toBe('expired');
    expect(['waiting', 'offered', 'expired', 'accepted', 'removed'].filter((s) => blocksPublicSale(s as never))).toEqual(['waiting', 'offered']);
  });

  it('refuses an email without an @ or a domain, in plain words', () => {
    const join = (email: string) => waitlistJoinSchema.safeParse({ categoryId: 'cat_1', ...joiner(1), email });
    expect(join('wait1@example.test').success).toBe(true);
    for (const bad of ['abc', 'wait1@example', 'wait 1@example.test']) {
      const r = join(bad);
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0].message).toBe('This email address is missing an @ or a domain. Check it and try again.');
    }
    const empty = join('  ');
    expect(empty.success).toBe(false);
    if (!empty.success) expect(empty.error.issues[0].message).toBe('Enter an email so the organizer can offer you a place.');
  });
});

describe('organizer-managed waitlist API', () => {
  it('refuses to join a category with places left or with the waitlist off', async () => {
    const s = await setup();
    await s.setCap(s.used + 5, true);
    expect((await s.join(joiner(1))).statusCode).toBe(409); // still has places
    await s.setCap(s.used, false);
    expect((await s.join(joiner(1))).statusCode).toBe(409); // waitlist off
  });

  it('refuses an ineligible rider', async () => {
    const s = await setup();
    const res = await s.join({ ...joiner(1), racingAge: 20 }); // Masters 35+
    expect(res.statusCode).toBe(422);
  });

  it('runs the whole flow: join in order, waitlist first, offer needs a free place, redeem, accept', async () => {
    const s = await setup();
    expect((await s.order()).statusCode).toBe(409); // full

    const a = (await s.join(joiner(1))).json() as Entry;
    const b = (await s.join(joiner(2))).json() as Entry;
    expect([a.position, b.position]).toEqual([1, 2]);
    expect(((await s.join(joiner(1))).json() as Entry).id).toBe(a.id); // same email: no duplicate
    expect((await s.publicEvent()).waitlist[s.cat.id]).toEqual({ waiting: 2 });

    // No free place yet, so nothing can be offered.
    expect((await s.offer(a.id)).statusCode).toBe(409);

    // One place frees up (limit raised). Waitlist first: the public still cannot buy it.
    await s.setCap(s.used + 1);
    expect((await s.publicEvent()).remaining[s.cat.id]).toBe(0);
    const publicTry = await s.order();
    expect(publicTry.statusCode).toBe(409);
    expect((publicTry.json() as { error: string }).error).toContain('waitlist');

    // Offer to the first rider; the offer reserves the only place, so the second cannot be offered.
    const offered = (await s.offer(a.id)).json() as Entry;
    expect(offered.status).toBe('offered');
    expect(offered.offerToken).toBeTruthy();
    expect((await s.offer(b.id)).statusCode).toBe(409);

    // The offer link lets that rider register and pay for the reserved place.
    const offerUrl = `/api/rider/offers/${offered.offerToken}`;
    const otherAccount = as('different-rider@example.test');
    const denied = await s.app.inject({ method: 'GET', url: offerUrl, headers: otherAccount });
    expect(denied.statusCode).toBe(404);
    expect(denied.json()).not.toHaveProperty('rider');
    expect((await s.order({ offerToken: offered.offerToken }, otherAccount)).statusCode).toBe(404);
    const response = await s.app.inject({ method: 'GET', url: offerUrl });
    expect(response.headers['cache-control']).toBe('no-store');
    const lookup = response.json() as { status: string; categoryId: string };
    expect(lookup).toMatchObject({ status: 'offered', categoryId: s.cat.id });
    const o = await s.order({ offerToken: offered.offerToken });
    expect(o.statusCode).toBe(201);
    const paid = (await s.pay((o.json() as { id: string }).id)).json() as { status: string };
    expect(paid.status).toBe('confirmed');

    const after = await s.list();
    expect(after.find((e) => e.id === a.id)).toMatchObject({ status: 'accepted', position: null });
    expect(after.find((e) => e.id === b.id)).toMatchObject({ status: 'waiting', position: 1 });
    // A used offer cannot be redeemed again.
    expect((await s.order({ offerToken: offered.offerToken })).statusCode).toBe(409);
  });

  it('records one offer email for the joining account and repeats only eligible sends', async () => {
    const send = vi.fn().mockRejectedValueOnce(new EmailUncertain('Fictional timeout.')).mockResolvedValue('re_waitlist_offer');
    const sender = { mode: 'resend' as const, from: 'sender@example.test', send };
    const s = await setup(sender);
    const entries = await Promise.all([1, 2, 3].map(async (n) => (await s.join(joiner(n))).json<Entry>()));
    await s.setCap(s.used + entries.length);
    const first = (await s.offer(entries[0].id)).json<Entry & { offerExpiresAt: string }>();
    expect(first.status).toBe('offered');
    expect((await s.offer(entries[0].id)).statusCode).toBe(409);
    expect((await s.offer(entries[1].id)).statusCode).toBe(200);
    expect((await s.offer(entries[2].id)).statusCode).toBe(200);
    expect((await s.remove(entries[1].id)).statusCode).toBe(200);
    const db = openDb(s.databaseUrl);
    try {
      const rows = await db.all<{ id: string; waitlist_entry_id: string }>(
        "SELECT id, waitlist_entry_id FROM email_messages WHERE kind = 'waitlist_offer'",
      );
      expect(rows).toHaveLength(3);
      const mailer = createMailer(db, sender, s.now);
      // Put the third offer past its expiry to model a stale worker pickup.
      await db.run("UPDATE waitlist_entries SET offer_expires_at = now() - interval '1 second' WHERE id = $1", [entries[2].id]);
      await mailer.dispatchNextRiderEmail();
      expect(send).toHaveBeenCalledTimes(1);
      const id = rows.find((row) => row.waitlist_entry_id === first.id)!.id;
      expect(send.mock.calls[0]).toEqual([{
        from: sender.from,
        to: DEFAULT_TEST_ORGANIZER,
        subject: 'A waitlist place is available',
        text: expect.stringContaining(`${first.offerExpiresAt}. Sign in with the account you used to join the waitlist: https://registration.example.test/#/register/${s.eventId}?offer=${first.offerToken}`),
      }, id]);
      const route = (entryId: string) => `/api/events/${s.eventId}/waitlist/${entryId}/offer-email`;
      const url = route(first.id);
      expect((await s.app.inject({ method: 'GET', url, headers: as('outsider@example.test') })).statusCode).toBe(404);
      expect((await s.app.inject({ method: 'POST', url: `${url}/retry` })).statusCode).toBe(409);
      await db.run("UPDATE email_messages SET sending_until = now() - interval '1 second' WHERE id = $1", [id]);
      const status = await s.app.inject({ method: 'GET', url });
      expect(status.headers['cache-control']).toBe('no-store');
      expect(status.json()).toEqual({ offerEmail: { status: 'uncertain', delivery: null, canRetry: true } });
      const before = await s.list();
      await db.run("UPDATE email_messages SET status = 'uncertain' WHERE waitlist_entry_id = ANY($1)", [entries.slice(1).map((entry) => entry.id)]);
      for (const entry of entries.slice(1)) {
        expect((await s.app.inject({ method: 'POST', url: `${route(entry.id)}/retry` })).statusCode).toBe(409);
      }
      const retried = await s.app.inject({ method: 'POST', url: `${url}/retry` });
      expect(retried.json()).toEqual({ offerEmail: { status: 'sent', delivery: null, canRetry: false } });
      await mailer.dispatchNextRiderEmail();
      expect(await s.list()).toEqual(before);
      expect(await db.all('SELECT email_id FROM rider_email_retry_requests')).toEqual([{ email_id: id }]);
      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[1]).toEqual(send.mock.calls[0]);
      expect(await db.get('SELECT status, provider_message_id FROM email_messages WHERE id = $1', [id]))
        .toEqual({ status: 'sent', provider_message_id: 're_waitlist_offer' });
    } finally {
      await db.close();
    }
  });

  it('sends one expiry notice for a previously sent offer and skips removed, active-checkout or never-sent offers', async () => {
    const send = vi.fn().mockResolvedValueOnce('re_offer').mockResolvedValueOnce('re_removed_offer').mockResolvedValueOnce('re_checkout_offer').mockResolvedValue('re_expiry');
    const sender = { mode: 'resend' as const, from: 'sender@example.test', send };
    const s = await setup(sender);
    const entries = await Promise.all([1, 2, 3, 4].map(async (n) => (await s.join(joiner(n))).json<Entry>()));
    await s.setCap(s.used + entries.length);
    const offers = [];
    for (const entry of entries) {
      const offered = await s.offer(entry.id);
      expect(offered.statusCode).toBe(200);
      offers.push(offered.json<Entry>());
    }
    const db = openDb(s.databaseUrl);
    try {
      const mailer = createMailer(db, sender, s.now);
      await mailer.dispatchNextRiderEmail();
      await mailer.dispatchNextRiderEmail();
      await mailer.dispatchNextRiderEmail();
      expect(send).toHaveBeenCalledTimes(3);
      expect((await s.order({ offerToken: offers[2].offerToken })).statusCode).toBe(201);
      expect((await s.remove(entries[1].id)).statusCode).toBe(200);
      await db.run("UPDATE waitlist_entries SET offer_expires_at = now() - interval '1 second' WHERE id = ANY($1)", [entries.map((entry) => entry.id)]);
      s.advanceHours(24);
      const before = await s.list();
      const otherWorker = createMailer(db, sender, s.now);
      await Promise.all([mailer.dispatchNextRiderEmail(), otherWorker.dispatchNextRiderEmail()]);
      await mailer.dispatchNextRiderEmail();
      expect(send).toHaveBeenCalledTimes(4);
      const [message, key] = send.mock.calls[3];
      expect(message).toMatchObject({ to: DEFAULT_TEST_ORGANIZER, subject: 'Your waitlist offer expired' });
      expect(message.text).not.toContain('?offer=');
      expect(await db.all("SELECT id, waitlist_expiry_entry_id AS waitlist_entry_id, status FROM email_messages WHERE kind = 'waitlist_expired'"))
        .toEqual([{ id: key, waitlist_entry_id: entries[0].id, status: 'sent' }]);
      expect(await s.list()).toEqual(before);
    } finally {
      await db.close();
    }
  });

  it('an unused offer expires after 24 hours and frees the place for the next rider', async () => {
    const s = await setup();
    const a = (await s.join(joiner(1))).json() as Entry;
    const b = (await s.join(joiner(2))).json() as Entry;
    await s.setCap(s.used + 1);
    const offered = (await s.offer(a.id)).json() as Entry;
    s.advanceHours(23);
    expect((await s.offer(b.id)).statusCode).toBe(409); // still reserved
    s.advanceHours(1);
    expect((await s.list()).find((e) => e.id === a.id)?.status).toBe('expired');
    expect((await s.order({ offerToken: offered.offerToken })).statusCode).toBe(409); // expired link
    expect((await s.offer(b.id)).statusCode).toBe(200);
  });

  it('removing the last waiting rider puts the category back on public sale', async () => {
    const s = await setup();
    const a = (await s.join(joiner(1))).json() as Entry;
    await s.setCap(s.used + 1);
    expect((await s.order()).statusCode).toBe(409);
    expect(((await s.remove(a.id)).json() as Entry).status).toBe('removed');
    expect((await s.order()).statusCode).toBe(201);
  });
});
