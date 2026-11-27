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

test('if the organizer moves the entry while the rider is asking, the form shows the new category before anything is sent', async ({ page, browser, baseURL }) => {
  const { eventId } = await (await page.request.post('/api/demo')).json();
  const eventUrl = `/api/events/${eventId}`;
  expect((await publishReviewed(page.request, eventUrl, { acknowledgeWarnings: true })).status()).toBe(200);
  const { config } = await (await page.request.get(eventUrl)).json();
  const from = config.categories.find((row: { timingCode: string }) => row.timingCode === 'RR-M35-34');
  const to = config.categories.find((row: { timingCode: string }) => row.timingCode === 'CR-M35-34');
  const email = `moved-${eventId}@example.test`;
  const headers = { Authorization: `Bearer test:${email}` };
  const created = await page.request.post(`/api/rider/events/${eventId}/orders`, { headers, data: {
    clientRequestId: `moved-ui-${eventId}`.slice(0, 64), categoryIds: [from.id],
    rider: { firstName: 'Sam', lastName: 'Fictional', email, team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Pat Fictional', phone: '555-555-0199' } },
    waiver: { version: config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Sam Fictional', signerRole: 'rider' },
  } });
  expect(created.status(), await created.text()).toBe(201);
  const { id: orderId } = await created.json();
  const paid = await page.request.post(`/api/orders/${orderId}/payment`, { headers, data: { attemptId: `moved-ui-paid-${orderId}`, outcome: 'success' } });
  const entryId = (await paid.json()).entries[0].id as string;

  const context = await browser.newContext({ baseURL, extraHTTPHeaders: headers });
  await context.addInitScript((account) => sessionStorage.setItem('cyclereg.test-session', account), email);
  const rider = await context.newPage();
  try {
    await rider.goto(`/#/orders/${orderId}`);
    await rider.getByRole('button', { name: `Ask to withdraw from ${from.name}` }).click();
    const oldForm = rider.getByRole('form', { name: `Ask to withdraw from ${from.name}` });
    await oldForm.getByRole('textbox', { name: 'Why do you want to withdraw?' }).fill('Leaving this race');
    // The organizer moves the entry while the form is open.
    expect((await page.request.post(`/api/order-entries/${entryId}/transfer`, { data: { toCategoryId: to.id, reason: 'Organizer moved the rider' } })).status()).toBe(200);
    await oldForm.getByRole('button', { name: 'Send request' }).click();
    const newForm = rider.getByRole('form', { name: `Ask to withdraw from ${to.name}` });
    await expect(newForm.getByRole('alert')).toContainText('moved to another category since you looked');
    await expect(newForm).toContainText(`${to.name}.`);
    expect((await (await page.request.get(`${eventUrl}/withdrawal-requests`)).json())).toEqual([]);
    // Sending again now asks about the category the rider can see.
    await newForm.getByRole('button', { name: 'Send request' }).click();
    await expect(rider.getByRole('status').filter({ hasText: `You asked to withdraw from ${to.name}.` })).toBeVisible();
    expect((await (await page.request.get(`${eventUrl}/withdrawal-requests`)).json())).toEqual([expect.objectContaining({ status: 'open', policy: expect.objectContaining({ categoryId: to.id }) })]);
  } finally {
    await context.close();
  }
});
