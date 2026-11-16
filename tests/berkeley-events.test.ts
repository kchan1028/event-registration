import { describe, expect, it } from 'vitest';
import { testApp, testDatabaseUrl } from './support/db';
import { buildBerkeleyOmniumEvent } from '../src/shared/berkeleyOmnium';
import { eventConfigSchema } from '../src/shared/schema';
import { validateConfig } from '../src/shared/validation';
import { quote } from '../src/shared/pricing';

const endpoint = '/api/demo/berkeley-events';

describe('Berkeley Omnium demo', () => {
  it('contains both races, valid category references, and the fixed-price weekend package', () => {
    const { config } = buildBerkeleyOmniumEvent();
    expect(eventConfigSchema.safeParse(config).success).toBe(true);
    expect(validateConfig(config, []).filter((i) => i.level === 'error')).toEqual([]);
    expect(config.event.name).toBe('Berkeley Omnium 2027');
    expect(config.days.map((d) => d.date)).toEqual(['2027-04-17', '2027-04-18']);
    expect(config.races.map((r) => r.name)).toEqual(['Berkeley Hills Road Race', 'Berkeley Streets Criterium']);
    expect(config.races.map((r) => config.categories.filter((c) => c.raceId === r.id).length)).toEqual([26, 28]);
    for (const cat of config.categories) {
      expect(config.startGroups.some((g) => g.id === cat.startGroupId && g.raceId === cat.raceId)).toBe(true);
      const group = config.displayGroups.find((g) => g.id === cat.displayGroupId)!.name;
      const rates: Record<string, number[]> = { Juniors: [3000, 2000], Collegiate: [6000, 4000], Women: [4000, 2000] };
      expect(cat.pricing.baseCents).toBe((rates[group] ?? [8000, 6000])[cat.raceId === config.races[0].id ? 0 : 1]);
    }
    const selections = config.races.map((r) => config.categories.find((c) => c.raceId === r.id)!.id);
    expect(quote(config, selections, '2027-03-15').entriesTotalCents).toBe(13000);
  });

  it('publishes only the combined event, persists across restart, and reruns without changing edits or unrelated data', async () => {
    const databaseUrl = await testDatabaseUrl();
    let app = (await testApp({ databaseUrl })).app;
    try {
      const unrelated = (await app.inject({ method: 'POST', url: '/api/organizations', payload: { name: 'Unrelated local club' } })).json();
      const seeded = await app.inject({ method: 'POST', url: endpoint });
      expect(seeded.statusCode).toBe(201);
      const { organizationId, eventIds } = seeded.json();
      expect(eventIds).toHaveLength(1);
      const catalog = (await app.inject({ method: 'GET', url: '/api/public/events' })).json();
      expect(catalog.map((e: { name: string }) => e.name).sort()).toEqual(['Berkeley Omnium 2027']);
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
