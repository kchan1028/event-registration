import AxeBuilder from '@axe-core/playwright';
import { E2E_ORGANIZER, expect, test, type Page } from './fixtures';
import { seedRegistrationCase } from './support/registration-case';
import type { CheckInList } from '../src/shared/checkin';

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
  await expect(page.getByLabel('First name (required)')).toHaveValue('Alex');
  await page.getByRole('button', { name: 'Continue to the waiver' }).click();

  await page.getByRole('button', { name: 'Sign and review the order' }).click();
  const summary = page.locator('.error-summary');
  await expect(summary).toContainText('Type your full name to sign the waiver.');
  await expect(summary).toContainText('Check the box to confirm you agree to the waiver.');
  await signAndReview(page, 'Alex Demo');

  await expect(page.locator('.simulated').first()).toHaveText('Simulated payment: no money is charged.');
  await expect(page.getByRole('button', { name: /^Pay/ })).toHaveCount(0);

  // Back to a completed step keeps the data (and releases the hold).
  await page.getByRole('button', { name: /Racer details/ }).click();
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
  expect((await page.request.post(`/api/events/${eventId}/publish`, { headers, data: { acknowledgeWarnings: true } })).ok()).toBe(true);

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

for (const committed of [true, false]) {
  test(`publication changes do not alter uncertain consent (${committed ? 'committed' : 'not committed'})`, async ({ page }) => {
    const eventId = await openEvent(page, 'criterium');
    await page.getByLabel('Use a demo rider (fake data)').selectOption('rider-alex');
    await page.getByRole('checkbox', { name: /DVC-M45/ }).click();
    await page.getByRole('button', { name: 'Continue to racer details' }).click();
    await page.getByRole('button', { name: 'Continue to the waiver' }).click();
    const bodies: { clientRequestId: string; categoryIds: string[]; waiver: { version: string } }[] = [];
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
    const current = await (await page.request.get(`/api/events/${eventId}`)).json();
    current.config.registration.waiverVersion = 'CRO-UPDATED-SAMPLE';
    current.config.registration.waiverText = 'New fictional waiver text, not real event policy.';
    current.config.categories.find((cat: { id: string }) => cat.id === bodies[0].categoryIds[0]).addendum = { title: 'New sample condition', text: 'Fictional new condition.' };
    expect((await page.request.put(`/api/events/${eventId}/config`, { data: { revision: current.revision, config: current.config } })).ok()).toBe(true);
    expect((await page.request.post(`/api/events/${eventId}/publish`, { data: { acknowledgeWarnings: true, acknowledgeImpact: true } })).ok()).toBe(true);
    await page.reload();
    await page.getByRole('button', { name: 'Retry reservation' }).click();
    if (committed) {
      await expect(page.getByRole('heading', { name: 'Review your order' })).toBeVisible();
      expect(orderIds[1]).toBe(orderIds[0]);
      await page.getByRole('button', { name: /Change my entries/ }).click();
      await page.getByRole('button', { name: 'Continue to racer details' }).click();
      await page.getByRole('button', { name: 'Continue to the waiver' }).click();
      await expect(page.locator('.waiver')).toHaveText(current.config.registration.waiverText);
      await expect(page.getByLabel('I agree to this waiver', { exact: true })).not.toBeChecked();
      await expect(page.getByLabel(/Type your full name to sign/)).toHaveValue('Alex Demo');
    } else {
      await expect(page.locator('.error-summary')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeEnabled();
      await expect(page.getByLabel('I have read the whole waiver')).not.toBeChecked();
      await expect(page.getByLabel('I agree to this waiver', { exact: true })).not.toBeChecked();
      expect(orderIds).toHaveLength(0);
    }
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toEqual(bodies[0]);
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
  expect((await page.request.post(`/api/events/${eventId}/publish`, { data: { acknowledgeWarnings: true } })).ok()).toBe(true);
  await page.getByRole('button', { name: 'Sign and review the order' }).click();
  await expect(page.locator('.waiver')).toHaveText(current.config.registration.waiverText);
  await expect(page.getByLabel('I have read the whole waiver')).not.toBeChecked();
  await expect(page.getByLabel('I agree to this waiver', { exact: true })).not.toBeChecked();
  await signAndReview(page, 'Alex Demo');
  await expect(page.getByRole('heading', { name: 'Review your order' })).toBeVisible();
});
