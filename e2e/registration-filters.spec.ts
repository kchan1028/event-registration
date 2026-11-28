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
import { ENTRY_COLUMNS } from '../src/shared/exports';
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
  // Leaving a column out narrows the download; the order and rider ids cannot be left out; ticking it again restores all.
  await filters.locator('summary', { hasText: 'Columns in the download' }).click();
  await expect(filters.getByRole('checkbox', { name: /^order_number/ })).toBeDisabled();
  await filters.getByRole('checkbox', { name: 'team', exact: true }).uncheck();
  await expect(filters.getByRole('link', { name: 'Download this view (CSV)' })).toHaveAttribute('href', /columns=order_number%2Crider_id%2Clast_name%2Cfirst_name%2Cracing_age/);
  await filters.getByRole('checkbox', { name: 'team', exact: true }).check();
  await expect(filters.getByRole('link', { name: 'Download this view (CSV)' })).toHaveAttribute('href', /\?sort=order$/);
  await filters.locator('summary', { hasText: 'Columns in the download' }).click();
  // A saved view whose columns leave out the ids still downloads them after its last optional column is unticked.
  expect((await page.request.post(`${eventUrl}/saved-views`, { data: { name: 'Team only', filter: { entryStatus: 'withdrawn', columns: ['team'] } } })).ok()).toBe(true);
  await page.reload();
  await filters.getByLabel('Saved view').selectOption({ label: 'Team only' });
  await filters.locator('summary', { hasText: 'Columns in the download' }).click();
  await filters.getByRole('checkbox', { name: 'team', exact: true }).uncheck();
  await expect(filters.getByRole('link', { name: 'Download this view (CSV)' })).toHaveAttribute('href', /columns=order_number%2Crider_id$/);
  // Ticking it again matches the saved view's columns, so the view shows as selected again.
  await filters.getByRole('checkbox', { name: 'team', exact: true }).check();
  await expect(filters.getByLabel('Saved view').locator('option:checked')).toHaveText('Team only');
  await filters.locator('summary', { hasText: 'Columns in the download' }).click();
  await page.request.get(`${eventUrl}/saved-views`).then(async (r) => {
    for (const v of await r.json() as { id: string }[]) await page.request.delete(`${eventUrl}/saved-views/${v.id}`);
  });
  // Start again from a fresh screen with the order-number sort the next steps expect.
  await page.reload();
  await sortBy.selectOption('order');
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

test('chosen download columns stay in the file and in a saved view, and clearing filters keeps them', { tag: '@smoke' }, async ({ page, browser, baseURL }) => {
  const { eventId, organizationId } = await (await page.request.post('/api/demo')).json();
  const eventUrl = `/api/events/${eventId}`;
  expect((await publishReviewed(page.request, eventUrl, { acknowledgeWarnings: true })).status()).toBe(200);
  expect((await page.request.post(`${eventUrl}/check-in-demo-riders`)).ok()).toBe(true);
  const before = await (await page.request.get(`${eventUrl}/orders`)).json() as Order[];
  const target = before.find((order) => order.entries.filter((entry) => entry.status === 'confirmed').length >= 2);
  expect(target).toBeTruthy();
  const entryId = target!.entries.find((entry) => entry.status === 'confirmed')!.id;
  expect((await page.request.post(`/api/order-entries/${entryId}/withdraw`, { data: { reason: 'Fictional withdrawal for the column test' } })).ok()).toBe(true);
  const live = await (await page.request.get(`${eventUrl}/orders`)).json() as Order[];
  const entries = live.flatMap((order) => order.entries);
  const activeEntries = entries.filter((entry) => entry.status === 'held' || entry.status === 'confirmed');
  expect(entries.length).toBeGreaterThan(activeEntries.length);

  await page.goto(`/#/events/${eventId}/registrations`);
  const filters = page.getByRole('group', { name: 'Narrow by entry' });
  const summary = filters.locator('summary', { hasText: 'Columns in the download' });
  const viewDownload = () => filters.getByRole('link', { name: 'Download this view (CSV)' });
  const allCount = page.getByRole('group', { name: 'Show registrations' }).getByRole('button', { name: /^All/ }).locator('.num');
  // The checkboxes are not in the page until the list is opened.
  await expect(summary).toHaveText('Columns in the download');
  await expect(filters.getByRole('checkbox', { name: 'team', exact: true })).toHaveCount(0);
  await expect(filters.getByRole('checkbox', { name: 'order_number (always included)', exact: true })).toHaveCount(0);
  await summary.click();
  await expect(filters.getByRole('checkbox', { name: 'order_number (always included)', exact: true })).toBeDisabled();
  await expect(filters.getByRole('checkbox', { name: 'order_number (always included)', exact: true })).toBeChecked();
  await expect(filters.getByRole('checkbox', { name: 'rider_id (always included)', exact: true })).toBeDisabled();
  await expect(filters.getByRole('checkbox', { name: 'rider_id (always included)', exact: true })).toBeChecked();
  expect((await new AxeBuilder({ page }).include('.reg-columns').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);

  // Untick in an order that is not the file order. The link and the file stay in the usual column order.
  const kept = ENTRY_COLUMNS.filter((column) => column !== 'team' && column !== 'amount_paid');
  const encoded = kept.join('%2C');
  await filters.getByRole('checkbox', { name: 'amount_paid', exact: true }).uncheck();
  await filters.getByRole('checkbox', { name: 'team', exact: true }).uncheck();
  await expect(summary).toHaveText(`Columns in the download (${kept.length} of ${ENTRY_COLUMNS.length})`);
  await expect(viewDownload()).toHaveAttribute('href', new RegExp(`\\?columns=${encoded}$`));
  await page.setViewportSize({ width: 390, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.setViewportSize({ width: 1440, height: 900 });

  const narrowed = await downloadView(page, viewDownload());
  expect(narrowed.filename).toContain('entries');
  expect(narrowed.filename).toContain('filtered');
  expect(narrowed.header).toEqual([...kept]);
  expect(narrowed.rows).toHaveLength(entries.length);
  expect(narrowed.rows[0][narrowed.header.indexOf('order_number')]).toBe(sortRegistrations(live, 'newest')[0].orderNumber);
  expect(narrowed.rows.every((row) => row[narrowed.header.indexOf('rider_id')] !== '')).toBe(true);
  expect(narrowed.rows.filter((row) => row[narrowed.header.indexOf('entry_status')] === 'withdrawn').length).toBeGreaterThan(0);
  const href = (await viewDownload().getAttribute('href'))!;
  const exported = await page.request.get(href);
  expect(exported.ok()).toBe(true);
  expect(exported.headers()['x-cyclereg-export-filters']).toBe(`columns=${encoded}`);
  expect(parseCsv(await exported.text())[0]).toEqual([...kept]);
  expect((await page.request.get(`${eventUrl}/exports/entries.csv?columns=emergency_contact`)).status()).toBe(400);

  // Columns are not an entry filter, so Clear stays hidden until a filter is set, and then leaves the columns in place.
  await expect(filters.getByRole('button', { name: 'Clear entry filters' })).toHaveCount(0);
  await filters.getByLabel('Entry status').selectOption('active');
  await expect(viewDownload()).toHaveAttribute('href', new RegExp(`entryStatus=active&columns=${encoded}$`));
  await filters.getByRole('button', { name: 'Clear entry filters' }).click();
  await expect(filters.getByLabel('Entry status')).toHaveValue('');
  await expect(filters.getByLabel('Sort by')).toHaveValue('newest');
  await expect(allCount).toHaveText(String(live.length));
  await expect(filters.getByRole('checkbox', { name: 'team', exact: true })).not.toBeChecked();
  await expect(filters.getByRole('checkbox', { name: 'amount_paid', exact: true })).not.toBeChecked();
  await expect(viewDownload()).toHaveAttribute('href', new RegExp(`\\?columns=${encoded}$`));
  await expect(filters.getByRole('button', { name: 'Clear entry filters' })).toHaveCount(0);

  await filters.getByLabel('Entry status').selectOption('active');
  await filters.getByLabel('View name').fill('Active columns');
  await filters.getByRole('button', { name: 'Save view' }).click();
  await expect(filters.getByLabel('Saved view').locator('option:checked')).toHaveText('Active columns');
  await filters.getByRole('checkbox', { name: 'racing_age', exact: true }).uncheck();
  await expect(filters.getByLabel('Saved view')).toHaveValue('');
  await filters.getByRole('checkbox', { name: 'racing_age', exact: true }).check();
  await expect(filters.getByLabel('Saved view').locator('option:checked')).toHaveText('Active columns');
  await page.reload();
  await filters.getByLabel('Saved view').selectOption({ label: 'Active columns' });
  await expect(filters.getByLabel('Entry status')).toHaveValue('active');
  await summary.click();
  await expect(summary).toHaveText(`Columns in the download (${kept.length} of ${ENTRY_COLUMNS.length})`);
  await expect(filters.getByRole('checkbox', { name: 'team', exact: true })).not.toBeChecked();
  await expect(filters.getByRole('checkbox', { name: 'amount_paid', exact: true })).not.toBeChecked();
  const saved = await downloadView(page, viewDownload());
  expect(saved.header).toEqual([...kept]);
  expect(saved.rows).toHaveLength(activeEntries.length);
  expect(saved.rows.every((row) => row[saved.header.indexOf('entry_status')] !== 'withdrawn')).toBe(true);

  // A saved view that left the ids out still downloads them, in the usual column order, ahead of the chosen columns.
  expect((await page.request.post(`${eventUrl}/saved-views`, { data: { name: 'Ids left out', filter: { entryStatus: 'active', columns: ['category', 'last_name'] } } })).ok()).toBe(true);
  await page.reload();
  await filters.getByLabel('Saved view').selectOption({ label: 'Ids left out' });
  await summary.click();
  await expect(summary).toHaveText(`Columns in the download (4 of ${ENTRY_COLUMNS.length})`);
  await expect(filters.getByRole('checkbox', { name: 'order_number (always included)', exact: true })).toBeChecked();
  await expect(filters.getByRole('checkbox', { name: 'order_number (always included)', exact: true })).toBeDisabled();
  await expect(filters.getByRole('checkbox', { name: 'rider_id (always included)', exact: true })).toBeChecked();
  await expect(filters.getByRole('checkbox', { name: 'last_name', exact: true })).toBeChecked();
  await expect(filters.getByRole('checkbox', { name: 'category', exact: true })).toBeChecked();
  await expect(filters.getByRole('checkbox', { name: 'team', exact: true })).not.toBeChecked();
  await expect(viewDownload()).toHaveAttribute('href', /entryStatus=active&columns=category%2Clast_name$/);
  const omittedHref = (await viewDownload().getAttribute('href'))!;
  const omitted = await downloadView(page, viewDownload());
  expect(omitted.header).toEqual(['order_number', 'rider_id', 'last_name', 'category']);
  expect(omitted.rows).toHaveLength(activeEntries.length);
  expect(omitted.rows.every((row) => row[2] !== '' && row[3] !== '')).toBe(true);
  const omittedExport = await page.request.get(omittedHref);
  expect(omittedExport.headers()['x-cyclereg-export-filters']).toBe('entryStatus=active&columns=category%2Clast_name');

  const email = `columns-finance-${eventId}@example.test`;
  const financeContext = await browser.newContext({ baseURL, extraHTTPHeaders: { Authorization: `Bearer test:${email}` } });
  try {
    await financeContext.request.get('/api/me');
    expect((await page.request.post(`/api/organizations/${organizationId}/members`, { data: { email, role: 'finance' } })).ok()).toBe(true);
    const finance = await financeContext.newPage();
    await finance.addInitScript((address) => sessionStorage.setItem('cyclereg.test-session', address), email);
    await finance.goto(`/#/events/${eventId}/registrations`);
    const financeFilters = finance.getByRole('group', { name: 'Narrow by entry' });
    await expect(financeFilters.getByLabel('Sort by')).toBeVisible();
    await expect(financeFilters.locator('summary', { hasText: 'Columns in the download' })).toHaveCount(0);
    await expect(finance.getByRole('link', { name: 'Download entries (CSV)' })).toHaveCount(0);
    expect((await financeContext.request.get(`${eventUrl}/exports/entries.csv?columns=last_name`)).status()).toBe(403);
  } finally {
    await financeContext.close();
  }
});
