// @covers src/web/registrations/WithdrawalRequests.tsx
// @covers src/web/registrations/RiderEmailDeliveryPanel.tsx
// @covers src/web/api.ts
// @covers src/server/app.ts
// @covers src/server/email.ts
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from './fixtures';
import { publishReviewed } from './support/publish';

/** A declined withdrawal request is the only place the decline email panel is mounted. */
async function declinedRequest(page: Page) {
  const { eventId, organizationId } = await (await page.request.post('/api/demo')).json();
  expect((await publishReviewed(page.request, `/api/events/${eventId}`, { acknowledgeWarnings: true })).status()).toBe(200);
  const { config } = await (await page.request.get(`/api/events/${eventId}`)).json();
  const category = config.categories.find((row: { timingCode: string }) => row.timingCode === 'RR-M35-34');
  const email = `sloane-${eventId}@example.test`;
  const headers = { Authorization: `Bearer test:${email}` };
  const created = await page.request.post(`/api/rider/events/${eventId}/orders`, { headers, data: {
    clientRequestId: `decline-panel-${eventId}`.slice(0, 64),
    categoryIds: [category.id],
    rider: {
      firstName: 'Sloane', lastName: 'Fictional', email, team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual',
      competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Pat Fictional', phone: '555-555-0199' },
    },
    waiver: { version: config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Sloane Fictional', signerRole: 'rider' },
  } });
  expect(created.status(), await created.text()).toBe(201);
  const order = await created.json();
  const paid = await page.request.post(`/api/orders/${order.id}/payment`, { headers, data: { attemptId: `decline-panel-pay-${order.id}`, outcome: 'success' } });
  expect(paid.status(), await paid.text()).toBe(200);
  const entryId = (await paid.json()).entries[0].id as string;
  const { preview } = await (await page.request.get(`/api/rider/order-entries/${entryId}/withdrawal`, { headers })).json();
  const asked = await page.request.post(`/api/rider/order-entries/${entryId}/withdrawal-requests`, { headers, data: {
    clientRequestId: `decline-panel-ask-${entryId}`,
    reason: 'Cannot attend',
    expectedCategoryId: preview.categoryId,
    expectedReturnAs: preview.entitlement?.returnAs ?? null,
    expectedAmountCents: preview.entitlement?.amountCents ?? null,
  } });
  expect(asked.status(), await asked.text()).toBe(201);
  const requestId = (await asked.json()).id as string;
  const declined = await page.request.post(`/api/events/${eventId}/withdrawal-requests/${requestId}/decline`, { data: { reason: 'Start list already sent' } });
  expect(declined.status(), await declined.text()).toBe(200);
  return { eventId, organizationId, requestId };
}

test('staff loads decline notice status and refreshes after an interrupted retry', { tag: '@smoke' }, async ({ page }) => {
  const { eventId, requestId } = await declinedRequest(page);
  const url = `**/api/events/${eventId}/withdrawal-requests/${requestId}/notice-delivery`;
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
  const section = page.getByRole('region', { name: /Withdrawal requests/ });
  await section.getByText('Decided (1)').click();
  const panel = section.locator('details.decline-email-delivery');
  const toggle = panel.locator('summary', { hasText: 'Decline email' });
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
    expect((await new AxeBuilder({ page }).include('details.decline-email-delivery').analyze()).violations).toEqual([]);
  }
  await panel.getByRole('button', { name: 'Retry decline email' }).click();
  await expect(panel.getByRole('alert')).toContainText('Refresh status before trying again.');
  await expect(panel.getByRole('button', { name: 'Retry decline email' })).toHaveCount(0);
  const refresh = panel.getByRole('button', { name: 'Refresh status' });
  await expect(refresh).toBeFocused();
  await refresh.click();
  await expect(panel.getByRole('status')).toContainText('Delivery: Delivered');
  expect(retries).toBe(1);
  expect(reads).toBe(2);
});

test('registration managers can read a recorded decline notice while finance cannot see it', async ({ page, browser }) => {
  const { eventId, organizationId, requestId } = await declinedRequest(page);
  const noticeUrl = `/api/events/${eventId}/withdrawal-requests/${requestId}/notice-delivery`;
  for (const role of ['registration_manager', 'finance'] as const) {
    const email = `decline-notice-${role}@example.test`;
    const context = await browser.newContext({ extraHTTPHeaders: { Authorization: `Bearer test:${email}` } });
    try {
      await context.request.get('/api/me');
      expect((await page.request.post(`/api/organizations/${organizationId}/members`, { data: { email, role } })).status()).toBe(200);
      const delivery = await context.request.get(noticeUrl);
      const member = await context.newPage();
      await member.addInitScript((address) => sessionStorage.setItem('cyclereg.test-session', address), email);
      await member.goto(`/#/events/${eventId}/registrations`);
      await expect(member.locator('.order').filter({ hasText: 'Sloane Fictional' })).toBeVisible();
      const section = member.getByRole('region', { name: /Withdrawal requests/ });
      if (role === 'finance') {
        expect(delivery.status()).toBe(403);
        expect((await context.request.post(`${noticeUrl}/retry`)).status()).toBe(403);
        await expect(section).toHaveCount(0);
        await expect(member.locator('.decline-email-delivery')).toHaveCount(0);
      } else {
        expect(delivery.status()).toBe(200);
        expect(await delivery.json()).toEqual({ notice: { status: 'recorded', delivery: null, canRetry: false } });
        const refused = await context.request.post(`${noticeUrl}/retry`);
        expect(refused.status()).toBe(409);
        expect(await refused.json()).toEqual({ error: 'This decline email cannot be retried now.' });
        await section.getByText('Decided (1)').click();
        const panel = section.locator('details.decline-email-delivery');
        await expect(panel).toHaveCount(1);
        await panel.locator('summary').click();
        await expect(panel.getByRole('status')).toContainText('Send status: Recorded');
        await expect(panel.getByRole('status')).toContainText('No outcome recorded');
        await expect(panel.getByRole('button', { name: 'Retry decline email' })).toHaveCount(0);
      }
    } finally {
      await context.close();
    }
  }
});
