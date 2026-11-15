import { afterEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../src/server/db';
import type { BibReassignment, BibReassignmentPlan, BibReassignmentResult, CheckInList } from '../src/shared/checkin';
import { as } from './support/auth';
import { testApp, testDatabaseUrl } from './support/db';

const connections: Db[] = [];
afterEach(async () => { await Promise.all(connections.splice(0).map((db) => db.close())); });

async function setup() {
  const databaseUrl = await testDatabaseUrl();
  const { app } = await testApp({ databaseUrl, now: () => new Date('2027-03-01T18:00:00Z') });
  const db = openDb(databaseUrl);
  connections.push(db);
  const { eventId, organizationId } = (await app.inject({ method: 'POST', url: '/api/demo' })).json() as { eventId: string; organizationId: string };
  await app.inject({ method: 'POST', url: `/api/events/${eventId}/publish`, payload: { acknowledgeWarnings: true } });
  await app.inject({ method: 'POST', url: `/api/events/${eventId}/check-in-demo-riders` });
  await app.inject({ method: 'PUT', url: `/api/events/${eventId}/bib-settings`, payload: { scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 199 }] } });
  const list = async (day?: string): Promise<CheckInList> => (await app.inject({ method: 'GET', url: `/api/events/${eventId}/check-in${day ? `?day=${day}` : ''}` })).json();
  const before = await list();
  const alex = before.riders.find((r) => r.name.startsWith('Alex'))!.orderId;
  const blake = before.riders.find((r) => r.name.startsWith('Blake'))!.orderId;
  const dana = before.riders.find((r) => r.name.startsWith('Dana'))!.orderId;
  const batch = { dayId: before.dayId, orderIds: [alex, blake, dana] };
  const allocation = (await app.inject({ method: 'POST', url: `/api/events/${eventId}/bibs/preview`, payload: batch })).json() as { fingerprint: string };
  expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/bibs/apply`, payload: { ...batch, fingerprint: allocation.fingerprint } })).statusCode).toBe(200);
  const checkIn = (orderId: string, dayId = before.dayId) => app.inject({ method: 'POST', url: `/api/events/${eventId}/check-in/${orderId}`, payload: { dayId, bib: null } });
  expect((await checkIn(alex)).statusCode).toBe(200);
  const preview = (input: BibReassignment, headers = {}) => app.inject({ method: 'POST', url: `/api/events/${eventId}/bibs/reassign/preview`, headers, payload: input });
  const apply = (input: BibReassignment, fingerprint: string, headers = {}) => app.inject({ method: 'POST', url: `/api/events/${eventId}/bibs/reassign/apply`, headers, payload: { batch: input, fingerprint } });
  const swap: BibReassignment = { mode: 'manual', acknowledgeCheckedIn: true, dayId: before.dayId, reason: 'Swap two demo numbers', assignments: [{ orderId: alex, bib: 101 }, { orderId: blake, bib: 100 }] };
  return { app, db, eventId, organizationId, before, list, alex, blake, dana, checkIn, preview, apply, swap };
}

describe('protected bib reassignment', () => {
  it('previews and atomically swaps checked-in and preassigned riders, audits the actor, and revises locked lists across the weekend', async () => {
    const { app, db, eventId, before, list, alex, blake, dana, preview, apply, swap } = await setup();
    const races = (await app.inject({ method: 'GET', url: `/api/events/${eventId}/start-lists` })).json() as { races: { raceId: string }[] };
    for (const race of races.races) expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/start-lists/${race.raceId}/lock` })).statusCode).toBe(201);
    const original = await list();
    const planResponse = await preview(swap);
    expect(planResponse.statusCode).toBe(200);
    const plan = planResponse.json() as BibReassignmentPlan;
    expect(plan).toMatchObject({ scope: 'weekend', reason: swap.reason });
    expect((await list(before.days[1].id)).riders.find((r) => r.orderId === alex)?.checkedInScope).toBe(true);
    expect(plan.assignments).toEqual(expect.arrayContaining([expect.objectContaining({ orderId: alex, currentBib: 100, bib: 101, checkedInDays: [before.days[0].label] }), expect.objectContaining({ orderId: blake, currentBib: 101, bib: 100, checkedInDays: [] })]));
    expect((await list()).riders.map((r) => [r.orderId, r.bib])).toEqual(original.riders.map((r) => [r.orderId, r.bib]));
    const result = await apply(swap, plan.fingerprint);
    expect(result.statusCode).toBe(200);
    const changed = result.json() as BibReassignmentResult;
    expect(changed).toMatchObject({ applied: 2, snapshots: expect.arrayContaining(races.races.map((r) => ({ raceId: r.raceId, version: 2 }))) });
    const after = await list();
    expect(after.riders.find((r) => r.orderId === alex)).toMatchObject({ bib: 101, checkedInAt: original.riders.find((r) => r.orderId === alex)!.checkedInAt });
    expect(after.riders.find((r) => r.orderId === blake)).toMatchObject({ bib: 100, checkedInAt: null });
    expect(after.riders.find((r) => r.orderId === dana)).toMatchObject({ bib: 102, result: { ready: false } });
    for (const day of after.days) {
      const riders = (await list(day.id)).riders;
      expect(riders.find((r) => r.orderId === alex)?.bib).toBe(101);
    }
    const audit = await db.get<{ reason: string; actor: string; assignments_json: { previousAssignmentId: string; assignmentId: string }[] }>(`SELECT r.reason, a.id AS actor, assignments_json FROM bib_reassignments r JOIN accounts a ON a.id = r.requested_by WHERE r.id = $1`, [changed.id!]);
    expect(audit).toMatchObject({ reason: swap.reason, actor: expect.any(String) });
    expect(audit!.assignments_json).toHaveLength(2);
    expect((await db.all(`SELECT id FROM bib_assignments WHERE reassignment_id = $1`, [changed.id!]))).toHaveLength(2);
    expect((await db.all(`SELECT id FROM start_list_snapshots WHERE reassignment_id = $1`, [changed.id!]))).toHaveLength(changed.snapshots.length);
    const lists = (await app.inject({ method: 'GET', url: `/api/events/${eventId}/start-lists` })).json() as { races: { lock: { snapshotVersion: number }; snapshots: { version: number }[]; changesSinceLock: { changed: { fields: string[] }[] } }[] };
    for (const race of lists.races) {
      expect(race.lock.snapshotVersion).toBe(1);
      expect(race.snapshots[0].version).toBe(2);
      expect(race.changesSinceLock.changed.some((c) => c.fields.includes('bib'))).toBe(true);
    }
    expect((await apply(swap, plan.fingerprint)).statusCode).toBe(409);
  });

  it('resequences explicitly selected existing numbers, leaves outside riders untouched, and treats an already-correct sequence as a no-op', async () => {
    const { db, alex, blake, dana, list, preview, apply, swap } = await setup();
    const first = (await preview(swap)).json() as BibReassignmentPlan;
    expect((await apply(swap, first.fingerprint)).statusCode).toBe(200);
    const sequence: BibReassignment = { mode: 'sequence', acknowledgeCheckedIn: true, dayId: swap.dayId, reason: 'Put selected demo riders in name order', orderIds: [blake, alex], sort: 'name' };
    const plan = (await preview(sequence)).json() as BibReassignmentPlan;
    expect(plan.assignments.map((r) => [r.orderId, r.bib])).toEqual([[alex, 100], [blake, 101]]);
    expect((await apply(sequence, plan.fingerprint)).statusCode).toBe(200);
    expect((await list()).riders.find((r) => r.orderId === dana)?.bib).toBe(102);
    const noOp = (await preview(sequence)).json() as BibReassignmentPlan;
    const auditCount = (await db.all(`SELECT id FROM bib_reassignments`)).length;
    expect((await apply(sequence, noOp.fingerprint)).json()).toMatchObject({ id: null, applied: 0, snapshots: [] });
    expect(await db.all(`SELECT id FROM bib_reassignments`)).toHaveLength(auditCount);
    // Numbers match the original state again, but original assignment IDs were released.
    expect((await apply(swap, first.fingerprint)).statusCode).toBe(409);
  });

  it('refuses conflicts, duplicate riders/numbers, out-of-range values, missing reasons and unpreviewed corrections', async () => {
    const { app, eventId, alex, blake, dana, list, preview, swap } = await setup();
    const before = await list();
    expect((await preview({ ...swap, mode: 'manual', assignments: [{ orderId: alex, bib: 102 }] })).statusCode).toBe(409);
    expect((await preview({ ...swap, mode: 'manual', assignments: [{ orderId: alex, bib: 130 }, { orderId: blake, bib: 130 }] })).statusCode).toBe(409);
    expect((await preview({ ...swap, mode: 'manual', assignments: [{ orderId: alex, bib: 130 }, { orderId: alex, bib: 140 }] })).statusCode).toBe(422);
    expect((await preview({ ...swap, mode: 'manual', assignments: [{ orderId: dana, bib: 300 }] })).statusCode).toBe(422);
    expect((await preview({ ...swap, reason: '' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/check-in/${alex}/bib`, payload: { dayId: swap.dayId, bib: 130, reason: 'Missing preview' } })).statusCode).toBe(400);
    expect((await list()).riders.map((r) => [r.orderId, r.bib, r.checkedInAt])).toEqual(before.riders.map((r) => [r.orderId, r.bib, r.checkedInAt]));
  });

  it('requires a fresh preview after check-in, reason, or scope settings change', async () => {
    const { app, eventId, blake, checkIn, preview, apply, swap } = await setup();
    const plan = (await preview(swap)).json() as BibReassignmentPlan;
    expect((await apply({ ...swap, reason: 'A different decision' }, plan.fingerprint)).statusCode).toBe(409);
    await checkIn(blake);
    expect((await apply(swap, plan.fingerprint)).statusCode).toBe(409);
    const fresh = (await preview(swap)).json() as BibReassignmentPlan;
    await app.inject({ method: 'PUT', url: `/api/events/${eventId}/bib-settings`, payload: { scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 299 }] } });
    expect((await apply(swap, fresh.fingerprint)).statusCode).toBe(409);
  });

  it('requires checked-in acknowledgement and keeps unrelated check-ins from invalidating approval', async () => {
    const { app, eventId, before, blake, checkIn, preview, apply, swap } = await setup();
    expect((await preview({ ...swap, acknowledgeCheckedIn: false })).statusCode).toBe(409);
    const input: BibReassignment = { ...swap, mode: 'manual', assignments: [{ orderId: blake, bib: 130 }], acknowledgeCheckedIn: false };
    const plan = (await preview(input)).json() as BibReassignmentPlan;
    const casey = before.riders.find((r) => r.name.startsWith('Casey'))!.orderId;
    const allocation = { dayId: before.dayId, orderIds: [casey] };
    const free = (await app.inject({ method: 'POST', url: `/api/events/${eventId}/bibs/preview`, payload: allocation })).json();
    await app.inject({ method: 'POST', url: `/api/events/${eventId}/bibs/apply`, payload: { ...allocation, fingerprint: free.fingerprint } });
    // Take a fresh preview after allocation; the unrelated check-in itself must not stale it.
    const fresh = (await preview(input)).json() as BibReassignmentPlan;
    expect(fresh.fingerprint).not.toBe(plan.fingerprint);
    expect((await checkIn(casey)).statusCode).toBe(200);
    expect((await apply(input, fresh.fingerprint)).statusCode).toBe(200);
  });

  it('rolls back releases, new numbers, audits and revisions when snapshot storage fails', async () => {
    const { db, preview, apply, swap, list } = await setup();
    const before = await list();
    const plan = (await preview(swap)).json() as BibReassignmentPlan;
    await db.run(`CREATE FUNCTION reject_bib_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.reassignment_id IS NOT NULL THEN RAISE EXCEPTION 'Test snapshot storage failure'; END IF; RETURN NEW; END $$`);
    await db.run(`CREATE TRIGGER reject_bib_snapshot BEFORE INSERT ON start_list_snapshots FOR EACH ROW EXECUTE FUNCTION reject_bib_snapshot()`);
    expect((await apply(swap, plan.fingerprint)).statusCode).toBe(500);
    expect((await list()).riders.map((r) => [r.orderId, r.bib, r.bibHistory])).toEqual(before.riders.map((r) => [r.orderId, r.bib, r.bibHistory]));
    expect(await db.all(`SELECT id FROM bib_reassignments`)).toHaveLength(0);
    expect(await db.all(`SELECT id FROM start_list_snapshots WHERE reassignment_id IS NOT NULL`)).toHaveLength(0);
    await db.run(`DROP TRIGGER reject_bib_snapshot ON start_list_snapshots`);
    expect((await apply(swap, (await preview(swap)).json().fingerprint)).statusCode).toBe(200);
  });

  it('serializes competing approvals so one batch applies and the other becomes stale', async () => {
    const { preview, apply, swap, db } = await setup();
    const plan = (await preview(swap)).json() as BibReassignmentPlan;
    const responses = await Promise.all([apply(swap, plan.fingerprint), apply(swap, plan.fingerprint)]);
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(await db.all(`SELECT id FROM bib_reassignments`)).toHaveLength(1);
  });

  it('keeps bulk changes manager-only, permits previewed individual staff corrections, and hides other organizations', async () => {
    const { app, eventId, organizationId, alex, preview, apply, swap } = await setup();
    const email = 'bib-volunteer@example.test';
    await app.inject({ method: 'POST', url: `/api/organizations/${organizationId}/members`, payload: { email, role: 'check_in_volunteer' } });
    const plan = (await preview(swap)).json() as BibReassignmentPlan;
    expect((await preview(swap, as(email))).statusCode).toBe(403);
    expect((await apply(swap, plan.fingerprint, as(email))).statusCode).toBe(403);
    const input = { dayId: swap.dayId, bib: 130, reason: 'Staff corrects a damaged demo bib', acknowledgeCheckedIn: true };
    const single = await app.inject({ method: 'POST', url: `/api/events/${eventId}/check-in/${alex}/bib/preview`, headers: as(email), payload: input });
    expect(single.statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/check-in/${alex}/bib`, headers: as(email), payload: { ...input, fingerprint: single.json().fingerprint } })).statusCode).toBe(200);
    expect((await preview(swap, as('other-club@example.test'))).statusCode).toBe(404);
  });

  it('limits a day-scoped correction to that day and leaves the other day’s number intact', async () => {
    const { app, eventId, before, alex, checkIn, preview, apply, list } = await setup();
    const [sat, sun] = before.days.map((d) => d.id);
    await app.inject({ method: 'PUT', url: `/api/events/${eventId}/bib-settings`, payload: { scope: 'day', ranges: [{ scope: sat, first: 100, last: 199 }, { scope: sun, first: 200, last: 299 }] } });
    expect((await checkIn(alex, sat)).statusCode).toBe(200);
    expect((await checkIn(alex, sun)).statusCode).toBe(200);
    const input: BibReassignment = { mode: 'manual', acknowledgeCheckedIn: true, dayId: sat, reason: 'Correct the Saturday demo bib', assignments: [{ orderId: alex, bib: 150 }] };
    const plan = (await preview(input)).json() as BibReassignmentPlan;
    expect(plan.races).toHaveLength(1);
    expect(plan.scope).toBe(sat);
    expect((await apply(input, plan.fingerprint)).statusCode).toBe(200);
    expect((await list(sat)).riders.find((r) => r.orderId === alex)?.bib).toBe(150);
    expect((await list(sun)).riders.find((r) => r.orderId === alex)?.bib).toBe(200);
  });
});
