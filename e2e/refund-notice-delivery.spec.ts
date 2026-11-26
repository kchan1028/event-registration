import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from './fixtures';
import { publishReviewed } from './support/publish';

async function fixture(page: Page) {
  const { eventId, organizationId } = await (await page.request.post('/api/demo')).json();
  expect((await publishReviewed(page.request, `/api/events/${eventId}`, { acknowledgeWarnings: true })).status()).toBe(200);
  const { config } = await (await page.request.get(`/api/events/${eventId}`)).json();
  const created = await page.request.post(`/api/rider/events/${eventId}/orders`, { data: {
    clientRequestId: `refund-notice-panel-order-${eventId}`, categoryIds: [config.categories.find((c: { timingCode: string }) => c.timingCode === 'RR-M35-34').id],
    rider: { firstName: 'Download', lastName: 'Fictional', email: 'download@example.test', team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Fictional Contact', phone: '555-555-0199' } },
    waiver: { version: config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Download Fictional', signerRole: 'rider' },
  } });
  expect(created.status()).toBe(201);
  const order = await created.json();
  expect((await page.request.post(`/api/orders/${order.id}/payment`, { data: { attemptId: `refund-notice-panel-pay-${eventId}`, outcome: 'success' } })).status()).toBe(200);
  expect((await page.request.post(`/api/orders/${order.id}/refunds`, { data: { clientRequestId: `refund-notice-panel-${eventId}`, amountCents: 500, reason: 'Fictional partial refund' } })).status()).toBe(200);
  const refundId = (await (await page.request.get(`/api/orders/${order.id}/refunds`)).json()).refunds[0].id as string;
  return { eventId, organizationId, order, refundId };
}

test('staff loads refund notice status and refreshes after an interrupted retry', async ({ page }) => {
  const { eventId, refundId } = await fixture(page);
  const url = `**/api/events/${eventId}/refunds/${refundId}/notice-delivery`;
  let reads = 0;
  let retries = 0;
  let delivered = false;
  await page.route(url, (route) => {
    reads++;
    return route.fulfill({ json: { notice: delivered
      ? { status: 'sent', delivery: 'delivered', canRetry: false }
      : { status: 'uncertain', delivery: null, canRetry: true } } });
  });
  await page.route(`${url}/retry`, (route) => {
    retries++;
    delivered = true;
    return route.abort();
  });
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto(`/#/events/${eventId}/registrations`);
  const panel = page.locator('details.refund-email-delivery');
  const toggle = panel.locator('summary');
  await expect(toggle).toBeVisible();
  expect(reads).toBe(0);
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(panel.getByRole('status')).toContainText('Send outcome unknown');
  await expect(panel.getByRole('status')).toContainText('No outcome recorded');
  for (const theme of ['light', 'dark']) {
    await page.locator('html').evaluate((root, value) => root.setAttribute('data-theme', value), theme);
    const overflow = await panel.evaluate((element) => element.scrollWidth > element.clientWidth);
    expect(overflow).toBe(false);
    expect((await new AxeBuilder({ page }).include('details.refund-email-delivery').analyze()).violations).toEqual([]);
  }
  await panel.getByRole('button', { name: 'Retry refund email' }).click();
  await expect(panel.getByRole('alert')).toContainText('Refresh status before trying again.');
  await expect(panel.getByRole('button', { name: 'Retry refund email' })).toHaveCount(0);
  const refresh = panel.getByRole('button', { name: 'Refresh status' });
  await expect(refresh).toBeFocused();
  await refresh.click();
  await expect(panel.getByRole('status')).toContainText('Delivery: Delivered');
  expect(retries).toBe(1);
  expect(reads).toBe(2);
});

test('registration managers can read a recorded refund notice while finance cannot see the panel', async ({ page, browser }) => {
  const { eventId, organizationId } = await fixture(page);
  for (const role of ['registration_manager', 'finance'] as const) {
    const email = `refund-notice-panel-${role}@example.test`;
    const context = await browser.newContext({ extraHTTPHeaders: { Authorization: `Bearer test:${email}` } });
    try {
      await context.request.get('/api/me');
      expect((await page.request.post(`/api/organizations/${organizationId}/members`, { data: { email, role } })).status()).toBe(200);
      const member = await context.newPage();
      await member.addInitScript((address) => sessionStorage.setItem('cyclereg.test-session', address), email);
      await member.goto(`/#/events/${eventId}/registrations`);
      const row = member.locator('.order').filter({ hasText: 'Download Fictional' });
      await expect(row).toBeVisible();
      const panel = row.locator('.refund-email-delivery');
      if (role === 'finance') {
        await expect(row.getByText('Refunded:')).toBeVisible();
        await expect(panel).toHaveCount(0);
      } else {
        await panel.locator('summary').click();
        await expect(panel.getByRole('status')).toContainText('Send status: Recorded');
        await expect(panel.getByRole('button', { name: 'Retry refund email' })).toHaveCount(0);
      }
    } finally {
      await context.close();
    }
  }
});
