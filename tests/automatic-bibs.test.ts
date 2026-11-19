import pg from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { testApp, testDatabaseUrl } from './support/db';
import { as } from './support/auth';
import { eventLock } from '../src/server/repo';
import type { EventConfig } from '../src/shared/schema';
import type { AutomaticBibJob, CheckInList } from '../src/shared/checkin';

async function setup() {
  let now = new Date('2027-03-01T18:00:00Z'); // 10:00 in the event's Los Angeles time zone.
  const databaseUrl = await testDatabaseUrl();
  const built = await testApp({ databaseUrl, now: () => now });
  const { app, automaticBibs } = built;
  const { eventId, organizationId } = (await app.inject({ method: 'POST', url: '/api/demo' })).json() as { eventId: string; organizationId: string };
  const event = (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json() as { config: EventConfig; revision: number };
  event.config.registration.demoIgnoreWindows = false;
  for (const category of event.config.categories) category.registration.closesAt = '2027-03-01T10:05';
  expect((await app.inject({ method: 'PUT', url: `/api/events/${eventId}/config`, payload: { config: event.config, revision: event.revision } })).statusCode).toBe(200);
  expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/publish`, payload: { acknowledgeWarnings: true } })).statusCode).toBe(200);
  expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/check-in-demo-riders` })).statusCode).toBe(201);
  const setBibs = (first: number, last: number) => app.inject({ method: 'PUT', url: `/api/events/${eventId}/bib-settings`, payload: { scope: 'weekend', ranges: [{ scope: 'weekend', first, last }] } });
  await setBibs(100, 199);
  const list = async (day?: string): Promise<CheckInList> => (await app.inject({ method: 'GET', url: `/api/events/${eventId}/check-in${day ? `?day=${day}` : ''}` })).json();
  const enable = () => app.inject({ method: 'POST', url: `/api/events/${eventId}/automatic-bibs`, payload: { sort: 'name' } });
  const jobs = async (): Promise<AutomaticBibJob[]> => (await app.inject({ method: 'GET', url: `/api/events/${eventId}/automatic-bibs` })).json();
  return { ...built, databaseUrl, eventId, organizationId, config: event.config, setBibs, list, enable, jobs, advance: (at: string) => { now = new Date(at); }, run: () => automaticBibs.runDue() };
}

describe('post-close automatic bib allocation', () => {
  it.each([false, true])('uses all weekend ranges and rolls back a disjoint allocation (disjoint=%s)', async (disjoint) => {
    const { app, eventId, config, advance, enable, jobs, run, list } = await setup();
    for (const c of config.categories) c.bibRange = config.races.find((r) => r.id === c.raceId)!.dayId === config.days[0].id ? { first: 100, last: 180 } : { first: disjoint ? 181 : 150, last: 199 };
    const current = (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json() as { revision: number };
    expect((await app.inject({ method: 'PUT', url: `/api/events/${eventId}/config`, payload: { config, revision: current.revision } })).statusCode).toBe(200);
    await app.inject({ method: 'POST', url: `/api/events/${eventId}/publish`, payload: { acknowledgeWarnings: true } });
    await enable();
    advance('2027-03-01T18:11:00Z');
    await run();
    const riders = (await list()).riders;
    if (disjoint) {
      expect(riders.every((r) => r.bib === null)).toBe(true);
      expect((await jobs())[0]).toMatchObject({ completedAt: null, message: expect.stringContaining('do not overlap') });
    } else {
      expect((await jobs())[0].completedAt).not.toBeNull();
      for (const r of riders.filter((r) => r.payment === 'confirmed')) {
        expect(r.bib).toBeGreaterThanOrEqual(150);
        expect(r.bib).toBeLessThanOrEqual(180);
      }
    }
  });

  it('waits for close in the event time zone and active holds, preserves issued bibs, and runs once', async () => {
    const { app, eventId, advance, enable, jobs, run, list } = await setup();
    const before = await list();
    const alex = before.riders.find((r) => r.name.startsWith('Alex'))!;
    expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/check-in/${alex.orderId}`, payload: { dayId: before.dayId, bib: 150 } })).statusCode).toBe(200);
    expect((await enable()).statusCode).toBe(200);
    await run();
    expect((await jobs())[0]).toMatchObject({ completedAt: null, message: expect.stringContaining('every published category') });
    advance('2027-03-01T18:05:00Z');
    await run();
    expect((await jobs())[0]).toMatchObject({ completedAt: null, message: expect.stringContaining('checkout holds') });
    advance('2027-03-01T18:11:00Z');
    await Promise.all([run(), run()]);
    expect((await jobs())[0]).toMatchObject({ completedAt: '2027-03-01T18:11:00.000Z', message: null, assigned: expect.any(Number) });
    const after = await list();
    expect(after.riders.find((r) => r.orderId === alex.orderId)).toMatchObject({ bib: 150, checkedInAt: expect.any(String) });
    for (const r of after.riders) {
      if (r.payment === 'confirmed') expect(r.bib).not.toBeNull();
      else expect(r.bib).toBeNull();
      expect(r.result.ready).toBe(before.riders.find((original) => original.orderId === r.orderId)!.result.ready);
    }
    const allocated = after.riders.filter((r) => r.bib !== null);
    expect(new Set(allocated.map((r) => r.bib)).size).toBe(allocated.length);
    await run();
    expect((await list()).riders.map((r) => [r.orderId, r.bib, r.bibHistory])).toEqual(after.riders.map((r) => [r.orderId, r.bib, r.bibHistory]));
    expect((await app.inject({ method: 'DELETE', url: `/api/events/${eventId}/automatic-bibs` })).json()).toEqual({ cancelled: false });
    const sunday = await list(after.days[1].id);
    for (const r of sunday.riders) {
      const saturday = after.riders.find((s) => s.orderId === r.orderId);
      if (saturday?.bib !== null && saturday) expect(r.bib).toBe(saturday.bib);
    }
  });

  it('serializes a pending automatic job, desk check-in and bulk apply under the same event lock', async () => {
    const s = await setup();
    const before = await s.list();
    const alex = before.riders.find((rider) => rider.name.startsWith('Alex'))!;
    const blake = before.riders.find((rider) => rider.name.startsWith('Blake'))!;
    const batch = { dayId: before.dayId, orderIds: [alex.orderId, blake.orderId] };
    expect((await s.enable()).statusCode).toBe(200);
    s.advance('2027-03-01T18:11:00Z');
    const preview = await s.app.inject({ method: 'POST', url: `/api/events/${s.eventId}/bibs/preview`, payload: batch });
    expect(preview.statusCode, preview.body).toBe(200);
    const plan = preview.json() as { fingerprint: string; assignments: { orderId: string; bib: number }[] };

    const blocker = new pg.Client({ connectionString: s.databaseUrl });
    await blocker.connect();
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT pg_advisory_xact_lock(hashtext($1))', [eventLock(s.eventId)]);
      const operations = Promise.all([
        s.run(),
        s.app.inject({ method: 'POST', url: `/api/events/${s.eventId}/check-in/${alex.orderId}`, payload: { dayId: before.dayId, bib: 150 } }),
        s.app.inject({ method: 'POST', url: `/api/events/${s.eventId}/bibs/apply`, payload: { ...batch, fingerprint: plan.fingerprint } }),
      ]);
      try {
        await vi.waitFor(async () => {
          const { rows } = await blocker.query(`SELECT count(*)::int AS n FROM pg_locks
            WHERE locktype = 'advisory' AND NOT granted
              AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`);
          expect(rows[0].n).toBe(3);
        }, { timeout: 3000 });
      } finally {
        await blocker.query('ROLLBACK');
        await operations;
      }

      const [, desk, bulk] = await operations;
      expect(desk.statusCode, desk.body).toBe(200);
      expect([200, 409]).toContain(bulk.statusCode);
      const [job] = await s.jobs();
      expect(job.completedAt).not.toBeNull();
      const { rows } = await blocker.query(`SELECT order_id, bib, automatic_job_id, released_at FROM bib_assignments WHERE event_id = $1`, [s.eventId]);
      expect(new Set(rows.map((row) => row.order_id)).size).toBe(rows.length);
      expect(new Set(rows.map((row) => row.bib)).size).toBe(rows.length);
      expect(rows.every((row) => row.released_at === null)).toBe(true);
      const assigned = new Map(rows.map((row) => [row.order_id, row]));
      expect(assigned.get(alex.orderId)?.bib).toBe(desk.json().bib);
      if (bulk.statusCode === 200) {
        for (const pick of plan.assignments) expect(assigned.get(pick.orderId)).toMatchObject({ bib: pick.bib, automatic_job_id: null });
      } else {
        expect(assigned.get(blake.orderId)?.automatic_job_id).toBe(job.id);
        expect(assigned.get(alex.orderId)?.automatic_job_id ?? null).toBe(desk.json().bib === 150 ? null : job.id);
      }
      expect((await s.list()).riders.find((rider) => rider.orderId === alex.orderId)).toMatchObject({ bib: desk.json().bib, checkedInAt: desk.json().checkedInAt });
      expect((await blocker.query('SELECT count(*)::int AS n FROM check_ins WHERE event_id = $1', [s.eventId])).rows[0].n).toBe(1);
    } finally {
      await blocker.end();
    }
  });

  it('catches up a pending post-close job when the HTTP server starts', async () => {
    const { app, advance, enable, jobs } = await setup();
    await enable();
    advance('2027-03-01T18:11:00Z');
    await app.listen({ port: 0, host: '127.0.0.1' });
    await vi.waitFor(async () => {
      expect((await jobs())[0].completedAt).not.toBeNull();
    });
    await app.close();
  });

  it('waits for missing close times and does not bypass demo registration windows', async () => {
    const { app, eventId, advance, enable, jobs, run } = await setup();
    await enable();
    advance('2027-03-01T18:11:00Z');
    const event = (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json() as { config: EventConfig; revision: number };
    event.config.categories[0].registration.closesAt = null;
    expect((await app.inject({ method: 'PUT', url: `/api/events/${eventId}/config`, payload: { revision: event.revision, config: event.config } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/publish`, payload: { acknowledgeWarnings: true } })).statusCode).toBe(200);
    await run();
    expect((await jobs())[0].message).toContain('Missing closing times');
    const next = (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json() as { config: EventConfig; revision: number };
    next.config.categories[0].registration.closesAt = '2027-03-01T10:05';
    next.config.registration.demoIgnoreWindows = true;
    expect((await app.inject({ method: 'PUT', url: `/api/events/${eventId}/config`, payload: { revision: next.revision, config: next.config } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/publish`, payload: { acknowledgeWarnings: true } })).statusCode).toBe(200);
    await run();
    expect((await jobs())[0].message).toContain('demo registration-window bypass');
    expect((await jobs())[0].completedAt).toBeNull();
  });

  it('keeps a linked rider’s canonical identity through allocation and desk actions after anchor expiry', async () => {
    const { app, eventId, advance, enable, jobs, run, list } = await setup();
    const before = await list();
    const root = before.riders.find((r) => r.name.startsWith('Frankie'))!;
    const alex = before.riders.find((r) => r.name.startsWith('Alex'))!;
    expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/rider-identity/link`, payload: { orderIds: [root.orderId, alex.orderId] } })).statusCode).toBe(200);
    await enable();
    advance('2027-03-01T18:11:00Z');
    await run();
    expect((await jobs())[0].completedAt).not.toBeNull();
    const after = await list();
    expect(after.riders.find((r) => r.orderId === root.orderId)).toMatchObject({ name: alex.name, bib: expect.any(Number) });
    expect(after.riders.some((r) => r.orderId === alex.orderId)).toBe(false);
    const allocated = after.riders.find((r) => r.orderId === root.orderId)!;
    const checked = await app.inject({ method: 'POST', url: `/api/events/${eventId}/check-in/${alex.orderId}`, payload: { dayId: after.dayId, bib: null } });
    expect(checked.statusCode).toBe(200);
    expect(checked.json()).toMatchObject({ orderId: root.orderId, bib: allocated.bib, checkedInAt: expect.any(String) });
    const repeated = await app.inject({ method: 'POST', url: `/api/events/${eventId}/check-in/${root.orderId}`, payload: { dayId: after.dayId, bib: null } });
    expect(repeated.statusCode).toBe(200);
    expect(repeated.json()).toMatchObject({ bib: allocated.bib, checkedInAt: checked.json().checkedInAt });
    const change = { dayId: after.dayId, bib: 199, reason: 'Correct the demo handoff number', acknowledgeCheckedIn: true };
    const preview = (await app.inject({ method: 'POST', url: `/api/events/${eventId}/check-in/${alex.orderId}/bib/preview`, payload: change })).json() as { fingerprint: string };
    const changed = await app.inject({ method: 'POST', url: `/api/events/${eventId}/check-in/${alex.orderId}/bib`, payload: { ...change, fingerprint: preview.fingerprint } });
    expect(changed.statusCode).toBe(200);
    expect(changed.json()).toMatchObject({ orderId: root.orderId, bib: 199 });
    const undone = await app.inject({ method: 'POST', url: `/api/events/${eventId}/check-in/${root.orderId}/undo`, payload: { dayId: after.dayId, reason: 'Undo the demo check-in' } });
    expect(undone.statusCode).toBe(200);
    expect(undone.json()).toMatchObject({ orderId: root.orderId, bib: null, checkedInAt: null });
  });

  it('rolls back every day on exhaustion and retries after ranges are corrected', async () => {
    const { app, eventId, advance, enable, run, jobs, list } = await setup();
    const days = (await list()).days;
    await app.inject({ method: 'PUT', url: `/api/events/${eventId}/bib-settings`, payload: { scope: 'day', ranges: [{ scope: days[0].id, first: 100, last: 199 }, { scope: days[1].id, first: 200, last: 200 }] } });
    await enable();
    advance('2027-03-01T18:11:00Z');
    await run();
    expect((await jobs())[0]).toMatchObject({ completedAt: null, message: expect.stringContaining('Not enough free bibs') });
    for (const day of days) expect((await list(day.id)).riders.every((r) => r.bib === null)).toBe(true);
    await app.inject({ method: 'PUT', url: `/api/events/${eventId}/bib-settings`, payload: { scope: 'day', ranges: [{ scope: days[0].id, first: 100, last: 199 }, { scope: days[1].id, first: 200, last: 299 }] } });
    await run();
    expect((await jobs())[0].completedAt).not.toBeNull();
  });

  it('keeps enable/cancel history and does not allocate a cancelled job', async () => {
    const { app, eventId, advance, enable, jobs, run, list } = await setup();
    await enable();
    await enable();
    expect((await jobs()).filter((j) => j.cancelledAt !== null)).toHaveLength(1);
    const cancelled = await app.inject({ method: 'DELETE', url: `/api/events/${eventId}/automatic-bibs` });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json()).toEqual({ cancelled: true });
    expect((await app.inject({ method: 'DELETE', url: `/api/events/${eventId}/automatic-bibs` })).json()).toEqual({ cancelled: false });
    advance('2027-03-01T18:11:00Z');
    await run();
    expect((await jobs()).every((j) => j.cancelledBy === j.configuredBy && j.completedAt === null)).toBe(true);
    expect((await list()).riders.every((r) => r.bib === null)).toBe(true);
  });

  it('restricts configuration and history to managers and rechecks the enabling account', async () => {
    const { app, eventId, organizationId, advance, enable, jobs, run } = await setup();
    const email = 'volunteer@example.test';
    await app.inject({ method: 'POST', url: `/api/organizations/${organizationId}/members`, payload: { email, role: 'check_in_volunteer' } });
    for (const method of ['GET', 'POST', 'DELETE'] as const) {
      expect((await app.inject({ method, url: `/api/events/${eventId}/automatic-bibs`, headers: as(email), ...(method === 'POST' ? { payload: { sort: 'name' } } : {}) })).statusCode).toBe(403);
    }
    const manager = 'bib-manager@example.test';
    await app.inject({ method: 'POST', url: `/api/organizations/${organizationId}/members`, payload: { email: manager, role: 'registration_manager' } });
    await app.inject({ method: 'POST', url: `/api/events/${eventId}/automatic-bibs`, headers: as(manager), payload: { sort: 'name' } });
    await app.inject({ method: 'POST', url: `/api/organizations/${organizationId}/members/remove`, payload: { email: manager, role: 'registration_manager' } });
    advance('2027-03-01T18:11:00Z');
    await run();
    expect((await jobs())[0]).toMatchObject({ completedAt: null, message: expect.stringContaining('no longer has bib-settings permission') });
    await enable();
    await run();
    expect((await jobs()).some((j) => j.completedAt !== null)).toBe(true);
  });
});
