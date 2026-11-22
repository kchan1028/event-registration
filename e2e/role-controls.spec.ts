import type { APIRequestContext, Browser } from '@playwright/test';
import { expect, test, type Page } from './fixtures';

/*
 * Role-aware organizer screens: a control or instruction appears only for a role that can act on it.
 * The server's own refusals are covered by tests/auth.test.ts.
 */

type Role = 'check_in_volunteer' | 'timer_export' | 'finance';

async function asRole(browser: Browser, organizer: APIRequestContext, organizationId: string, role: Role, run: (page: Page) => Promise<void>, width = 1440) {
  const email = `controls.${role}@example.test`;
  expect((await organizer.post(`/api/organizations/${organizationId}/members`, { data: { email, role } })).ok()).toBe(true);
  const context = await browser.newContext({ viewport: { width, height: 900 }, extraHTTPHeaders: {} });
  try {
    await context.addInitScript((user) => sessionStorage.setItem('cyclereg.test-session', user), email);
    await run(await context.newPage());
  } finally {
    await context.close();
  }
}

for (const width of [390, 1440]) {
  test(`check-in hides setup a volunteer cannot do at ${width}px`, async ({ page, browser }) => {
    const { eventId, organizationId } = await (await page.request.post('/api/demo')).json();
    await asRole(browser, page.request, organizationId, 'check_in_volunteer', async (volunteer) => {
      await volunteer.goto(`/#/events/${eventId}/check-in`);
      await expect(volunteer.getByText('This event is not published yet. A registration manager or owner publishes it.')).toBeVisible();
      await expect(volunteer.getByText('Ask a registration manager or owner to set one before checking riders in.')).toBeVisible();
      await volunteer.getByRole('button', { name: 'Register a walk-up' }).click();
      await expect(volunteer.getByText('A registration manager or owner must publish this event before you share rider registration.')).toBeVisible();

      expect((await page.request.post(`/api/events/${eventId}/publish`, { data: { acknowledgeWarnings: true } })).ok()).toBe(true);
      await volunteer.reload();
      await expect(volunteer.getByText('No registered riders for this day yet.')).toBeVisible();
      await expect(volunteer.getByRole('button', { name: 'Add fictional demo riders' })).toHaveCount(0);
      expect(await volunteer.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }, width);

    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/#/events/${eventId}/check-in`);
    await expect(page.getByRole('button', { name: 'Add fictional demo riders' })).toBeVisible();
    await expect(page.getByText(/Set one under Bib ranges/)).toBeVisible();
  });
}

for (const role of ['check_in_volunteer', 'timer_export', 'finance'] as const) {
  test(`schedule shows ${role} details without editing controls`, async ({ page, browser }) => {
    const { eventId, organizationId } = await (await page.request.post('/api/demo')).json();
    const { config } = await (await page.request.get(`/api/events/${eventId}`)).json();
    const category = config.categories.find((c: { raceId: string }) => c.raceId === config.races[0].id);

    await asRole(browser, page.request, organizationId, role, async (member) => {
      await member.goto(`/#/events/${eventId}/race/${category.raceId}`);
      await expect(member.getByText('View only', { exact: true })).toBeVisible();
      await expect(member.getByRole('heading', { name: 'Checks before publishing' })).toHaveCount(0);
      await expect(member.getByRole('button', { name: /^Move .* (up|down)$/ })).toHaveCount(0);
      await member.locator('.cat-row__name', { hasText: category.name }).first().click();
      const details = member.getByRole('complementary', { name: 'Category details' });
      await expect(details.getByLabel('Category name')).toHaveValue(category.name);
      await expect(details.getByLabel('Category name')).toBeDisabled();
      await expect(details.getByRole('button')).toHaveCount(1);
      await expect(details.getByText(/Choose how this race is measured|Set a cap, a start group/)).toHaveCount(0);
      await details.getByRole('button', { name: 'Close category details' }).click();
      await expect(details).toHaveCount(0);

      await member.setViewportSize({ width: 390, height: 900 });
      await member.reload();
      await expect(member.getByText('View only', { exact: true })).toBeVisible();
      await expect(member.getByRole('heading', { name: 'Checks before publishing', includeHidden: true })).toHaveCount(0);
    });

    await page.goto(`/#/events/${eventId}/race/${category.raceId}`);
    await page.locator('.cat-row__name', { hasText: category.name }).first().click();
    await expect(page.getByRole('complementary', { name: 'Category editor' }).getByRole('button', { name: 'Add price change' })).toBeVisible();
  });
}

test('an event without races offers setup only to an editor', async ({ page, browser }) => {
  // A new event, because the demo's test entries keep its categories from being removed.
  const { organizationId } = await (await page.request.post('/api/demo')).json();
  const created = await page.request.post(`/api/organizations/${organizationId}/events`, {
    data: { name: 'Example empty weekend', template: 'criterium', startDate: '2027-04-17', timeZone: 'America/Los_Angeles' },
  });
  expect(created.status()).toBe(201);
  const { id: eventId, revision, config } = await created.json();
  const empty = { ...config, races: [], categories: [], startGroups: [], capacityPools: [] };
  expect((await page.request.put(`/api/events/${eventId}/config`, { data: { revision, config: empty } })).ok()).toBe(true);

  await asRole(browser, page.request, organizationId, 'timer_export', async (member) => {
    await member.goto(`/#/events/${eventId}`);
    await expect(member.getByText('This event has no races yet.')).toBeVisible();
    await expect(member.getByRole('link', { name: 'Open event setup' })).toHaveCount(0);
    await expect(member.getByText('Select a category in the schedule to see its details.')).toHaveCount(0);
  });

  await page.goto(`/#/events/${eventId}`);
  await expect(page.getByRole('link', { name: 'Open event setup' })).toBeVisible();
});
