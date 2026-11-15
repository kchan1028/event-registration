import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/server/app';
import { checkInResult, mergeReadiness, nextFreeBib } from '../src/shared/checkin';
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

  it('finds the lowest free bib and reports a full range', () => {
    expect(nextFreeBib({ scope: 'weekend', first: 10, last: 12 }, new Set([10, 12]))).toBe(11);
    expect(nextFreeBib({ scope: 'weekend', first: 10, last: 11 }, new Set([10, 11]))).toBeNull();
  });
});

type Card = { orderId: string; name: string; checkInCode: string | null; bib: number | null; checkedInAt: string | null; result: { ready: boolean }; bibHistory: { bib: number; reason: string | null }[]; undoneCheckIns: { bib: number | null; bibReleased: boolean; reason: string }[] };
type List = { dayId: string; days: { id: string }[]; riders: Card[] };

async function setup() {
  const { app } = buildApp({ dbPath: ':memory:', now: () => new Date('2027-03-01T18:00:00Z') });
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
    const res = await app.inject({ method: 'POST', url: `/api/events/${eventId}/check-in/${alex}/bib`, payload: { dayId: first.dayId, bib: 120, reason: 'Bib torn' } });
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
});
