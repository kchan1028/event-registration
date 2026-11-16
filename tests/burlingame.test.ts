import { describe, expect, it } from 'vitest';
import { buildBurlingameEvent } from '../src/shared/burlingame';
import { eventConfigSchema } from '../src/shared/schema';
import { validateConfig } from '../src/shared/validation';
import { quote } from '../src/shared/pricing';
import { testApp } from './support/db';

describe('Burlingame historical demo', () => {
  it('keeps historical starts and separate masters classifications with explicit test assumptions', () => {
    const config = buildBurlingameEvent();
    expect(eventConfigSchema.safeParse(config).success).toBe(true);
    expect(validateConfig(config, []).filter((i) => i.level === 'error')).toEqual([]);
    expect(config.days[0].date).toBe('2017-06-25');
    expect(config.startGroups.map((g) => g.startTime)).toEqual(['07:00', '07:50', '08:40', '09:35', '12:00', '13:00', '14:00']);
    expect(config.categories).toHaveLength(9);
    for (const time of ['09:35', '13:00']) {
      const group = config.startGroups.find((g) => g.startTime === time)!;
      const categories = config.categories.filter((c) => c.startGroupId === group.id);
      expect(group.fieldLimit).toBe(60);
      expect(categories.map((c) => c.eligibility.paths[0].minAge)).toEqual([35, 45]);
      expect(new Set(categories.map((c) => c.classifications[0].code)).size).toBe(2);
      expect(categories.every((c) => c.cap === null && c.eligibility.organizerReview)).toBe(true);
    }
    expect(quote(config, [config.categories[0].id], '2026-11-15').totalCents).toBe(4000);
    expect(config.registration.bundles).toEqual([]);
    expect(config.event.demoNotice).toContain('on hiatus');
    expect(config.categories.every((c) => c.length.kind === 'duration' && c.length.minutes === 40)).toBe(true);
  });

  it('publishes one empty event and preserves edits, publication, and Berkeley on rerun', async () => {
    const { app } = await testApp();
    const berkeley = (await app.inject({ method: 'POST', url: '/api/demo/berkeley-events' })).json();
    const first = await app.inject({ method: 'POST', url: '/api/demo/burlingame' });
    expect(first.statusCode).toBe(201);
    const { eventIds } = first.json();
    expect(eventIds).toHaveLength(1);
    const url = `/api/events/${eventIds[0]}`;
    const event = (await app.inject({ method: 'GET', url })).json();
    expect(event.entries).toEqual([]);
    expect(event.publishedVersion).toBe(1);
    event.config.event.venue = 'Organizer draft edit';
    expect((await app.inject({ method: 'PUT', url: `${url}/config`, payload: { revision: event.revision, config: event.config } })).statusCode).toBe(200);
    const rerun = await app.inject({ method: 'POST', url: '/api/demo/burlingame' });
    expect(rerun.statusCode).toBe(200);
    expect(rerun.json().eventIds).toEqual(eventIds);
    const after = (await app.inject({ method: 'GET', url })).json();
    expect(after.config.event.venue).toBe('Organizer draft edit');
    expect(after.publishedVersion).toBe(1);
    const catalog = (await app.inject({ method: 'GET', url: '/api/public/events' })).json();
    expect(catalog.map((e: { id: string }) => e.id).sort()).toEqual([...berkeley.eventIds, ...eventIds].sort());
    await app.close();
  });
});
