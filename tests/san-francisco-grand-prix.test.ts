import { describe, expect, it } from 'vitest';
import { buildSanFranciscoGrandPrixEvent } from '../src/shared/sanFranciscoGrandPrix';
import { eventConfigSchema } from '../src/shared/schema';
import { validateConfig } from '../src/shared/validation';
import { quote } from '../src/shared/pricing';
import { testApp } from './support/db';

describe('San Francisco Grand Prix historical demo', () => {
  it('models a road race and total distance without pretending its varying loops are uniform laps', () => {
    const config = buildSanFranciscoGrandPrixEvent();
    expect(eventConfigSchema.safeParse(config).success).toBe(true);
    expect(validateConfig(config, []).filter((i) => i.level === 'error')).toEqual([]);
    expect(config.days.map((d) => d.date)).toEqual(['2005-09-04']);
    expect(config.races).toHaveLength(1);
    expect(config.races[0].discipline).toBe('road_race');
    expect(config.categories).toHaveLength(1);
    const category = config.categories[0];
    expect(category.length).toEqual({ kind: 'distance', distance: 108.1, unit: 'mi', laps: null, partialFinalLap: false });
    expect(config.startGroups).toHaveLength(1);
    expect(category.startGroupId).toBe(config.startGroups[0].id);
    expect(category.eligibility.organizerReview).toBe(true);
    expect(category.eligibility.paths[0].licenseCategories).toEqual(['PRO']);
    expect(config.event.demoNotice).toContain('does not grant professional or team admission');
    expect(quote(config, [category.id], '2026-11-15').totalCents).toBe(4000);
    expect(config.registration.bundles).toEqual([]);
  });

  it('publishes one empty event, preserves draft edits on rerun, and leaves other demos intact', async () => {
    const { app } = await testApp();
    const berkeley = (await app.inject({ method: 'POST', url: '/api/demo/berkeley-events' })).json();
    const burlingame = (await app.inject({ method: 'POST', url: '/api/demo/burlingame' })).json();
    const endpoint = '/api/demo/san-francisco-grand-prix';
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
    expect(catalog.map((e: { id: string }) => e.id).sort()).toEqual([...berkeley.eventIds, ...burlingame.eventIds, ...eventIds].sort());
    await app.close();
  });
});
