// @covers src/web/WithdrawalRequest.tsx
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';
import { publishReviewed } from './support/publish';

test('a rider sees the policy effect, asks to withdraw an entry, and the request waits for the organizer', async ({ page, browser, baseURL }) => {
  const { eventId } = await (await page.request.post('/api/demo')).json();
  const eventUrl = `/api/events/${eventId}`;
  expect((await publishReviewed(page.request, eventUrl, { acknowledgeWarnings: true })).status()).toBe(200);
  const { config } = await (await page.request.get(eventUrl)).json();
  const category = config.categories.find((row: { timingCode: string }) => row.timingCode === 'RR-M35-34');
  const email = `withdraw-${eventId}@example.test`;
  const headers = { Authorization: `Bearer test:${email}` };
  const created = await page.request.post(`/api/rider/events/${eventId}/orders`, {
    headers,
    data: {
      clientRequestId: `withdraw-ui-${eventId}`.slice(0, 64),
      categoryIds: [category.id],
      rider: {
        firstName: 'Sam', lastName: 'Fictional', email, team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual',
        competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Pat Fictional', phone: '555-555-0199' },
      },
      waiver: { version: config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Sam Fictional', signerRole: 'rider' },
    },
  });
  expect(created.status(), await created.text()).toBe(201);
  const { id: orderId } = await created.json();
  expect((await page.request.post(`/api/orders/${orderId}/payment`, { headers, data: { attemptId: `withdraw-ui-paid-${orderId}`, outcome: 'success' } })).status()).toBe(200);

  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 900 }, extraHTTPHeaders: headers });
  await context.addInitScript((account) => sessionStorage.setItem('cyclereg.test-session', account), email);
  const rider = await context.newPage();
  try {
    await rider.goto(`/#/orders/${orderId}`);
    const ask = rider.getByRole('button', { name: `Ask to withdraw from ${category.name}` });
    await expect(ask).toBeVisible();
    await ask.click();
    const form = rider.getByRole('form', { name: `Ask to withdraw from ${category.name}` });
    await expect(form).toContainText("Under this event's refund policy, withdrawing today returns");
    await expect(form.getByRole('textbox', { name: 'Why do you want to withdraw?' })).toBeFocused();
    expect(await rider.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    expect((await new AxeBuilder({ page: rider }).include('form.correction').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);

    // A missing reason is explained without sending anything.
    await form.getByRole('button', { name: 'Send request' }).click();
    await expect(form.getByRole('alert')).toHaveText('Write why you want to withdraw.');

    await form.getByRole('textbox', { name: 'Why do you want to withdraw?' }).fill('Injured, cannot race');
    await form.getByRole('button', { name: 'Send request' }).click();
    const waiting = rider.getByRole('status').filter({ hasText: 'The organizer has not decided yet' });
    await expect(waiting).toBeFocused();
    await expect(rider.getByRole('button', { name: /Ask to withdraw/ })).toHaveCount(0);
    await rider.screenshot({ path: 'test-results/rider-withdrawal-waiting-390.png', fullPage: true });

    // After a reload the request still shows as waiting, and the entry is unchanged.
    await rider.reload();
    await expect(rider.getByRole('status').filter({ hasText: 'The organizer has not decided yet' })).toBeVisible();
    const requests = await (await page.request.get(`${eventUrl}/withdrawal-requests`)).json();
    expect(requests).toEqual([expect.objectContaining({ orderId, status: 'open', reason: 'Injured, cannot race' })]);
  } finally {
    await context.close();
  }
});
