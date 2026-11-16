import { describe, expect, it } from 'vitest';
import { regionalHistoricalDemos } from '../src/shared/regionalHistoricalEvents';
import { teamTimeTrialResearchDemos } from '../src/shared/teamTimeTrialResearch';
import { testApp } from './support/db';
import { as } from './support/auth';

const published = [
  { key: 'berkeley-events', organizationName: 'Berkeley Omnium (local demo)' },
  { key: 'burlingame', organizationName: 'Burlingame historical case study (local demo)' },
  { key: 'san-francisco-grand-prix', organizationName: 'San Francisco Grand Prix historical case study (local demo)' },
  { key: 'red-kite-series', organizationName: 'Red Kite historical criterium sample (local demo)' },
  ...regionalHistoricalDemos,
];

describe('named demo checkout and workspace isolation', () => {
  for (const demo of published) {
    it(`${demo.key}: completes a simulated order while retaining license review`, async () => {
      const { app } = await testApp();
      const seeded = (await app.inject({ method: 'POST', url: `/api/demo/${demo.key}` })).json();
      const id = seeded.eventIds[0];
      const event = (await app.inject({ method: 'GET', url: `/api/public/events/${id}` })).json();
      const category = event.config.categories[0];
      const path = category.eligibility.paths[0];
      const rider = {
        firstName: 'Fixture', lastName: 'Rider', email: 'fixture.rider@example.test', team: '',
        racingAge: Math.max(30, path.minAge ?? 0), licenseCategory: path.licenseCategories[0] ?? '3',
        licenseType: path.licenseTypes[0], competitionClass: path.genderClass === 'any' ? 'men' : path.genderClass,
        collegiateDivision: path.collegiateDivisions[0] ?? null, guardian: null,
        emergencyContact: { name: 'Fixture Contact', phone: '202-555-0133' },
      };
      const created = await app.inject({ method: 'POST', url: `/api/rider/events/${id}/orders`, payload: {
        clientRequestId: 'named-demo-checkout-request', categoryIds: [category.id], rider,
        waiver: { version: event.config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Fixture Rider', signerRole: 'rider' },
      } });
      expect(created.statusCode).toBe(201);
      const paid = await app.inject({ method: 'POST', url: `/api/orders/${created.json().id}/payment`, payload: { attemptId: 'named-demo-payment', outcome: 'success' } });
      expect(paid.statusCode).toBe(200);
      expect(paid.json().status).toBe('confirmed');
      expect(paid.json().entries).toHaveLength(1);
      expect(paid.json().entries[0].readiness.some((item: { key: string; state: string }) => item.key === 'license' && item.state === 'needs_review')).toBe(true);
      await app.close();
    });
  }

  it('uses reserved workspace identities independently of user-chosen organization names', async () => {
    const { app } = await testApp();
    for (const demo of [...published, ...teamTimeTrialResearchDemos]) {
      const privateOrg = (await app.inject({ method: 'POST', url: '/api/organizations', headers: as('private@example.test'), payload: { name: demo.organizationName } })).json();
      const privateEvent = (await app.inject({ method: 'POST', url: `/api/organizations/${privateOrg.id}/events`, headers: as('private@example.test'), payload: { name: 'Private fictional event', template: 'road_race', startDate: '2027-01-01', timeZone: 'America/Los_Angeles' } })).json();
      expect((await app.inject({ method: 'GET', url: `/api/events/${privateEvent.id}`, headers: as('private@example.test') })).statusCode).toBe(200);
      const seeded = await app.inject({ method: 'POST', url: `/api/demo/${demo.key}`, headers: as('loader@example.test') });
      expect(seeded.statusCode).toBe(201);
      expect(seeded.json().organizationId).not.toBe(privateOrg.id);
      expect((await app.inject({ method: 'GET', url: `/api/events/${privateEvent.id}`, headers: as('loader@example.test') })).statusCode).toBe(404);
    }
    await app.close();
  });

  it('refuses to share a demo workspace after a non-demo event is added', async () => {
    const { app } = await testApp();
    const seeded = (await app.inject({ method: 'POST', url: '/api/demo/wente' })).json();
    const privateEvent = (await app.inject({ method: 'POST', url: `/api/organizations/${seeded.organizationId}/events`, payload: { name: 'Non-demo fictional event', template: 'road_race', startDate: '2027-01-01', timeZone: 'America/Los_Angeles' } })).json();
    expect((await app.inject({ method: 'GET', url: `/api/events/${privateEvent.id}` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/demo/wente', headers: as('another@example.test') })).statusCode).toBe(409);
    expect((await app.inject({ method: 'GET', url: `/api/events/${privateEvent.id}`, headers: as('another@example.test') })).statusCode).toBe(404);
    await app.close();
  });
  it('does not share additional events even when their drafts are relabeled as demos', async () => {
    const { app } = await testApp();
    const seed = (await app.inject({ method: 'POST', url: '/api/demo/wente' })).json();
    const extra = (await app.inject({ method: 'POST', url: `/api/organizations/${seed.organizationId}/events`, payload: { name: 'Additional fictional event', template: 'road_race', startDate: '2027-01-01', timeZone: 'America/Los_Angeles' } })).json();
    extra.config.event.isDemo = true;
    expect((await app.inject({ method: 'PUT', url: `/api/events/${extra.id}/config`, payload: { revision: extra.revision, config: extra.config } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/demo/wente', headers: as('another@example.test') })).statusCode).toBe(409);
    expect((await app.inject({ method: 'GET', url: `/api/events/${extra.id}`, headers: as('another@example.test') })).statusCode).toBe(404);
    await app.close();
  });

  it('checks the published demo identity even after the working draft is relabeled', async () => {
    const { app } = await testApp();
    const seed = (await app.inject({ method: 'POST', url: '/api/demo/wente' })).json();
    const url = `/api/events/${seed.eventIds[0]}`;
    let event = (await app.inject({ method: 'GET', url })).json();
    event.config.event.isDemo = false;
    expect((await app.inject({ method: 'PUT', url: `${url}/config`, payload: { revision: event.revision, config: event.config } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: `${url}/publish`, payload: { acknowledgeWarnings: true } })).statusCode).toBe(200);
    event = (await app.inject({ method: 'GET', url })).json();
    event.config.event.isDemo = true;
    expect((await app.inject({ method: 'PUT', url: `${url}/config`, payload: { revision: event.revision, config: event.config } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/demo/wente', headers: as('another@example.test') })).statusCode).toBe(409);
    expect((await app.inject({ method: 'GET', url, headers: as('another@example.test') })).statusCode).toBe(404);
    await app.close();
  });

});
