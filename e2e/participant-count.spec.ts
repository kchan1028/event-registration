import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';
import { publishReviewed } from './support/publish';

test('explains the event participant count to staff with entry management access', async ({ page, browser }) => {
  const demo = await page.request.post('/api/demo');
  expect(demo.status()).toBe(201);
  const { eventId, organizationId } = await demo.json();
  const eventUrl = `/api/events/${eventId}`;
  const route = `/#/events/${eventId}/registrations`;
  expect((await publishReviewed(page.request, eventUrl, { acknowledgeWarnings: true })).status()).toBe(200);

  await page.goto(route);
  const toggle = page.getByText('Event participants', { exact: true });
  await toggle.click();
  const section = page.getByRole('region', { name: 'Event participants' });
  await expect(section.getByRole('status')).toHaveText('0 participants with confirmed orders');

  const { config } = await (await page.request.get(eventUrl)).json();
  const category = config.categories.find((row: { timingCode: string }) => row.timingCode === 'RR-J1516');
  const rider = {
    firstName: 'Sam', lastName: 'Fictional', email: '', team: '',
    racingAge: 16, licenseCategory: null, licenseType: 'annual', competitionClass: 'men',
    collegiateDivision: null,
    guardian: { name: 'Pat Fictional', relationship: 'Parent', email: 'parent@example.test', phone: '' },
    emergencyContact: { name: 'Pat Fictional', phone: '555-555-0199' },
  };
  for (const attempt of [1, 2]) {
    const created = await page.request.post(`/api/rider/events/${eventId}/orders`, {
      data: {
        clientRequestId: `participant-order-${attempt}`,
        categoryIds: [category.id],
        rider,
        waiver: {
          version: config.registration.waiverVersion, read: true, agreed: true,
          signatureName: 'Pat Fictional', signerRole: 'guardian',
        },
      },
    });
    expect(created.status(), await created.text()).toBe(201);
    const { id } = await created.json();
    expect((await page.request.post(`/api/orders/${id}/payment`, {
      data: { attemptId: `participant-payment-${eventId}-${attempt}`, outcome: 'success' },
    })).status()).toBe(200);
  }

  let failCountRequest = true;
  await page.route(`**${eventUrl}/participant-groups`, (route) =>
    failCountRequest ? route.fulfill({ status: 503, json: { error: 'Temporary failure' } }) : route.continue(),
  );
  await page.reload();
  await toggle.click();
  await expect(section.getByRole('alert')).toHaveText('Could not load the participant count.');
  const retry = section.getByRole('button', { name: 'Retry participant count' });
  await retry.focus();
  failCountRequest = false;
  await retry.press('Enter');
  await expect(section.getByRole('status')).toHaveText('1 participant with confirmed orders');
  await expect(section.getByRole('status')).toBeFocused();
  await expect(section).toContainText('one check-in card for two participants');
  await expect(section).toContainText('two check-in cards for one participant');
  await expect(section).not.toContainText('Fictional');

  for (const colorScheme of ['light', 'dark'] as const) {
    await page.setViewportSize({ width: 360, height: 900 });
    await page.emulateMedia({ colorScheme });
    expect(await section.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include('[aria-labelledby="participant-count-title"]').analyze()).violations).toEqual([]);
  }

  const email = `participant-count-finance-${eventId}@example.test`;
  const context = await browser.newContext({ extraHTTPHeaders: { Authorization: `Bearer test:${email}` } });
  try {
    await context.request.get('/api/me');
    expect((await page.request.post(`/api/organizations/${organizationId}/members`, { data: { email, role: 'finance' } })).status()).toBe(200);
    const member = await context.newPage();
    await member.addInitScript((address) => sessionStorage.setItem('cyclereg.test-session', address), email);
    await member.goto(route);
    await expect(member.getByRole('heading', { name: 'Registrations', exact: true })).toBeVisible();
    await expect(member.getByText('Event participants', { exact: true })).toHaveCount(0);
    expect((await context.request.get(`${eventUrl}/participant-groups`)).status()).toBe(403);
  } finally {
    await context.close();
  }
});
