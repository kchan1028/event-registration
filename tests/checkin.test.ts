import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { testApp, testDatabaseUrl } from './support/db';
import { buildDemoEvent } from '../src/shared/demo';
import { bibRangeForEntries, checkInResult, checkInTiming, mergeReadiness, nextFreeBib } from '../src/shared/checkin';
import type { EventConfig } from '../src/shared/schema';
import type { ReadinessItem } from '../src/shared/checkout';

const done = (key: ReadinessItem['key']): ReadinessItem => ({ key, label: key, state: 'done' });

describe('check-in rules', () => {
  it('is ready only when paid and every requirement is done', () => {
    expect(checkInResult({ payment: 'confirmed', entriesToday: 1, readiness: [done('license'), done('waiver')] }).ready).toBe(true);
  });

  it('treats an unreviewed license as blocked, never cleared', () => {
    const r = checkInResult({ payment: 'confirmed', entriesToday: 1, readiness: [{ key: 'license', label: '', state: 'needs_review' }, done('waiver')] });
    expect(r.ready).toBe(false);
    expect(r.blockers.map((b) => b.key)).toEqual(['license']);
  });

  it('does not clear an unpaid rider, and blocks a rider with no entry that day', () => {
    expect(checkInResult({ payment: 'not_complete', entriesToday: 1, readiness: [done('license')] }).blockers.map((b) => b.key)).toEqual(['payment']);
    expect(checkInResult({ payment: 'confirmed', entriesToday: 0, readiness: [] }).blockers.map((b) => b.key)).toEqual(['no_entry']);
  });

  it('merges readiness so one unfinished entry blocks the day', () => {
    const merged = mergeReadiness([[done('license')], [{ key: 'license', label: 'x', state: 'needs_review' }]]);
    expect(merged).toEqual([{ key: 'license', label: 'x', state: 'needs_review' }]);
  });

  it('summarizes check-in times as median and 95th percentile, ignoring implausible ones', () => {
    expect(checkInTiming([])).toEqual({ timed: 0, medianSeconds: null, p95Seconds: null });
    expect(checkInTiming([10_000, 20_000, 30_000])).toEqual({ timed: 3, medianSeconds: 20, p95Seconds: 30 });
    const twenty = Array.from({ length: 20 }, (_, i) => (i + 1) * 1000); // 1..20 s
    expect(checkInTiming(twenty)).toMatchObject({ medianSeconds: 11, p95Seconds: 19 });
    expect(checkInTiming([0, 15_000, 11 * 60_000])).toEqual({ timed: 1, medianSeconds: 15, p95Seconds: 15 });
  });

  it('uses entry-specific fallbacks without capping explicit category ranges', () => {
    const { config } = buildDemoEvent();
    const rr = config.categories.find((c) => c.timingCode === 'RR-M35-34')!;
    const cr = config.categories.find((c) => c.timingCode === 'CR-M35-34')!;
    rr.bibRange = { first: 100, last: 180 };
    cr.bibRange = null;
    const entry = (c: typeof rr) => ({ categoryId: c.id, dayId: config.races.find((r) => r.id === c.raceId)!.dayId });
    const settings = { scope: 'weekend' as const, ranges: [{ scope: 'weekend', first: 150, last: 199 }] };
    expect(bibRangeForEntries(config, [entry(rr)], settings, entry(rr).dayId)).toEqual({ scope: 'weekend', first: 100, last: 180 });
    expect(bibRangeForEntries(config, [entry(rr), entry(cr)], settings, entry(rr).dayId)).toEqual({ scope: 'weekend', first: 150, last: 180 });
    expect(bibRangeForEntries(config, [entry(rr), entry(cr)], { scope: 'weekend', ranges: [] }, entry(rr).dayId)).toBeNull();
  });

  it('finds the lowest free bib and reports a full range', () => {
    expect(nextFreeBib({ scope: 'weekend', first: 10, last: 12 }, new Set([10, 12]))).toBe(11);
    expect(nextFreeBib({ scope: 'weekend', first: 10, last: 11 }, new Set([10, 11]))).toBeNull();
  });
});

type Card = { orderId: string; name: string; checkInCode: string | null; bib: number | null; checkedInAt: string | null; result: { ready: boolean }; bibHistory: { bib: number; reason: string | null }[]; undoneCheckIns: { bib: number | null; bibReleased: boolean; reason: string }[] };
type List = { dayId: string; days: { id: string }[]; riders: Card[] };

async function setup(databaseUrl?: string) {
  const { app } = await testApp({ databaseUrl, now: () => new Date('2027-03-01T18:00:00Z') });
  const { eventId } = (await app.inject({ method: 'POST', url: '/api/demo' })).json() as { eventId: string };
  await app.inject({ method: 'POST', url: `/api/events/${eventId}/publish`, payload: { acknowledgeWarnings: true } });
  const seeded = await app.inject({ method: 'POST', url: `/api/events/${eventId}/check-in-demo-riders` });
  const list = async (q = '', day?: string) =>
    (await app.inject({ method: 'GET', url: `/api/events/${eventId}/check-in?${new URLSearchParams({ q, ...(day ? { day } : {}) })}` })).json() as List;
  const first = await list();
  const rider = (name: string) => first.riders.find((r) => r.name.startsWith(name))!;
  const checkIn = (orderId: string, bib: number | null = null, dayId = first.dayId) => app.inject({ method: 'POST', url: `/api/events/${eventId}/check-in/${orderId}`, payload: { dayId, bib } });
  const setBibs = (payload: Record<string, unknown>) => app.inject({ method: 'PUT', url: `/api/events/${eventId}/bib-settings`, payload });
  return { app, eventId, seeded, list, first, rider, checkIn, setBibs };
}

describe('check-in API', () => {
  it('refuses desk check-in for a paid rider with a missing waiver signature', async () => {
    const databaseUrl = await testDatabaseUrl();
    const { rider, list, setBibs, checkIn } = await setup(databaseUrl);
    const alex = rider('Alex');
    expect(alex.result.ready).toBe(true);
    expect((await setBibs({ scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 199 }] })).statusCode).toBe(200);

    // Checkout requires a signature. Model an incomplete stored waiver only in the disposable fixture.
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      const changed = await client.query(
        `UPDATE orders SET waiver_json = waiver_json || '{"signatureName": ""}'::jsonb WHERE id = $1`,
        [alex.orderId],
      );
      expect(changed.rowCount).toBe(1);
    } finally {
      await client.end();
    }

    const blockedCard = async () => (await list(alex.checkInCode!)).riders.find((card) => card.orderId === alex.orderId);
    const blocked = await blockedCard();
    expect(blocked).toMatchObject({
      payment: 'confirmed',
      bib: null,
      checkedInAt: null,
      result: { ready: false, blockers: [{
        key: 'waiver',
        label: 'Waiver not accepted',
        action: 'Send the rider to the registration desk to accept the waiver.',
      }] },
    });
    const refused = await checkIn(alex.orderId);
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({ error: expect.stringContaining('waiver not accepted') });
    expect(await blockedCard()).toEqual(blocked);
  });

  it('uses the same weekend overlap for desk and bulk assignment while day-scoped bibs stay independent', async () => {
    const { app, eventId, first, rider, checkIn, setBibs } = await setup();
    const event = (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json() as { config: EventConfig; revision: number };
    for (const c of event.config.categories) c.bibRange = event.config.races.find((r) => r.id === c.raceId)!.dayId === first.dayId ? { first: 100, last: 180 } : { first: 150, last: 199 };
    await app.inject({ method: 'PUT', url: `/api/events/${eventId}/config`, payload: { config: event.config, revision: event.revision } });
    await app.inject({ method: 'POST', url: `/api/events/${eventId}/publish`, payload: { acknowledgeWarnings: true } });
    await setBibs({ scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 199 }] });
    expect((await checkIn(rider('Alex').orderId, 120)).statusCode).toBe(422);
    expect((await checkIn(rider('Alex').orderId)).json()).toMatchObject({ bib: 150 });
    const batch = { dayId: first.dayId, orderIds: [rider('Blake').orderId] };
    const plan = (await app.inject({ method: 'POST', url: `/api/events/${eventId}/bibs/preview`, payload: batch })).json();
    expect(plan.assignments[0]).toMatchObject({ bib: 151, range: { first: 150, last: 180 } });
    expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/bibs/apply`, payload: { ...batch, fingerprint: plan.fingerprint } })).statusCode).toBe(200);
    await setBibs({ scope: 'day', ranges: first.days.map((d) => ({ scope: d.id, first: 100, last: 199 })) });
    expect((await checkIn(rider('Casey').orderId, 120)).statusCode).toBe(200);
  });

  it('previews a stable confirmed-rider bib batch and applies it without clearing readiness', async () => {
    const { app, eventId, first, rider, setBibs, list } = await setup();
    await setBibs({ scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 102 }] });
    const orderIds = [rider('Blake').orderId, rider('Alex').orderId];
    const preview = await app.inject({ method: 'POST', url: `/api/events/${eventId}/bibs/preview`, payload: { dayId: first.dayId, orderIds } });
    expect(preview.statusCode).toBe(200);
    const plan = preview.json() as { fingerprint: string; assignments: { orderId: string; bib: number }[] };
    expect(plan.assignments.map((a) => a.bib)).toEqual([100, 101]);
    expect((await list()).riders.find((r) => r.orderId === rider('Alex').orderId)?.bib).toBeNull();
    const applied = await app.inject({ method: 'POST', url: `/api/events/${eventId}/bibs/apply`, payload: { dayId: first.dayId, orderIds, fingerprint: plan.fingerprint } });
    expect(applied.statusCode).toBe(200);
    expect((await list()).riders.find((r) => r.orderId === rider('Alex').orderId)).toMatchObject({ bib: 100, checkedInAt: null });
    expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/bibs/apply`, payload: { dayId: first.dayId, orderIds, fingerprint: plan.fingerprint } })).statusCode).toBe(409);
  });

  it('rejects a stale or exhausted bib batch without partial assignments', async () => {
    const { app, eventId, first, rider, setBibs, checkIn, list } = await setup();
    await setBibs({ scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 101 }] });
    const orderIds = [rider('Alex').orderId, rider('Blake').orderId];
    const payload = { dayId: first.dayId, orderIds };
    const plan = (await app.inject({ method: 'POST', url: `/api/events/${eventId}/bibs/preview`, payload })).json() as { fingerprint: string };
    await checkIn(rider('Alex').orderId, 100);
    expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/bibs/apply`, payload: { ...payload, fingerprint: plan.fingerprint } })).statusCode).toBe(409);
    expect((await list()).riders.find((r) => r.orderId === rider('Blake').orderId)?.bib).toBeNull();
    expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/bibs/preview`, payload: { ...payload, orderIds: [rider('Blake').orderId, rider('Dana').orderId] } })).statusCode).toBe(409);
  });

  it('preserves checked-in riders after the bib scope changes', async () => {
    const { app, eventId, first, rider, setBibs, checkIn } = await setup();
    await setBibs({ scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 199 }] });
    const alex = rider('Alex').orderId;
    expect((await checkIn(alex, 100)).statusCode).toBe(200);
    expect((await setBibs({ scope: 'day', ranges: [{ scope: first.dayId, first: 200, last: 299 }] })).statusCode).toBe(200);
    const preview = await app.inject({ method: 'POST', url: `/api/events/${eventId}/bibs/preview`, payload: { dayId: first.dayId, orderIds: [alex] } });
    expect(preview.statusCode).toBe(409);
    expect(preview.json()).toMatchObject({ error: expect.stringContaining('Already checked in') });
  });

  it('binds race/category and sort choices to the preview', async () => {
    const { app, eventId, first, rider, setBibs } = await setup();
    await setBibs({ scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 199 }] });
    const event = (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json() as { config: { categories: { id: string; raceId: string }[] } };
    const alex = rider('Alex').orderId;
    const card = first.riders.find((r) => r.orderId === alex) as Card & { entries: { categoryId: string }[] };
    const categoryId = card.entries[0].categoryId;
    const raceId = event.config.categories.find((c) => c.id === categoryId)!.raceId;
    const payload = { dayId: first.dayId, orderIds: [alex], categoryId, raceId, sort: 'registration' };
    const preview = await app.inject({ method: 'POST', url: `/api/events/${eventId}/bibs/preview`, payload });
    expect(preview.statusCode).toBe(200);
    const plan = preview.json() as { fingerprint: string; categoryId: string; raceId: string; sort: string };
    expect(plan).toMatchObject({ categoryId, raceId, sort: 'registration' });
    expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/bibs/apply`, payload: { ...payload, sort: 'start', fingerprint: plan.fingerprint } })).statusCode).toBe(409);
    expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/bibs/preview`, payload: { ...payload, categoryId: 'cat_missing' } })).statusCode).toBe(422);
    expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/bibs/apply`, payload: { ...payload, fingerprint: plan.fingerprint } })).statusCode).toBe(200);
  });
  it('orders a multi-rider batch by name, registration, or start time', async () => {
    const { app, eventId, first, rider, setBibs } = await setup();
    await setBibs({ scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 199 }] });
    const alex = rider('Alex').orderId;
    const blake = rider('Blake').orderId;
    const orderIds = [blake, alex];
    for (const [sort, expected] of [
      ['name', [alex, blake]],
      // The fixture clock is fixed, so registration timestamps tie.
      ['registration', [...orderIds].sort()],
      // Blake starts at 08:05; Alex starts at 09:30.
      ['start', [blake, alex]],
    ] as const) {
      const response = await app.inject({ method: 'POST', url: `/api/events/${eventId}/bibs/preview`, payload: { dayId: first.dayId, orderIds, sort } });
      expect(response.statusCode).toBe(200);
      const plan = response.json() as { assignments: { orderId: string; bib: number }[] };
      expect(plan.assignments.map((a) => a.orderId)).toEqual(expected);
      expect(plan.assignments.map((a) => a.bib)).toEqual([100, 101]);
    }
  });

  it('seeds fictional riders with ready and blocked cases', async () => {
    const { seeded, first } = await setup();
    expect(seeded.statusCode).toBe(201);
    expect(first.riders.some((r) => r.result.ready)).toBe(true);
    expect(first.riders.some((r) => !r.result.ready)).toBe(true);
  });

  it('needs a bib range before issuing bibs', async () => {
    const { rider, checkIn } = await setup();
    const res = await checkIn(rider('Alex').orderId);
    expect(res.statusCode).toBe(409);
  });

  it('issues the next free bib, and a repeat check-in keeps the same bib and time', async () => {
    const { rider, checkIn, setBibs } = await setup();
    await setBibs({ scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 199 }] });
    const a = (await checkIn(rider('Alex').orderId)).json() as Card;
    expect(a.bib).toBe(100);
    const again = (await checkIn(rider('Alex').orderId)).json() as Card;
    expect(again.bib).toBe(100);
    expect(again.checkedInAt).toBe(a.checkedInAt);
    expect(((await checkIn(rider('Blake').orderId)).json() as Card).bib).toBe(101);
  });

  it('refuses a blocked rider and a bib that is taken or out of range', async () => {
    const { rider, checkIn, setBibs } = await setup();
    await setBibs({ scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 199 }] });
    expect((await checkIn(rider('Dana').orderId)).statusCode).toBe(409);
    await checkIn(rider('Alex').orderId, 150);
    expect((await checkIn(rider('Blake').orderId, 150)).statusCode).toBe(409);
    expect((await checkIn(rider('Blake').orderId, 500)).statusCode).toBe(422);
  });

  it('keeps bib history when a bib changes', async () => {
    const { app, eventId, first, rider, checkIn, setBibs } = await setup();
    await setBibs({ scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 199 }] });
    const alex = rider('Alex').orderId;
    await checkIn(alex);
    const input = { dayId: first.dayId, bib: 120, reason: 'Bib torn', acknowledgeCheckedIn: true };
    const preview = (await app.inject({ method: 'POST', url: `/api/events/${eventId}/check-in/${alex}/bib/preview`, payload: input })).json() as { fingerprint: string };
    const res = await app.inject({ method: 'POST', url: `/api/events/${eventId}/check-in/${alex}/bib`, payload: { ...input, fingerprint: preview.fingerprint } });
    const card = res.json() as Card;
    expect(card.bib).toBe(120);
    expect(card.bibHistory.map((h) => [h.bib, h.reason])).toEqual([
      [100, 'Bib torn'],
      [120, null],
    ]);
  });

  it('gives a separate bib per day when bibs are per day', async () => {
    const { first, rider, checkIn, setBibs } = await setup();
    const [sat, sun] = first.days.map((d) => d.id);
    await setBibs({ scope: 'day', ranges: [{ scope: sat, first: 100, last: 199 }, { scope: sun, first: 200, last: 299 }] });
    const alex = rider('Alex').orderId;
    expect(((await checkIn(alex, null, sat)).json() as Card).bib).toBe(100);
    expect(((await checkIn(alex, null, sun)).json() as Card).bib).toBe(200);
  });

  it('finds a rider by check-in code with or without the dash, and shares no contact or payment details', async () => {
    const { list, rider } = await setup();
    const code = rider('Harper').checkInCode!;
    expect((await list(code)).riders.map((r) => r.name)).toEqual(['Harper Demo']);
    expect((await list(code.replace('-', '').toLowerCase())).riders.map((r) => r.name)).toEqual(['Harper Demo']);
    const raw = JSON.stringify(await list());
    expect(raw).not.toMatch(/@example\.com|totalCents|emergencyContact|licenseNumber/);
  });
  it('undoes a check-in with a reason: check-in removed, bib released, record kept, rider can check in again', async () => {
    const { app, eventId, first, rider, checkIn, setBibs } = await setup();
    await setBibs({ scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 199 }] });
    const alex = rider('Alex').orderId;
    const undo = (orderId: string, reason: string, dayId = first.dayId) => app.inject({ method: 'POST', url: `/api/events/${eventId}/check-in/${orderId}/undo`, payload: { dayId, reason } });

    expect((await undo(alex, 'Not checked in yet')).statusCode).toBe(409);
    await checkIn(alex);
    expect((await undo(alex, '')).statusCode).toBe(400);

    const res = await undo(alex, 'Checked in the wrong rider');
    expect(res.statusCode).toBe(200);
    const card = res.json() as Card;
    expect(card.checkedInAt).toBeNull();
    expect(card.bib).toBeNull();
    expect(card.undoneCheckIns).toEqual([expect.objectContaining({ bib: 100, bibReleased: true, reason: 'Checked in the wrong rider' })]);
    expect(card.bibHistory[0].reason).toBe('Check-in undone: Checked in the wrong rider');

    const again = (await checkIn(alex)).json() as Card;
    expect(again.checkedInAt).not.toBeNull();
    expect(again.bib).toBe(100); // released, so it is the next free bib again
  });

  it('keeps a weekend bib while the rider is still checked in on the other day', async () => {
    const { app, eventId, first, list, checkIn, setBibs } = await setup();
    await setBibs({ scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 199 }] });
    const [sat, sun] = first.days.map((d) => d.id);
    const sunList = await list('', sun);
    const both = first.riders.find((r) => r.result.ready && sunList.riders.some((x) => x.orderId === r.orderId && x.result.ready))!;
    expect(both).toBeTruthy();
    const undo = (dayId: string) => app.inject({ method: 'POST', url: `/api/events/${eventId}/check-in/${both.orderId}/undo`, payload: { dayId, reason: 'Testing undo' } });

    const satCard = (await checkIn(both.orderId, null, sat)).json() as Card;
    await checkIn(both.orderId, null, sun);
    const afterSat = (await undo(sat)).json() as Card;
    expect(afterSat.checkedInAt).toBeNull();
    expect(afterSat.bib).toBe(satCard.bib); // still covers Sunday
    expect(afterSat.undoneCheckIns[0]).toMatchObject({ bibReleased: false });

    const afterSun = (await undo(sun)).json() as Card;
    expect(afterSun.bib).toBeNull();
    expect(afterSun.undoneCheckIns[0]).toMatchObject({ bibReleased: true });
  });
  it('records a measured check-in time once and summarizes the day', async () => {
    const { app, eventId, first, rider, checkIn, setBibs } = await setup();
    await setBibs({ scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 199 }] });
    const timed = (orderId: string, durationMs: number | null) => app.inject({ method: 'POST', url: `/api/events/${eventId}/check-in/${orderId}`, payload: { dayId: first.dayId, bib: null, durationMs } });
    await timed(rider('Alex').orderId, 12_000);
    await timed(rider('Alex').orderId, 99_000); // repeat check-in: first measurement kept
    await timed(rider('Blake').orderId, 30_000);
    await timed(rider('Emery').orderId, 20 * 60_000); // interrupted, left out
    await checkIn(rider('Harper').orderId); // no measurement sent
    const summary = (await app.inject({ method: 'GET', url: `/api/events/${eventId}/check-in?q=` })).json() as { summary: { checkedIn: number; timing: { timed: number; medianSeconds: number | null; p95Seconds: number | null } } };
    expect(summary.summary.checkedIn).toBe(4);
    expect(summary.summary.timing).toEqual({ timed: 2, medianSeconds: 21, p95Seconds: 30 });
  });
});
