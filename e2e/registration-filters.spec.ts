// @covers src/web/Registrations.tsx
// @covers src/shared/registrationFilters.ts
// @covers src/web/styles.css
// @covers src/server/app.ts
// @covers src/server/savedViews.ts
// @covers src/shared/exports.ts
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { parseCsv } from '../src/shared/csv';
import { sortRegistrations } from '../src/shared/registrationFilters';
import { expect, test } from './fixtures';
import { publishReviewed } from './support/publish';

type Entry = { id: string; dayId: string; categoryId: string; status: string; raceName: string };
type Order = { id: string; orderNumber: string; createdAt: string; rider: { firstName: string; lastName: string }; entries: Entry[] };

const byText = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base' });

/** Last name, then first name, then order number, then id. Same rule for the list and the entries file. */
function orderedBy(orders: readonly Order[], sort: 'newest' | 'oldest' | 'name' | 'order'): Order[] {
  const tie = (a: Order, b: Order) => byText(a.orderNumber, b.orderNumber) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const compare = {
    newest: (a: Order, b: Order) => b.createdAt.localeCompare(a.createdAt) || tie(a, b),
    oldest: (a: Order, b: Order) => a.createdAt.localeCompare(b.createdAt) || tie(a, b),
    name: (a: Order, b: Order) => byText(a.rider.lastName, b.rider.lastName) || byText(a.rider.firstName, b.rider.firstName) || tie(a, b),
    order: tie,
  };
  return [...orders].sort(compare[sort]);
}

const isActiveEntry = (status: string) => status === 'held' || status === 'confirmed';

function withEntryStatus(orders: readonly Order[], entryStatus: 'active'): Order[] {
  return orders
    .filter((order) => order.entries.some((entry) => isActiveEntry(entry.status)))
    .map((order) => ({ ...order, entries: order.entries.filter((entry) => isActiveEntry(entry.status)) }));
}

async function expectRowOrder(rows: Locator, orders: readonly Order[]) {
  await expect(rows).toHaveCount(orders.length);
  const texts = await rows.allTextContents();
  orders.forEach((order, index) => {
    expect(texts[index]).toContain(`${order.rider.firstName} ${order.rider.lastName}`);
    expect(texts[index]).toContain(`order ${order.orderNumber}`);
  });
}

async function downloadView(page: Page, link: Locator) {
  const pending = page.waitForEvent('download');
  await link.click();
  const download = await pending;
  const [header, ...rows] = parseCsv(await readFile((await download.path())!, 'utf8'));
  return { filename: download.suggestedFilename(), header, rows };
}

/** A view file: orders in the screen's row order, and each order's entries by race name. */
function viewEntryRows(orders: readonly Order[], sort: 'newest' | 'oldest' | 'name' | 'order'): string[][] {
  return orderedBy(orders, sort).flatMap((order) =>
    [...order.entries]
      .sort((a, b) => a.raceName.localeCompare(b.raceName))
      .map((entry) => [order.orderNumber, order.rider.lastName, order.rider.firstName, entry.raceName]),
  );
}

/** The full entries file: every entry by rider, then race, ignoring the screen's row order. */
function riderEntryRows(orders: readonly Order[]): string[][] {
  return orders
    .flatMap((order) => order.entries.map((entry) => [order.orderNumber, order.rider.lastName, order.rider.firstName, entry.raceName]))
    .sort((a, b) => `${a[1]} ${a[2]} ${a[3]}`.localeCompare(`${b[1]} ${b[2]} ${b[3]}`));
}

function csvEntryRows(file: { header: string[]; rows: string[][] }): string[][] {
  const number = file.header.indexOf('order_number');
  const last = file.header.indexOf('last_name');
  const first = file.header.indexOf('first_name');
  const race = file.header.indexOf('race');
  return file.rows.map((row) => [row[number], row[last], row[first], row[race]]);
}

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

  // Sort by rider last name, then by order number; the rows follow the shared sort rule.
  const sortBy = filters.getByLabel('Sort by');
  await expect(sortBy).toHaveValue('newest');
  await sortBy.selectOption('name');
  await expect(rows.first()).toContainText(sortRegistrations(live, 'name')[0].orderNumber);
  await expect(rows.last()).toContainText(sortRegistrations(live, 'name').at(-1)!.orderNumber);
  await sortBy.selectOption('order');
  await expect(rows.first()).toContainText(sortRegistrations(live, 'order')[0].orderNumber);
  // A sort alone is enough to download the view in that order.
  await expect(filters.getByRole('link', { name: 'Download this view (CSV)' })).toHaveAttribute('href', /\?sort=order$/);
  // Clearing the entry filters keeps the row order.
  await filters.getByLabel('Entry status').selectOption('withdrawn');
  await filters.getByRole('button', { name: 'Clear entry filters' }).click();
  await expect(sortBy).toHaveValue('order');
  await sortBy.selectOption('newest');

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

  // While a save is running, the picker and Save view are disabled, so nothing can race it; it ends selected.
  await filters.getByLabel('View name').fill('Slow save');
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/saved-views', async (route) => {
    if (route.request().method() === 'POST') await held;
    await route.continue();
  });
  await filters.getByRole('button', { name: 'Save view' }).click();
  await expect(filters.getByRole('button', { name: 'Save view' })).toBeDisabled();
  release();
  await expect(filters.getByLabel('Saved view').locator('option:checked')).toHaveText('Slow save');
  await expect(filters.getByRole('button', { name: 'Save view' })).toBeEnabled();
  await page.unroute('**/saved-views');
  // With an existing view, the picker is disabled during a save too.
  await filters.getByLabel('Entry status').selectOption('cancelled');
  const held2 = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/saved-views', async (route) => {
    if (route.request().method() === 'POST') await held2;
    await route.continue();
  });
  await filters.getByLabel('View name').fill('Another');
  await filters.getByRole('button', { name: 'Save view' }).click();
  await expect(filters.getByLabel('Saved view')).toBeDisabled();
  release();
  await expect(filters.getByLabel('Saved view')).toBeEnabled();
  await page.unroute('**/saved-views');
  await expect(filters.getByLabel('Saved view').locator('option:checked')).toHaveText('Another');
  await filters.getByRole('button', { name: 'Delete view' }).click();
  await filters.getByLabel('Saved view').selectOption({ label: 'Slow save' });
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

test('a sort orders riders by last name, stays in a saved view, and is the view download', { tag: '@smoke' }, async ({ page }) => {
  const { eventId } = await (await page.request.post('/api/demo')).json();
  const eventUrl = `/api/events/${eventId}`;
  expect((await publishReviewed(page.request, eventUrl, { acknowledgeWarnings: true })).status()).toBe(200);
  expect((await page.request.post(`${eventUrl}/check-in-demo-riders`)).ok()).toBe(true);
  const { config } = await (await page.request.get(eventUrl)).json();
  const category = config.categories.find((item: { timingCode: string }) => item.timingCode === 'RR-M35-34');
  expect(category).toBeTruthy();
  // Aaron shares the demo riders' last name and sorts ahead of Alex by first name, whichever order number he draws.
  const created = await page.request.post(`/api/rider/events/${eventId}/orders`, { data: {
    clientRequestId: `sort-tie-${eventId}`,
    categoryIds: [category.id],
    rider: { firstName: 'Aaron', lastName: 'Demo', email: 'aaron.demo@example.test', team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Fictional Contact', phone: '555-555-0199' } },
    waiver: { version: config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Aaron Demo', signerRole: 'rider' },
  } });
  expect(created.status(), created.status() === 201 ? '' : await created.text()).toBe(201);
  const aaronId = (await created.json()).id as string;
  expect((await page.request.post(`/api/orders/${aaronId}/payment`, { data: { attemptId: `sort-tie-pay-${eventId}`, outcome: 'success' } })).ok()).toBe(true);
  const live = await (await page.request.get(`${eventUrl}/orders`)).json() as Order[];
  const aaron = live.find((order) => order.rider.firstName === 'Aaron' && order.rider.lastName === 'Demo');
  const alex = live.find((order) => order.rider.firstName === 'Alex' && order.rider.lastName === 'Demo');
  expect(aaron && alex).toBeTruthy();
  expect(live.filter((order) => byText(order.rider.lastName, 'Demo') === 0).length).toBeGreaterThan(1);

  await page.goto(`/#/events/${eventId}/registrations`);
  const filters = page.getByRole('group', { name: 'Narrow by entry' });
  const rows = page.getByRole('list', { name: 'Registrations', exact: true }).locator('> li');
  const sortBy = filters.getByLabel('Sort by');
  const viewDownload = () => filters.getByRole('link', { name: 'Download this view (CSV)' });

  await expect(sortBy).toHaveValue('newest');
  await expect(viewDownload()).toHaveCount(0);
  await expectRowOrder(rows, orderedBy(live, 'newest'));

  await sortBy.selectOption('name');
  const byName = orderedBy(live, 'name');
  await expectRowOrder(rows, byName);
  const shown = await rows.allTextContents();
  expect(shown.findIndex((text) => text.includes('Aaron Demo'))).toBeLessThan(shown.findIndex((text) => text.includes('Alex Demo')));
  await expect(viewDownload()).toHaveAttribute('href', /\?sort=name$/);
  // A sort is not a filter, so it cannot be saved on its own.
  await expect(filters.getByRole('button', { name: 'Save view' })).toHaveCount(0);

  await page.getByLabel('Find a registration').fill('Aaron');
  await expect(viewDownload()).toHaveCount(0);
  await expect(filters).toContainText('Clear the search and choose All to download this view.');
  await page.getByLabel('Find a registration').fill('');
  await expect(sortBy).toHaveValue('name');
  await expect(viewDownload()).toBeVisible();

  await sortBy.selectOption('oldest');
  await expectRowOrder(rows, orderedBy(live, 'oldest'));
  await sortBy.selectOption('order');
  await expectRowOrder(rows, orderedBy(live, 'order'));
  await sortBy.selectOption('name');

  const active = withEntryStatus(live, 'active');
  await filters.getByLabel('Entry status').selectOption('active');
  await expectRowOrder(rows, orderedBy(active, 'name'));
  await filters.getByLabel('View name').fill('Active by last name');
  await filters.getByRole('button', { name: 'Save view' }).click();
  await expect(filters.getByLabel('Saved view').locator('option:checked')).toHaveText('Active by last name');
  // A different row order is a different view, so the saved one drops away until it is applied again.
  await sortBy.selectOption('oldest');
  await expect(filters.getByLabel('Saved view')).toHaveValue('');
  await expectRowOrder(rows, orderedBy(active, 'oldest'));

  await page.reload();
  await filters.getByLabel('Saved view').selectOption({ label: 'Active by last name' });
  await expect(sortBy).toHaveValue('name');
  await expect(filters.getByLabel('Entry status')).toHaveValue('active');
  await expectRowOrder(rows, orderedBy(active, 'name'));
  await expect(viewDownload()).toHaveAttribute('href', /entryStatus=active&sort=name$/);
  const filtered = await downloadView(page, viewDownload());
  expect(filtered.filename).toContain('entries');
  expect(filtered.filename).toContain('filtered');
  const last = filtered.header.indexOf('last_name');
  const first = filtered.header.indexOf('first_name');
  const number = filtered.header.indexOf('order_number');
  const namesOf = (orders: readonly Order[]) => orders.flatMap((order) => order.entries.map(() => [order.rider.lastName, order.rider.firstName, order.orderNumber]));
  expect(filtered.rows.map((row) => [row[last], row[first], row[number]])).toEqual(namesOf(orderedBy(active, 'name')));

  await filters.getByRole('button', { name: 'Clear entry filters' }).click();
  await expect(sortBy).toHaveValue('name');
  await expect(filters.getByLabel('Entry status')).toHaveValue('');
  await expect(filters.getByRole('button', { name: 'Save view' })).toHaveCount(0);
  await expect(viewDownload()).toHaveAttribute('href', /\?sort=name$/);
  const sortedOnly = await downloadView(page, viewDownload());
  expect(sortedOnly.filename).toContain('filtered');
  const onlyLast = sortedOnly.header.indexOf('last_name');
  const onlyFirst = sortedOnly.header.indexOf('first_name');
  const onlyNumber = sortedOnly.header.indexOf('order_number');
  expect(sortedOnly.rows.map((row) => [row[onlyLast], row[onlyFirst], row[onlyNumber]])).toEqual(namesOf(byName));
  // The file follows the order-number rule, checked against the shared sort.
  await sortBy.selectOption('order');
  await expect(viewDownload()).toHaveAttribute('href', /\?sort=order$/);
  await expectRowOrder(rows, orderedBy(live, 'order'));
  const orderedFile = await downloadView(page, viewDownload());
  expect(orderedFile.filename).toContain('entries');
  expect(orderedFile.filename).toContain('filtered');
  const orderNumber = orderedFile.header.indexOf('order_number');
  const seen: string[] = [];
  for (const row of orderedFile.rows) if (seen.at(-1) !== row[orderNumber]) seen.push(row[orderNumber]);
  expect(seen).toEqual(orderedBy(live, 'order').map((order) => order.orderNumber));
});

test('the full entries file stays in rider order and an explicit newest sort is the screen order', { tag: '@smoke' }, async ({ page }) => {
  const { eventId } = await (await page.request.post('/api/demo')).json();
  const eventUrl = `/api/events/${eventId}`;
  expect((await publishReviewed(page.request, eventUrl, { acknowledgeWarnings: true })).status()).toBe(200);
  expect((await page.request.post(`${eventUrl}/check-in-demo-riders`)).ok()).toBe(true);
  const { config } = await (await page.request.get(eventUrl)).json();
  const road = config.categories.find((item: { timingCode: string }) => item.timingCode === 'RR-M35-34');
  const crit = config.categories.find((item: { timingCode: string }) => item.timingCode === 'CR-M35-34');
  expect(road && crit).toBeTruthy();
  // Crit is stored first. Race names sort the road race ahead of it, so the file order is not the stored entry order.
  const created = await page.request.post(`/api/rider/events/${eventId}/orders`, { data: {
    clientRequestId: `sort-newest-${eventId}`,
    categoryIds: [crit.id, road.id],
    rider: { firstName: 'Zoe', lastName: 'Young', email: 'zoe.young@example.test', team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Fictional Contact', phone: '555-555-0199' } },
    waiver: { version: config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Zoe Young', signerRole: 'rider' },
  } });
  expect(created.status(), created.status() === 201 ? '' : await created.text()).toBe(201);
  const zoeId = (await created.json()).id as string;
  expect((await page.request.post(`/api/orders/${zoeId}/payment`, { data: { attemptId: `sort-newest-pay-${eventId}`, outcome: 'success' } })).ok()).toBe(true);
  const live = await (await page.request.get(`${eventUrl}/orders`)).json() as Order[];
  const zoe = live.find((order) => order.id === zoeId);
  expect(zoe).toBeTruthy();
  const storedRaces = zoe!.entries.map((entry) => entry.raceName);
  const racesByName = [...storedRaces].sort((a, b) => a.localeCompare(b));
  expect(storedRaces).toHaveLength(2);
  expect(storedRaces).not.toEqual(racesByName);
  expect(orderedBy(live, 'newest')[0].id).toBe(zoeId);

  await page.goto(`/#/events/${eventId}/registrations`);
  const filters = page.getByRole('group', { name: 'Narrow by entry' });
  const rows = page.getByRole('list', { name: 'Registrations', exact: true }).locator('> li');
  await expect(filters.getByLabel('Sort by')).toHaveValue('newest');
  await expect(filters.getByRole('link', { name: 'Download this view (CSV)' })).toHaveCount(0);
  await expectRowOrder(rows, orderedBy(live, 'newest'));

  const full = await downloadView(page, page.getByRole('link', { name: 'Download entries (CSV)' }));
  expect(full.filename).toContain('entries');
  expect(full.filename).not.toContain('filtered');
  const fullRows = csvEntryRows(full);
  expect(fullRows).toEqual(riderEntryRows(live));
  expect(fullRows[0][0]).not.toBe(zoe!.orderNumber);

  const newestRes = await page.request.get(`${eventUrl}/exports/entries.csv?sort=newest`);
  expect(newestRes.ok()).toBe(true);
  expect(newestRes.headers()['x-cyclereg-export-filters']).toBe('sort=newest');
  expect(newestRes.headers()['content-disposition']).toContain('-filtered');
  const [header, ...newestRows] = parseCsv(await newestRes.text());
  const newest = csvEntryRows({ header, rows: newestRows });
  expect(newest).toEqual(viewEntryRows(live, 'newest'));
  expect(newest[0][0]).toBe(zoe!.orderNumber);
  expect(newest.filter((row) => row[0] === zoe!.orderNumber).map((row) => row[3])).toEqual(racesByName);
});
