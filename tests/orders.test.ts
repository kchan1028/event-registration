import { staffHoldReleaseFromEnv } from '../src/server/app';
import { reservationLookupSchema, reservationReferenceSchema } from '../src/shared/checkout';
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/server/db';
import { testApp, testDatabaseUrl } from './support/db';
import { waiverChangeFor } from './support/waiver';
import type { EventConfig } from '../src/shared/schema';
import type { WaiverEvidence } from '../src/shared/checkout';

type Order = {
  id: string;
  status: string;
  totalCents: number;
  waiverEvidence: WaiverEvidence | null;
  checkInCode: string | null;
  entries: { id: string; categoryId: string; status: string; readiness: { key: string; state: string }[] }[];
};

const RIDER = { firstName: 'Test', lastName: 'Rider', email: 'test.rider@example.test', team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Test Contact', phone: '555-555-0199' } };

async function setup(opts: { publish?: boolean } = {}) {
  let now = new Date('2027-03-01T18:00:00Z');
  const clock = { advance: (min: number) => (now = new Date(now.getTime() + min * 60_000)) };
  const databaseUrl = await testDatabaseUrl();
  const { app } = await testApp({ databaseUrl, now: () => now, holdMinutes: 10 });
  const { eventId } = (await app.inject({ method: 'POST', url: '/api/demo' })).json() as { eventId: string };
  if (opts.publish !== false) await app.inject({ method: 'POST', url: `/api/events/${eventId}/publish`, payload: { acknowledgeWarnings: true } });
  const event = (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json() as { config: EventConfig; revision: number; entries: unknown[] };
  const code = (c: string) => event.config.categories.find((x) => x.timingCode === c)!.id;
  const waiver = { version: event.config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Test Rider', signerRole: 'rider' };
  let n = 0;
  const order = (categoryIds: string[], extra: Record<string, unknown> = {}) =>
    app.inject({ method: 'POST', url: `/api/rider/events/${eventId}/orders`, payload: { clientRequestId: `req-${++n}-xxxxxxxx`, categoryIds, rider: RIDER, waiver, ...extra } });
  const pay = (orderId: string, outcome: 'success' | 'failure', attemptId = `att-${Math.random().toString(36).slice(2)}`) =>
    app.inject({ method: 'POST', url: `/api/orders/${orderId}/payment`, payload: { attemptId, outcome } });
  const entriesCount = async () => ((await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json() as { entries: unknown[] }).entries.length;
  return { app, databaseUrl, eventId, event, code, waiver, order, pay, clock, entriesCount };
}

describe('rider checkout: holds and simulated payment', () => {
  it('never publishes different waiver text under a version already used, so the signed version identifies the text', async () => {
    const { app, eventId, event, order, code, waiver } = await setup();
    const publish = async (waiverVersion: string, waiverText: string) => {
      const { config, revision } = (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json() as { config: EventConfig; revision: number };
      Object.assign(config.registration, { waiverVersion, waiverText });
      const saved = await app.inject({ method: 'PUT', url: `/api/events/${eventId}/config`, payload: { revision, config } });
      expect(saved.statusCode).toBe(200);
      return app.inject({ method: 'POST', url: `/api/events/${eventId}/publish`, payload: { acknowledgeWarnings: true, acknowledgeImpact: true, waiverChange: waiverChangeFor(saved.json()) } });
    };
    const { waiverVersion: v1, waiverText: original } = event.config.registration;
    const live = async () => (await app.inject({ method: 'GET', url: `/api/public/events/${eventId}` })).json().config.registration;

    for (const changed of ['Different fictional waiver.', `${original} `, '']) {
      const refused = await publish(v1, changed);
      expect(refused.statusCode).toBe(422);
      expect(refused.json().error).toContain('already published with different text');
      expect(await live()).toMatchObject({ waiverVersion: v1, waiverText: original });
    }
    expect((await publish('v2', 'Different fictional waiver.')).statusCode).toBe(200);
    // Not only the latest publication: an older version's label stays with its own text.
    for (const changed of ['A third fictional waiver.', `${original} `, '']) expect((await publish(v1, changed)).statusCode).toBe(422);
    const stale = await order([code('RR-M35-34')], { waiver });
    expect(stale.statusCode).toBe(409);
    expect((await publish(v1, original)).statusCode).toBe(200);
  });

  it('holds no new places on a version that older publications gave two texts, and still replays a committed order', async () => {
    const { app, databaseUrl, eventId, code, order } = await setup();
    const key = { clientRequestId: 'committed-before-ambiguity' };
    const committed = await order([code('RR-M35-34')], key);
    expect(committed.statusCode).toBe(201);
    const db = openDb(databaseUrl);
    try {
      // History from before publishing enforced the rule.
      await db.run(
        `INSERT INTO event_versions (event_id, version, config_json, draft_revision, warnings_acknowledged, published_at)
         SELECT event_id, 0, jsonb_set(config_json, '{registration,waiverText}', '"An earlier fictional text."'), draft_revision, warnings_acknowledged, published_at
         FROM event_versions WHERE event_id = $1 AND version = 1`,
        [eventId],
      );
    } finally {
      await db.close();
    }
    const refused = await order([code('RR-M35-34')], { rider: { ...RIDER, firstName: 'Second' } });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error).toContain('Registration is paused');
    expect((await order([code('RR-M35-34')], key)).json().id).toBe(committed.json().id);

    const { config, revision } = (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json() as { config: EventConfig; revision: number };
    config.registration.waiverVersion = 'unambiguous';
    const saved = await app.inject({ method: 'PUT', url: `/api/events/${eventId}/config`, payload: { revision, config } });
    expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/publish`, payload: { acknowledgeWarnings: true, acknowledgeImpact: true, waiverChange: waiverChangeFor(saved.json()) } })).statusCode).toBe(200);
    const resumed = await order([code('RR-M35-34')], { rider: { ...RIDER, firstName: 'Second' }, waiver: { version: 'unambiguous', read: true, agreed: true, signatureName: 'Second Rider', signerRole: 'rider' } });
    expect(resumed.statusCode).toBe(201);
  });

  it('requires a published version', async () => {
    const { order, code } = await setup({ publish: false });
    const res = await order([code('RR-M35-34')]);
    expect(res.statusCode).toBe(409);
  });

  it('holds both days in one order with the bundle price (Buy both days)', async () => {
    const { order, code } = await setup();
    const res = await order([code('RR-M35-34'), code('CR-M35-34')]);
    expect(res.statusCode).toBe(201);
    const o = res.json() as Order;
    expect(o.status).toBe('held');
    expect(o.totalCents).toBe(7500);
    expect(o.entries).toHaveLength(2);
    expect(o.checkInCode).toBeNull();
  });

  it('a repeated request with the same client request ID returns the same order', async () => {
    const { app, eventId, code, waiver, entriesCount } = await setup();
    const before = await entriesCount();
    const body = { clientRequestId: 'same-request-123', categoryIds: [code('RR-M35-34')], rider: RIDER, waiver, waiverEvidence: { signerAccountId: 'forged-account', riderRacingAge: 99, acceptedAt: '1900-01-01T00:00:00Z' } };
    const a = (await app.inject({ method: 'POST', url: `/api/rider/events/${eventId}/orders`, payload: body })).json() as Order;
    const b = (await app.inject({ method: 'POST', url: `/api/rider/events/${eventId}/orders`, payload: body })).json() as Order;
    expect(b.id).toBe(a.id);
    expect(a.waiverEvidence).toMatchObject({ signerAccountId: expect.any(String), riderRacingAge: RIDER.racingAge, acceptedAt: expect.any(String) });
    const signer = (await app.inject({ method: 'GET', url: '/api/me' })).json().account;
    expect(a.waiverEvidence?.signerAccountId).toBe(signer.id);
    expect(a.waiverEvidence?.acceptedAt).not.toBe(body.waiverEvidence.acceptedAt);
    expect(b.waiverEvidence).toEqual(a.waiverEvidence);
    expect(await entriesCount()).toBe(before + 1);
  });

  it('looks up a reservation by exact reference without creating or extending a hold', async () => {
    const { app, eventId, order, code, clock, entriesCount } = await setup();
    const reference = 'reservation-reference-0001';
    const url = `/api/events/${eventId}/reservation-status`;
    const check = (value: string) => app.inject({ method: 'POST', url, payload: { reference: value } });
    const before = await entriesCount();

    const unknown = await check(reference);
    expect(unknown.statusCode).toBe(200);
    expect(unknown.json()).toEqual({ order: null, releaseEnabled: false });
    expect(unknown.headers['cache-control']).toBe('no-store');
    expect(await entriesCount()).toBe(before);
    expect((await check('short')).statusCode).toBe(400);

    const response = await order([code('RR-M35-34')], { clientRequestId: reference });
    expect(response.statusCode).toBe(201);
    const saved = response.json<{ orderNumber: string; holdExpiresAt: string }>();
    expect((await check(reference)).json()).toEqual({
      order: { orderNumber: saved.orderNumber, status: 'held', holdExpiresAt: saved.holdExpiresAt, releasedByStaff: false },
      releaseEnabled: true,
    });
    expect((await check(reference.toUpperCase())).json()).toEqual({ order: null, releaseEnabled: false });
    const other = (await app.inject({ method: 'POST', url: '/api/demo' })).json<{ eventId: string }>();
    expect((await app.inject({ method: 'POST', url: `/api/events/${other.eventId}/reservation-status`, payload: { reference } })).json()).toEqual({ order: null, releaseEnabled: false });
    expect(await entriesCount()).toBe(before + 1);
    clock.advance(10);
    expect((await check(reference)).json()).toEqual({
      order: { orderNumber: saved.orderNumber, status: 'expired', holdExpiresAt: null, releasedByStaff: false },
      releaseEnabled: false,
    });
    expect(await entriesCount()).toBe(before);
    expect((await app.inject({ method: 'GET', url: `/api/events/${eventId}/orders` })).json()).toHaveLength(1);
  });

  it('releases an unpaid hold once with staff evidence and keeps checkout replay terminal', async () => {
    const { app, eventId, order, code, entriesCount, databaseUrl, pay } = await setup();
    const reference = 'staff-release-reference';
    const url = `/api/events/${eventId}/reservation-release`;
    const release = (extra: object = {}) => app.inject({
      method: 'POST', url, payload: { reference, riderRequested: true, reason: 'Rider requested release', ...extra },
    });
    const before = await entriesCount();
    expect((await release()).statusCode).toBe(404);
    const create = () => order([code('RR-M35-34')], { clientRequestId: reference });
    const created = (await create()).json<{ id: string; orderNumber: string }>();
    expect(await entriesCount()).toBe(before + 1);
    expect((await release({ riderRequested: false })).statusCode).toBe(400);
    expect((await release({ reason: ' ' })).statusCode).toBe(400);
    expect((await release({ reason: '😀a' })).statusCode).toBe(400);
    await pay(created.id, 'failure');
    const released = await release();
    expect(released.statusCode).toBe(200);
    expect(released.json()).toEqual({
      order: { orderNumber: created.orderNumber, status: 'cancelled', holdExpiresAt: null, releasedByStaff: true },
      releaseEnabled: false,
    });
    expect(await entriesCount()).toBe(before);
    const lookup = await app.inject({
      method: 'POST', url: `/api/events/${eventId}/reservation-status`, payload: { reference },
    });
    expect(lookup.json()).toEqual(released.json());
    const retried = await release({ reason: 'Changed reason on retry' });
    expect(retried.json()).toEqual(released.json());
    expect((await create()).json()).toMatchObject({ id: created.id, status: 'cancelled', releasedByStaff: true, entries: [{ status: 'released' }] });
    expect((await pay(created.id, 'success')).json()).toMatchObject({ status: 'cancelled', releasedByStaff: true });
    const actor = (await app.inject({ method: 'GET', url: '/api/me' })).json().account.id;
    const db = openDb(databaseUrl);
    try {
      expect(await db.get('SELECT staff_released_by, staff_released_at, staff_release_reason FROM orders WHERE id=$1', [created.id]))
        .toEqual({ staff_released_by: actor, staff_released_at: '2027-03-01T18:00:00.000Z', staff_release_reason: 'Rider requested release' });
      expect(await db.get('SELECT count(*)::int AS count FROM payment_attempts WHERE order_id=$1', [created.id])).toEqual({ count: 1 });
    } finally { await db.close(); }
  });

  it('refuses every release while staff release is off, as production is by default', async () => {
    expect([{}, { STAFF_HOLD_RELEASE: 'off' }, { NODE_ENV: 'production' }, { NODE_ENV: 'production', STAFF_HOLD_RELEASE: 'yes' }, { NODE_ENV: 'production', STAFF_HOLD_RELEASE: 'on' }].map(staffHoldReleaseFromEnv))
      .toEqual([true, false, false, false, true]);
    const { eventId, order, code, databaseUrl } = await setup();
    const { app } = await testApp({ databaseUrl, staffHoldRelease: false, now: () => new Date('2027-03-01T18:00:00Z') });
    const reference = 'staff-release-turned-off';
    await order([code('RR-M35-34')], { clientRequestId: reference });
    expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/reservation-status`, payload: { reference } })).json()).toMatchObject({ order: { status: 'held' }, releaseEnabled: false });
    expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/reservation-release`, payload: { reference, riderRequested: true, reason: 'Fictional request' } })).statusCode).toBe(409);
  });

  it('refuses expired holds, confirmed orders and holds with provider activity', async () => {
    const { app, eventId, order, code, clock, databaseUrl, pay } = await setup();
    const makeOrder = async (reference: string) => (await order([code('RR-M35-34')], { clientRequestId: reference })).json<{ id: string }>();
    const release = (reference: string) => app.inject({
      method: 'POST', url: `/api/events/${eventId}/reservation-release`, payload: { reference, riderRequested: true, reason: 'Fictional request' },
    });
    const paid = await makeOrder('staff-release-paid');
    expect((await pay(paid.id, 'success')).json().status).toBe('confirmed');
    const paidStatus = await app.inject({
      method: 'POST', url: `/api/events/${eventId}/reservation-status`, payload: { reference: 'staff-release-paid' },
    });
    expect(paidStatus.json()).toMatchObject({ order: { status: 'confirmed' }, releaseEnabled: false });
    expect((await release('staff-release-paid')).statusCode).toBe(409);

    const pending = await makeOrder('staff-release-awaiting');
    const db = openDb(databaseUrl);
    try {
      await db.run(`INSERT INTO payment_sessions(id,order_id,provider,url,amount_cents,status,expires_at,created_at)
        VALUES ('cs_test_release_guard',$1,'stripe_test','https://example.test/checkout',1000,'open','2027-03-01T18:50Z','2027-03-01T18:00Z')`, [pending.id]);
      const pendingStatus = await app.inject({
        method: 'POST', url: `/api/events/${eventId}/reservation-status`, payload: { reference: 'staff-release-awaiting' },
      });
      expect(pendingStatus.json()).toMatchObject({ order: { status: 'held' }, releaseEnabled: false });
      const blocked = await release('staff-release-awaiting');
      expect(blocked.statusCode).toBe(409);
      expect(blocked.json().error).toContain('needs review');
      expect(await db.get('SELECT status, staff_released_at FROM orders WHERE id=$1', [pending.id])).toEqual({ status: 'held', staff_released_at: null });
      const legacy = await makeOrder('staff-release-untracked');
      await db.run('UPDATE orders SET stripe_checkout_tracked=false WHERE id=$1', [legacy.id]);
      const untracked = await release('staff-release-untracked');
      expect(untracked.statusCode).toBe(409);
      expect(untracked.json().error).toContain('predates payment tracking');
    } finally { await db.close(); }

    await makeOrder('staff-release-expired');
    clock.advance(10);
    expect((await release('staff-release-expired')).statusCode).toBe(409);
  });

  it('serializes a simulated payment with a simultaneous staff release', async () => {
    const { app, eventId, order, code, pay } = await setup();
    const reference = 'staff-release-concurrent';
    const created = (await order([code('RR-M35-34')], { clientRequestId: reference })).json<{ id: string }>();
    const [paid, released] = await Promise.all([
      pay(created.id, 'success'),
      app.inject({ method: 'POST', url: `/api/events/${eventId}/reservation-release`, payload: { reference, riderRequested: true, reason: 'Fictional request' } }),
    ]);
    const final = (await app.inject({ method: 'GET', url: `/api/orders/${created.id}` })).json();
    if (released.statusCode === 200) {
      expect(paid.json().status).toBe('cancelled');
      expect(final).toMatchObject({ status: 'cancelled', releasedByStaff: true });
    } else {
      expect(released.statusCode).toBe(409);
      expect(paid.json().status).toBe('confirmed');
      expect(final).toMatchObject({ status: 'confirmed', releasedByStaff: false });
    }
  });

  it('refuses ineligible entries, missing guardians, and a stale waiver', async () => {
    const { order, code, waiver } = await setup();
    expect((await order([code('RR-P12')])).statusCode).toBe(422); // Cat 3 is not P/1/2
    const junior = { ...RIDER, racingAge: 16, licenseCategory: null };
    expect((await order([code('RR-J1516')], { rider: junior })).statusCode).toBe(422);
    const withGuardian = { ...junior, guardian: { name: 'Test Parent', relationship: 'Parent', email: '', phone: '' } };
    expect((await order([code('RR-J1516')], { rider: withGuardian })).statusCode).toBe(422); // rider signed, guardian must
    expect((await order([code('RR-J1516')], { rider: withGuardian, waiver: { ...waiver, signatureName: 'Test Parent', signerRole: 'guardian' } })).statusCode).toBe(201);
    expect((await order([code('RR-M35-34')], { waiver: { ...waiver, version: 'old' } })).statusCode).toBe(409);
  });

  it('does not let a minor self-sign through an adult/open category', async () => {
    const { order, code, waiver } = await setup();
    const teen = { ...RIDER, racingAge: 17, licenseCategory: '5' };
    expect((await order([code('RR-45')], { rider: teen })).statusCode).toBe(422); // no guardian
    const withGuardian = { ...teen, guardian: { name: 'Test Parent', relationship: 'Parent', email: '', phone: '' } };
    expect((await order([code('RR-45')], { rider: withGuardian })).statusCode).toBe(422); // rider signed
    expect((await order([code('RR-45')], { rider: withGuardian, waiver: { ...waiver, signatureName: 'Someone Else', signerRole: 'guardian' } })).statusCode).toBe(422); // wrong signer
    const ok = await order([code('RR-45')], { rider: withGuardian, waiver: { ...waiver, signatureName: 'Test Parent', signerRole: 'guardian' } });
    expect(ok.statusCode).toBe(201);
    const o = ok.json() as Order;
    expect(o.entries[0].readiness.find((r) => r.key === 'guardian')?.state).toBe('done');
    const adult = (await order([code('RR-45')], { rider: { ...RIDER, racingAge: 19, licenseCategory: '5' } })).json() as Order;
    expect(adult.entries[0].readiness.some((r) => r.key === 'guardian')).toBe(false);
  });

  it('confirms on payment once, even when the notification repeats (Payment retry)', async () => {
    const { order, pay, code, entriesCount } = await setup();
    const o = (await order([code('RR-M35-34')])).json() as Order;
    const first = (await pay(o.id, 'success', 'attempt-aaaaaaaa')).json() as Order;
    expect(first.status).toBe('confirmed');
    expect(first.checkInCode).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    const count = await entriesCount();
    const again = (await pay(o.id, 'success', 'attempt-aaaaaaaa')).json() as Order;
    const other = (await pay(o.id, 'success', 'attempt-bbbbbbbb')).json() as Order;
    expect(again.checkInCode).toBe(first.checkInCode);
    expect(other.checkInCode).toBe(first.checkInCode);
    expect(await entriesCount()).toBe(count);
  });

  it('a declined payment keeps the hold; a retry can still succeed', async () => {
    const { order, pay, code } = await setup();
    const o = (await order([code('RR-M35-34')])).json() as Order;
    expect(((await pay(o.id, 'failure')).json() as Order).status).toBe('payment_failed');
    expect(((await pay(o.id, 'success')).json() as Order).status).toBe('confirmed');
  });

  it('held places count toward shared limits, and a bundle is held all or nothing', async () => {
    const { app, eventId, order, code, entriesCount } = await setup();
    // Masters 50+ has 35 entries; fill the combined pool of 60 to 59.
    await app.inject({ method: 'POST', url: `/api/events/${eventId}/test-entries`, payload: { categoryId: code('RR-M60'), count: 24 } });
    const rider60 = { ...RIDER, racingAge: 61, licenseCategory: '3' };
    expect((await order([code('RR-M60')], { rider: rider60 })).statusCode).toBe(201); // takes the 60th place
    const before = await entriesCount();
    const res = await order([code('CR-M35-34'), code('RR-M60')], { rider: rider60 });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/Nothing was held/);
    expect(await entriesCount()).toBe(before);
  });

  it('two riders racing for the last place on two connections: exactly one hold, and a repeated payment confirms once', async () => {
    const { app, databaseUrl, eventId, code, waiver } = await setup();
    const { app: b } = await testApp({ databaseUrl, now: () => new Date('2027-03-01T18:00:00Z'), holdMinutes: 10 });
    await app.inject({ method: 'POST', url: `/api/events/${eventId}/test-entries`, payload: { categoryId: code('RR-M60'), count: 24 } }); // 59 of 60
    const rider60 = { ...RIDER, racingAge: 61 };
    const body = (clientRequestId: string) => ({ clientRequestId, categoryIds: [code('RR-M60')], rider: rider60, waiver });
    const race = await Promise.all([
      app.inject({ method: 'POST', url: `/api/rider/events/${eventId}/orders`, payload: body('race-a-12345678') }),
      b.inject({ method: 'POST', url: `/api/rider/events/${eventId}/orders`, payload: body('race-b-12345678') }),
    ]);
    expect(race.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    const held = race.find((r) => r.statusCode === 201)!.json() as Order;
    // The same payment notification arriving on both connections at once is processed once.
    const paid = await Promise.all(
      [app, b].map((x) => x.inject({ method: 'POST', url: `/api/orders/${held.id}/payment`, payload: { attemptId: 'same-attempt-123', outcome: 'success' } })),
    );
    expect(paid.map((p) => p.statusCode)).toEqual([200, 200]);
    const [first, second] = paid.map((p) => p.json() as Order);
    expect([first.status, second.status]).toEqual(['confirmed', 'confirmed']);
    expect(second.checkInCode).toBe(first.checkInCode);
  });

  it('expired holds release places; a late payment confirms only if every place is still free', async () => {
    const { app, eventId, order, pay, code, clock } = await setup();
    await app.inject({ method: 'POST', url: `/api/events/${eventId}/test-entries`, payload: { categoryId: code('RR-M60'), count: 24 } }); // 59 of 60
    const rider60 = { ...RIDER, racingAge: 61 };
    const slow = (await order([code('RR-M60')], { rider: rider60 })).json() as Order; // holds the last place
    expect((await order([code('RR-M60')], { rider: rider60 })).statusCode).toBe(409);

    clock.advance(11);
    expect(((await app.inject({ method: 'GET', url: `/api/orders/${slow.id}` })).json() as Order).status).toBe('expired');
    const fast = (await order([code('RR-M60')], { rider: rider60 })).json() as Order;
    expect(((await pay(fast.id, 'success')).json() as Order).status).toBe('confirmed');

    const late = (await pay(slow.id, 'success')).json() as Order;
    expect(late.status).toBe('needs_attention');
    expect(late.checkInCode).toBeNull();
  });

  it('a late payment after expiry confirms when the places are still free', async () => {
    const { order, pay, code, clock } = await setup();
    const o = (await order([code('RR-M35-34')])).json() as Order;
    clock.advance(30);
    expect(((await pay(o.id, 'success')).json() as Order).status).toBe('confirmed');
  });

  it('a payment that arrives after the rider cancelled goes to the exception queue instead of re-entering them', async () => {
    const { app, order, pay, code } = await setup();
    const o = (await order([code('RR-M35-34')])).json() as Order;
    await app.inject({ method: 'POST', url: `/api/orders/${o.id}/cancel` });
    expect(((await pay(o.id, 'success')).json() as Order).status).toBe('needs_attention');
  });

  it('cancelling releases the hold', async () => {
    const { app, order, code, entriesCount } = await setup();
    const before = await entriesCount();
    const o = (await order([code('RR-M35-34')])).json() as Order;
    expect(await entriesCount()).toBe(before + 1);
    await app.inject({ method: 'POST', url: `/api/orders/${o.id}/cancel` });
    expect(await entriesCount()).toBe(before);
  });

  it('paying does not clear a rider: license review stays pending until the organizer records it', async () => {
    const { app, eventId, order, pay, code } = await setup();
    const o = (await order([code('RR-M35-34')])).json() as Order;
    const paid = (await pay(o.id, 'success')).json() as Order;
    expect(paid.entries[0].readiness.find((r) => r.key === 'license')!.state).toBe('needs_review');
    const reviewUrl = `/api/order-entries/${paid.entries[0].id}/license-review`;
    expect((await app.inject({ method: 'POST', url: reviewUrl, payload: { note: 123 } })).statusCode).toBe(400);
    const confirmation = await app.inject({ method: 'POST', url: reviewUrl, payload: {} });
    expect(confirmation.statusCode).toBe(200);
    const reviewed = confirmation.json() as Order;
    expect(reviewed.entries[0].readiness.find((r) => r.key === 'license')!.state).toBe('done');
    const list = (await app.inject({ method: 'GET', url: `/api/events/${eventId}/orders` })).json() as Order[];
    expect(list).toHaveLength(1);
  });

  it('requires the typed signature to match the rider and an emergency contact', async () => {
    const { order, code, waiver } = await setup();
    expect((await order([code('RR-M35-34')], { waiver: { ...waiver, signatureName: 'Someone Else' } })).statusCode).toBe(422);
    expect((await order([code('RR-M35-34')], { waiver: { ...waiver, signatureName: '  test   rider ' } })).statusCode).toBe(201);
    const res = await order([code('RR-M35-34')], { rider: { ...RIDER, emergencyContact: { name: 'X', phone: '12345' } } });
    expect(res.statusCode).toBe(400);
  });

  it('a category with a confirmed registration cannot be deleted from the draft', async () => {
    const { app, eventId, order, pay, code } = await setup();
    const o = (await order([code('RR-M35-34')])).json() as Order;
    await pay(o.id, 'success');
    const ev = (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json() as { config: EventConfig; revision: number };
    const config = structuredClone(ev.config);
    config.categories = config.categories.filter((c) => c.timingCode !== 'RR-M35-34');
    const res = await app.inject({ method: 'PUT', url: `/api/events/${eventId}/config`, payload: { revision: ev.revision, config } });
    expect(res.statusCode).toBe(409);
  });
});

describe('generated case-study purchases through the API', () => {
  it('loads generated cases once and preserves checkout totals and simulated license results', async () => {
    const { app } = await testApp({ now: () => new Date('2027-03-01T18:00:00Z') });
    const first = await app.inject({ method: 'POST', url: '/api/demo/case-studies' });
    expect(first.statusCode).toBe(201);
    const again = await app.inject({ method: 'POST', url: '/api/demo/case-studies' });
    expect(again.statusCode).toBe(200);
    const events = (await app.inject({ method: 'GET', url: '/api/public/events' })).json() as { id: string; name: string }[];
    expect(events).toHaveLength(4);
    expect((await app.inject({ method: 'POST', url: '/api/demo/purchase-flow' })).statusCode).toBe(404);
    const criteriumId = events.find((e) => e.name === 'Demo Harbor Criterium: pricing and eligibility lab')!.id;
    const pub = (await app.inject({ method: 'GET', url: `/api/public/events/${criteriumId}` })).json() as { config: EventConfig; remaining: Record<string, number> };
    const cat = (n: string) => pub.config.categories.find((c) => c.name === n)!.id;
    expect(pub.remaining[cat('Masters 35+ Cat 3/4')]).toBe(0);

    const waiverFor = (name: string, role = 'rider') => ({ version: pub.config.registration.waiverVersion, read: true, agreed: true, signatureName: name, signerRole: role });
    const alex = { firstName: 'Alex', lastName: 'Demo', email: 'alex.demo@example.com', phone: '555-555-0101', team: 'Demo Wheelers', racingAge: 29, licenseCategory: '4', licenseType: 'annual', licenseNumber: 'DEMO-100001', competitionClass: 'men', collegiateDivision: null, demoRiderId: 'rider-alex', emergencyContact: { name: 'Robin Demo', phone: '555-555-0111' }, guardian: null };
    const a = (await app.inject({ method: 'POST', url: `/api/rider/events/${criteriumId}/orders`, payload: { clientRequestId: 'alex-order-1', categoryIds: [cat('Men Cat 4/5'), cat('Open Cat 4/5 Evening')], rider: alex, waiver: waiverFor('Alex Demo') } })).json() as Order;
    expect(a.totalCents).toBe(5965);
    const paidA = (await app.inject({ method: 'POST', url: `/api/orders/${a.id}/payment`, payload: { attemptId: 'alex-attempt-1', outcome: 'success' } })).json() as Order;
    expect(paidA.entries.every((e) => e.readiness.every((r) => r.state === 'done'))).toBe(true);

    const sam = { ...alex, firstName: 'Sam', email: 'sam.demo@example.com', racingAge: 31, competitionClass: 'women', licenseNumber: 'DEMO-100004', demoRiderId: 'rider-sam', team: '' };
    const s = (await app.inject({ method: 'POST', url: `/api/rider/events/${criteriumId}/orders`, payload: { clientRequestId: 'sam-order-1', categoryIds: [cat('Women Cat 3/4/5')], rider: sam, waiver: waiverFor('Sam Demo') } })).json() as Order;
    expect(s.totalCents).toBe(3905);
    const paidS = (await app.inject({ method: 'POST', url: `/api/orders/${s.id}/payment`, payload: { attemptId: 'sam-attempt-1', outcome: 'success' } })).json() as Order;
    expect(paidS.status).toBe('confirmed');
    expect(paidS.entries[0].readiness.find((r) => r.key === 'license')!.state).toBe('needs_review');
    await app.close();
  });
});

describe('registration windows through the API', () => {
  /** The demo weekend turned into a "real" event: windows are enforced. */
  async function realEvent(at: string) {
    let now = new Date(at);
    const clock = { set: (iso: string) => (now = new Date(iso)), advance: (min: number) => (now = new Date(now.getTime() + min * 60_000)) };
    const { app } = await testApp({ now: () => now, holdMinutes: 10 });
    const { eventId } = (await app.inject({ method: 'POST', url: '/api/demo' })).json() as { eventId: string };
    const ev = (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json() as { config: EventConfig; revision: number };
    const config = structuredClone(ev.config);
    config.event.isDemo = false;
    await app.inject({ method: 'PUT', url: `/api/events/${eventId}/config`, payload: { revision: ev.revision, config } });
    await app.inject({ method: 'POST', url: `/api/events/${eventId}/publish`, payload: { acknowledgeWarnings: true } });
    const code = (c: string) => config.categories.find((x) => x.timingCode === c)!.id;
    const waiver = { version: config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Test Rider', signerRole: 'rider' };
    let n = 0;
    const order = (ids: string[]) => app.inject({ method: 'POST', url: `/api/rider/events/${eventId}/orders`, payload: { clientRequestId: `win-${++n}-xxxxxx`, categoryIds: ids, rider: RIDER, waiver } });
    return { app, eventId, code, order, clock };
  }

  it('refuses entries before a window opens and after it closes', async () => {
    const { order, code, clock } = await realEvent('2027-01-15T20:00:00Z');
    const early = await order([code('RR-M35-34')]);
    expect(early.statusCode).toBe(422);
    expect(early.json().error).toMatch(/opens Feb 1, 2027, 9:00 AM/);
    clock.set('2027-04-23T04:00:00Z'); // Apr 22, 9:00 PM in California: road race closed at 8:00 PM, criterium still open
    expect((await order([code('RR-M35-34')])).statusCode).toBe(422);
    expect((await order([code('CR-M35-34')])).statusCode).toBe(201);
  });

  it('a demo event lets testers register outside the window', async () => {
    let now = new Date('2027-01-15T20:00:00Z');
    const { app } = await testApp({ now: () => now });
    const { eventId } = (await app.inject({ method: 'POST', url: '/api/demo' })).json() as { eventId: string };
    await app.inject({ method: 'POST', url: `/api/events/${eventId}/publish`, payload: { acknowledgeWarnings: true } });
    const pub = (await app.inject({ method: 'GET', url: `/api/public/events/${eventId}` })).json() as { config: EventConfig; enforceWindows: boolean; nowLocal: string };
    expect(pub.enforceWindows).toBe(false);
    expect(pub.nowLocal).toBe('2027-01-15T12:00');
    const cat = pub.config.categories.find((c) => c.timingCode === 'RR-M35-34')!.id;
    const waiver = { version: pub.config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Test Rider', signerRole: 'rider' };
    const res = await app.inject({ method: 'POST', url: `/api/rider/events/${eventId}/orders`, payload: { clientRequestId: 'demo-window-1', categoryIds: [cat], rider: RIDER, waiver } });
    expect(res.statusCode).toBe(201);
  });

  it('a hold taken before close can be paid within its time, but a late payment after close goes to a person', async () => {
    const { app, order, code, clock } = await realEvent('2027-04-23T02:55:00Z'); // 7:55 PM, road race closes 8:00 PM
    const inTime = (await order([code('RR-M35-34')])).json() as Order;
    const lateOne = (await order([code('RR-D23')])).json() as Order;
    clock.advance(6); // 8:01 PM: closed, holds still valid
    expect(((await app.inject({ method: 'POST', url: `/api/orders/${inTime.id}/payment`, payload: { attemptId: 'win-pay-1', outcome: 'success' } })).json() as Order).status).toBe('confirmed');
    clock.advance(10); // hold expired after close
    expect(((await app.inject({ method: 'POST', url: `/api/orders/${lateOne.id}/payment`, payload: { attemptId: 'win-pay-2', outcome: 'success' } })).json() as Order).status).toBe('needs_attention');
  });
});


describe('Berkeley package order snapshot', () => {
  it.each([{ codes: ['RR-M35-34', 'CR-M35-34'], rider: RIDER, total: 13000 }, { codes: ['RR-WL', 'CR-W3'], rider: { ...RIDER, competitionClass: 'women', collegiateDivision: 'B' }, total: 5000 }])('preserves the $total discount and podium nomination through simulated confirmation and later draft changes', async ({ codes, rider, total }) => {
    const { app } = await testApp({ now: () => new Date('2027-03-15T18:00:00Z') });
    try {
      const { eventId } = (await app.inject({ method: 'POST', url: '/api/demo/berkeley-omnium' })).json();
      const event = (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json();
      const config = event.config as EventConfig;
      const categoryIds = codes.map((code) => config.categories.find((c) => c.timingCode === code)!.id);
      expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/publish`, payload: { acknowledgeWarnings: true } })).statusCode).toBe(200);
      const selectedBundle = config.registration.bundles[0];
      config.registration.bundles.push({ id: 'other-weekend', name: 'Other weekend discount', raceIds: selectedBundle.raceIds, priceCents: 100, discountCents: 0 });
      config.registration.bundles.push({ id: 'no-saving', name: 'No savings at current prices', raceIds: selectedBundle.raceIds, priceCents: null, discountCents: 0 });
      expect((await app.inject({ method: 'PUT', url: `/api/events/${eventId}/config`, payload: { revision: event.revision, config } })).statusCode).toBe(200);
      expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/publish`, payload: { acknowledgeWarnings: true } })).statusCode).toBe(200);
      const url = `/api/rider/events/${eventId}/orders`;
      const payload = {
        clientRequestId: 'berkeley-package-order', categoryIds, rider,
        bundleIntent: config.registration.bundles[0].id,
        waiver: { version: config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Test Rider', signerRole: 'rider' },
      };
      const incomplete = await app.inject({ method: 'POST', url, payload: { ...payload, categoryIds: categoryIds.slice(0, 1) } });
      expect(incomplete.statusCode).toBe(422);
      expect(incomplete.json().error).toContain('Nothing was held');
      const noSaving = await app.inject({ method: 'POST', url, payload: { ...payload, bundleIntent: 'no-saving' } });
      expect(noSaving.statusCode).toBe(422);
      expect(noSaving.json().error).toContain('Nothing was held');
      expect((await app.inject({ method: 'GET', url: '/api/rider/registrations' })).json()).toEqual([]);
      const res = await app.inject({ method: 'POST', url, payload });
      expect(res.statusCode).toBe(201);
      const held = res.json();
      expect(held.quote.bundle.omnium.categoryIds).toEqual(categoryIds);
      expect(held.quote.bundle.id).toBe(selectedBundle.id);
      expect(held.totalCents).toBe(total);
      const current = (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json();
      config.registration.bundles = [];
      expect((await app.inject({ method: 'PUT', url: `/api/events/${eventId}/config`, payload: { revision: current.revision, config } })).statusCode).toBe(200);
      expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/publish`, payload: { acknowledgeWarnings: true } })).statusCode).toBe(200);
      const stale = await app.inject({ method: 'POST', url, payload: { ...payload, clientRequestId: 'new-stale-package-order' } });
      expect(stale.statusCode).toBe(409);
      const replay = await app.inject({ method: 'POST', url, payload });
      expect(replay.statusCode).toBe(201);
      expect(replay.json()).toMatchObject({ id: held.id, quote: held.quote });
      const paid = (await app.inject({ method: 'POST', url: `/api/orders/${held.id}/payment`, payload: { attemptId: 'berkeley-package-payment', outcome: 'success' } })).json();
      expect(paid.status).toBe('confirmed');
      expect(paid.totalCents).toBe(total);
      expect(paid.quote.bundle).toEqual(held.quote.bundle);
      expect(paid.quote.bundle.omnium.status).toBe('needs_review');
      expect(paid.entries).toHaveLength(2);
    } finally {
      await app.close();
    }
  });
});

describe('order numbers', () => {
  it('start with DEMO- on a demonstration event and CR- on any other event', async () => {
    const { app, eventId, event, order, code } = await setup();
    const demo = (await order([code('RR-M35-34')])).json() as Order & { orderNumber: string };
    expect(demo.orderNumber).toBe(`DEMO-${demo.id.slice(4, 12).toUpperCase()}`);

    // The same event published as a real one: new orders are numbered CR-, the earlier order keeps DEMO-.
    const config = { ...event.config, event: { ...event.config.event, isDemo: false, demoNotice: '' }, registration: { ...event.config.registration, demoIgnoreWindows: false } };
    expect((await app.inject({ method: 'PUT', url: `/api/events/${eventId}/config`, payload: { revision: event.revision, config } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/publish`, payload: { acknowledgeWarnings: true, acknowledgeImpact: true } })).statusCode).toBe(200);
    const res = await order([code('CR-M35-34')]);
    expect(res.statusCode).toBe(201);
    const real = res.json() as Order & { orderNumber: string };
    expect(real.orderNumber).toBe(`CR-${real.id.slice(4, 12).toUpperCase()}`);
    const again = (await app.inject({ method: 'GET', url: `/api/orders/${demo.id}` })).json() as { orderNumber: string };
    expect(again.orderNumber).toBe(demo.orderNumber);
    // Organizer search finds an order by its number, with or without the prefix.
    const find = async (q: string) => ((await app.inject({ method: 'GET', url: `/api/events/${eventId}/orders?${new URLSearchParams({ q })}` })).json() as { id: string }[]).map((o) => o.id);
    expect(await find(real.orderNumber)).toEqual([real.id]);
    expect(await find(real.orderNumber.slice(3))).toEqual([real.id]);
  });
});

it('keeps every saved key retryable and refuses a lookup only for what storage cannot hold exactly', () => {
  for (const key of ['7f6c2a52-0d0b-4d59-9a57-3b7c2d8e1f00', ' spaced-reference ', 'référence-🚲-01', 'exact\nreference', 'exact\treference', 'exact\u007freference']) {
    expect(reservationReferenceSchema.safeParse(key).success).toBe(true);
    expect(reservationLookupSchema.safeParse(key).success).toBe(true);
  }
  for (const key of ['exact\u0000reference', 'exact\ud800reference', 'exact\udc00reference']) {
    expect(reservationReferenceSchema.safeParse(key).success).toBe(true);
    expect(reservationLookupSchema.safeParse(key).success).toBe(false);
  }
});
