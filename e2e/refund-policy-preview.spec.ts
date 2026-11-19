import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

for (const mode of ['full_refund', 'credit', 'rider_choice', null] as const) test(`inspects whole-order accepted policy without making a refund (${mode})`, async ({ page }) => {
  const { eventId } = await (await page.request.post('/api/demo')).json();
  const event = await (await page.request.get(`/api/events/${eventId}`)).json();
  event.config.registration.refundRules = mode === null ? null : { tiers: [{ daysBefore: 7, percent: 100 }], returnAs: 'cash', organizerCancellation: mode };
  expect((await page.request.put(`/api/events/${eventId}/config`, { data: { revision: event.revision, config: event.config } })).status()).toBe(200);
  expect((await page.request.post(`/api/events/${eventId}/publish`, { data: { acknowledgeWarnings: true } })).status()).toBe(200);
  const rider = { firstName: 'Policy', lastName: 'Fictional', email: 'policy@example.test', team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Example Contact', phone: '555-555-0199' } };
  const ordered = await page.request.post(`/api/rider/events/${eventId}/orders`, { data: { clientRequestId: `policy-preview-browser-${mode}`, categoryIds: [event.config.categories.find((c: { timingCode: string }) => c.timingCode === 'RR-M35-34').id], rider, waiver: { version: event.config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Policy Fictional', signerRole: 'rider' } } });
  expect(ordered.status()).toBe(201);
  const order = await ordered.json();
  const paid = await page.request.post(`/api/orders/${order.id}/payment`, { data: { attemptId: `policy-preview-payment-${mode}`, outcome: 'success' } });
  expect(paid.status()).toBe(200);
  const before = await paid.json();
  let refundPosts = 0;
  page.on('request', (request) => { if (request.method() === 'POST' && request.url().endsWith(`/api/orders/${order.id}/refunds`)) refundPosts++; });
  let fail = true;
  let previewGets = 0;
  let holdNext = false;
  let releaseOld!: () => void;
  let capturedOld!: () => void;
  let fulfilledOld!: () => void;
  const held = new Promise<void>((resolve) => { releaseOld = resolve; });
  const captured = new Promise<void>((resolve) => { capturedOld = resolve; });
  const fulfilled = new Promise<void>((resolve) => { fulfilledOld = resolve; });
  await page.route(`**/api/orders/${order.id}/refund-policy-preview?*`, async (route) => {
    previewGets++;
    if (fail) return route.abort('failed');
    if (holdNext) {
      holdNext = false;
      const response = await route.fetch();
      capturedOld();
      await held;
      await route.fulfill({ response });
      fulfilledOld();
      return;
    }
    return route.continue();
  });
  await page.goto(`/#/events/${eventId}/registrations`);
  await page.getByRole('button', { name: 'Refund Policy Fictional', exact: true }).click();
  const region = page.getByRole('region', { name: 'Whole-order refund policy', exact: true });
  const button = region.getByRole('button', { name: 'Preview whole-order policy' });
  await button.focus(); await page.keyboard.press('Enter');
  await expect(region.getByRole('alert')).toContainText('Try Preview whole-order policy again');
  await expect(button).toBeFocused();
  fail = false;
  await button.click();
  await expect(region).toContainText('Accepted version');
  await expect(page.getByLabel('Amount (USD)')).toHaveValue('');
  await region.getByLabel('Policy scenario').selectOption('organizer_cancellation');
  await expect(region.getByRole('status')).toBeEmpty();
  await button.click();
  await expect(region).toContainText('Assessed');
  if (mode === 'full_refund') await expect(region.getByRole('status')).toContainText('Policy cash amount:');
  else {
    await expect(region).toContainText('Review required; no cash amount suggested.');
    await expect(region).toContainText(mode === null ? 'No structured refund policy' : mode === 'credit' ? 'as credit' : 'rider’s choice of cash or credit');
  }
  for (const theme of ['light', 'dark']) {
    const toggle = page.getByRole('button', { name: /^Theme: / });
    await expect(toggle).toBeVisible();
    if (await toggle.getAttribute('data-current') !== theme) await toggle.click();
    await expect(toggle).toHaveAttribute('data-current', theme);
    for (const width of [360, 390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      const scopeBox = await page.getByLabel('For', { exact: true }).boundingBox();
      const amountBox = await page.getByLabel('Amount (USD)').boundingBox();
      if (!scopeBox || !amountBox) throw new Error('Refund fields must be visible');
      if (width === 1440) expect(Math.abs(scopeBox.y - amountBox.y)).toBeLessThanOrEqual(1);
      else expect(amountBox.y).toBeGreaterThan(scopeBox.y);
      await region.screenshot({ path: `test-results/refund-policy-${mode}-${theme}-${width}.png` });
    }
    expect((await new AxeBuilder({ page }).include('[aria-label="Whole-order refund policy"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  }
  await page.getByLabel('For', { exact: true }).selectOption(before.entries[0].id);
  await expect(region).toHaveCount(0);
  await page.getByLabel('For', { exact: true }).selectOption('');
  await expect(region).toBeVisible();
  await expect(region.getByRole('status')).toBeEmpty();
  expect(refundPosts).toBe(0);
  expect((await (await page.request.get(`/api/orders/${order.id}/refunds`)).json()).refunds).toEqual([]);
  expect(await (await page.request.get(`/api/orders/${order.id}`)).json()).toEqual(before);
  if (mode === 'full_refund') {
    await button.click();
    await expect(region).toContainText('Policy cash amount:');
    const callsBeforeHold = previewGets;
    holdNext = true;
    await button.focus(); await page.keyboard.press('Enter');
    await captured;
    const checking = region.getByRole('button', { name: 'Checking policy…' });
    await expect(checking).toHaveAttribute('aria-disabled', 'true');
    await expect(checking).toBeFocused();
    await page.keyboard.press('Enter'); // a second activation must not start another GET
    await page.getByRole('button', { name: /^Withdraw RR-M35-34 / }).click();
    await page.getByLabel('Reason for the withdrawal', { exact: true }).fill('Fictional earlier withdrawal');
    await page.getByRole('button', { name: 'Withdraw entry', exact: true }).click();
    await expect(region.getByRole('status')).toBeEmpty();
    const withdrawn = await (await page.request.get(`/api/orders/${order.id}`)).json();
    await button.click();
    await expect(region).toContainText('inactive entries');
    await expect(region).toContainText('Review required; no cash amount suggested.');
    releaseOld(); await fulfilled;
    await page.waitForLoadState('networkidle');
    await expect(region).toContainText('inactive entries');
    await expect(region).not.toContainText('Policy cash amount:');
    expect(previewGets).toBe(callsBeforeHold + 2);
    expect(refundPosts).toBe(0);
    expect(await (await page.request.get(`/api/orders/${order.id}`)).json()).toEqual(withdrawn);
  }
});
