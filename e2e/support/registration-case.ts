import { expect, type APIRequestContext } from '@playwright/test';
import { buildCaseStudyScenarios } from '../../src/shared/caseStudies';
import { E2E_ORGANIZER } from '../fixtures';
import { publishReviewed } from './publish';

/** Isolate each browser journey so full-field and checkout tests cannot consume each other's places. */
export async function seedRegistrationCase(api: APIRequestContext, kind: 'criterium' | 'omnium') {
  const scenario = buildCaseStudyScenarios().find((c) => c.key === kind)!;
  const config = scenario.config;
  const headers = { Authorization: `Bearer test:${E2E_ORGANIZER}` };
  const org = await api.post('/api/organizations', { headers, data: { name: 'Browser registration cases' } });
  expect(org.ok()).toBe(true);
  const created = await api.post(`/api/organizations/${(await org.json()).id}/events`, { headers, data: { name: config.event.name, template: kind === 'criterium' ? 'criterium' : 'weekend', startDate: config.days[0].date, timeZone: config.event.timeZone } });
  expect(created.ok()).toBe(true);
  const event = await created.json();
  expect((await api.put(`/api/events/${event.id}/config`, { headers, data: { config, revision: event.revision } })).ok()).toBe(true);
  for (const plan of scenario.entryPlan.filter((p) => p.count === config.categories.find((c) => c.id === p.categoryId)?.cap)) {
    expect((await api.post(`/api/events/${event.id}/test-entries`, { headers, data: { categoryId: plan.categoryId, count: plan.count } })).ok()).toBe(true);
  }
  expect((await publishReviewed(api, `/api/events/${event.id}`, { acknowledgeWarnings: true }, headers)).ok()).toBe(true);
  return event.id as string;
}
