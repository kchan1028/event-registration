import { describe, expect, it } from 'vitest';
import { buildRedKiteSeriesEvent } from '../src/shared/redKiteSeries';
import { eventConfigSchema } from '../src/shared/schema';
import { validateConfig } from '../src/shared/validation';
import { quote } from '../src/shared/pricing';
import { limitsForCategory } from '../src/shared/capacity';
import { testApp } from './support/db';

describe('Red Kite historical criterium sample', () => {
  it('keeps three sourced rounds separate and shares starts without merging classifications or capacity across rounds', () => {
    const config = buildRedKiteSeriesEvent();
    expect(eventConfigSchema.safeParse(config).success).toBe(true);
    expect(validateConfig(config, []).filter((i) => i.level === 'error')).toEqual([]);
    expect(config.days.map((d) => d.date)).toEqual(['2017-03-19', '2017-04-23', '2017-07-09']);
    expect(config.startGroups).toHaveLength(33);
    expect(config.categories).toHaveLength(42);
    for (const race of config.races) {
      expect(race.discipline).toBe('criterium');
      expect(config.days.some((d) => d.id === race.dayId)).toBe(true);
      const starts = config.startGroups.filter((g) => g.raceId === race.id);
      const categories = config.categories.filter((c) => c.raceId === race.id);
      expect(starts.map((g) => g.startTime)).toEqual(['08:00', '08:50', '09:30', '10:20', '11:10', '12:30', '13:20', '14:10', '15:00', '16:10', '17:20']);
      expect(categories).toHaveLength(14);
      for (const time of ['08:00', '10:20', '13:20']) {
        const group = starts.find((g) => g.startTime === time)!;
        const members = categories.filter((c) => c.startGroupId === group.id);
        expect(members).toHaveLength(2);
        expect(new Set(members.map((c) => c.classifications[0].code)).size).toBe(2);
        expect(limitsForCategory(config, members[0].id)).toEqual([{ kind: 'start_group', id: group.id, name: group.name, limit: 60, categoryIds: members.map((c) => c.id) }]);
      }
    }
    const picks = config.races.map((r) => config.categories.find((c) => c.raceId === r.id)!.id);
    expect(quote(config, picks, '2026-11-15').totalCents).toBe(12000);
    expect(config.registration.bundles).toEqual([]);
    expect(config.event.demoNotice).toContain('not the full 14-round series');
    expect(config.categories.every((c) => c.eligibility.organizerReview)).toBe(true);
  });

  it('publishes one empty sample, preserves draft edits on rerun, and leaves other events intact', async () => {
    const { app } = await testApp();
    const other = (await app.inject({ method: 'POST', url: '/api/demo/berkeley-events' })).json();
    const endpoint = '/api/demo/red-kite-series';
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
});
