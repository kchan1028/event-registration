import { describe, expect, it } from 'vitest';
import { testApp, testDatabaseUrl } from './support/db';
import { buildBerkeleyEvents } from '../src/shared/berkeleyEvents';
import { eventConfigSchema } from '../src/shared/schema';
import { validateConfig } from '../src/shared/validation';
import { quote } from '../src/shared/pricing';

const endpoint = '/api/demo/berkeley-events';

describe('standalone Berkeley demo', () => {
  it('keeps each race and its category, day, and start-group references inside its own event', () => {
    const configs = buildBerkeleyEvents();
    expect(configs.map((c) => c.event.name)).toEqual(['Berkeley Hills Road Race', 'Berkeley Streets Criterium']);
    configs.forEach((c, index) => {
      expect(eventConfigSchema.safeParse(c).success).toBe(true);
      expect(validateConfig(c, []).filter((i) => i.level === 'error')).toEqual([]);
      expect(c.days).toHaveLength(1);
      expect(c.races).toHaveLength(1);
      expect(c.registration.bundles).toEqual([]);
      expect(c.registration.sameRaceExtraEntryCents).toBeNull();
      expect(c.categories.length).toBeGreaterThan(10);
      for (const cat of c.categories) {
        expect(cat.raceId).toBe(c.races[0].id);
        expect(c.startGroups.some((g) => g.id === cat.startGroupId && g.raceId === cat.raceId)).toBe(true);
        expect(cat.pricing.baseCents).toBe(index === 0 ? 8000 : 6000);
        const q = quote(c, [cat.id], c.days[0].date);
        expect(q.totalCents).toBe(index === 0 ? 8000 : 6000);
        expect(q.fees).toEqual([]);
        expect(q.bundle).toBeNull();
      }
    });
    const firstIds = new Set(configs[0].categories.map((c) => c.id));
    expect(configs[1].categories.some((c) => firstIds.has(c.id))).toBe(false);
  });

  it('publishes both events, persists across restart, and reruns without changing edits or unrelated data', async () => {
    const databaseUrl = await testDatabaseUrl();
    let app = (await testApp({ databaseUrl })).app;
    try {
      const unrelated = (await app.inject({ method: 'POST', url: '/api/organizations', payload: { name: 'Unrelated local club' } })).json();
      const seeded = await app.inject({ method: 'POST', url: endpoint });
      expect(seeded.statusCode).toBe(201);
      const { organizationId, eventIds } = seeded.json();
      expect(eventIds).toHaveLength(2);
      const catalog = (await app.inject({ method: 'GET', url: '/api/public/events' })).json();
      expect(catalog.map((e: { name: string }) => e.name).sort()).toEqual(['Berkeley Hills Road Race', 'Berkeley Streets Criterium']);
      const event = (await app.inject({ method: 'GET', url: `/api/events/${eventIds[0]}` })).json();
      expect(event.entries).toEqual([]);
      event.config.event.name = 'Organizer edited draft';
      expect((await app.inject({ method: 'PUT', url: `/api/events/${eventIds[0]}/config`, payload: { config: event.config, revision: event.revision } })).statusCode).toBe(200);
      await app.close();
      app = (await testApp({ databaseUrl })).app;
      const rerun = await app.inject({ method: 'POST', url: endpoint });
      expect(rerun.statusCode).toBe(200);
      expect(rerun.json().organizationId).toBe(organizationId);
      expect(rerun.json().eventIds.sort()).toEqual([...eventIds].sort());
      const after = (await app.inject({ method: 'GET', url: `/api/events/${eventIds[0]}` })).json();
      expect(after.config.event.name).toBe('Organizer edited draft');
      expect(after.publishedVersion).toBe(1);
      const orgs = (await app.inject({ method: 'GET', url: '/api/organizations' })).json();
      expect(orgs).toHaveLength(2);
      expect(orgs.some((o: { id: string }) => o.id === unrelated.id)).toBe(true);
    } finally {
      await app.close();
    }
  });
});
