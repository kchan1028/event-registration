import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';
import { publishReviewed } from './support/publish';

test('organizers can open confirmed participant history for the current event', async ({ page, browser, baseURL }) => {
  const demo = await page.request.post('/api/demo');
  expect(demo.status()).toBe(201);
  const { eventId, organizationId } = await demo.json();
  const eventUrl = `/api/events/${eventId}`;
  const registrationsUrl = `/#/events/${eventId}/registrations`;
  expect((await publishReviewed(page.request, eventUrl, { acknowledgeWarnings: true })).status()).toBe(200);
  const { config } = await (await page.request.get(eventUrl)).json();
  const category = config.categories.find((row: { timingCode: string }) => row.timingCode === 'RR-M35-34');
  const createOrder = async (ref: string, selfRegistrationConfirmed: boolean, paid = true) => {
    const result = await page.request.post(`/api/rider/events/${eventId}/orders`, {
      data: {
        clientRequestId: `organizer-history-${ref}`,
        categoryIds: [category.id],
        selfRegistrationConfirmed,
        rider: {
          firstName: 'Sam', lastName: 'Fictional', email: 'rider@example.test', team: '',
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
    expect(result.status(), await result.text()).toBe(201);
    const order = await result.json() as { id: string; orderNumber: string };
    if (paid) {
      expect((await page.request.post(`/api/orders/${order.id}/payment`, {
        data: { attemptId: `organizer-history-paid-${order.id}`, outcome: 'success' },
      })).status()).toBe(200);
    }
    return order;
  };
  const first = await createOrder('first', true);
  const anchor = await createOrder('anchor', true);
  const proxy = await createOrder('proxy', false);
  const held = await createOrder('held', true, false);
  const historyUrl = `${eventUrl}/orders/${anchor.id}/participant-history`;

  let requests = 0;
  await page.route(`**${historyUrl}`, (route) => {
    requests++;
    return requests === 1 ? route.fulfill({ status: 503, json: { error: 'Temporary failure' } }) : route.continue();
  });
  await page.goto(registrationsUrl);
  const trigger = page.getByLabel(`Participant history for ${anchor.orderNumber}`);
  await expect(trigger).toBeVisible();
  await expect(page.getByLabel(`Participant history for ${held.orderNumber}`)).toHaveCount(0);
  expect(requests).toBe(0);
  await trigger.focus();
  await trigger.press('Enter');
  const panel = page.locator('.organizer-participant-history[open]');
  await expect(panel.getByRole('alert')).toContainText('Could not load participant history');
  await trigger.press('Enter');
  await expect(page.locator('.organizer-participant-history [role="alert"]')).toHaveCount(0);
  await trigger.press('Enter');

  const list = panel.getByRole('list', { name: 'Confirmed participant history' });
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await expect(list).toContainText(anchor.orderNumber);
  await expect(list).toContainText(first.orderNumber);
  await expect(list).not.toContainText(proxy.orderNumber);
  await expect(panel).toContainText('History can connect junior and adult orders through an approved claim.');
  await expect(panel).toContainText('Event participants counts adult self-registrations by account.');
  await expect(panel.getByRole('list', { name: 'Other events in this organization' })).toHaveCount(0);
  await expect(panel).not.toContainText('Fictional');

  await page.setViewportSize({ width: 360, height: 900 });
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include('.organizer-participant-history[open]').analyze()).violations).toEqual([]);
  }

  const email = `organizer-history-finance-${eventId}@example.test`;
  const financeContext = await browser.newContext({ baseURL, extraHTTPHeaders: { Authorization: `Bearer test:${email}` } });
  try {
    await financeContext.request.get('/api/me');
    expect((await page.request.post(`/api/organizations/${organizationId}/members`, { data: { email, role: 'finance' } })).status()).toBe(200);
    const finance = await financeContext.newPage();
    await finance.addInitScript((address) => sessionStorage.setItem('cyclereg.test-session', address), email);
    await finance.goto(registrationsUrl);
    await expect(finance.getByRole('heading', { name: 'Registrations', exact: true })).toBeVisible();
    await expect(finance.getByRole('list', { name: 'Registrations', exact: true }).getByRole('listitem').filter({ hasText: anchor.orderNumber }).first()).toBeVisible();
    await expect(finance.getByText('Participant history', { exact: true })).toHaveCount(0);
    expect((await financeContext.request.get(historyUrl)).status()).toBe(403);
  } finally {
    await financeContext.close();
  }
});

test('organizer history shows another event and labels a demo event', async ({ page }) => {
  const demo = await page.request.post('/api/demo');
  expect(demo.status()).toBe(201);
  const { eventId, organizationId } = await demo.json();
  const eventUrl = `/api/events/${eventId}`;
  expect((await publishReviewed(page.request, eventUrl, { acknowledgeWarnings: true })).status()).toBe(200);
  const source = await (await page.request.get(eventUrl)).json();
  const created = await page.request.post(`/api/organizations/${organizationId}/events`, {
    data: { name: 'Second fictional event', template: 'road_race', startDate: '2027-04-04', timeZone: 'America/Los_Angeles' },
  });
  expect(created.status()).toBe(201);
  const same = await created.json();
  const copied = await page.request.put(`/api/events/${same.id}/config`, {
    data: {
      revision: same.revision,
      config: {
        ...source.config,
        event: { ...source.config.event, name: 'Second fictional event', isDemo: false },
        categories: source.config.categories.map((category: { registration: { opensAt: string | null; closesAt: string | null } }) => ({
          ...category,
          registration: { ...category.registration, opensAt: null, closesAt: null },
        })),
      },
    },
  });
  expect(copied.status()).toBe(200);
  expect((await publishReviewed(page.request, `/api/events/${same.id}`, { acknowledgeWarnings: true })).status()).toBe(200);

  const place = async (event: string, ref: string) => {
    const { config } = await (await page.request.get(`/api/events/${event}`)).json();
    const category = config.categories.find((row: { timingCode: string }) => row.timingCode === 'RR-M35-34');
    const result = await page.request.post(`/api/rider/events/${event}/orders`, {
      data: {
        clientRequestId: `organizer-history-other-${ref}`,
        categoryIds: [category.id],
        selfRegistrationConfirmed: true,
        rider: {
          firstName: 'Sam', lastName: 'Fictional', email: 'rider@example.test', team: '',
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
    expect(result.status(), await result.text()).toBe(201);
    const order = await result.json() as { id: string; orderNumber: string };
    expect((await page.request.post(`/api/orders/${order.id}/payment`, {
      data: { attemptId: `organizer-history-other-paid-${order.id}`, outcome: 'success' },
    })).status()).toBe(200);
    return order;
  };
  const demoOrder = await place(eventId, 'demo');
  const realOrder = await place(same.id, 'real');

  const openHistory = async (registrationsEvent: string, orderNumber: string) => {
    await page.goto(`/#/events/${registrationsEvent}/registrations`);
    const trigger = page.getByLabel(`Participant history for ${orderNumber}`);
    await trigger.focus();
    await trigger.press('Enter');
    const panel = page.locator('.organizer-participant-history[open]');
    await expect(panel.getByRole('list', { name: 'Confirmed participant history' })).toBeVisible();
    return panel;
  };

  const fromReal = await openHistory(same.id, realOrder.orderNumber);
  const demoGroup = fromReal.getByRole('list', { name: 'Other events in this organization' });
  await expect(demoGroup).toContainText('Example Valley Omnium (demonstration)');
  await expect(demoGroup.getByText('Demo', { exact: true })).toBeVisible();
  await expect(fromReal).toContainText('Demo marks simulated orders.');
  await expect(demoGroup).toContainText(demoOrder.orderNumber);
  await expect(fromReal).not.toContainText('Fictional');
  await expect(fromReal).toContainText(realOrder.orderNumber);

  const fromDemo = await openHistory(eventId, demoOrder.orderNumber);
  const realGroup = fromDemo.getByRole('list', { name: 'Other events in this organization' });
  await expect(realGroup).toContainText('Second fictional event');
  await expect(realGroup.getByText('Demo', { exact: true })).toHaveCount(0);
  await expect(fromDemo).not.toContainText('Demo marks simulated orders.');
  await expect(realGroup).toContainText(realOrder.orderNumber);
  await expect(fromDemo).not.toContainText('Fictional');

  await page.setViewportSize({ width: 360, height: 900 });
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    expect(await fromDemo.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include('.organizer-participant-history[open]').analyze()).violations).toEqual([]);
  }
});
