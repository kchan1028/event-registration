import { describe, expect, it } from 'vitest';
import { regionalHistoricalDemos } from '../src/shared/regionalHistoricalEvents';
import { eventConfigSchema } from '../src/shared/schema';
import { validateConfig } from '../src/shared/validation';
import { quote } from '../src/shared/pricing';
import { testApp } from './support/db';

const expected = {
  wente: { dates: ['2018-04-29'], races: 1, starts: 3, categories: 3 },
  'mount-hamilton': { dates: ['2019-05-26'], races: 1, starts: 9, categories: 14 },
  'chico-stage-race': { dates: ['2018-03-17', '2018-03-18'], races: 2, starts: 4, categories: 4 },
  'sunset-criterium': { dates: ['2017-07-29'], races: 1, starts: 3, categories: 3 },
};

describe('regional historical setup demos', () => {
  for (const demo of regionalHistoricalDemos) {
    it(`${demo.key}: validates its explicit scope and keeps all references inside each race`, () => {
      const config = demo.build();
      const counts = expected[demo.key];
      expect(eventConfigSchema.safeParse(config).success).toBe(true);
      expect(validateConfig(config, []).filter((i) => i.level === 'error')).toEqual([]);
      expect(config.days.map((d) => d.date)).toEqual(counts.dates);
      expect(config.races).toHaveLength(counts.races);
      expect(config.startGroups).toHaveLength(counts.starts);
      expect(config.categories).toHaveLength(counts.categories);
      expect(config.event.isDemo).toBe(true);
      expect(config.registration.bundles).toEqual([]);
      for (const category of config.categories) {
        expect(config.races.some((r) => r.id === category.raceId)).toBe(true);
        expect(config.startGroups.some((g) => g.id === category.startGroupId && g.raceId === category.raceId)).toBe(true);
        expect(config.displayGroups.some((g) => g.id === category.displayGroupId)).toBe(true);
        expect(category.eligibility.organizerReview).toBe(true);
        expect(quote(config, [category.id], '2026-11-15').totalCents).toBe(4000);
      }
      if (demo.key === 'mount-hamilton') {
        expect(config.startGroups.map((g) => g.startTime)).toEqual(['08:00', '08:10', '08:20', '08:30', '08:40', '08:50', '09:00', '09:10', '09:20']);
        const women = config.startGroups.find((g) => g.startTime === '08:50')!;
        const members = config.categories.filter((c) => c.startGroupId === women.id);
        expect(members).toHaveLength(3);
        expect(new Set(members.map((c) => c.classifications[0].code)).size).toBe(3);
        expect(members.every((c) => c.cap === null)).toBe(true);
        expect(config.categories.every((c) => c.length.kind === 'distance' && c.length.distance === 63.5 && c.length.laps === null)).toBe(true);
      }
      if (demo.key === 'chico-stage-race') {
        expect(config.races.map((r) => r.discipline)).toEqual(['road_race', 'criterium']);
        expect(config.startGroups.map((g) => g.startTime)).toEqual(['08:00', '09:30', '15:25', '16:45']);
        expect(config.categories.map((c) => c.length)).toEqual([
          { kind: 'distance', distance: 90, unit: 'mi', laps: null, partialFinalLap: false },
          { kind: 'distance', distance: 90, unit: 'mi', laps: null, partialFinalLap: false },
          { kind: 'duration', minutes: 70, plusLaps: null },
          { kind: 'duration', minutes: 60, plusLaps: null },
        ]);
        expect(config.event.demoNotice).toContain('not official stage-race admission');
      }
      if (demo.key === 'sunset-criterium') {
        expect(config.races[0].discipline).toBe('criterium');
        expect(config.startGroups.map((g) => g.startTime)).toEqual(['13:30', '19:00', '20:15']);
        expect(config.event.demoNotice).toContain('Kids ride and fixed-gear program are not included');
      }
      if (demo.key === 'wente') expect(config.event.demoNotice).toContain('full field matrix was not verified');
    });

    it(`${demo.key}: publishes empty, reuses IDs and edits, and preserves other demos`, async () => {
      const { app } = await testApp();
      const other = (await app.inject({ method: 'POST', url: '/api/demo/berkeley-events' })).json();
      const endpoint = `/api/demo/${demo.key}`;
      const first = await app.inject({ method: 'POST', url: endpoint });
      expect(first.statusCode).toBe(201);
      const { eventIds } = first.json();
      expect(eventIds).toHaveLength(1);
      const url = `/api/events/${eventIds[0]}`;
      const event = (await app.inject({ method: 'GET', url })).json();
      expect(event.entries).toEqual([]);
      expect(event.publishedVersion).toBe(1);
      event.config.event.venue = 'Organizer draft edit';
      expect((await app.inject({ method: 'PUT', url: `${url}/config`, payload: { revision: event.revision, config: event.config } })).statusCode).toBe(200);
      const rerun = await app.inject({ method: 'POST', url: endpoint });
      expect(rerun.statusCode).toBe(200);
      expect(rerun.json().eventIds).toEqual(eventIds);
      const after = (await app.inject({ method: 'GET', url })).json();
      expect(after.config.event.venue).toBe('Organizer draft edit');
      expect(after.publishedVersion).toBe(1);
      const catalog = (await app.inject({ method: 'GET', url: '/api/public/events' })).json();
      expect(catalog.map((e: { id: string }) => e.id).sort()).toEqual([...other.eventIds, ...eventIds].sort());
      await app.close();
    });
  }

  it('concurrent seed requests create one event', async () => {
    const { app } = await testApp();
    const responses = await Promise.all([
      app.inject({ method: 'POST', url: '/api/demo/wente' }),
      app.inject({ method: 'POST', url: '/api/demo/wente' }),
    ]);
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 201]);
    expect(responses[0].json().eventIds).toEqual(responses[1].json().eventIds);
    expect((await app.inject({ method: 'GET', url: '/api/public/events' })).json()).toHaveLength(1);
    await app.close();
  });
});
