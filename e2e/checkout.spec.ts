import AxeBuilder from '@axe-core/playwright';
import { E2E_ORGANIZER, expect, test, type Page } from './fixtures';
import { seedRegistrationCase } from './support/registration-case';
import type { CheckInList } from '../src/shared/checkin';
import { publishReviewed } from './support/publish';

/* Clickable demo purchase flow (product.md 2a) using isolated generated case-study data. */

async function openEvent(page: Page, kind: 'criterium' | 'omnium'): Promise<string> {
  const eventId = await seedRegistrationCase(page.request, kind);
  await page.goto('/');
  await page.getByRole('button', { name: 'Browse rider events' }).click();
  await expect(page.getByRole('heading', { name: 'Choose an event' })).toBeVisible();
  // The event list covers demo and real events, so each demo event carries its own label.
  await expect(page.locator(`a[href="#/register/${eventId}"]`).locator('.tag--demo')).toHaveText('Demo data');
  await page.locator(`a[href="#/register/${eventId}"]`).click();
  await expect(page.getByRole('heading', { name: 'About you' })).toBeVisible();
  // Inside a demo event the header says so.
  await expect(page.locator('.demo-badge')).toHaveText('Demo');
  return new URL(page.url()).hash.split('/')[2];
}

async function signAndReview(page: Page, name: string) {
  await page.getByLabel('I have read the whole waiver').check();
  await page.getByLabel(/Type your full name to sign/).fill(name);
  await page.getByLabel(/agree to this waiver/).check();
  await page.getByRole('button', { name: 'Sign and review the order' }).click();
}

test('two races on one day: second-race discount, fees, signature errors, back navigation, simulated payment', async ({ page }) => {
  await openEvent(page, 'criterium');
  await expect(page).toHaveTitle(/^Race registration · .+ \| CycleReg$/);
  await page.getByLabel('Use a demo rider (fake data)').selectOption('rider-alex');
  // Fixture registration opens Jan 1, 2027; the demo says so and lets testers try it anyway.
  if (new Date() < new Date('2027-01-01T17:00:00Z')) await expect(page.getByRole('note').filter({ hasText: 'Demo mode:' })).toContainText('opens Jan 1, 2027');

  await expect(page.getByRole('checkbox', { name: /DVC-M35/ })).toHaveAttribute('aria-disabled', 'true'); // full and too young
  await page.getByRole('checkbox', { name: /DVC-M45/ }).click();
  await page.getByRole('checkbox', { name: /DVC-O45E/ }).click();
  const tray = page.locator('.tray');
  await expect(tray).toContainText('Second race discount');
  await expect(tray).toContainText('Demo platform fee');
  await expect(tray).toContainText('Demo processing fee (simulated)');
  await expect(tray.locator('.quote__total')).toContainText('$59.65');

  await page.getByRole('button', { name: 'Continue to racer details' }).click();
  await expect(page.getByRole('heading', { name: 'Racer details' })).toBeFocused();
  await expect(page.getByLabel('First name (required)')).toHaveValue('Alex');
  await page.getByRole('button', { name: 'Continue to the waiver' }).click();
  await expect(page.getByRole('heading', { name: 'Waiver', exact: true })).toBeFocused();

  await page.getByRole('button', { name: 'Sign and review the order' }).click();
  const summary = page.locator('.error-summary');
  await expect(summary).toContainText('Type your full name to sign the waiver.');
  await expect(summary).toContainText('Check the box to confirm you agree to the waiver.');
  await expect(page.getByRole('checkbox', { name: 'I’m registering myself' })).not.toBeChecked();
  const proxyRequest = page.waitForRequest((request) => request.method() === 'POST' && request.url().includes('/api/rider/events/') && request.url().endsWith('/orders'));
  await signAndReview(page, 'Alex Demo');
  expect((await proxyRequest).postDataJSON()).not.toHaveProperty('selfRegistrationConfirmed');
  await expect(page.getByRole('heading', { name: 'Review your order' })).toBeFocused();

  await expect(page.locator('.simulated').first()).toHaveText('Simulated payment: no money is charged.');
  await expect(page.getByRole('button', { name: /^Pay/ })).toHaveCount(0);

  // Back to a completed step keeps the data (and releases the hold).
  await page.getByRole('button', { name: /Racer details/ }).click();
  await expect(page.getByRole('heading', { name: 'Racer details' })).toBeFocused();
  await expect(page.getByLabel('Last name (required)')).toHaveValue('Demo');
  await page.getByRole('button', { name: 'Continue to the waiver' }).click();
  await expect(page.getByLabel(/Type your full name to sign/)).toHaveValue('Alex Demo');
  await page.getByRole('button', { name: 'Sign and review the order' }).click();

  await page.getByRole('button', { name: 'Simulate a declined payment' }).click();
  await expect(page.getByRole('alert')).toContainText('declined');
  await page.getByRole('button', { name: /Complete simulated payment \(\$59\.65\)/ }).click();

  await expect(page.getByRole('heading', { name: 'You’re entered' })).toBeVisible();
  // The check-in code is also shown as a QR code for scanning at the check-in table.
  await expect(page.getByRole('img', { name: /QR code for check-in code/ })).toBeVisible();
  await expect(page.locator('.reg__meta')).toContainText(/order DEMO-/);
  await expect(page.locator('.receipt')).toHaveAttribute('data-watermark', 'DEMO');
  await expect(page.locator('.receipt')).toContainText('Simulated payment: no money is charged.');
  await expect(page.locator('.done__entry').first()).toContainText('License: simulated check valid (demo)');
  await expect(page.locator('.done__entry').first()).toContainText('Waiver signed by Alex Demo');
});

test('adult self-registration requires a fresh choice and retries the same signed-in request', async ({ page }) => {
  const eventId = await openEvent(page, 'criterium');
  await page.getByLabel('Use a demo rider (fake data)').selectOption('rider-alex');
  await page.getByRole('checkbox', { name: /DVC-M45/ }).click();
  await page.getByRole('button', { name: 'Continue to racer details' }).click();
  const continueToWaiver = page.getByRole('button', { name: 'Continue to the waiver' });
  await continueToWaiver.click();
  const self = page.getByRole('checkbox', { name: 'I’m registering myself' });
  await expect(self).toBeEnabled();
  await self.check();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await continueToWaiver.click();
  await expect(self).not.toBeChecked();
  await page.setViewportSize({ width: 360, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  expect((await new AxeBuilder({ page }).include('[aria-labelledby="waiver-title"]').analyze()).violations).toEqual([]);
  await self.focus();
  await self.press('Space');
  await expect(self).toBeChecked();

  const requests: unknown[] = [];
  const replies: { id: string; selfRegistrationConfirmed?: boolean }[] = [];
  await page.route(`**/api/rider/events/${eventId}/orders`, async (route) => {
    requests.push(route.request().postDataJSON());
    const response = await route.fetch();
    replies.push(await response.json());
    if (requests.length === 1) await route.abort('failed');
    else await route.fulfill({ response });
  });
  await signAndReview(page, 'Alex Demo');
  await expect(page.locator('.error-summary')).toContainText('Cannot reach');
  await expect(page.getByText('Your self-registration confirmation is saved with this pending request.')).toBeVisible();
  await expect(self).toHaveCount(0);
  expect(requests[0]).toMatchObject({ selfRegistrationConfirmed: true });
  expect(replies[0]).toMatchObject({ selfRegistrationConfirmed: true });

  await page.reload();
  await expect(page.getByRole('button', { name: 'Retry reservation' })).toBeEnabled();
  const switchAccount = async (email: string) => {
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.getByRole('button', { name: 'Sign in with email' }).click();
    await page.getByLabel('Test email').fill(email);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  };
  await switchAccount('different-checkout-rider@example.test');
  const retry = page.getByRole('button', { name: 'Retry reservation' });
  await expect(retry).toBeDisabled();
  await expect(page.getByText(/Sign back in with the account that confirmed self-registration/)).toBeVisible();
  expect(requests).toHaveLength(1);
  await switchAccount(E2E_ORGANIZER);
  await retry.click();
  await expect(page.getByRole('heading', { name: 'Review your order' })).toBeVisible();
  expect(requests).toEqual([requests[0], requests[0]]);
  expect(replies).toEqual([replies[0], replies[0]]);
});

test('weekend bundle needs both days; missing details show field messages and a summary', async ({ page }) => {
  await openEvent(page, 'omnium');
  await page.getByLabel('Racing age').fill('40');
  await page.getByLabel('License category').selectOption('3');
  await page.getByLabel(/I want the/).check();
  await page.getByRole('checkbox', { name: /DRW-RR-M35/ }).click();
  await page.getByRole('button', { name: 'Continue to racer details' }).click();
  await expect(page.locator('.error-summary')).toContainText('needs an entry in every included race');

  await page.getByRole('checkbox', { name: /DRW-CR-M35/ }).click();
  await expect(page.locator('.tray .quote__total')).toContainText('$80.25');
  await page.getByRole('button', { name: 'Continue to racer details' }).click();

  await page.getByRole('button', { name: 'Continue to the waiver' }).click();
  const summary = page.locator('.error-summary');
  await expect(summary).toBeFocused();
  for (const msg of ['Enter your first name.', 'Enter your last name.', 'Enter an email address, like name@example.com.', "Enter an emergency contact's name."]) await expect(summary).toContainText(msg);
  await expect(page.locator('#f-first-name')).toHaveAttribute('aria-invalid', 'true');

  await page.getByLabel('First name (required)').fill('Pat');
  await page.getByLabel('Last name (required)').fill('Tester');
  await page.getByLabel('Email for the receipt (required)').fill('pat.tester@example.com');
  await page.getByLabel('Contact name').fill('Lee Tester');
  await page.getByLabel('Contact phone').fill('555-555-0123');
  await page.getByRole('button', { name: 'Continue to the waiver' }).click();
  await expect(page.getByRole('heading', { name: 'Waiver' })).toBeVisible();
});

test('a removed package refuses the reservation until the rider clears their choice', async ({ page }) => {
  const eventId = await openEvent(page, 'omnium');
  await page.getByLabel('Use a demo rider (fake data)').selectOption('rider-alex');
  await page.getByLabel('Racing age').fill('40');
  await page.getByLabel(/I want the/).check();
  for (const code of [/DRW-RR-M35/, /DRW-CR-M35/]) await page.getByRole('checkbox', { name: code }).click();
  await page.getByRole('button', { name: 'Continue to racer details' }).click();
  await page.getByRole('button', { name: 'Continue to the waiver' }).click();

  const headers = { Authorization: `Bearer test:${E2E_ORGANIZER}` };
  const event = await (await page.request.get(`/api/events/${eventId}`, { headers })).json();
  event.config.registration.bundles = [];
  expect((await page.request.put(`/api/events/${eventId}/config`, { headers, data: { config: event.config, revision: event.revision } })).ok()).toBe(true);
  expect((await publishReviewed(page.request, `/api/events/${eventId}`, { acknowledgeWarnings: true }, headers)).ok()).toBe(true);

  await signAndReview(page, 'Alex Demo');
  await expect(page.locator('.error-summary')).toContainText('Your selected package is no longer available');
  await page.getByRole('button', { name: /Choose races/ }).click();
  await page.getByRole('button', { name: 'Clear package choice' }).click();
  await expect(page.getByRole('heading', { name: 'Your entries' })).toBeFocused();
  await page.getByRole('button', { name: 'Continue to racer details' }).click();
  await page.getByRole('button', { name: 'Continue to the waiver' }).click();
  await signAndReview(page, 'Alex Demo');
  await expect(page.getByRole('heading', { name: 'Review your order' })).toBeVisible();
});

test('junior with guardian: only the guardian’s typed name signs', async ({ page }) => {
  await openEvent(page, 'criterium');
  await page.getByLabel('Use a demo rider (fake data)').selectOption('rider-casey');
  await page.getByRole('checkbox', { name: /DVC-J1014/ }).click();
  await expect(page.locator('.tray .quote__total')).toContainText('$18.45');
  await page.getByRole('button', { name: 'Continue to racer details' }).click();
  await expect(page.getByLabel('Guardian name')).toHaveValue('Jordan Demo');
  await page.getByRole('button', { name: 'Continue to the waiver' }).click();

  await expect(page.getByRole('checkbox', { name: 'I’m registering myself' })).toHaveCount(0);
  await signAndReview(page, 'Casey Demo');
  await expect(page.locator('.error-summary')).toContainText("The typed name must match the rider's name (or the guardian's, for a minor).");
  await page.getByLabel(/Type your full name to sign/).fill('Jordan Demo');
  await page.getByRole('button', { name: 'Sign and review the order' }).click();
  await page.getByRole('button', { name: /Complete simulated payment/ }).click();
  await expect(page.locator('.done__entry')).toContainText('Guardian signature recorded');
});

test('a paid rider can receive a bib after the organizer reviews the license', async ({ page }) => {
  const eventId = await openEvent(page, 'criterium');
  await page.getByLabel('Use a demo rider (fake data)').selectOption('rider-sam');
  await page.getByRole('checkbox', { name: /DVC-W345/ }).click();
  await expect(page.locator('.tray .quote__total')).toContainText('$39.05');
  await page.getByRole('button', { name: 'Continue to racer details' }).click();
  await page.getByRole('button', { name: 'Continue to the waiver' }).click();
  await signAndReview(page, 'Sam Demo');
  await page.getByRole('button', { name: /Complete simulated payment/ }).click();
  await expect(page.locator('.done__entry')).toContainText('License needs review');

  const eventUrl = `/api/events/${eventId}`;
  const bibSettings = await page.request.put(`${eventUrl}/bib-settings`, {
    data: { scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 199 }] },
  });
  expect(bibSettings.ok()).toBe(true);
  const checkInUrl = `/#/events/${eventId}/check-in`;
  const detail = page.getByRole('region', { name: 'Rider check-in' });
  const findRider = async () => {
    await page.goto(checkInUrl);
    const search = page.getByRole('searchbox', { name: 'Find a rider' });
    await search.fill('Sam Demo');
    await search.press('Enter');
    await expect(detail.getByRole('heading', { name: 'Sam Demo', exact: true })).toBeVisible();
  };
  const readRider = async () => {
    const response = await page.request.get(`${eventUrl}/check-in`, { params: { q: 'Sam Demo' } });
    expect(response.ok()).toBe(true);
    const list: CheckInList = await response.json();
    expect(list.riders).toHaveLength(1);
    return list.riders[0];
  };
  await findRider();
  await expect(detail.getByRole('status')).toContainText('Not ready');
  await expect(detail.getByText('License needs review', { exact: true }).first()).toBeVisible();
  await expect(detail.getByRole('button', { name: /Check in and issue/ })).toHaveCount(0);
  const before = await readRider();
  expect(before).toMatchObject({ payment: 'confirmed', bib: null, checkedInAt: null });

  await page.goto(`/#/events/${eventId}/registrations`);
  await page.getByRole('button', { name: /License review/ }).click();
  const order = page.locator('.order', { hasText: 'Sam Demo' });
  await order.getByRole('button', { name: 'Review license' }).click();
  const confirmReview = order.getByRole('group', { name: /^Review the license for/ });
  await expect(confirmReview.getByRole('textbox')).toHaveCount(0);
  await order.getByRole('button', { name: 'Mark reviewed' }).click();
  await expect(order).toHaveCount(0);
  await page.getByRole('button', { name: /^All/ }).click();
  await expect(page.locator('.order', { hasText: 'Sam Demo' })).toContainText('License reviewed');
  await findRider();
  await expect(detail.getByRole('status')).toContainText('Ready to race');
  const list: CheckInList = await (await page.request.get(`${eventUrl}/check-in`)).json();
  const batch = { dayId: list.dayId, orderIds: [before.orderId] };
  const preview = await page.request.post(`${eventUrl}/bibs/preview`, { data: batch });
  expect(preview.ok()).toBe(true);
  const { fingerprint } = await preview.json();
  expect((await page.request.post(`${eventUrl}/bibs/apply`, { data: { ...batch, fingerprint } })).ok()).toBe(true);
  await findRider();
  await detail.getByRole('button', { name: 'Check in and issue bib 100', exact: true }).click();
  await expect(detail.getByRole('button', { name: 'Undo check-in' })).toBeVisible();
  await expect(detail.locator('.ci-bib__number')).toHaveText('100');
  expect(await readRider()).toMatchObject({
    orderId: before.orderId, entries: before.entries, payment: 'confirmed', bib: 100, checkedInAt: expect.any(String),
  });
});

test('rider screens follow the theme toggle and remember it', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await openEvent(page, 'criterium');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: /Switch to dark theme/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.demo-badge')).toBeVisible();
  await page.screenshot({ path: 'test-results/rider-dark.png' });
  const scheme = page.locator('meta[name="color-scheme"]');
  await expect(scheme).toHaveAttribute('content', 'dark');
  await page.getByRole('button', { name: /Switch to light theme.*system preference/ }).click();
  await expect(scheme).toHaveAttribute('content', 'light dark');
  await page.reload();
  await expect(scheme).toHaveAttribute('content', 'light dark');

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: /Switch to light theme/ }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(scheme).toHaveAttribute('content', 'light');
});

test('with the demo setting off, categories outside their window cannot be chosen', async ({ page }) => {
  test.skip(new Date() >= new Date('2027-02-01T17:00:00Z'), 'Demo windows open Feb 1, 2027; this check needs a date before that.');
  await page.goto('/');
  await page.getByRole('button', { name: 'fictional example weekend' }).click();
  await expect(page.getByRole('heading', { name: 'Saturday road race', level: 2 })).toBeVisible();
  await page.getByRole('link', { name: 'Event setup' }).click();
  await page.getByLabel(/let testers register outside the registration windows/).uncheck();
  await expect(page.locator('.save')).toContainText('All changes saved');
  await page.getByRole('link', { name: 'Review and publish' }).last().click();
  const ack = page.getByLabel(/I have reviewed the/);
  if (await ack.count()) await ack.check();
  await page.getByRole('button', { name: /Publish version 1/ }).click();
  await page.getByRole('link', { name: /Open rider registration/ }).click();

  await expect(page.getByRole('note').filter({ hasText: 'Registration opens Feb 1, 2027' })).toBeVisible();
  const option = page.getByRole('checkbox', { name: /RR-M35-34/ });
  await expect(option).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('.opt', { has: option })).toContainText('Opens Feb 1, 2027, 9:00 AM');
  await page.locator('.sched-day').first().evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: 'test-results/windows-enforced.png' });
});

test('organizer creates a coupon code; the rider applies it at checkout and the redemption is counted', async ({ page }) => {
  const eventId = await openEvent(page, 'criterium');

  await page.goto(`/#/events/${eventId}/registrations`);
  const coupons = page.locator('section', { has: page.getByRole('heading', { name: 'Coupon codes' }) });
  await coupons.getByRole('button', { name: 'Add a coupon code' }).click();
  await coupons.getByRole('textbox', { name: 'Code', exact: true }).fill('e2e10');
  await coupons.getByLabel('Percent off each eligible entry').fill('10');
  await coupons.getByLabel('Total uses (optional)').fill('1');
  await coupons.getByRole('button', { name: 'Save coupon code' }).click();
  const row = coupons.getByRole('row', { name: /E2E10/ });
  await expect(row).toContainText('10%');
  await expect(row).toContainText('0 paid of 1');

  await page.goto(`/#/register/${eventId}`);
  await page.getByLabel('Use a demo rider (fake data)').selectOption('rider-alex');
  await page.getByRole('checkbox', { name: /DVC-M45/ }).click();
  const tray = page.locator('.tray');
  await tray.getByLabel('Coupon code').fill('nope');
  await tray.getByRole('button', { name: 'Apply' }).click();
  await expect(tray).toContainText('NOPE is not a code for this event.');
  await tray.getByLabel('Coupon code').fill('e2e10');
  await tray.getByRole('button', { name: 'Apply' }).click();
  await expect(tray.locator('.quote__discount')).toContainText('Coupon E2E10');

  await page.getByRole('button', { name: 'Continue to racer details' }).click();
  await page.getByRole('button', { name: 'Continue to the waiver' }).click();
  await signAndReview(page, 'Alex Demo');
  await expect(page.locator('.quote')).toContainText('Coupon E2E10');
  await page.getByRole('button', { name: /Complete simulated payment/ }).click();
  await expect(page.getByRole('heading', { name: 'You’re entered' })).toBeVisible();
  await expect(page.locator('.receipt')).toContainText('Coupon E2E10');

  await page.goto(`/#/events/${eventId}/registrations`);
  await expect(page.getByRole('row', { name: /E2E10/ })).toContainText('1 paid of 1');
});

test('organizer finds a registration by order number and corrects the rider’s name with a reason', async ({ page }) => {
  const eventId = await openEvent(page, 'criterium');
  await page.getByLabel('Use a demo rider (fake data)').selectOption('rider-alex');
  await page.getByRole('checkbox', { name: /DVC-O45E/ }).click();
  await page.getByRole('button', { name: 'Continue to racer details' }).click();
  await page.getByRole('button', { name: 'Continue to the waiver' }).click();
  await signAndReview(page, 'Alex Demo');
  await page.getByRole('button', { name: /Complete simulated payment/ }).click();
  await expect(page.getByRole('heading', { name: 'You’re entered' })).toBeVisible();
  const orderNumber = ((await page.locator('.reg__meta').textContent()) ?? '').match(/DEMO-[A-Z0-9]+/)![0];

  await page.goto(`/#/events/${eventId}/registrations`);
  await page.getByRole('searchbox', { name: 'Find a registration' }).fill(orderNumber.toLowerCase());
  await expect(page.getByRole('status').filter({ hasText: 'registration matches' })).toHaveText(/^1 registration matches/);
  const list = page.getByRole('list', { name: 'Registrations', exact: true });
  await expect(list.locator(':scope > .order')).toHaveCount(1);
  const order = list.locator('.order', { hasText: orderNumber });

  await order.getByRole('button', { name: 'Correct details for Alex Demo' }).click();
  await order.getByLabel('Last name').fill('Demos');
  await order.getByRole('button', { name: 'Save correction' }).click();
  await expect(order.getByRole('alert')).toHaveText('Write why the details are being corrected.');
  await order.getByLabel('Reason for the correction (required)').fill('Rider emailed: surname misspelled');
  await order.getByRole('button', { name: 'Save correction' }).click();
  await expect(order.locator('.order__name')).toContainText('Alex Demos');
  await expect(order.getByRole('list', { name: 'Corrections to Alex Demos' })).toContainText('Last name: “Demo” to “Demos”');
  await expect(order.getByRole('list', { name: 'Corrections to Alex Demos' })).toContainText('Rider emailed: surname misspelled');

  await page.getByRole('searchbox', { name: 'Find a registration' }).fill('no such rider');
  await expect(page.locator('.empty')).toContainText('No registration matches “no such rider”');
});

test('organizer finds a paid registration by the whole license number or an active bib', async ({ page }) => {
  const eventId = await openEvent(page, 'criterium');
  await page.getByLabel('Use a demo rider (fake data)').selectOption('rider-alex');
  await page.getByRole('checkbox', { name: /DVC-O45E/ }).click();
  await page.getByRole('button', { name: 'Continue to racer details' }).click();
  await page.getByRole('button', { name: 'Continue to the waiver' }).click();
  await signAndReview(page, 'Alex Demo');
  await page.getByRole('button', { name: /Complete simulated payment/ }).click();
  await expect(page.getByRole('heading', { name: 'You’re entered' })).toBeVisible();

  const orders = await (await page.request.get(`/api/events/${eventId}/orders`)).json() as {
    id: string;
    entries: { dayId: string }[];
    rider: { firstName: string; lastName: string };
  }[];
  const alex = orders.find((order) => order.rider.firstName === 'Alex' && order.rider.lastName === 'Demo');
  expect(alex?.entries[0]?.dayId).toBeTruthy();
  expect((await page.request.put(`/api/events/${eventId}/bib-settings`, {
    data: { scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 199 }] },
  })).ok()).toBe(true);
  const batch = { dayId: alex!.entries[0].dayId, orderIds: [alex!.id] };
  const preview = await page.request.post(`/api/events/${eventId}/bibs/preview`, { data: batch });
  expect(preview.ok()).toBe(true);
  const plan = await preview.json() as { fingerprint: string; assignments: { bib: number }[] };
  const bib = plan.assignments[0].bib;
  expect((await page.request.post(`/api/events/${eventId}/bibs/apply`, { data: { ...batch, fingerprint: plan.fingerprint } })).ok()).toBe(true);

  await page.goto(`/#/events/${eventId}/registrations`);
  const search = page.getByRole('searchbox', { name: 'Find a registration' });
  await expect(search).toHaveAttribute('placeholder', 'Rider name, email, team, bib, license number, order number, or check-in code');
  const list = page.getByRole('list', { name: 'Registrations', exact: true });
  const alexRows = () => list.locator(':scope > .order', { hasText: 'Alex Demo' });

  await search.fill('DEMO-100001');
  await expect(alexRows()).toHaveCount(1);
  await expect(page.getByRole('status').filter({ hasText: 'registration matches' })).toHaveText(/^1 registration matches/);
  await search.fill('100001');
  await expect(alexRows()).toHaveCount(0);
  await search.fill(String(bib));
  await expect(alexRows()).toHaveCount(1);
  await search.fill(`0${bib}`);
  await expect(alexRows()).toHaveCount(1);
  await search.fill(String(bib).slice(0, -1));
  await expect(alexRows()).toHaveCount(0);
  await search.fill('100');
  await expect(alexRows()).toHaveCount(bib === 100 ? 1 : 0);

  await page.setViewportSize({ width: 390, height: 844 });
  await search.fill('DEMO-100001');
  await expect(alexRows()).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('Berkeley package recalculates when rider age changes between junior and standard rates', async ({ page }) => {
  const seeded = await page.request.post('/api/demo/berkeley-events');
  expect(seeded.ok()).toBe(true);
  const eventId = (await seeded.json()).eventIds[0];
  await page.goto(`/#/register/${eventId}`);
  await page.getByLabel('Racing age').fill('17');
  await page.getByLabel('License category').selectOption('3');
  await expect(page.getByRole('checkbox', { name: /RR-E3/ })).toContainText('$30');
  await page.getByRole('checkbox', { name: /RR-E3/ }).click();
  await page.getByRole('checkbox', { name: /CR-E3/ }).click();
  await expect(page.locator('.tray .quote__total')).toContainText('$40');
  await page.getByLabel('Racing age').fill('30');
  await expect(page.locator('.tray .quote__total')).toContainText('$130');
  await expect(page.getByRole('checkbox', { name: /RR-E3/ })).toContainText('$80');
});


test('Berkeley shows every Omnium rate above the schedule before rider details are entered', async ({ page }) => {
  const seeded = await page.request.post('/api/demo/berkeley-events');
  expect(seeded.ok()).toBe(true);
  const eventId = (await seeded.json()).eventIds[0];
  await page.goto(`/#/register/${eventId}`);
  const pricing = page.getByRole('region', { name: 'Omnium pricing' });
  for (const [label, amount] of [['Junior', '$40'], ['Collegiate', '$90'], ['Women', '$50'], ['Standard', '$130']]) {
    await expect(pricing.getByRole('row').filter({ hasText: label })).toContainText(amount);
  }
  await expect(pricing).toContainText('lowest eligible price applies automatically');
  expect(await page.evaluate(() => Boolean(document.querySelector('.package-pricing')!.compareDocumentPosition(document.querySelector('#schedule')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await expect(page.locator('.bundle-pick')).not.toContainText('$130');
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    if (viewport.width === 390) await page.getByRole('button', { name: /Switch to dark/ }).click();
    await pricing.scrollIntoViewIfNeeded();
    await expect(pricing).toBeVisible();
    expect(await pricing.evaluate((node) => node.getBoundingClientRect().right <= window.innerWidth && node.scrollWidth <= node.clientWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include('.package-pricing').analyze()).violations).toEqual([]);
    await page.screenshot({ path: test.info().outputPath(`berkeley-pricing-${viewport.width}.png`) });
  }
});

test('Berkeley shortcut finds the six category choices for a 50-year-old Cat 4 and restores the full schedule', async ({ page }) => {
  const seeded = await page.request.post('/api/demo/berkeley-events');
  const eventId = (await seeded.json()).eventIds[0];
  await page.goto(`/#/register/${eventId}`);
  const schedule = page.locator('#schedule');
  await expect(schedule.getByRole('checkbox')).toHaveCount(54);
  await expect(page.getByRole('button', { name: 'Find my races', exact: true })).toBeDisabled();
  await page.getByLabel('Racing age').fill('50');
  await page.getByLabel('License category').selectOption('4');
  await expect(schedule.getByRole('checkbox')).toHaveCount(54);
  await expect(schedule.getByRole('checkbox', { name: /RR-WL/ }).locator('..')).toContainText('Organizer review');
  await page.getByRole('button', { name: 'Find my races', exact: true }).click();
  await expect(schedule).toBeFocused();
  await expect(schedule.getByRole('heading', { name: 'Your matching races', exact: true })).toBeInViewport();
  await expect(schedule.getByRole('checkbox')).toHaveCount(6);
  for (const code of ['RR-E4', 'RR-M35-34', 'RR-M50-34', 'CR-E4', 'CR-M35-34', 'CR-M50-34']) {
    await expect(schedule.getByRole('checkbox', { name: new RegExp(code) })).toBeVisible();
  }
  await expect(schedule.getByRole('checkbox', { name: /RR-WL/ })).toHaveCount(0);
  await expect(schedule).toContainText('2 categories start together and are scored separately');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    if (width === 390) await page.getByRole('button', { name: /Switch to dark/ }).click();
    await schedule.getByRole('heading', { name: 'Your matching races', exact: true }).scrollIntoViewIfNeeded();
    expect(await schedule.evaluate((node) => node.getBoundingClientRect().right <= window.innerWidth && node.scrollWidth <= node.clientWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include('#schedule').analyze()).violations).toEqual([]);
    await page.screenshot({ path: test.info().outputPath(`berkeley-matches-${width}.png`) });
  }
  await page.getByRole('button', { name: 'All races', exact: true }).click();
  await expect(schedule.getByRole('checkbox')).toHaveCount(54);
});

test('Berkeley matching view retains selected categories when rider details change', async ({ page }) => {
  const seeded = await page.request.post('/api/demo/berkeley-events');
  const eventId = (await seeded.json()).eventIds[0];
  await page.goto(`/#/register/${eventId}`);
  await page.getByLabel('Racing age').fill('50');
  await page.getByLabel('License category').selectOption('4');
  await page.getByRole('button', { name: 'Find my races', exact: true }).click();
  const selected = page.getByRole('checkbox', { name: /RR-M50-34/ });
  await selected.click();
  await page.getByLabel('Racing age').fill('30');
  await expect(selected).toHaveAttribute('aria-checked', 'true');
  await expect(selected.locator('..')).toContainText('Not eligible');
  await expect(page.locator('.tray')).toContainText('Masters 50+ 3/4');
  await page.getByRole('button', { name: 'All races', exact: true }).click();
  await expect(selected).toHaveAttribute('aria-checked', 'true');
  await selected.click();
  await expect(selected).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('button', { name: 'Matching races', exact: true }).click();
  await page.getByLabel('License category').selectOption('');
  await expect(page.getByRole('button', { name: 'All races', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('License category').selectOption('4');
  await expect(page.locator('#schedule').getByRole('checkbox')).toHaveCount(54);
});

test('validation recovery keeps keyboard focus and typed details', async ({ page }) => {
  await openEvent(page, 'criterium');
  await page.getByLabel('Use a demo rider (fake data)').selectOption('rider-alex');
  await page.getByRole('checkbox', { name: /DVC-M45/ }).click();
  await page.getByRole('button', { name: 'Continue to racer details' }).click();
  const fieldBounds = (label: string) => page.getByLabel(label, { exact: true }).evaluate(input => {
    const { left, top, bottom } = input.getBoundingClientRect();
    return { left, top, bottom };
  });
  for (const [left, right] of [['Email for the receipt (required)', 'Phone (optional)'], ['Team (optional)', 'License number (optional)']]) {
    expect(Math.abs((await fieldBounds(left)).top - (await fieldBounds(right)).top)).toBeLessThan(1);
  }
  const contactPhone = page.getByLabel('Contact phone', { exact: true });
  const savedPhone = await contactPhone.inputValue();
  await contactPhone.fill('123');
  await page.getByRole('button', { name: 'Continue to the waiver' }).click();
  await expect(page.locator('.error-summary')).toBeFocused();
  await expect(page.locator('.error-summary')).toContainText('Enter a phone number with 10 digits.');
  expect(Math.abs((await fieldBounds('Contact name')).top - (await fieldBounds('Contact phone')).top)).toBeLessThan(1);

  const desktop = page.viewportSize()!;
  await page.setViewportSize({ width: 360, height: 800 });
  const email = await fieldBounds('Email for the receipt (required)');
  const phone = await fieldBounds('Phone (optional)');
  expect(Math.abs(email.left - phone.left)).toBeLessThan(1);
  expect(phone.top).toBeGreaterThan(email.bottom);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await page.setViewportSize(desktop);
  await contactPhone.fill(savedPhone);
  const first = page.getByLabel('First name (required)');
  await first.fill('');
  await page.getByRole('button', { name: 'Continue to the waiver' }).click();
  await expect(page.locator('.error-summary')).toBeFocused();
  await page.locator('.error-summary').getByRole('link', { name: 'Enter your first name.' }).click();
  await expect(first).toBeFocused();
  await first.pressSequentially('Racer');
  await expect(first).toHaveValue('Racer');
  await expect(first).toBeFocused();
  await page.getByLabel('Last name (required)').fill('');
  await page.getByRole('button', { name: 'Continue to the waiver' }).click();
  await expect(page.locator('.error-summary')).toBeFocused();
  await expect(page.locator('.error-summary')).toContainText('Enter your last name.');
  await page.screenshot({ path: 'test-results/recovery-desktop-errors.png' });
  await page.getByLabel('Last name (required)').fill('Demo');
  await page.reload();
  await expect(first).toHaveValue('Racer');
  await page.getByRole('button', { name: 'Continue to the waiver' }).click();
  await expect(page.getByRole('heading', { name: 'Waiver', exact: true })).toBeVisible();
});

test('lost hold response retries the same reservation across refresh', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const eventId = await openEvent(page, 'criterium');
  await page.getByLabel('Use a demo rider (fake data)').selectOption('rider-alex');
  await page.getByRole('checkbox', { name: /DVC-M45/ }).click();
  await page.getByRole('button', { name: 'Continue to racer details' }).click();
  await page.getByRole('button', { name: 'Continue to the waiver' }).click();
  const attempts: string[] = [];
  const orders: string[] = [];
  await page.route('**/api/rider/events/*/orders', async (route) => {
    attempts.push(route.request().postDataJSON().clientRequestId);
    if (attempts.length === 2) {
      await route.fulfill({ status: 403, json: { error: 'Sign in again to recover your reservation.' } });
      return;
    }
    const response = await route.fetch();
    orders.push((await response.json()).id);
    if (attempts.length === 1) await route.abort('failed');
    else await route.fulfill({ response });
  });
  await signAndReview(page, 'Alex Demo');
  await expect(page.locator('.error-summary')).toContainText('Cannot reach');
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeDisabled();
  await page.screenshot({ path: 'test-results/recovery-mobile-pending.png', fullPage: true });
  const beforeOffer = await page.evaluate((id) => JSON.parse(sessionStorage.getItem(`cyclereg.register.${id}`)!), eventId);
  await page.route('**/api/rider/offers/pending-test', async (route) => {
    await route.fulfill({ json: { eventId, categoryId: 'another-offer-category', categoryName: 'Other fictional race', status: 'offered', offerExpiresAt: '2027-04-17T18:00:00Z', rider: { firstName: 'Other', lastName: 'Rider', email: 'other@example.test', racingAge: 60, licenseCategory: '5', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null } } });
  });
  // A new document restores the draft while an offer link also tries to prefill it.
  await page.goto(`/?recovery-offer=1#/register/${eventId}?offer=pending-test`);
  await expect(page.getByText(/Other fictional race/)).toBeVisible();
  const afterOffer = await page.evaluate((id) => JSON.parse(sessionStorage.getItem(`cyclereg.register.${id}`)!), eventId);
  expect(afterOffer).toEqual(beforeOffer);
  await expect(page.getByLabel(/Type your full name to sign/)).toHaveValue('Alex Demo');
  await page.getByRole('button', { name: /Retry.*reservation/ }).click();
  await expect(page.locator('.error-summary')).toContainText('Sign in again');
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: /Retry.*reservation/ }).click();
  await expect(page.getByRole('heading', { name: 'Review your order' })).toBeVisible();
  expect(attempts).toHaveLength(3);
  expect(new Set(attempts).size).toBe(1);
  expect(orders[1]).toBe(orders[0]);
  await page.screenshot({ path: 'test-results/recovery-mobile-review.png', fullPage: true });
  await page.getByRole('button', { name: /Complete simulated payment/ }).click();
  await expect(page.getByRole('heading', { name: 'You’re entered' })).toBeVisible();
});

test('organizer checks the rider’s pending reservation by exact reference', async ({ page, browser }) => {
  const eventId = await openEvent(page, 'criterium');
  await page.getByLabel('Use a demo rider (fake data)').selectOption('rider-alex');
  await page.getByRole('checkbox', { name: /DVC-M45/ }).click();
  await page.getByRole('button', { name: 'Continue to racer details' }).click();
  await page.getByRole('button', { name: 'Continue to the waiver' }).click();
  const attempts: unknown[] = [];
  let orderNumber: string | null = null;
  await page.route('**/api/rider/events/*/orders', async (route) => {
    attempts.push(route.request().postDataJSON());
    if (attempts.length === 1) {
      await route.abort();
      return;
    }
    const response = await route.fetch();
    if (attempts.length === 2) {
      orderNumber = (await response.json()).orderNumber;
      await route.abort();
      return;
    }
    await route.fulfill({ response });
  });
  await signAndReview(page, 'Alex Demo');
  await expect(page.locator('.error-summary')).toContainText('Cannot reach');
  const riderReference = page.getByRole('textbox', { name: 'Reservation reference' });
  const reference = await riderReference.inputValue();
  expect(reference).toMatch(/^[0-9a-f-]{36}$/);
  await expect(riderReference).toHaveAccessibleDescription('If retries keep failing, share this reference with the event organizer before starting another registration.');
  await page.reload();
  await expect(riderReference).toHaveValue(reference);

  const organizations: { id: string; events: { id: string }[] }[] = await (await page.request.get('/api/organizations')).json();
  const organizationId = organizations.find((org) => org.events.some((event) => event.id === eventId))!.id;
  const staffEmail = 'reservation.finance@example.test';
  expect((await page.request.post(`/api/organizations/${organizationId}/members`, { data: { email: staffEmail, role: 'finance' } })).ok()).toBe(true);
  const staffContext = await browser.newContext({ viewport: { width: 390, height: 844 }, extraHTTPHeaders: {} });
  await staffContext.addInitScript((email) => sessionStorage.setItem('cyclereg.test-session', email), staffEmail);
  const staff = await staffContext.newPage();
  await staff.goto(`/#/events/${eventId}/registrations`);
  await staff.getByRole('button', { name: /^Refunded/ }).click();
  await staff.getByText('Check a pending reservation', { exact: true }).click();
  const lookup = staff.locator('details').filter({ hasText: 'Check a pending reservation' });
  const check = lookup.getByRole('button', { name: 'Check reservation' });
  await lookup.getByRole('textbox', { name: 'Reservation reference' }).fill(reference);
  await check.press('Enter');
  const status = lookup.getByRole('status');
  await expect(status).toContainText('No order is visible for this reference yet');
  await expect(status).toContainText('Check the reference against the rider’s checkout.');
  await expect(status).toContainText('retry the same reservation');
  await expect(check).toBeFocused();
  expect((await new AxeBuilder({ page: staff }).include('details:has(#staff-reservation-reference)').analyze()).violations).toEqual([]);
  expect(await lookup.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);

  await page.getByRole('button', { name: 'Retry reservation' }).click();
  await expect.poll(() => orderNumber).toBeTruthy();
  await expect(page.locator('.error-summary')).toContainText('Cannot reach');
  await check.click();
  await expect(status).toContainText(orderNumber!);
  await expect(status).toContainText('Places held, unpaid');
  await expect(status).toContainText('Hold expires');
  // The order committed after this list loaded: it must be findable by number without a reload.
  await staff.getByLabel('Find a registration').fill(orderNumber!);
  await expect(staff.getByText(`1 registration matches “${orderNumber}”.`)).toBeVisible();

  const staffReference = lookup.getByRole('textbox', { name: 'Reservation reference' });
  await expect(staff.getByRole('list', { name: 'Registrations', exact: true }).getByRole('listitem').first()).toContainText(orderNumber!);
  await staffReference.fill(`  ${reference} `);
  await check.click();
  await expect(status).toContainText('It starts or ends with a space');
  await expect(status).not.toContainText(orderNumber!);
  for (const [bad, why] of [['short', 'at least 8 characters'], ['x'.repeat(65), 'at most 64 characters']] as const) {
    await staffReference.fill(bad);
    await check.click();
    await expect(staffReference).toBeFocused();
    await expect(staffReference).toHaveAttribute('aria-invalid', 'true');
    await expect(staffReference).toHaveAccessibleDescription(new RegExp(why));
  }
  for (const type of ['paste', 'drop'] as const) {
    await staffReference.fill(reference);
    const refused = await staffReference.evaluate((field, kind) => {
      const data = new DataTransfer();
      data.setData('text/plain', 'exact\nreference');
      const event = kind === 'paste' ? new ClipboardEvent(kind, { clipboardData: data, bubbles: true, cancelable: true }) : new DragEvent(kind, { dataTransfer: data, bubbles: true, cancelable: true });
      return !field.dispatchEvent(event);
    }, type);
    expect(refused).toBe(true);
    await expect(staffReference).toHaveValue('');
    await expect(staffReference).toHaveAccessibleDescription('This field cannot check a reference with a line break. Keep the original unchanged: removing the break makes it a different reference.');
    await check.click();
    await expect(status).not.toContainText(orderNumber!);
    await expect(staffReference).toHaveAccessibleDescription(/^This field cannot check a reference with a line break/);
  }
  expect(await lookup.locator('summary').evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  const staffSize = staff.viewportSize()!;
  const riderSize = page.viewportSize()!;
  await staff.setViewportSize({ width: 360, height: 800 });
  for (const control of [staffReference, check]) expect(await control.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  await expect(staffReference).toHaveCSS('font-size', '16px');
  await staff.setViewportSize(staffSize);
  await page.setViewportSize({ width: 360, height: 800 });
  expect(await riderReference.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  await expect(riderReference).toHaveCSS('font-size', '16px');
  await page.setViewportSize(riderSize);
  await staffReference.fill(reference);
  await expect(staffReference).not.toHaveAttribute('aria-invalid');
  await check.click();
  await expect(status).toContainText(orderNumber!);

  // A paste during a lookup changes nothing: the answer belongs to the reference on screen.
  let answer = () => {};
  const held = new Promise<void>((resolve) => (answer = resolve));
  await staff.route('**/reservation-status', async (route) => { await held; await route.continue(); });
  await staffReference.fill(reference);
  await check.click();
  await expect(status).toContainText('Checking for a saved order');
  await staffReference.evaluate((field) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', 'other\nreference');
    field.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
  });
  await expect(staffReference).toHaveValue(reference);
  await expect(staffReference).not.toHaveAttribute('aria-invalid');
  answer();
  await expect(status).toContainText(orderNumber!);
  await staff.unroute('**/reservation-status');

  // Keys the checkout API accepts as sent: surrounding spaces are part of the key.
  for (const [spaced, firstName] of [[' spaced-reference-0001 ', 'Avery'], ['        ', 'Blair']] as const) {
    const saved = await page.request.post(`/api/rider/events/${eventId}/orders`, { data: { ...(attempts[0] as object), clientRequestId: spaced, rider: { ...(attempts[0] as { rider: object }).rider, firstName }, waiver: { ...(attempts[0] as { waiver: object }).waiver, signatureName: `${firstName} Demo` } } });
    expect(saved.status()).toBe(201);
    await staffReference.fill(spaced);
    await check.click();
    await expect(status).toContainText((await saved.json()).orderNumber);
  }
  await staffReference.fill(reference);
  await check.click();
  await expect(status).toContainText(orderNumber!);
  await lookup.screenshot({ path: 'test-results/reservation-lookup-phone.png' });

  await page.getByRole('button', { name: 'Retry reservation' }).click();
  await expect(page.getByRole('heading', { name: 'Review your order' })).toBeVisible();
  expect(attempts).toHaveLength(3);
  expect(attempts[1]).toStrictEqual(attempts[0]);
  expect(attempts[2]).toStrictEqual(attempts[0]);
  await staffContext.close();
});

test('a registration manager releases a hold the rider asked to release', async ({ page, browser }) => {
  const eventId = await openEvent(page, 'criterium');
  await page.getByLabel('Use a demo rider (fake data)').selectOption('rider-alex');
  await page.getByRole('checkbox', { name: /DVC-M45/ }).click();
  await page.getByRole('button', { name: 'Continue to racer details' }).click();
  await page.getByRole('button', { name: 'Continue to the waiver' }).click();
  // The hold commits, but the rider never sees the response.
  await page.route('**/api/rider/events/*/orders', async (route) => {
    await route.fetch();
    await route.abort();
  }, { times: 1 });
  await signAndReview(page, 'Alex Demo');
  await expect(page.locator('.error-summary')).toContainText('Cannot reach');
  const reference = await page.getByRole('textbox', { name: 'Reservation reference' }).inputValue();

  const organizations: { id: string; events: { id: string }[] }[] = await (await page.request.get('/api/organizations')).json();
  const organizationId = organizations.find((org) => org.events.some((event) => event.id === eventId))!.id;
  const find = async (role: 'finance' | 'registration_manager') => {
    const email = `release.${role}@example.test`;
    expect((await page.request.post(`/api/organizations/${organizationId}/members`, { data: { email, role } })).ok()).toBe(true);
    const context = await browser.newContext({ viewport: { width: 360, height: 800 }, extraHTTPHeaders: {} });
    await context.addInitScript((user) => sessionStorage.setItem('cyclereg.test-session', user), email);
    const staff = await context.newPage();
    await staff.goto(`/#/events/${eventId}/registrations`);
    await staff.getByText('Check a pending reservation', { exact: true }).click();
    const lookup = staff.locator('details').filter({ hasText: 'Check a pending reservation' });
    await lookup.getByRole('textbox', { name: 'Reservation reference' }).fill(reference);
    await lookup.getByRole('button', { name: 'Check reservation' }).click();
    await expect(lookup.getByRole('status')).toContainText('Places held, unpaid');
    return { context, staff, lookup };
  };

  const finance = await find('finance');
  await expect(finance.lookup.getByRole('button', { name: 'Release unpaid hold' })).toHaveCount(0);
  await expect(finance.lookup).not.toContainText('cannot be released here');
  await finance.context.close();

  const { context, staff, lookup } = await find('registration_manager');
  const open = lookup.getByRole('button', { name: 'Release unpaid hold' });
  await open.click();
  const form = lookup.getByRole('form', { name: 'Release unpaid hold' });
  const acknowledge = form.getByRole('checkbox', { name: 'The rider asked me to release this hold' });
  const confirm = form.getByRole('button', { name: 'Confirm hold release' });
  await expect(acknowledge).toBeFocused();
  await expect(confirm).toBeDisabled();
  await expect(lookup.getByRole('textbox', { name: 'Reservation reference' })).toHaveAttribute('readonly', '');
  await form.getByRole('button', { name: 'Cancel' }).click();
  await expect(lookup.getByRole('button', { name: 'Check reservation' })).toBeFocused();
  await open.click();
  await acknowledge.check();
  await confirm.click();
  await expect(form.getByRole('alert')).toContainText('Enter a reason');
  const reason = form.getByRole('textbox', { name: 'Reason for release' });
  await reason.fill('Rider requested release');
  for (const control of [reason, confirm, form.getByRole('button', { name: 'Cancel' })]) {
    expect(await control.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  }
  await expect(reason).toHaveCSS('font-size', '16px');
  await expect(reason).toHaveAccessibleDescription('Leave out names and contact details.');
  expect(await staff.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  expect((await new AxeBuilder({ page: staff }).include('details:has(#staff-reservation-reference)').analyze()).violations).toEqual([]);
  await lookup.screenshot({ path: 'test-results/staff-release-phone.png' });
  await confirm.click();
  await expect(lookup.getByRole('status')).toContainText('Released by organizer');
  await expect(lookup.getByRole('button', { name: 'Check reservation' })).toBeFocused();
  await expect(staff.getByRole('list', { name: 'Registrations', exact: true })).toContainText('Released by organizer');
  await context.close();

  await page.getByRole('button', { name: 'Retry reservation' }).click();
  await expect(page.getByRole('heading', { name: 'Review your order' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('The organizer released your hold');
  await expect(page.getByRole('button', { name: /Complete simulated payment/ })).toBeDisabled();
});

test('a rider already on Stripe review sees a staff release', async ({ page }) => {
  // The screen is in Stripe mode; the simulated test server refuses checkout with the same 409 a release causes.
  await page.route('**/api/public/events/*', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), paymentMode: 'stripe_test' } });
  });
  const eventId = await openEvent(page, 'criterium');
  await page.getByLabel('Use a demo rider (fake data)').selectOption('rider-alex');
  await page.getByRole('checkbox', { name: /DVC-M45/ }).click();
  await page.getByRole('button', { name: 'Continue to racer details' }).click();
  await page.getByRole('button', { name: 'Continue to the waiver' }).click();
  const sent = page.waitForRequest((request) => request.method() === 'POST' && /\/api\/rider\/events\/[^/]+\/orders$/.test(request.url()));
  await signAndReview(page, 'Alex Demo');
  const request = await sent;
  const { id } = await (await request.response())!.json();
  const payOnStripe = page.getByRole('button', { name: /on Stripe/ });
  await expect(payOnStripe).toBeEnabled();
  const released = await page.request.post(`/api/events/${eventId}/reservation-release`, { data: { reference: request.postDataJSON().clientRequestId, riderRequested: true, reason: 'Rider requested release' } });
  expect(released.status()).toBe(200);
  await payOnStripe.click();
  await expect(page.getByRole('alert').filter({ hasText: 'The organizer released your hold' })).toBeVisible();
  await expect(payOnStripe).toBeDisabled();
  await page.goto(`/#/orders/${id}`);
  await expect(page.getByText('The organizer released this hold.')).toBeVisible();
});

test('a rejected reservation keeps details editable and rapid submission creates one hold', async ({ page }) => {
  await openEvent(page, 'criterium');
  await page.getByLabel('Use a demo rider (fake data)').selectOption('rider-alex');
  await page.getByRole('checkbox', { name: /DVC-M45/ }).click();
  await page.getByRole('button', { name: 'Continue to racer details' }).click();
  await page.getByRole('button', { name: 'Continue to the waiver' }).click();
  await page.route('**/api/rider/events/*/orders', async (route) => {
    await route.fulfill({ status: 422, json: { error: 'Reservation rejected. Review your entries.' } });
  }, { times: 1 });
  await signAndReview(page, 'Alex Demo');
  await expect(page.locator('.error-summary')).toContainText('Reservation rejected');
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeEnabled();
  await expect(page.getByLabel(/Type your full name to sign/)).toBeEnabled();
  let posts = 0;
  await page.route('**/api/rider/events/*/orders', async (route) => {
    posts++;
    await route.fulfill({ response: await route.fetch() });
  });
  await page.getByRole('button', { name: 'Sign and review the order' }).dblclick();
  await expect(page.getByRole('heading', { name: 'Review your order' })).toBeVisible();
  expect(posts).toBe(1);
});

test('a new reservation omits consent for a removed race addendum', async ({ page }) => {
  const eventId = await openEvent(page, 'criterium');
  await page.getByLabel('Use a demo rider (fake data)').selectOption('rider-alex');
  await page.getByRole('checkbox', { name: /DVC-M45/ }).click();
  await page.getByRole('button', { name: 'Continue to racer details' }).click();
  await page.getByRole('button', { name: 'Continue to the waiver' }).click();
  await expect(page.locator('.addendum-text')).toHaveCount(0);
  await page.evaluate((id) => {
    const key = `cyclereg.register.${id}`;
    const saved = JSON.parse(sessionStorage.getItem(key)!);
    saved.extras = { ...saved.extras, addenda: [saved.selected[0]] };
    sessionStorage.setItem(key, JSON.stringify(saved));
  }, eventId);
  await page.reload();
  await page.route('**/api/rider/events/*/orders', async (route) => {
    expect(route.request().postDataJSON().extras.addenda).toEqual([]);
    await route.abort('failed');
  }, { times: 1 });
  await signAndReview(page, 'Alex Demo');
  await expect(page.getByRole('button', { name: 'Retry reservation' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Race terms you accepted' })).toHaveCount(0);
});

const NEW_TERMS = { title: 'New sample condition', text: 'Fictional new condition.' };
const consentRecoveryCases: { committed: boolean; legacy: boolean; waiverChanges: boolean; only?: 'title' | 'text' }[] = [
  { committed: true, legacy: false, waiverChanges: true },
  { committed: false, legacy: false, waiverChanges: true },
  { committed: true, legacy: true, waiverChanges: true },
  { committed: false, legacy: true, waiverChanges: true },
  { committed: true, legacy: false, waiverChanges: false },
  { committed: false, legacy: false, waiverChanges: false },
  { committed: false, legacy: true, waiverChanges: false },
  // One field at a time, in a tab that still holds the old publication.
  { committed: true, legacy: false, waiverChanges: false, only: 'title' },
  { committed: true, legacy: false, waiverChanges: false, only: 'text' },
  { committed: false, legacy: false, waiverChanges: false, only: 'title' },
  { committed: false, legacy: false, waiverChanges: false, only: 'text' },
];

for (const { committed, legacy, waiverChanges, only } of consentRecoveryCases) {
  const scenario = [committed ? 'committed' : 'not committed', legacy ? 'older draft' : null, waiverChanges ? null : 'addendum only', only ? `${only}, no reload` : null].filter(Boolean).join(', ');
  test(`publication changes do not alter uncertain consent (${scenario})`, async ({ page }, testInfo) => {
    if (!committed) await page.setViewportSize({ width: 390, height: 844 });
    const eventId = await openEvent(page, 'criterium');
    const eventPath = `/api/events/${eventId}`;
    const draft = await (await page.request.get(eventPath)).json();
    const category = draft.config.categories.find((c: { timingCode: string }) => c.timingCode === 'DVC-M45');
    const originalText = 'Fictional original race condition.\n' + 'LongFictionalTerm'.repeat(30);
    category.addendum = { title: 'Original sample condition ' + 'W'.repeat(54), text: originalText };
    expect((await page.request.put(eventPath + '/config', { data: { revision: draft.revision, config: draft.config } })).ok()).toBe(true);
    expect((await publishReviewed(page.request, eventPath, { acknowledgeWarnings: true, acknowledgeImpact: true, waiverChangeReason: 'Fictional waiver update' })).ok()).toBe(true);
    await page.reload();
    await page.getByLabel('Use a demo rider (fake data)').selectOption('rider-alex');
    await page.getByRole('checkbox', { name: /DVC-M45/ }).click();
    await page.getByRole('button', { name: 'Continue to racer details' }).click();
    await page.getByRole('button', { name: 'Continue to the waiver' }).click();
    await expect(page.locator('.addendum-text')).toHaveText(originalText);
    await expect(page.locator('.addendum-text')).toHaveCSS('white-space', 'pre-wrap');
    const wide = page.viewportSize()!;
    await page.setViewportSize({ width: 360, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    await page.setViewportSize(wide);
    await page.getByLabel('I accept this', { exact: true }).check();
    const bodies: { clientRequestId: string; categoryIds: string[]; waiver: { version: string }; extras: { addenda: string[] } }[] = [];
    const orderIds: string[] = [];
    await page.route('**/api/rider/events/*/orders', async (route) => {
      bodies.push(route.request().postDataJSON());
      if (bodies.length === 1) {
        if (committed) orderIds.push((await (await route.fetch()).json()).id);
        await route.abort('failed');
      } else {
        const response = await route.fetch();
        if (response.ok()) orderIds.push((await response.json()).id);
        await route.fulfill({ response });
      }
    });
    await signAndReview(page, 'Alex Demo');
    await expect(page.locator('.error-summary')).toContainText('Cannot reach');
    const terms = page.getByRole('region', { name: 'Race terms you accepted', exact: true });
    await expect(terms.getByRole('heading', { name: /Original sample condition/ })).toBeVisible();
    expect(await terms.locator('.addendum-text').textContent()).toBe(originalText);
    await expect(terms.locator('.addendum-text')).toHaveCSS('white-space', 'pre-wrap');
    await expect(terms.getByRole('checkbox')).toHaveCount(0);
    expect(bodies[0].extras.addenda).toEqual([category.id]);
    if (legacy) {
      await page.evaluate((id) => {
        const key = `cyclereg.register.${id}`;
        const stored = JSON.parse(sessionStorage.getItem(key)!);
        delete stored.pendingReservation.addenda;
        delete stored.pendingReservation.request.extras.acceptedTerms;
        delete stored.extras.acceptedTerms;
        sessionStorage.setItem(key, JSON.stringify(stored));
      }, eventId);
    }
    const current = await (await page.request.get(`/api/events/${eventId}`)).json();
    if (waiverChanges) {
      current.config.registration.waiverVersion = 'CRO-UPDATED-SAMPLE';
      current.config.registration.waiverText = 'New fictional waiver text, not real event policy.';
    }
    const next = only ? { ...category.addendum, [only]: NEW_TERMS[only] } : NEW_TERMS;
    current.config.categories.find((cat: { id: string }) => cat.id === bodies[0].categoryIds[0]).addendum = next;
    expect((await page.request.put(`/api/events/${eventId}/config`, { data: { revision: current.revision, config: current.config } })).ok()).toBe(true);
    expect((await publishReviewed(page.request, `/api/events/${eventId}`, { acknowledgeWarnings: true, acknowledgeImpact: true, waiverChangeReason: 'Fictional waiver update' })).ok()).toBe(true);
    if (!only) await page.reload();
    await expect(terms).toBeVisible();
    if (legacy) {
      await expect(terms).toContainText('Original text for one or more race terms isn’t available in this tab.');
      await expect(terms.locator('.addendum-text')).toHaveCount(0);
    } else {
      await expect(terms.locator('.addendum-text')).toHaveText(originalText);
    }
    if (!committed) {
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      expect((await new AxeBuilder({ page }).include('[aria-labelledby="submitted-race-terms"]').analyze()).violations).toEqual([]);
      await terms.screenshot({ path: testInfo.outputPath('pending-race-terms-phone.png') });
    }
    await expect(page.getByText('Fictional new condition.', { exact: true })).toHaveCount(0);
    if (legacy) delete (bodies[0].extras as { acceptedTerms?: unknown }).acceptedTerms;
    await page.getByRole('button', { name: 'Retry reservation' }).click();
    if (committed) {
      await expect(page.getByRole('heading', { name: 'Review your order' })).toBeVisible();
      expect(orderIds[1]).toBe(orderIds[0]);
      await page.getByRole('button', { name: /Change my entries/ }).click();
      await page.getByRole('button', { name: 'Continue to racer details' }).click();
      await page.getByRole('button', { name: 'Continue to the waiver' }).click();
      await expect(page.locator('.waiver')).toHaveText(current.config.registration.waiverText);
      await expect(page.getByLabel('I agree to this waiver', { exact: true })).toBeChecked({ checked: !waiverChanges });
      await expect(page.getByLabel(/Type your full name to sign/)).toHaveValue('Alex Demo');
    } else {
      await expect(page.locator('.error-summary')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeEnabled();
      await expect(page.getByLabel('I have read the whole waiver')).toBeChecked({ checked: !waiverChanges });
      await expect(page.getByLabel('I agree to this waiver', { exact: true })).toBeChecked({ checked: !waiverChanges });
      expect(orderIds).toHaveLength(0);
      await expect(terms).toHaveCount(0);
      await expect(page.locator('.addendum-text')).toHaveText(next.text);
      await expect(page.locator('.addendum-title')).toContainText(next.title);
      if (!waiverChanges) await expect(page.locator('.error-summary')).toContainText('Read them and accept again');
    }
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toEqual(bodies[0]);

    // Every way back to the waiver asks again for changed race terms, and only for what changed.
    const renew = page.getByLabel('I accept this', { exact: true });
    await expect(renew).not.toBeChecked();
    await expect(renew).toHaveAccessibleDescription(/Read them and accept again/);
    expect((await new AxeBuilder({ page }).include('fieldset:has(.addendum-text)').analyze()).violations).toEqual([]);
    if (!waiverChanges) {
      await renew.check();
      await expect(renew).not.toHaveAttribute('aria-describedby');
      await page.getByRole('button', { name: 'Sign and review the order' }).click();
      await expect(page.getByRole('heading', { name: 'Review your order' })).toBeVisible();
      expect(bodies[2].clientRequestId).not.toBe(bodies[0].clientRequestId);
      expect((bodies[2].extras as { acceptedTerms?: unknown }).acceptedTerms).toEqual([{ categoryId: category.id, ...next }]);
    }
  });
}

test('recovering a cancelled reservation disables payment and allows reselection', async ({ page }) => {
  await openEvent(page, 'criterium');
  await page.getByLabel('Use a demo rider (fake data)').selectOption('rider-alex');
  await page.getByRole('checkbox', { name: /DVC-M45/ }).click();
  await page.getByRole('button', { name: 'Continue to racer details' }).click();
  await page.getByRole('button', { name: 'Continue to the waiver' }).click();
  let id = '';
  await page.route('**/api/rider/events/*/orders', async (route) => {
    const response = await route.fetch();
    id = (await response.json()).id;
    await route.abort('failed');
  }, { times: 1 });
  await signAndReview(page, 'Alex Demo');
  await expect(page.locator('.error-summary')).toContainText('Cannot reach');
  expect((await page.request.post(`/api/orders/${id}/cancel`)).ok()).toBe(true);
  await page.getByRole('button', { name: 'Retry reservation' }).click();
  await expect(page.getByRole('alert')).toContainText('cancelled');
  await expect(page.getByRole('button', { name: /Complete simulated payment/ })).toBeDisabled();
  await page.getByRole('button', { name: /Change my entries/ }).click();
  await expect(page.getByRole('heading', { name: 'About you', exact: true })).toBeVisible();
});

test('persistent server and rate-limit failures preserve recovery and explain the unknown outcome', async ({ page }) => {
  await openEvent(page, 'criterium');
  await page.getByLabel('Use a demo rider (fake data)').selectOption('rider-alex');
  await page.getByRole('checkbox', { name: /DVC-M45/ }).click();
  await page.getByRole('button', { name: 'Continue to racer details' }).click();
  await page.getByRole('button', { name: 'Continue to the waiver' }).click();
  const attempts: string[] = [];
  await page.route('**/api/rider/events/*/orders', async (route) => {
    attempts.push(route.request().postDataJSON().clientRequestId);
    await route.fulfill({ status: [500, 429, 408, 425, 500][attempts.length - 1], json: { error: 'Temporary request failure. Try again.' } });
  });
  await signAndReview(page, 'Alex Demo');
  await expect(page.locator('.error-summary')).toContainText('Temporary request failure');
  await page.locator('.error-summary a').click();
  await expect(page.locator('#reservation-status')).toBeFocused();
  await expect(page.locator('#reservation-status')).toContainText('not confirmed');
  await page.reload();
  await expect(page.getByLabel(/Type your full name to sign/)).toBeDisabled();
  await expect(page.getByRole('button', { name: /Choose races/ })).toBeDisabled();
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: 'Retry reservation' }).click();
    await expect(page.locator('.error-summary')).toContainText('Temporary request failure');
  }
  expect(attempts).toHaveLength(5);
  expect(new Set(attempts).size).toBe(1);
});

test('stale waiver rejection refreshes terms without reload and requires fresh agreement', async ({ page }) => {
  const eventId = await openEvent(page, 'criterium');
  await page.getByLabel('Use a demo rider (fake data)').selectOption('rider-alex');
  await page.getByRole('checkbox', { name: /DVC-M45/ }).click();
  await page.getByRole('button', { name: 'Continue to racer details' }).click();
  await page.getByRole('button', { name: 'Continue to the waiver' }).click();
  await page.getByLabel('I have read the whole waiver').check();
  await page.getByLabel(/Type your full name to sign/).fill('Alex Demo');
  await page.getByLabel('I agree to this waiver', { exact: true }).check();
  const current = await (await page.request.get(`/api/events/${eventId}`)).json();
  current.config.registration.waiverVersion = 'CRO-STALE-SAMPLE';
  current.config.registration.waiverText = 'Updated fictional waiver requiring renewed agreement.';
  expect((await page.request.put(`/api/events/${eventId}/config`, { data: { revision: current.revision, config: current.config } })).ok()).toBe(true);
  expect((await publishReviewed(page.request, `/api/events/${eventId}`, { acknowledgeWarnings: true, waiverChangeReason: 'Fictional waiver update' })).ok()).toBe(true);
  await page.getByRole('button', { name: 'Sign and review the order' }).click();
  await expect(page.locator('.waiver')).toHaveText(current.config.registration.waiverText);
  await expect(page.getByLabel('I have read the whole waiver')).not.toBeChecked();
  await expect(page.getByLabel('I agree to this waiver', { exact: true })).not.toBeChecked();
  await signAndReview(page, 'Alex Demo');
  await expect(page.getByRole('heading', { name: 'Review your order' })).toBeVisible();
});
