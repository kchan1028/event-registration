import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from './fixtures';
import { seedRegistrationCase } from './support/registration-case';

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
  await expect(page.locator('.error-summary')).toContainText('needs one eligible race on each day');

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

test('uncertain license: paid but needs review, and the organizer clears it', async ({ page }) => {
  const eventId = await openEvent(page, 'criterium');
  await page.getByLabel('Use a demo rider (fake data)').selectOption('rider-sam');
  await page.getByRole('checkbox', { name: /DVC-W345/ }).click();
  await expect(page.locator('.tray .quote__total')).toContainText('$39.05');
  await page.getByRole('button', { name: 'Continue to racer details' }).click();
  await page.getByRole('button', { name: 'Continue to the waiver' }).click();
  await signAndReview(page, 'Sam Demo');
  await page.getByRole('button', { name: /Complete simulated payment/ }).click();
  await expect(page.locator('.done__entry')).toContainText('License needs review');

  await page.goto(`/#/events/${eventId}/registrations`);
  await page.getByRole('button', { name: /License review/ }).click();
  const order = page.locator('.order', { hasText: 'Sam Demo' });
  await order.getByRole('button', { name: 'Review license' }).click();
  await order.getByRole('textbox').fill('Demo license card checked at the desk');
  await order.getByRole('button', { name: 'Mark reviewed' }).click();
  await expect(order).toHaveCount(0);
  await page.getByRole('button', { name: /^All/ }).click();
  await expect(page.locator('.order', { hasText: 'Sam Demo' })).toContainText('License reviewed: Demo license card checked at the desk');
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
