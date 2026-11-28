// @covers src/web/Registrations.tsx
// @covers src/shared/registrationFilters.ts
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';
import { publishReviewed } from './support/publish';

test('organizers narrow registrations by race day, category, entry status and missing waiver', async ({ page }) => {
  const { eventId } = await (await page.request.post('/api/demo')).json();
  const eventUrl = `/api/events/${eventId}`;
  expect((await publishReviewed(page.request, eventUrl, { acknowledgeWarnings: true })).status()).toBe(200);
  expect((await page.request.post(`${eventUrl}/check-in-demo-riders`)).ok()).toBe(true);
  const { config } = await (await page.request.get(eventUrl)).json();
  const orders = await (await page.request.get(`${eventUrl}/orders`)).json() as { entries: { id: string; dayId: string; categoryId: string; status: string }[] }[];
  const sunday = config.days.find((d: { label: string }) => d.label === 'Sunday');
  const expectedSunday = orders.filter((o) => o.entries.some((e) => e.dayId === sunday.id)).length;
  // Withdraw one entry so the status filter has something to find.
  const entryId = orders.flatMap((o) => o.entries).find((e) => e.status === 'confirmed')!.id;
  expect((await page.request.post(`/api/order-entries/${entryId}/withdraw`, { data: { reason: 'Fictional withdrawal for the filter test' } })).ok()).toBe(true);

  // Archive a category that still has registrations; it must stay filterable.
  const usedCategoryId = orders.flatMap((o) => o.entries)[0].categoryId;
  const current = await (await page.request.get(eventUrl)).json();
  const archived = structuredClone(current.config);
  const used = archived.categories.find((c: { id: string }) => c.id === usedCategoryId);
  used.status = 'archived';
  expect((await page.request.put(`${eventUrl}/config`, { data: { config: archived, revision: current.revision } })).ok()).toBe(true);
  expect((await publishReviewed(page.request, eventUrl, { acknowledgeWarnings: true, acknowledgeImpact: true })).status()).toBe(200);

  await page.goto(`/#/events/${eventId}/registrations`);
  const filters = page.getByRole('group', { name: 'Narrow by entry' });
  const allCount = page.getByRole('group', { name: 'Show registrations' }).getByRole('button', { name: /^All/ }).locator('.num');
  await expect(allCount).toHaveText(String(orders.length));

  await filters.getByLabel('Race day').selectOption(sunday.id);
  await expect(allCount).toHaveText(String(expectedSunday));

  await filters.getByLabel('Race day').selectOption('');
  await filters.getByLabel('Entry status').selectOption('withdrawn');
  await expect(allCount).toHaveText('1');
  expect((await new AxeBuilder({ page }).include('.reg-entry-filters').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);

  await expect(filters.getByLabel('Category').locator(`option[value="${usedCategoryId}"]`)).toHaveText(`${used.timingCode} ${used.name} (archived)`);
  await filters.getByLabel('Entry status').selectOption('');
  await filters.getByLabel('Category').selectOption(usedCategoryId);
  await expect(allCount).toHaveText(String(orders.filter((o) => o.entries.some((e) => e.categoryId === usedCategoryId)).length));

  await filters.getByRole('button', { name: 'Clear entry filters' }).click();
  await expect(allCount).toHaveText(String(orders.length));
  await expect(filters.getByRole('button', { name: 'Clear entry filters' })).toHaveCount(0);

  // The demo riders all signed their waivers, so the missing-waiver filter finds none.
  await filters.getByLabel('Missing waiver or guardian signature').check();
  await expect(allCount).toHaveText('0');
  await page.setViewportSize({ width: 390, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
