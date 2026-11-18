import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';
import type { EventConfig } from '../src/shared/schema';

test('previews published cancellation impact with recovery and discards older responses', async ({ page }) => {
  const { eventId } = await (await page.request.post('/api/demo')).json();
  const event = await (await page.request.get(`/api/events/${eventId}`)).json();
  const config = event.config as EventConfig;
  expect((await page.request.post(`/api/events/${eventId}/publish`, { data: { acknowledgeWarnings: true } })).status()).toBe(200);
  const rr = config.categories.find((c) => c.timingCode === 'RR-M35-34')!;
  const cr = config.categories.find((c) => c.timingCode === 'CR-M35-34')!;
  const rider = { firstName: 'Cancellation', lastName: 'Fictional', email: 'cancellation@example.test', team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Fictional Contact', phone: '555-555-0199' } };
  const created = await page.request.post(`/api/rider/events/${eventId}/orders`, { data: { clientRequestId: 'cancellation-preview-browser', categoryIds: [rr.id, cr.id], rider, waiver: { version: config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Cancellation Fictional', signerRole: 'rider' } } });
  expect(created.status()).toBe(201); const order = await created.json();
  const paid = await page.request.post(`/api/orders/${order.id}/payment`, { data: { attemptId: 'cancellation-preview-browser-payment', outcome: 'success' } });
  expect(paid.status()).toBe(200); const before = await paid.json();
  config.races[0].name = 'UNPUBLISHED DRAFT RACE';
  const latest = await (await page.request.get(`/api/events/${eventId}`)).json();
  expect((await page.request.put(`/api/events/${eventId}/config`, { data: { revision: latest.revision, config } })).status()).toBe(200);
  let calls = 0; let fail = true; let holdNext = false; let refundPosts = 0;
  let release!: () => void; let captured!: () => void; let fulfilled!: () => void;
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  const ready = new Promise<void>((resolve) => { captured = resolve; });
  const done = new Promise<void>((resolve) => { fulfilled = resolve; });
  page.on('request', (r) => { if (r.method() === 'POST' && /\/(refunds|retry)$/.test(r.url())) refundPosts++; });
  await page.route(`**/api/events/${eventId}/cancellation-impact-preview`, async (route) => {
    calls++;
    if (fail) return route.abort('failed');
    if (holdNext) { holdNext = false; const response = await route.fetch(); captured(); await waiting; await route.fulfill({ response }); fulfilled(); return; }
    return route.continue();
  });
  let releaseOrders!: () => void;
  const ordersGate = new Promise<void>((resolve) => { releaseOrders = resolve; });
  let firstOrders = true;
  await page.route(`**/api/events/${eventId}/orders`, async (route) => {
    if (!firstOrders) return route.continue();
    firstOrders = false; const response = await route.fetch(); await ordersGate; return route.fulfill({ response });
  });
  await page.goto(`/#/events/${eventId}/registrations`);
  const region = page.getByRole('region', { name: 'Cancellation preview', exact: true });
  const button = region.getByRole('button', { name: 'Preview cancellation impact', exact: true });
  await expect(page.getByRole('heading', { name: 'Registrations', exact: true })).toBeVisible();
  await expect(region).toHaveCount(0); releaseOrders();
  await expect(page.getByRole('button', { name: 'Refund Cancellation Fictional', exact: true })).toBeVisible();
  await button.focus(); await page.keyboard.press('Enter');
  await expect(region.getByRole('alert')).toContainText('Try Preview cancellation impact again');
  await expect(button).toBeFocused();
  fail = false; await button.click();
  await expect(region.getByRole('status')).toContainText('2 live entries');
  await expect(region).toContainText('Financial review required');
  await expect(region).toContainText('not a refundable balance');
  await expect(region).toContainText('Cancellation confirmation and execution are not available');
  expect(refundPosts).toBe(0);
  expect(await (await page.request.get(`/api/orders/${order.id}`)).json()).toEqual(before);
  holdNext = true; await button.click(); await ready;
  const loading = region.getByRole('button', { name: 'Loading cancellation preview…' });
  await expect(loading).toHaveAttribute('aria-disabled', 'true');
  await loading.focus(); await page.keyboard.press('Enter'); expect(calls).toBe(3);
  await region.getByLabel('Cancellation scope', { exact: true }).selectOption('race');
  await expect(region.getByRole('status')).toBeEmpty();
  await expect(region.getByLabel('Published race')).not.toContainText('UNPUBLISHED');
  await region.getByLabel('Published race').selectOption(cr.raceId);
  await button.click(); await expect(region.getByRole('status')).toContainText('1 live entry');
  await expect(region).toContainText('1 unaffected live entry');
  release(); await done; await page.waitForLoadState('networkidle');
  await expect(region.getByRole('status')).toContainText('1 live entry');
  expect(calls).toBe(4);
  for (const theme of ['light', 'dark']) {
    const toggle = page.getByRole('button', { name: /^Theme: / });
    if (await toggle.getAttribute('data-current') !== theme) await toggle.click();
    await expect(toggle).toHaveAttribute('data-current', theme);
    for (const width of [360, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.setViewportSize({ width, height: 3000 });
      await region.screenshot({ animations: 'disabled', path: `test-results/cancellation-preview-${theme}-${width}.png` });
    }
    expect((await new AxeBuilder({ page }).include('[aria-label="Cancellation preview"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  }
  await page.getByRole('button', { name: /^Withdraw RR-M35-34 / }).click();
  await page.getByLabel('Reason for the withdrawal', { exact: true }).fill('Fictional preview refresh check');
  await page.getByRole('button', { name: 'Withdraw entry', exact: true }).click();
  await expect(region.getByRole('status')).toBeEmpty();
  await expect(region.getByLabel('Cancellation scope')).toHaveValue('event');
  await button.click(); await expect(region.getByRole('status')).toContainText('1 live entry');
  expect(refundPosts).toBe(0);
  await region.getByLabel('Cancellation scope').selectOption('day');
  await expect(region.getByLabel('Published day')).toBeVisible();
  await expect(region.getByRole('status')).toBeEmpty();
});

test('limits the screen to finance and owner and recovers an empty preview', async ({ page, browser }) => {
  const { eventId, organizationId } = await (await page.request.post('/api/demo')).json();
  expect((await page.request.post(`/api/events/${eventId}/publish`, { data: { acknowledgeWarnings: true } })).status()).toBe(200);
  for (const role of ['finance', 'registration_manager'] as const) {
    const email = `cancellation-${role}@example.test`;
    expect((await page.request.post(`/api/organizations/${organizationId}/members`, { data: { email, role } })).status()).toBe(200);
    expect((await page.request.get('/api/me', { headers: { Authorization: `Bearer test:${email}` } })).status()).toBe(200);
    const context = await browser.newContext({ extraHTTPHeaders: { Authorization: `Bearer test:${email}` } });
    await context.addInitScript((account) => sessionStorage.setItem('cyclereg.test-session', account), email);
    const viewer = await context.newPage();
    try {
      await viewer.goto(`/#/events/${eventId}/registrations`);
      await expect(viewer.getByRole('heading', { name: 'Registrations', exact: true })).toBeVisible();
      const region = viewer.getByRole('region', { name: 'Cancellation preview', exact: true });
      if (role === 'registration_manager') await expect(region).toHaveCount(0);
      else {
        await region.getByRole('button', { name: 'Preview cancellation impact' }).click();
        await expect(region).toContainText('No live entries or active waitlist records are affected');
        await expect(region).toContainText('Original paid entry allocations: $0');
      }
    } finally { await context.close(); }
  }
});


test('rejects a preview that crossed a publication and retries against the new version', async ({ page }) => {
  const { eventId } = await (await page.request.post('/api/demo')).json();
  expect((await page.request.post(`/api/events/${eventId}/publish`, { data: { acknowledgeWarnings: true } })).status()).toBe(200);
  let publishDuringRequest = true;
  await page.route(`**/api/events/${eventId}/cancellation-impact-preview`, async (route) => {
    if (publishDuringRequest) {
      publishDuringRequest = false;
      const event = await (await page.request.get(`/api/events/${eventId}`)).json();
      event.config.event.name = 'New published cancellation schedule';
      expect((await page.request.put(`/api/events/${eventId}/config`, { data: { revision: event.revision, config: event.config } })).status()).toBe(200);
      expect((await page.request.post(`/api/events/${eventId}/publish`, { data: { acknowledgeWarnings: true } })).status()).toBe(200);
    }
    return route.continue();
  });
  await page.goto(`/#/events/${eventId}/registrations`);
  const region = page.getByRole('region', { name: 'Cancellation preview', exact: true });
  const button = region.getByRole('button', { name: 'Preview cancellation impact' });
  await button.click();
  await expect(region.getByRole('alert')).toContainText('published schedule changed while loading');
  await expect(region.getByRole('status')).toBeEmpty();
  await button.click();
  await expect(region).toContainText('Published version 2');
  await expect(region.getByRole('alert')).toHaveCount(0);
});
