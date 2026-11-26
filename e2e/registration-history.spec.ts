import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';
import { publishReviewed } from './support/publish';

test('a signed-in rider can open history for a confirmed self-registration and follow its receipts', async ({ page, browser, baseURL }) => {
  const demo = await page.request.post('/api/demo');
  expect(demo.status()).toBe(201);
  const { eventId } = await demo.json();
  const eventUrl = `/api/events/${eventId}`;
  expect((await publishReviewed(page.request, eventUrl, { acknowledgeWarnings: true })).status()).toBe(200);
  const { config } = await (await page.request.get(eventUrl)).json();
  const category = config.categories.find((row: { timingCode: string }) => row.timingCode === 'RR-M35-34');
  const email = `history-${eventId}@example.test`;
  const headers = { Authorization: `Bearer test:${email}` };
  const buy = async (ref: string, selfRegistrationConfirmed: boolean, confirmed = true) => {
    const created = await page.request.post(`/api/rider/events/${eventId}/orders`, {
      headers,
      data: {
        clientRequestId: `history-${ref}`,
        categoryIds: [category.id],
        selfRegistrationConfirmed,
        rider: {
          firstName: 'Sam', lastName: 'Fictional', email, team: '',
          racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men',
          collegiateDivision: null, guardian: null,
          emergencyContact: { name: 'Pat Fictional', phone: '555-555-0199' },
        },
        waiver: {
          version: config.registration.waiverVersion, read: true, agreed: true,
          signatureName: 'Sam Fictional', signerRole: 'rider',
        },
      },
    });
    expect(created.status(), await created.text()).toBe(201);
    const { id } = await created.json();
    if (confirmed) {
      expect((await page.request.post(`/api/orders/${id}/payment`, {
        headers, data: { attemptId: `history-paid-${id}`, outcome: 'success' },
      })).status()).toBe(200);
    }
    return id as string;
  };
  const first = await buy('first', true);
  const second = await buy('second', true);
  const proxy = await buy('proxy', false);
  const held = await buy('held', true, false);
  const receiptHref = (id: string) => `#/orders/${id}`;

  const riderContext = await browser.newContext({ baseURL, extraHTTPHeaders: {} });
  const riderPage = await riderContext.newPage();
  try {
    let historyRequests = 0;
    await riderPage.route('**/api/rider/orders/*/participant-history', async (route) => {
      historyRequests++;
      if (historyRequests === 1) await route.fulfill({ status: 503, json: { error: 'Temporary failure' } });
      else await route.continue();
    });
    await riderPage.goto('/#/my-registrations');
    await riderPage.getByRole('button', { name: 'Sign in with email' }).click();
    await riderPage.getByLabel('Test email').fill(email);
    await riderPage.getByRole('button', { name: 'Sign in', exact: true }).click();

    const registrations = riderPage.getByRole('list', { name: 'Your registrations' });
    const row = (id: string) => registrations.locator(':scope > li').filter({ has: riderPage.locator(`a[href="${receiptHref(id)}"]`) });
    const trigger = row(second).getByText('Registration history', { exact: true });
    await expect(trigger).toBeVisible();
    expect(historyRequests).toBe(0);
    for (const id of [proxy, held]) {
      await expect(row(id)).toBeVisible();
      await expect(row(id).getByText('Registration history', { exact: true })).toHaveCount(0);
    }

    await trigger.focus();
    await trigger.press('Enter');
    await expect(row(second).getByRole('alert')).toContainText('Could not load registration history');
    await trigger.press('Enter');
    await expect(row(second).locator('[role="alert"]')).toHaveCount(0);
    await trigger.press('Enter');
    const history = riderPage.getByRole('list', { name: 'Confirmed registration history' });
    await expect(history.getByRole('link')).toHaveCount(2);
    await expect(history.locator(`a[href="${receiptHref(first)}"]`)).toBeVisible();
    await expect(history.locator(`a[href="${receiptHref(second)}"]`)).toBeVisible();
    expect(historyRequests).toBe(2);

    await riderPage.setViewportSize({ width: 360, height: 900 });
    for (const colorScheme of ['light', 'dark'] as const) {
      await riderPage.emulateMedia({ colorScheme });
      expect(await history.evaluate((list) => list.scrollWidth <= list.clientWidth)).toBe(true);
      expect((await new AxeBuilder({ page: riderPage }).include('.my-reg-history[open]').analyze()).violations).toEqual([]);
    }
    await history.locator(`a[href="${receiptHref(first)}"]`).click();
    await expect(riderPage.getByRole('heading', { name: 'You’re entered' })).toBeVisible();
    await expect(riderPage).toHaveURL(new RegExp(`${receiptHref(first)}$`));
  } finally {
    await riderContext.close();
  }
});
