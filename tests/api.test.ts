import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/server/app';
import type { EventConfig } from '../src/shared/schema';

const dirs: string[] = [];
function tempDb(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cyclereg-test-'));
  dirs.push(dir);
  return join(dir, 'test.sqlite');
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

type Payload = { id: string; revision: number; config: EventConfig; entries: { categoryId: string }[]; issues: { level: string; key: string }[]; publishedVersion: number | null };

async function setupDemo(dbPath = ':memory:') {
  const { app } = buildApp({ dbPath });
  const res = await app.inject({ method: 'POST', url: '/api/demo' });
  const { eventId } = res.json() as { eventId: string };
  const event = (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json() as Payload;
  return { app, eventId, event };
}

describe('organizations and draft events', () => {
  it('creates an organization and a weekend draft, then reloads it from disk', async () => {
    const dbPath = tempDb();
    const { app } = buildApp({ dbPath });
    const org = (await app.inject({ method: 'POST', url: '/api/organizations', payload: { name: 'Valley Bicycle Club' } })).json() as { id: string };
    const created = await app.inject({
      method: 'POST',
      url: `/api/organizations/${org.id}/events`,
      payload: { name: 'Valley Weekend', template: 'weekend', startDate: '2027-04-24', timeZone: 'America/Los_Angeles' },
    });
    expect(created.statusCode).toBe(201);
    const ev = created.json() as Payload;
    expect(ev.config.races).toHaveLength(2);
    await app.close();

    const again = buildApp({ dbPath }).app;
    const loaded = (await again.inject({ method: 'GET', url: `/api/events/${ev.id}` })).json() as Payload;
    expect(loaded.config.event.name).toBe('Valley Weekend');
    const orgs = (await again.inject({ method: 'GET', url: '/api/organizations' })).json() as { name: string; events: unknown[] }[];
    expect(orgs[0].name).toBe('Valley Bicycle Club');
    expect(orgs[0].events).toHaveLength(1);
    await again.close();
  });

  it('rejects invalid input with a readable message', async () => {
    const { app } = buildApp({ dbPath: ':memory:' });
    const res = await app.inject({ method: 'POST', url: '/api/organizations', payload: { name: '   ' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBeTruthy();
    await app.close();
  });
});

describe('saving the draft', () => {
  it('saves with the current revision and rejects a stale one', async () => {
    const { app, eventId, event } = await setupDemo();
    const config = structuredClone(event.config);
    config.event.name = 'Renamed example';
    const ok = await app.inject({ method: 'PUT', url: `/api/events/${eventId}/config`, payload: { revision: event.revision, config } });
    expect(ok.statusCode).toBe(200);
    expect((ok.json() as Payload).revision).toBe(event.revision + 1);

    const stale = await app.inject({ method: 'PUT', url: `/api/events/${eventId}/config`, payload: { revision: event.revision, config } });
    expect(stale.statusCode).toBe(409);
    await app.close();
  });

  it('will not lower a cap below existing entries or delete a category that has entries', async () => {
    const { app, eventId, event } = await setupDemo();
    const lowered = structuredClone(event.config);
    lowered.categories.find((c) => c.timingCode === 'RR-M50')!.cap = 10; // 35 entries exist
    const r1 = await app.inject({ method: 'PUT', url: `/api/events/${eventId}/config`, payload: { revision: event.revision, config: lowered } });
    expect(r1.statusCode).toBe(409);
    expect(r1.json().error).toMatch(/below the 35 riders/);

    const removed = structuredClone(event.config);
    removed.categories = removed.categories.filter((c) => c.timingCode !== 'RR-M50');
    const r2 = await app.inject({ method: 'PUT', url: `/api/events/${eventId}/config`, payload: { revision: event.revision, config: removed } });
    expect(r2.statusCode).toBe(409);
    expect(r2.json().error).toMatch(/Archive it instead/);
    await app.close();
  });

  it('rejects a configuration that fails the schema', async () => {
    const { app, eventId, event } = await setupDemo();
    const bad = structuredClone(event.config) as unknown as { categories: { cap: unknown }[] };
    bad.categories[0].cap = -5;
    const res = await app.inject({ method: 'PUT', url: `/api/events/${eventId}/config`, payload: { revision: event.revision, config: bad } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('shared capacity through the API', () => {
  it('stops at the combined 60 even when one category still has room (40/40/60)', async () => {
    const { app, eventId, event } = await setupDemo();
    const m60 = event.config.categories.find((c) => c.timingCode === 'RR-M60')!;
    const res = await app.inject({ method: 'POST', url: `/api/events/${eventId}/test-entries`, payload: { categoryId: m60.id, count: 30 } });
    const { result } = res.json() as { result: { created: number; blockedBy: { kind: string } } };
    expect(result.created).toBe(25);
    expect(result.blockedBy.kind).toBe('pool');
    await app.close();
  });

  it('two buyers racing for the last shared place: exactly one succeeds, across two connections', async () => {
    const dbPath = tempDb();
    const { app: a, eventId, event } = await setupDemo(dbPath);
    const { app: b } = buildApp({ dbPath });
    const m60 = event.config.categories.find((c) => c.timingCode === 'RR-M60')!;
    await a.inject({ method: 'POST', url: `/api/events/${eventId}/test-entries`, payload: { categoryId: m60.id, count: 24 } }); // 59 of 60
    const race = await Promise.all([
      a.inject({ method: 'POST', url: `/api/events/${eventId}/test-entries`, payload: { categoryId: m60.id, count: 1 } }),
      b.inject({ method: 'POST', url: `/api/events/${eventId}/test-entries`, payload: { categoryId: m60.id, count: 1 } }),
    ]);
    const created = race.map((r) => (r.json() as { result: { created: number } }).result.created);
    expect(created.sort()).toEqual([0, 1]);
    const final = (await b.inject({ method: 'GET', url: `/api/events/${eventId}` })).json() as Payload;
    const pool = final.config.capacityPools[0];
    expect(final.entries.filter((e) => pool.memberCategoryIds.includes(e.categoryId))).toHaveLength(60);
    await a.close();
    await b.close();
  });
});

describe('publishing', () => {
  it('blocks publishing with errors, requires warnings to be acknowledged, then freezes a version', async () => {
    const { app, eventId, event } = await setupDemo();

    const broken = structuredClone(event.config);
    broken.categories[0].timingCode = '';
    const saved = (await app.inject({ method: 'PUT', url: `/api/events/${eventId}/config`, payload: { revision: event.revision, config: broken } })).json() as Payload;
    const blocked = await app.inject({ method: 'POST', url: `/api/events/${eventId}/publish`, payload: { acknowledgeWarnings: true } });
    expect(blocked.statusCode).toBe(422);
    expect(blocked.json().error).toMatch(/Fix 1 error/);

    const fixed = (await app.inject({ method: 'PUT', url: `/api/events/${eventId}/config`, payload: { revision: saved.revision, config: event.config } })).json() as Payload;
    const hasWarnings = fixed.issues.some((i) => i.level === 'warning');
    if (hasWarnings) {
      const needAck = await app.inject({ method: 'POST', url: `/api/events/${eventId}/publish`, payload: { acknowledgeWarnings: false } });
      expect(needAck.statusCode).toBe(422);
    }
    const ok = await app.inject({ method: 'POST', url: `/api/events/${eventId}/publish`, payload: { acknowledgeWarnings: true } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().publishedVersion).toBe(1);

    // Later draft edits do not change the frozen version.
    const after = structuredClone(event.config);
    after.event.name = 'Edited after publishing';
    await app.inject({ method: 'PUT', url: `/api/events/${eventId}/config`, payload: { revision: fixed.revision, config: after } });
    const v1 = (await app.inject({ method: 'GET', url: `/api/events/${eventId}/versions/1` })).json() as { config: EventConfig };
    expect(v1.config.event.name).toBe(event.config.event.name);
    const list = (await app.inject({ method: 'GET', url: '/api/organizations' })).json() as { events: { hasUnpublishedChanges: boolean }[] }[];
    expect(list[0].events[0].hasUnpublishedChanges).toBe(true);
    await app.close();
  });
});

describe('Berkeley Omnium demo', () => {
  it('seeds both races with every 2026 field and no publish-blocking errors', async () => {
    const { app } = buildApp({ dbPath: ':memory:' });
    const res = await app.inject({ method: 'POST', url: '/api/demo/berkeley-omnium' });
    expect(res.statusCode).toBe(201);
    const { eventId } = res.json() as { eventId: string };
    const event = (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json() as Payload;
    expect(event.config.races.map((r) => r.name)).toEqual(['Berkeley Hills Road Race', 'Berkeley Streets Criterium']);
    expect(event.config.startGroups.filter((g) => g.raceId === event.config.races[0].id)).toHaveLength(16);
    expect(event.config.startGroups.filter((g) => g.raceId === event.config.races[1].id)).toHaveLength(12);
    expect(event.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(event.entries.length).toBeGreaterThan(0);
  });
});
