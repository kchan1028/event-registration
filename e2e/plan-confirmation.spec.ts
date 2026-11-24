import AxeBuilder from '@axe-core/playwright';
import type { Locator } from '@playwright/test';
import { expect, test, type Page } from './fixtures';
import type { CancellationConfirmation, CancellationConfirmationInput } from '../src/shared/cancellations';
import { publishReviewed } from './support/publish';

async function setup(page: Page, pay = true) {
  const { eventId, organizationId } = await (await page.request.post('/api/demo')).json();
  const event = await (await page.request.get(`/api/events/${eventId}`)).json();
  expect((await publishReviewed(page.request, `/api/events/${eventId}`, { acknowledgeWarnings: true })).status()).toBe(200);
  let order: { id: string } | null = null;
  if (pay) {
    const rider = { firstName: 'Review', lastName: 'Fictional', email: 'review@plan.test', team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Fictional Contact', phone: '555-555-0199' } };
    const created = await page.request.post(`/api/rider/events/${eventId}/orders`, { data: { clientRequestId: `plan-screen-${eventId}`, categoryIds: [event.config.categories.find((c: { timingCode: string }) => c.timingCode === 'RR-M35-34').id], rider, waiver: { version: event.config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Review Fictional', signerRole: 'rider' } } });
    expect(created.status()).toBe(201); order = await created.json();
    expect((await page.request.post(`/api/orders/${order!.id}/payment`, { data: { attemptId: `plan-screen-payment-${eventId}`, outcome: 'success' } })).status()).toBe(200);
  }
  await page.goto(`/#/events/${eventId}/registrations`);
  const preview = page.getByRole('region', { name: 'Cancellation preview', exact: true });
  const confirmation = page.getByRole('region', { name: 'Reviewed plan confirmation', exact: true });
  return { eventId, organizationId, order, preview, confirmation,
    load: () => preview.getByRole('button', { name: 'Preview cancellation impact', exact: true }).click(),
    fill: async (reason = 'Fictional weather plan review') => {
      await confirmation.getByLabel('Reason for the reviewed plan').fill(reason);
      await confirmation.getByRole('checkbox').check();
    },
  };
}

async function inspectState(page: Page, region: Locator, state: string) {
  for (const theme of ['light', 'dark']) {
    const toggle = page.getByRole('button', { name: /^Theme: / });
    if (await toggle.getAttribute('data-current') !== theme) await toggle.click();
    await expect(toggle).toHaveAttribute('data-current', theme);
    for (const width of [360, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.setViewportSize({ width, height: 3000 });
      await region.screenshot({ path: `test-results/plan-confirmation-${state}-${theme}-${width}.png` });
    }
    expect((await new AxeBuilder({ page }).include('[aria-label="Reviewed plan confirmation"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  }
}

test('records only acknowledged plans and recovers a committed lost response across refresh', async ({ page }) => {
  const s = await setup(page); const posts: CancellationConfirmationInput[] = []; let financialPosts = 0;
  let release!: () => void; let captured!: () => void; let saved!: CancellationConfirmation;
  const gate = new Promise<void>((r) => { release = r; }); const ready = new Promise<void>((r) => { captured = r; });
  await page.route(`**/api/events/${s.eventId}/cancellation-confirmations`, async (route) => {
    posts.push(route.request().postDataJSON());
    if (posts.length === 1) { const response = await route.fetch(); expect(response.status()).toBe(200); saved = await response.json(); captured(); await gate; return route.abort('failed'); }
    return route.continue();
  });
  page.on('request', (r) => { if (r.method() === 'POST' && /\/(refunds|payment|checkout|retry)$/.test(r.url())) financialPosts++; });
  await s.load();
  await s.confirmation.getByLabel('Reason for the reviewed plan').fill('Fictional weather plan review');
  await s.confirmation.getByRole('button', { name: 'Record plan confirmation' }).click();
  await expect(s.confirmation.getByRole('alert')).toContainText('Acknowledge'); expect(posts).toHaveLength(0);
  await expect(s.confirmation.getByRole('checkbox')).toHaveAttribute('aria-invalid', 'true');
  await expect(s.confirmation.getByRole('checkbox')).toHaveAccessibleDescription('Acknowledge that this records a plan only.');
  await s.fill('ab'); await s.confirmation.getByRole('button', { name: 'Record plan confirmation' }).click();
  await expect(s.confirmation.getByRole('alert')).toContainText('3 to 300'); expect(posts).toHaveLength(0);
  await expect(s.confirmation.getByLabel('Reason for the reviewed plan')).toHaveAttribute('aria-invalid', 'true');
  await expect(s.confirmation.getByLabel('Reason for the reviewed plan')).toHaveAccessibleDescription('Write a reason of 3 to 300 characters.');
  await s.fill();
  await inspectState(page, s.confirmation, 'form');
  await s.confirmation.getByRole('button', { name: 'Record plan confirmation' }).click(); await ready;
  const retry = s.confirmation.getByRole('button', { name: 'Retry original plan confirmation' });
  await expect(retry).toHaveAttribute('aria-disabled', 'true'); await retry.focus(); await page.keyboard.press('Enter'); expect(posts).toHaveLength(1);
  await expect(s.preview.getByLabel('Cancellation scope', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: /^Withdraw RR-M35-34 / }).click();
  await page.getByLabel('Reason for the withdrawal', { exact: true }).fill('Fictional change after plan was recorded');
  const withdrawal = page.waitForResponse((r) => r.url().includes('/api/order-entries/') && r.url().endsWith('/withdraw') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Withdraw entry', exact: true }).click(); expect((await withdrawal).status()).toBe(200);
  await expect(s.preview.getByRole('status', { name: 'Cancellation impact status' })).toBeEmpty();
  await expect(s.confirmation).toContainText('Original reason: Fictional weather plan review');
  release(); await expect(s.confirmation.getByRole('alert')).toContainText('original result is unresolved');
  await inspectState(page, s.confirmation, 'pending');
  const afterWithdrawal = await (await page.request.get(`/api/orders/${s.order!.id}`)).json();
  await page.reload();
  await expect(s.confirmation).toContainText('Original reason: Fictional weather plan review'); expect(posts).toHaveLength(1);
  await s.confirmation.getByRole('button', { name: 'Retry original plan confirmation' }).click();
  await expect(s.confirmation).toContainText('Reviewed plan recorded. Recording a plan does not execute cancellation.');
  expect(posts).toHaveLength(2); expect(posts[1]).toEqual(posts[0]);
  await expect(s.confirmation).toContainText(saved.id);
  expect(await (await page.request.get(`/api/events/${s.eventId}/cancellation-confirmations/${saved.id}`)).json()).toEqual(saved);
  expect(await (await page.request.get(`/api/orders/${s.order!.id}`)).json()).toEqual(afterWithdrawal);
  expect(financialPosts).toBe(0);
  let failLookup = true; let lookupCalls = 0;
  await page.route(`**/api/events/${s.eventId}/cancellation-confirmations/*`, (route) => { lookupCalls++; return failLookup ? route.abort('failed') : route.continue(); });
  await page.reload(); await expect(s.confirmation).toContainText('Saved plan evidence could not be loaded');
  const lookup = s.confirmation.getByRole('button', { name: 'Retry saved record lookup' });
  await lookup.focus(); await page.keyboard.press('Enter'); await expect.poll(() => lookupCalls).toBe(2);
  await expect(lookup).toHaveAttribute('aria-disabled', 'false'); await expect(lookup).toBeFocused();
  await expect(s.confirmation).not.toContainText('Reviewed plan recorded'); expect(posts).toHaveLength(2);
  await inspectState(page, s.confirmation, 'failed-lookup');
  failLookup = false; await s.confirmation.getByRole('button', { name: 'Retry saved record lookup' }).click();
  await expect(s.confirmation).toContainText(saved.id); expect(posts).toHaveLength(2);
  await expect(s.confirmation.getByLabel('Recorded plan evidence')).toBeFocused();
  await inspectState(page, s.confirmation, 'recorded');
});

test('refuses stale impact and requires a fresh review and acknowledgement', async ({ page }) => {
  const s = await setup(page); const posts: CancellationConfirmationInput[] = [];
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().endsWith(`/api/events/${s.eventId}/cancellation-confirmations`)) posts.push(r.postDataJSON()); });
  await s.load(); await s.fill();
  const before = await (await page.request.get(`/api/orders/${s.order!.id}`)).json();
  expect((await page.request.post(`/api/order-entries/${before.entries[0].id}/withdraw`, { data: { reason: 'Fictional external change before plan save' } })).status()).toBe(200);
  await s.confirmation.getByRole('button', { name: 'Record plan confirmation' }).click();
  await expect(s.confirmation.getByRole('alert')).toContainText('plan was not recorded.');
  await expect(s.preview.getByRole('button', { name: 'Preview cancellation impact', exact: true })).toBeFocused();
  await expect(s.confirmation.getByLabel('Reason for the reviewed plan')).toHaveCount(0);
  await s.load(); await expect(s.confirmation.getByLabel('Reason for the reviewed plan')).toHaveValue(''); await expect(s.confirmation.getByRole('checkbox')).not.toBeChecked();
  await s.fill('Fictional fresh review after withdrawal'); await s.confirmation.getByRole('button', { name: 'Record plan confirmation' }).click();
  await expect(s.confirmation).toContainText('Reviewed plan recorded'); expect(posts).toHaveLength(2); expect(posts[0].clientRequestId).not.toBe(posts[1].clientRequestId);
});

test('keeps the original request in memory when browser recovery storage is blocked', async ({ page }) => {
  await page.addInitScript(() => {
    const get = Storage.prototype.getItem; const set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) { if (key.startsWith('cyclereg.plan-confirmation.')) throw new Error('Fictional storage block'); return get.call(this, key); };
    Storage.prototype.setItem = function (key, value) { if (key.startsWith('cyclereg.plan-confirmation.')) throw new Error('Fictional storage block'); return set.call(this, key, value); };
  });
  const s = await setup(page, false); const posts: CancellationConfirmationInput[] = [];
  await page.route(`**/api/events/${s.eventId}/cancellation-confirmations`, async (route) => { posts.push(route.request().postDataJSON()); if (posts.length === 1) { await route.fetch(); return route.abort('failed'); } return route.continue(); });
  await s.load(); await s.fill(); await s.confirmation.getByRole('button', { name: 'Record plan confirmation' }).click();
  await expect(s.confirmation.getByRole('alert')).toContainText('original result is unresolved'); await expect(s.confirmation).toContainText('Keep this page open');
  await inspectState(page, s.confirmation, 'blocked-storage');
  await s.confirmation.getByRole('button', { name: 'Retry original plan confirmation' }).click();
  await expect(s.confirmation).toContainText('Reviewed plan recorded'); expect(posts).toHaveLength(2); expect(posts[1]).toEqual(posts[0]);
});

test('isolates unresolved recovery by event and signed-in account without automatic resubmission', async ({ page, browser }) => {
  const s = await setup(page, false); let posts = 0; let ownerRequest!: CancellationConfirmationInput;
  await page.route(`**/api/events/${s.eventId}/cancellation-confirmations`, async (route) => { posts++; ownerRequest = route.request().postDataJSON(); return route.abort('failed'); });
  await s.load(); await s.fill('Private fictional owner review'); await s.confirmation.getByRole('button', { name: 'Record plan confirmation' }).click();
  await expect(s.confirmation.getByRole('alert')).toContainText('unresolved');
  const other = await setup(page, false); await expect(other.confirmation).not.toContainText('Private fictional owner review'); expect(posts).toBe(1);
  const email = 'plan-finance@example.test';
  expect((await page.request.post(`/api/organizations/${s.organizationId}/members`, { data: { email, role: 'finance' } })).status()).toBe(200);
  expect((await page.request.get('/api/me', { headers: { Authorization: `Bearer test:${email}` } })).status()).toBe(200);
  const savedStorage = await page.evaluate(() => Object.fromEntries(Object.entries(sessionStorage)));
  const context = await browser.newContext({ extraHTTPHeaders: { Authorization: `Bearer test:${email}` } });
  await context.addInitScript(({ items, account }) => { for (const [key, value] of Object.entries(items)) sessionStorage.setItem(key, value); sessionStorage.setItem('cyclereg.test-session', account); }, { items: savedStorage, account: email });
  const financePage = await context.newPage();
  try {
    await financePage.goto(`/#/events/${s.eventId}/registrations`);
    const financeConfirmation = financePage.getByRole('region', { name: 'Reviewed plan confirmation', exact: true });
    await expect(financeConfirmation).toContainText('Load and review a current cancellation preview'); await expect(financeConfirmation).not.toContainText('Private fictional owner review'); expect(posts).toBe(1);
    await financePage.getByRole('button', { name: 'Preview cancellation impact' }).click();
    await financeConfirmation.getByLabel('Reason for the reviewed plan').fill('Separate fictional finance review'); await financeConfirmation.getByRole('checkbox').check();
    const returned = financePage.waitForResponse((r) => r.url().endsWith(`/api/events/${s.eventId}/cancellation-confirmations`) && r.request().method() === 'POST');
    await financeConfirmation.getByRole('button', { name: 'Record plan confirmation' }).click(); const financeRecord = await (await returned).json();
    await expect(financeConfirmation).toContainText('Reviewed plan recorded');
    expect(financeRecord.clientRequestId).not.toBe(ownerRequest.clientRequestId);
    expect(financeRecord.confirmedBy).toBe((await (await context.request.get('/api/me')).json()).account.id);

  } finally { await context.close(); }
  await page.goto(`/#/events/${s.eventId}/registrations`); await expect(s.confirmation).toContainText('Private fictional owner review'); expect(posts).toBe(1);
});


test('retains conflicting original intent instead of assuming every 409 means no record exists', async ({ page }) => {
  const s = await setup(page, false); const posts: CancellationConfirmationInput[] = []; let existing!: CancellationConfirmation;
  await page.route(`**/api/events/${s.eventId}/cancellation-confirmations`, async (route) => {
    const body = route.request().postDataJSON() as CancellationConfirmationInput; posts.push(body);
    if (posts.length === 1) {
      const seeded = await page.request.post(`/api/events/${s.eventId}/cancellation-confirmations`, { data: { ...body, reason: 'Different fictional request already recorded' } });
      expect(seeded.status()).toBe(200); existing = await seeded.json();
    }
    return route.continue();
  });
  await s.load(); await s.fill(); await s.confirmation.getByRole('button', { name: 'Record plan confirmation' }).click();
  await expect(s.confirmation.getByRole('alert')).toContainText('original result is unresolved');
  await expect(s.preview.getByLabel('Cancellation scope', { exact: true })).toBeDisabled();
  await s.confirmation.getByRole('button', { name: 'Retry original plan confirmation' }).click();
  await expect(s.confirmation.getByRole('alert')).toContainText('different details'); expect(posts).toHaveLength(2); expect(posts[1]).toEqual(posts[0]);
  expect(await (await page.request.get(`/api/events/${s.eventId}/cancellation-confirmations/${existing.id}`)).json()).toEqual(existing);
  await page.reload(); await expect(s.confirmation).toContainText('Original reason: Fictional weather plan review'); expect(posts).toHaveLength(2);
});

for (const raw of ['{not-json', JSON.stringify({ state: 'recorded', id: '../../members' })]) test(`blocks unreadable or unsafe recovery data (${raw})`, async ({ page }) => {
  const s = await setup(page, false); const actor = (await (await page.request.get('/api/me')).json()).account.id;
  await page.evaluate(({ eventId, accountId, value }) => sessionStorage.setItem(`cyclereg.plan-confirmation.${accountId}.${eventId}`, value), { eventId: s.eventId, accountId: actor, value: raw });
  let posts = 0; page.on('request', (r) => { if (r.method() === 'POST' && r.url().endsWith(`/api/events/${s.eventId}/cancellation-confirmations`)) posts++; });
  await page.reload(); await expect(s.confirmation).toContainText('Saved recovery data could not be read');
  await s.load(); await expect(s.confirmation.getByRole('button', { name: 'Record plan confirmation' })).toHaveCount(0);
  await expect(s.confirmation).toContainText('Manual review'); expect(posts).toBe(0);
  if (raw === '{not-json') await inspectState(page, s.confirmation, 'corrupt-storage');
});


test('can start an explicit separate review when a recorded reference is unavailable', async ({ page }) => {
  const s = await setup(page, false); const posts: CancellationConfirmationInput[] = [];
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().endsWith(`/api/events/${s.eventId}/cancellation-confirmations`)) posts.push(r.postDataJSON()); });
  await s.load(); await s.fill('Fictional original review');
  const response = page.waitForResponse((r) => r.url().endsWith(`/api/events/${s.eventId}/cancellation-confirmations`) && r.request().method() === 'POST');
  await s.confirmation.getByRole('button', { name: 'Record plan confirmation' }).click(); const original = await (await response).json();
  await expect(s.confirmation).toContainText('Reviewed plan recorded'); expect(posts).toHaveLength(1);
  const actor = (await (await page.request.get('/api/me')).json()).account.id;
  // A missing historical reference is modeled without resetting shared browser fixtures.
  await page.evaluate(({ eventId, accountId }) => sessionStorage.setItem(`cyclereg.plan-confirmation.${accountId}.${eventId}`, JSON.stringify({ state: 'recorded', id: 'missing_recorded_reference' })), { eventId: s.eventId, accountId: actor });
  await page.reload(); await expect(s.confirmation).toContainText('Saved plan evidence could not be loaded'); await expect(s.confirmation).not.toContainText('Reviewed plan recorded'); expect(posts).toHaveLength(1);
  await s.confirmation.getByRole('button', { name: 'Start a separate review' }).click(); await expect(s.confirmation.getByLabel('Reason for the reviewed plan')).toHaveCount(0);
  await expect(s.preview.getByRole('button', { name: 'Preview cancellation impact', exact: true })).toBeFocused();
  await s.load(); await s.fill('Fictional explicit separate review'); await s.confirmation.getByRole('button', { name: 'Record plan confirmation' }).click();
  await expect(s.confirmation).toContainText('Reviewed plan recorded'); expect(posts).toHaveLength(2); expect(posts[0].clientRequestId).not.toBe(posts[1].clientRequestId);
  expect(await (await page.request.get(`/api/events/${s.eventId}/cancellation-confirmations/${original.id}`)).json()).toEqual(original);
});


test('unlocks a refused request only when the server proves the vanished scope was not recorded', async ({ page }) => {
  const s = await setup(page, false);
  const changeDay = async (include: boolean) => {
    const record = await (await page.request.get(`/api/events/${s.eventId}`)).json();
    const date = new Date(`${record.config.days[0].date}T00:00Z`); date.setUTCDate(date.getUTCDate() + 7);
    record.config.days = record.config.days.filter((d: { id: string }) => d.id !== 'day_confirmation_temporary');
    if (include) record.config.days.push({ id: 'day_confirmation_temporary', label: 'Temporary published confirmation day', date: date.toISOString().slice(0, 10) });
    expect((await page.request.put(`/api/events/${s.eventId}/config`, { data: { revision: record.revision, config: record.config } })).status()).toBe(200);
    expect((await publishReviewed(page.request, `/api/events/${s.eventId}`, { acknowledgeWarnings: true, acknowledgeImpact: true })).status()).toBe(200);
  };
  await changeDay(true); await page.reload(); await s.load(); await expect(s.confirmation.getByLabel('Reason for the reviewed plan')).toBeVisible();
  await s.preview.getByLabel('Cancellation scope', { exact: true }).selectOption('day'); await s.preview.getByLabel('Published day').selectOption('day_confirmation_temporary');
  await s.load(); await s.fill(); await changeDay(false);
  await s.confirmation.getByRole('button', { name: 'Record plan confirmation' }).click();
  await expect(s.confirmation.getByRole('alert')).toContainText('plan was not recorded');
  await expect(s.preview.getByLabel('Cancellation scope', { exact: true })).toBeEnabled();
  await expect(s.confirmation.getByRole('button', { name: 'Retry original plan confirmation' })).toHaveCount(0);
  await s.preview.getByLabel('Cancellation scope', { exact: true }).selectOption('event'); await s.load();
  await expect(s.confirmation.getByRole('checkbox')).not.toBeChecked(); await s.fill('Fictional revised scope review');
  await s.confirmation.getByRole('button', { name: 'Record plan confirmation' }).click(); await expect(s.confirmation).toContainText('Reviewed plan recorded');
});
