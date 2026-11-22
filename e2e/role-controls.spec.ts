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

for (const width of [375, 1440]) {
  test(`check-in hides setup a volunteer cannot do at ${width}px`, async ({ page, browser }) => {
    const { eventId, organizationId } = await (await page.request.post('/api/demo')).json();
    await asRole(browser, page.request, organizationId, 'check_in_volunteer', async (volunteer) => {
      await volunteer.goto(`/#/events/${eventId}/check-in`);
      await expect(volunteer.getByText('This event is not published yet. A registration manager or owner publishes it.')).toBeVisible();
      await expect(volunteer.getByText('Ask a registration manager or owner to set one for riders who still need a bib and whose category has no range of its own.')).toBeVisible();
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
    const { revision, config } = await (await page.request.get(`/api/events/${eventId}`)).json();
    const category = config.categories.find((c: { raceId: string }) => c.raceId === config.races[0].id);
    // A start group with a problem to fix.
    Object.assign(config.startGroups.find((g: { id: string }) => g.id === category.startGroupId), { startTime: '08:00', stagingTime: '09:00' });
    // Two groups at one time: a warning on the race itself.
    const others = config.startGroups.filter((g: { raceId: string; id: string }) => g.raceId === category.raceId && g.id !== category.startGroupId);
    Object.assign(others[0], { startTime: '08:00', stagingTime: null });
    // Every optional part of the editor that carries a hint: a question, a timed length, and no timing code (a problem to fix).
    Object.assign(category, {
      questions: [{ id: 'q-role-test', label: '', required: false, options: [] }],
      length: { kind: 'duration', minutes: 45, plusLaps: 3 },
      timingCode: '',
      needsReview: true,
      reviewReason: 'Copied from "Example". Check the name, timing code, and price before publishing.',
    });
    expect((await page.request.put(`/api/events/${eventId}/config`, { data: { revision, config } })).ok()).toBe(true);

    await asRole(browser, page.request, organizationId, role, async (member) => {
      await member.goto(`/#/events/${eventId}/race/${category.raceId}`);
      await expect(member.getByText('View only', { exact: true })).toBeVisible();
      await expect(member.getByRole('heading', { name: 'Checks before publishing' })).toHaveCount(0);
      await expect(member.getByRole('button', { name: /^Move .* (up|down)$/ })).toHaveCount(0);
      await expect(member.locator('.cat-table thead th')).toHaveCount(7);
      // Problems show to every role, as words and not by color alone. The tasks that fix them stay with editors.
      await expect(member.locator('.clip--error').first()).toContainText('staging time is after the start time');
      await expect(member.locator('.cat-row', { hasText: category.name }).first()).toContainText('Not reviewed yet');
      await expect(member.getByRole('list', { name: 'Problems in this race' })).toContainText('start at the same time');
      await member.locator('.cat-row__name', { hasText: category.name }).first().click();
      await expect(member.getByText(/^(Review copy|Needs fixing)$/)).toHaveCount(0);
      const details = member.getByRole('complementary', { name: 'Category details' });
      await expect(details.getByText('An organizer has not finished reviewing this copied category.')).toBeVisible();
      await expect(details.getByText(/Check the name/)).toHaveCount(0);
      await expect(details.getByLabel('Category name')).toHaveValue(category.name);
      await expect(details.getByLabel('Category name')).toBeDisabled();
      await expect(details.getByRole('button')).toHaveCount(1);
      await expect(details.getByText(/Choose how this race is measured|Set a cap, a start group|list each allowed category|Comma-separated|Leave blank|For example|Cannot go below|you offer freed places/)).toHaveCount(0);
      await expect(details.getByPlaceholder(/For example/)).toHaveCount(0);
      const problems = details.getByRole('list', { name: 'Problems in this category' });
      await expect(problems).toContainText('needs a short timing code');
      await expect(problems).not.toContainText('Copied from');
      await details.getByRole('button', { name: 'Close category details' }).click();
      await expect(details).toHaveCount(0);

      if (role !== 'check_in_volunteer') {
        await member.goto(`/#/events/${eventId}/${role === 'finance' ? 'registrations' : 'startlists'}`);
        await expect(member.getByRole('heading', { name: role === 'finance' ? 'Registrations' : /start list/i }).first()).toBeVisible();
        await expect(member.locator('aside.inspector')).toHaveCount(0);
        for (const width of [1100, 1440]) {
          await member.setViewportSize({ width, height: 900 });
          expect(await member.locator('#main').evaluate((main) => Math.round(main.getBoundingClientRect().right) === document.documentElement.clientWidth)).toBe(true);
        }
      }
      await member.setViewportSize({ width: 375, height: 900 });
      await member.reload();
      await expect(member.getByText('View only', { exact: true })).toBeVisible();
      if (role === 'check_in_volunteer') {
        expect(await member.locator('.cat-row').first().evaluate((row) => [...row.children].every((cell) => cell.getBoundingClientRect().left === row.children[0].getBoundingClientRect().left))).toBe(true);
      }
      await expect(member.getByRole('heading', { name: 'Checks before publishing', includeHidden: true })).toHaveCount(0);
    });

    await page.goto(`/#/events/${eventId}/race/${category.raceId}`);
    await expect(page.locator('.cat-table thead th')).toHaveCount(10);
    await expect(page.locator('.clip--error').first()).toBeVisible();
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
    await expect(member.locator('aside.inspector')).toHaveCount(0);
  });

  await page.goto(`/#/events/${eventId}`);
  await expect(page.getByRole('link', { name: 'Open event setup' })).toBeVisible();
});
