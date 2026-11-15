import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/server/app';
import { csvField, diffRows, sortRows, toCsv, type StartListRow } from '../src/shared/startlist';

const row = (o: Partial<StartListRow>): StartListRow => ({
  entryId: 'e1',
  riderId: 'r1',
  raceId: 'race',
  raceName: 'Crit',
  raceDate: '2027-04-25',
  startGroup: 'Cat 4/5',
  startTime: '09:00',
  classificationCode: 'C45',
  categoryName: 'Cat 4/5',
  raceLength: '45 min + 3 laps',
  bib: null,
  firstName: 'Alex',
  lastName: 'Demo',
  team: '',
  licenseNumber: 'DEMO-1',
  racingAge: 30,
  competitionClass: 'men',
  licenseStatus: 'reviewed',
  checkedIn: false,
  ...o,
});

describe('start-list CSV and diff', () => {
  it('quotes commas and quotes, and neutralizes spreadsheet formulas', () => {
    expect(csvField('Velo, Inc. "Fast"')).toBe('"Velo, Inc. ""Fast"""');
    expect(csvField('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvField(true)).toBe('Y');
    expect(csvField(null)).toBe('');
  });

  it('keeps the configured length instead of inventing a distance', () => {
    const csv = toCsv([row({})]);
    expect(csv.split('\r\n')[1]).toContain('45 min + 3 laps');
  });

  it('sorts by start time, code, then bib with unassigned bibs last', () => {
    const sorted = sortRows([row({ entryId: 'a', startTime: '10:00' }), row({ entryId: 'b', bib: null }), row({ entryId: 'c', bib: 5 })]);
    expect(sorted.map((r) => r.entryId)).toEqual(['c', 'b', 'a']);
  });

  it('reports added, removed, and changed entries by stable entry ID', () => {
    const d = diffRows([row({ entryId: 'keep' }), row({ entryId: 'gone' })], [row({ entryId: 'keep', bib: 7 }), row({ entryId: 'new' })]);
    expect(d.added.map((r) => r.entryId)).toEqual(['new']);
    expect(d.removed.map((r) => r.entryId)).toEqual(['gone']);
    expect(d.changed.map((c) => [c.after.entryId, c.fields])).toEqual([['keep', ['bib']]]);
  });
});

type Overview = { races: { raceId: string; raceName: string; rows: StartListRow[]; snapshots: { version: number }[]; changesSinceLastSnapshot: { changed: unknown[] } | null; lock: { snapshotVersion: number; lockedAt: string } | null; changesSinceLock: { added: unknown[]; removed: unknown[]; changed: unknown[] } | null }[] };

async function setup() {
  const { app } = buildApp({ dbPath: ':memory:', now: () => new Date('2027-03-01T18:00:00Z') });
  const { eventId } = (await app.inject({ method: 'POST', url: '/api/demo' })).json() as { eventId: string };
  await app.inject({ method: 'POST', url: `/api/events/${eventId}/publish`, payload: { acknowledgeWarnings: true } });
  await app.inject({ method: 'POST', url: `/api/events/${eventId}/check-in-demo-riders` });
  await app.inject({ method: 'PUT', url: `/api/events/${eventId}/bib-settings`, payload: { scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 299 }] } });
  const overview = async () => (await app.inject({ method: 'GET', url: `/api/events/${eventId}/start-lists` })).json() as Overview;
  return { app, eventId, overview };
}

describe('start-list API', () => {
  it('lists only confirmed entries and leaves out unpaid holds and test entries', async () => {
    const { overview } = await setup();
    const o = await overview();
    // 8 demo riders, one unpaid; the demo event's simulated test entries are never exported.
    expect(o.races[0].rows).toHaveLength(7);
    expect(o.races[0].rows.every((r) => r.riderId.startsWith('ord_'))).toBe(true);
  });

  it('saves numbered snapshots and shows later bib changes against the latest', async () => {
    const { app, eventId, overview } = await setup();
    const raceId = (await overview()).races[0].raceId;
    const s1 = await app.inject({ method: 'POST', url: `/api/events/${eventId}/start-lists/${raceId}/snapshots` });
    expect(s1.json()).toMatchObject({ version: 1 });
    const list = (await app.inject({ method: 'GET', url: `/api/events/${eventId}/check-in?q=` })).json() as { dayId: string; riders: { orderId: string; result: { ready: boolean } }[] };
    const ready = list.riders.find((r) => r.result.ready)!;
    await app.inject({ method: 'POST', url: `/api/events/${eventId}/check-in/${ready.orderId}`, payload: { dayId: list.dayId, bib: null } });
    const race = (await overview()).races[0];
    expect(race.snapshots.map((s) => s.version)).toEqual([1]);
    expect(race.changesSinceLastSnapshot?.changed).toHaveLength(1);
    const s2 = await app.inject({ method: 'POST', url: `/api/events/${eventId}/start-lists/${raceId}/snapshots` });
    expect(s2.json()).toMatchObject({ version: 2 });
  });

  it('downloads a CSV with stable IDs and no contact or payment data', async () => {
    const { app, eventId, overview } = await setup();
    const raceId = (await overview()).races[0].raceId;
    const res = await app.inject({ method: 'GET', url: `/api/events/${eventId}/start-lists/${raceId}/csv` });
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('SAMPLE.csv');
    const [header, first] = res.body.split('\r\n');
    expect(header.split(',')).toContain('entry_id');
    expect(first).toMatch(/oe_/);
    expect(res.body).not.toMatch(/@example\.com|555-|Robin Demo/);
  });

  it('serves a saved snapshot unchanged and refuses an unknown one', async () => {
    const { app, eventId, overview } = await setup();
    const raceId = (await overview()).races[0].raceId;
    await app.inject({ method: 'POST', url: `/api/events/${eventId}/start-lists/${raceId}/snapshots` });
    expect((await app.inject({ method: 'GET', url: `/api/events/${eventId}/start-lists/${raceId}/csv?snapshot=1` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/api/events/${eventId}/start-lists/${raceId}/csv?snapshot=9` })).statusCode).toBe(404);
  });

  it('needs a published event', async () => {
    const { app } = buildApp({ dbPath: ':memory:' });
    const { eventId } = (await app.inject({ method: 'POST', url: '/api/demo' })).json() as { eventId: string };
    expect((await app.inject({ method: 'GET', url: `/api/events/${eventId}/start-lists` })).statusCode).toBe(409);
  });
  it('locks a start list at a snapshot, never blocks later changes, and shows them as revisions', async () => {
    const { app, eventId, overview } = await setup();
    const raceId = (await overview()).races[0].raceId;
    expect((await overview()).races[0].lock).toBeNull();

    const locked = await app.inject({ method: 'POST', url: `/api/events/${eventId}/start-lists/${raceId}/lock` });
    expect(locked.statusCode).toBe(201);
    expect(locked.json()).toMatchObject({ version: 1 });
    let race = (await overview()).races[0];
    expect(race.lock?.snapshotVersion).toBe(1);
    expect(race.changesSinceLock).toEqual({ added: [], removed: [], changed: [] });

    // A check-in after the lock still goes through and shows as a revision (bib assigned).
    const list = (await app.inject({ method: 'GET', url: `/api/events/${eventId}/check-in?q=` })).json() as { dayId: string; riders: { orderId: string; result: { ready: boolean } }[] };
    const ready = list.riders.find((r) => r.result.ready)!;
    expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/check-in/${ready.orderId}`, payload: { dayId: list.dayId, bib: null } })).statusCode).toBe(200);
    // A plain snapshot afterwards does not move the lock.
    await app.inject({ method: 'POST', url: `/api/events/${eventId}/start-lists/${raceId}/snapshots` });
    race = (await overview()).races[0];
    expect(race.lock?.snapshotVersion).toBe(1);
    expect(race.changesSinceLock?.changed).toHaveLength(1);

    // Locking again moves the lock to a new snapshot of the current list.
    const again = (await app.inject({ method: 'POST', url: `/api/events/${eventId}/start-lists/${raceId}/lock` })).json() as { version: number };
    expect(again.version).toBe(3);
    race = (await overview()).races[0];
    expect(race.lock?.snapshotVersion).toBe(3);
    expect(race.changesSinceLock).toEqual({ added: [], removed: [], changed: [] });
  });
});
