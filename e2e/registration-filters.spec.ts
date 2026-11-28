// @covers src/web/Registrations.tsx
// @covers src/shared/registrationFilters.ts
// @covers src/web/styles.css
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';
import { publishReviewed } from './support/publish';

type Entry = { id: string; dayId: string; categoryId: string; status: string };
type Order = { orderNumber: string; entries: Entry[] };

test('organizers narrow registrations by race day, category, entry status and missing waiver', { tag: '@smoke' }, async ({ page }) => {
  const { eventId } = await (await page.request.post('/api/demo')).json();
  const eventUrl = `/api/events/${eventId}`;
  expect((await publishReviewed(page.request, eventUrl, { acknowledgeWarnings: true })).status()).toBe(200);
  expect((await page.request.post(`${eventUrl}/check-in-demo-riders`)).ok()).toBe(true);
  const { config } = await (await page.request.get(eventUrl)).json();
  const orders = await (await page.request.get(`${eventUrl}/orders`)).json() as Order[];
  const sunday = config.days.find((d: { label: string }) => d.label === 'Sunday');
  const expectedSunday = orders.filter((o) => o.entries.some((e) => e.dayId === sunday.id)).length;
  // Withdraw one entry on an order that still has another active entry. That order matches both filters.
  const target = orders.find((o) => o.entries.filter((e) => e.status === 'confirmed').length >= 2);
  expect(target).toBeTruthy();
  const entryId = target!.entries.find((e) => e.status === 'confirmed')!.id;
  expect((await page.request.post(`/api/order-entries/${entryId}/withdraw`, { data: { reason: 'Fictional withdrawal for the filter test' } })).ok()).toBe(true);
  const live = await (await page.request.get(`${eventUrl}/orders`)).json() as Order[];
  const expectedActive = live.filter((o) => o.entries.some((e) => e.status === 'held' || e.status === 'confirmed')).length;
  const withdrawnOrder = live.find((o) => o.entries.some((e) => e.id === entryId))!;
  expect(withdrawnOrder.entries.some((e) => e.status === 'held' || e.status === 'confirmed')).toBe(true);

  // Archive a category that still has registrations; it must stay filterable.
  // An archived category nobody entered must leave the list.
  const usedCategoryId = orders.flatMap((o) => o.entries)[0].categoryId;
  const usedIds = new Set(orders.flatMap((o) => o.entries.map((e) => e.categoryId)));
  const current = await (await page.request.get(eventUrl)).json();
  const archived = structuredClone(current.config);
  const used = archived.categories.find((c: { id: string }) => c.id === usedCategoryId);
  used.status = 'archived';
  // A very long category name must not widen the page on a phone.
  const other = archived.categories.find((c: { id: string; status: string }) => c.id !== usedCategoryId && c.status !== 'archived');
  other.name = 'Masters 35 plus Category 3 and 4 combined field with a deliberately very long fictional name';
  const unused = archived.categories.find((c: { id: string; status: string }) => c.id !== usedCategoryId && c.id !== other.id && c.status !== 'archived' && !usedIds.has(c.id));
  expect(unused).toBeTruthy();
  unused.status = 'archived';
  expect((await page.request.put(`${eventUrl}/config`, { data: { config: archived, revision: current.revision } })).ok()).toBe(true);
  expect((await publishReviewed(page.request, eventUrl, { acknowledgeWarnings: true, acknowledgeImpact: true })).status()).toBe(200);

  await page.goto(`/#/events/${eventId}/registrations`);
  const filters = page.getByRole('group', { name: 'Narrow by entry' });
  const rows = page.getByRole('list', { name: 'Registrations', exact: true }).locator('> li');
  const allCount = page.getByRole('group', { name: 'Show registrations' }).getByRole('button', { name: /^All/ }).locator('.num');
  await expect(allCount).toHaveText(String(orders.length));

  await filters.getByLabel('Race day').selectOption(sunday.id);
  await expect(allCount).toHaveText(String(expectedSunday));

  // Day and category apply to the same entry. A rider in both days is not a Sunday entry in a Saturday category.
  const bothDays = orders.find((o) => new Set(o.entries.map((e) => e.dayId)).size > 1);
  expect(bothDays).toBeTruthy();
  const saturdayCategoryId = bothDays!.entries.find((e) => e.dayId !== sunday.id)!.categoryId;
  const sundayCategoryId = bothDays!.entries.find((e) => e.dayId === sunday.id)!.categoryId;
  await filters.getByLabel('Category').selectOption(saturdayCategoryId);
  await expect(allCount).toHaveText('0');
  await expect(rows).toHaveCount(0);
  await filters.getByLabel('Category').selectOption(sundayCategoryId);
  await expect(allCount).toHaveText(String(orders.filter((o) => o.entries.some((e) => e.dayId === sunday.id && e.categoryId === sundayCategoryId)).length));
  await filters.getByLabel('Category').selectOption('');

  await filters.getByLabel('Race day').selectOption('');
  await filters.getByLabel('Entry status').selectOption('withdrawn');
  await expect(allCount).toHaveText('1');
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText(withdrawnOrder.orderNumber);
  await filters.getByLabel('Entry status').selectOption('active');
  await expect(allCount).toHaveText(String(expectedActive));
  await expect(page.getByRole('list', { name: 'Registrations', exact: true })).toContainText(withdrawnOrder.orderNumber);
  await filters.getByLabel('Entry status').selectOption('cancelled');
  await expect(allCount).toHaveText('0');
  await filters.getByLabel('Entry status').selectOption('withdrawn');
  expect((await new AxeBuilder({ page }).include('.reg-entry-filters').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);

  await expect(filters.getByLabel('Category').locator(`option[value="${usedCategoryId}"]`)).toHaveText(`${used.timingCode} ${used.name} (archived)`);
  await expect(filters.getByLabel('Category').locator(`option[value="${unused.id}"]`)).toHaveCount(0);
  await filters.getByLabel('Entry status').selectOption('');
  await filters.getByLabel('Category').selectOption(usedCategoryId);
  await expect(allCount).toHaveText(String(orders.filter((o) => o.entries.some((e) => e.categoryId === usedCategoryId)).length));

  // Save the withdrawn view, reload, and apply it again from Saved view.
  await filters.getByLabel('Category').selectOption('');
  await filters.getByLabel('Entry status').selectOption('withdrawn');
  await filters.getByLabel('View name').fill('Withdrawn riders');
  await filters.getByRole('button', { name: 'Save view' }).click();
  await expect(filters.getByLabel('Saved view').locator('option', { hasText: 'Withdrawn riders' })).toHaveCount(1);
  await page.reload();
  await expect(allCount).toHaveText(String(orders.length));
  await filters.getByLabel('Saved view').selectOption({ label: 'Withdrawn riders' });
  await expect(allCount).toHaveText('1');
  await expect(filters.getByLabel('Entry status')).toHaveValue('withdrawn');
  // Changing a filter deselects the view; choosing it again re-applies it.
  await filters.getByLabel('Entry status').selectOption('');
  await expect(filters.getByLabel('Saved view')).toHaveValue('');
  await filters.getByLabel('Saved view').selectOption({ label: 'Withdrawn riders' });
  await expect(filters.getByLabel('Entry status')).toHaveValue('withdrawn');
  await filters.getByRole('button', { name: 'Delete view' }).click();
  await expect(filters.getByLabel('Saved view')).toHaveCount(0);

  // Two views with the same filters: picking the second keeps it selected, and Delete view removes that one.
  await filters.getByLabel('View name').fill('First copy');
  await filters.getByRole('button', { name: 'Save view' }).click();
  await filters.getByLabel('View name').fill('Second copy');
  await filters.getByRole('button', { name: 'Save view' }).click();
  await filters.getByLabel('Saved view').selectOption({ label: 'Second copy' });
  await expect(filters.getByLabel('Saved view').locator('option:checked')).toHaveText('Second copy');
  // Choosing no view stays on no view even though both views match the filters.
  await filters.getByLabel('Saved view').selectOption('');
  await expect(filters.getByLabel('Saved view')).toHaveValue('');
  await expect(filters.getByRole('button', { name: 'Delete view' })).toHaveCount(0);
  await filters.getByLabel('Saved view').selectOption({ label: 'Second copy' });
  await filters.getByRole('button', { name: 'Delete view' }).click();
  await expect(filters.getByLabel('Saved view').locator('option')).toHaveText(['Choose a view', 'First copy']);
  await filters.getByLabel('Saved view').selectOption({ label: 'First copy' });
  await filters.getByRole('button', { name: 'Delete view' }).click();
  await expect(filters.getByLabel('Saved view')).toHaveCount(0);

  // Picking a view while a save of new filters over it is still running ends on the saved filters, still selected.
  await filters.getByLabel('Entry status').selectOption('withdrawn');
  await filters.getByLabel('View name').fill('Slow save');
  await filters.getByRole('button', { name: 'Save view' }).click();
  await expect(filters.getByLabel('Saved view').locator('option', { hasText: 'Slow save' })).toHaveCount(1);
  await filters.getByLabel('Entry status').selectOption('cancelled');
  let release!: () => void;
  let held = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/saved-views', async (route) => {
    if (route.request().method() === 'POST') await held;
    await route.continue();
  });
  await filters.getByRole('button', { name: 'Save view' }).click();
  await filters.getByLabel('Saved view').selectOption({ label: 'Slow save' });
  await expect(filters.getByLabel('Entry status')).toHaveValue('withdrawn');
  release();
  await expect(filters.getByLabel('Entry status')).toHaveValue('cancelled');
  await expect(filters.getByLabel('Saved view').locator('option:checked')).toHaveText('Slow save');
  // A filter edit made after the re-pick wins over the late save.
  held = new Promise<void>((resolve) => { release = resolve; });
  await filters.getByLabel('Entry status').selectOption('withdrawn');
  await filters.getByRole('button', { name: 'Save view' }).click();
  await filters.getByLabel('Saved view').selectOption({ label: 'Slow save' });
  await expect(filters.getByLabel('Entry status')).toHaveValue('cancelled');
  await filters.getByLabel('Entry status').selectOption('active');
  const lateSave = page.waitForResponse((r) => r.url().endsWith('/saved-views') && r.request().method() === 'POST');
  release();
  await lateSave;
  // Let the screen handle the response before checking that the edit survived.
  await expect(filters.getByLabel('Saved view').locator('option', { hasText: 'Slow save' })).toHaveCount(1);
  await page.waitForTimeout(200);
  await expect(filters.getByLabel('Entry status')).toHaveValue('active');
  await expect(filters.getByLabel('Saved view')).toHaveValue('');
  await filters.getByLabel('Saved view').selectOption({ label: 'Slow save' });
  await page.unroute('**/saved-views');
  await filters.getByRole('button', { name: 'Delete view' }).click();
  await expect(filters.getByLabel('Saved view')).toHaveCount(0);

  // Clear entry filters resets every filter, category included.
  await filters.getByLabel('Category').selectOption(usedCategoryId);
  await filters.getByRole('button', { name: 'Clear entry filters' }).click();
  await expect(filters.getByLabel('Category')).toHaveValue('');
  await expect(filters.getByLabel('Entry status')).toHaveValue('');
  await expect(allCount).toHaveText(String(orders.length));
  await expect(filters.getByRole('button', { name: 'Clear entry filters' })).toHaveCount(0);

  await page.getByLabel('Find a registration').fill('zzzz-not-a-rider');
  await expect(allCount).toHaveText('0');
  await expect(page.getByRole('status').filter({ hasText: 'registrations match' })).toHaveText('0 registrations match “zzzz-not-a-rider”.');
  await page.getByLabel('Find a registration').fill('');
  await expect(allCount).toHaveText(String(orders.length));

  // The demo riders all signed their waivers, so the missing-waiver filter finds none.
  await filters.getByLabel('Missing waiver or guardian signature').check();
  await expect(allCount).toHaveText('0');
  await page.setViewportSize({ width: 390, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await filters.getByLabel('Missing waiver or guardian signature').uncheck();
  await expect(allCount).toHaveText(String(orders.length));
  await expect(filters.getByRole('button', { name: 'Clear entry filters' })).toHaveCount(0);
});
