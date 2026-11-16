import { describe, expect, it } from 'vitest';
import { teamTimeTrialResearchDemos } from '../src/shared/teamTimeTrialResearch';
import { eventConfigSchema } from '../src/shared/schema';
import { validateConfig } from '../src/shared/validation';
import { buildBurlingameEvent } from '../src/shared/burlingame';
import { checkSelection } from '../src/shared/checkout';
import { testApp } from './support/db';

describe('team time trial read-only research examples', () => {
  it('only permits empty demo research, while ordinary empty events still cannot publish', () => {
    const config = teamTimeTrialResearchDemos[0].build();
    delete config.event.researchOnly;
    expect(validateConfig(config, []).filter((i) => i.level === 'error').map((i) => i.key)).toEqual(['event.no-races', 'event.no-categories']);
    config.event.researchOnly = true;
    config.event.isDemo = false;
    expect(validateConfig(config, []).some((i) => i.key === 'event.research-only')).toBe(true);
    const populated = buildBurlingameEvent();
    populated.event.researchOnly = true;
    expect(validateConfig(populated, []).some((i) => i.key === 'event.research-only')).toBe(true);
  });

  for (const demo of teamTimeTrialResearchDemos) {
    it(`${demo.key}: has no substituted road race, category, roster, or checkout configuration`, () => {
      const config = demo.build();
      expect(eventConfigSchema.safeParse(config).success).toBe(true);
      expect(config.event.isDemo).toBe(true);
      expect(config.races).toEqual([]);
      expect(config.categories).toEqual([]);
      expect(config.startGroups).toEqual([]);
      expect(config.displayGroups).toEqual([]);
      expect(config.registration.bundles).toEqual([]);
      expect(validateConfig(config, []).filter((i) => i.level === 'error')).toEqual([]);
      expect(config.event.researchOnly).toBe(true);
      expect(checkSelection(config, ['invented-category'], { racingAge: 30, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null }).problems).toEqual(['This is a read-only research example. Registration is unavailable.']);
      if (demo.key === 'bbc-team-time-trial') expect(config.days[0].date).toBe('2008-03-09');
      else {
        expect(config.days[0].date).toBe('2026-11-15');
        expect(config.days[0].label).toContain('NOT a race date');
        expect(config.event.demoNotice).toContain('NOT an event date');
      }
    });

    it(`${demo.key}: publishes read-only, blocks order creation, and preserves edits on rerun`, async () => {
      const { app } = await testApp();
      const other = (await app.inject({ method: 'POST', url: '/api/demo/berkeley-events' })).json();
      const endpoint = `/api/demo/${demo.key}`;
      const first = await app.inject({ method: 'POST', url: endpoint });
      expect(first.statusCode).toBe(201);
      const { eventIds } = first.json();
      expect(eventIds).toHaveLength(1);
      const url = `/api/events/${eventIds[0]}`;
      const event = (await app.inject({ method: 'GET', url })).json();
      expect(event.publishedVersion).toBe(1);
      expect(event.entries).toEqual([]);
      expect(event.versions).toHaveLength(1);
      const order = await app.inject({ method: 'POST', url: `/api/rider/events/${eventIds[0]}/orders`, payload: { clientRequestId: 'research-order-request', categoryIds: ['invented-category'], rider: {}, waiver: {} } });
      expect(order.statusCode).toBe(409);
      expect(order.json().error).toContain('Registration is unavailable');
      const publicEvent = await app.inject({ method: 'GET', url: `/api/public/events/${eventIds[0]}` });
      expect(publicEvent.statusCode).toBe(200);
      expect(publicEvent.json().config.event.researchOnly).toBe(true);
      event.config.event.venue = 'Organizer research note';
      expect((await app.inject({ method: 'PUT', url: `${url}/config`, payload: { revision: event.revision, config: event.config } })).statusCode).toBe(200);
      const rerun = await app.inject({ method: 'POST', url: endpoint });
      expect(rerun.statusCode).toBe(200);
      expect(rerun.json().eventIds).toEqual(eventIds);
      const after = (await app.inject({ method: 'GET', url })).json();
      expect(after.config.event.venue).toBe('Organizer research note');
      expect(after.publishedVersion).toBe(1);
      const catalog = (await app.inject({ method: 'GET', url: '/api/public/events' })).json();
      expect(catalog.map((e: { id: string }) => e.id).sort()).toEqual([...other.eventIds, ...eventIds].sort());
      expect(catalog.find((e: { id: string }) => e.id === eventIds[0]).researchOnly).toBe(true);
      const orgs = (await app.inject({ method: 'GET', url: '/api/organizations' })).json();
      expect(orgs.some((o: { events: Array<{ id: string }> }) => o.events.some((e) => e.id === eventIds[0]))).toBe(true);
      await app.close();
    });
  }
});
