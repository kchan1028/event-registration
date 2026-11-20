import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';
import { seedRegistrationCase } from './support/registration-case';
import type { CheckInList } from '../src/shared/checkin';
import type { EventConfig } from '../src/shared/schema';

test('phone handoff keeps the rider account separate and returns a paid rider to check-in', async ({ page, browser }) => {
  const eventId = await seedRegistrationCase(page.request, 'criterium');
  await page.request.put(`/api/events/${eventId}/bib-settings`, { data: { scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 199 }] } });
  await page.goto(`/?staff-context=fictional#/events/${eventId}/check-in`);
  await page.getByRole('button', { name: 'Register a walk-up' }).click();
  const panel = page.getByRole('region', { name: 'Rider phone registration' });
  await expect(panel.getByRole('img', { name: 'QR code to open rider registration' })).toBeVisible();
  await expect(panel).toContainText('Payment alone does not clear readiness');
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => localStorage.setItem('cyclereg-theme', value), theme);
    await page.reload();
    await page.getByRole('button', { name: 'Register a walk-up' }).click();
    await expect(panel.getByRole('img')).toBeVisible();
    expect((await new AxeBuilder({ page }).include('.ci-walkup').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
  }
  const address = await panel.getByLabel('Public registration address').inputValue();
  expect(new URL(address).hash).toBe(`#/register/${eventId}`);
  expect(new URL(address).search).toBe('');
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.screenshot({ path: 'test-results/walkup-mobile.png' });

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, extraHTTPHeaders: { Authorization: 'Bearer test:walkup.rider@example.test' } });
  try {
    const rider = await context.newPage();
    await rider.addInitScript(() => sessionStorage.setItem('cyclereg.test-session', 'walkup.rider@example.test'));
    await rider.goto(address);
    await rider.getByLabel('Use a demo rider (fake data)').selectOption('rider-alex');
    await rider.getByRole('checkbox', { name: /DVC-M45/ }).click();
    await rider.getByRole('button', { name: 'Continue to racer details' }).click();
    await rider.getByRole('button', { name: 'Continue to the waiver' }).click();
    await rider.getByLabel('I have read the whole waiver').check();
    await rider.getByLabel(/Type your full name to sign/).fill('Alex Demo');
    await rider.getByLabel('I agree to this waiver', { exact: true }).check();
    await rider.getByRole('button', { name: 'Sign and review the order' }).click();
    await rider.getByRole('button', { name: 'Simulate a declined payment' }).click();
    await expect(rider.getByRole('alert')).toContainText('declined');
    const lookup = page.getByRole('searchbox', { name: 'Find a rider' });
    await lookup.fill('Alex Demo');
    await lookup.press('Enter');
    await expect(page.getByRole('region', { name: 'Rider check-in' })).toContainText('Alex Demo');
    await expect(page.getByRole('region', { name: 'Rider check-in' })).toContainText('Payment not complete');
    await expect(page.getByRole('button', { name: /Check in and issue/ })).toHaveCount(0);
    await rider.getByRole('button', { name: /Complete simulated payment/ }).click();
    await expect(rider.getByRole('heading', { name: 'You’re entered' })).toBeVisible();
    const mine = await rider.request.get('/api/rider/registrations', { headers: { Authorization: 'Bearer test:walkup.rider@example.test' } });
    // Account ownership is also enforced by the actual participant session used throughout checkout.
    expect(mine.status()).toBe(200);
    expect((await mine.json()).filter((o: { rider: { firstName: string }; placedByYou: boolean }) => o.rider.firstName === 'Alex' && o.placedByYou)).toHaveLength(1);
    const staffOrders = await page.request.get('/api/rider/registrations');
    expect(staffOrders.status()).toBe(200);
    expect((await staffOrders.json()).filter((o: { eventId: string }) => o.eventId === eventId)).toHaveLength(0);
    await lookup.press('Enter');
    const desk = page.getByRole('region', { name: 'Rider check-in' });
    await expect(desk).toContainText('No preassigned bib');
    await expect(desk.getByRole('button', { name: /Check in and issue/ })).toHaveCount(0);
    const checkInUrl = `/api/events/${eventId}/check-in`;
    const list: CheckInList = await (await page.request.get(checkInUrl, { params: { q: 'Alex Demo' } })).json();
    const [card] = list.riders;
    const entryId = card.entries[0].id;
    expect(card.entries[0].walkUp).toBe(false);
    const riderUrl = `${checkInUrl}/${card.orderId}`;
    const payload = { dayId: list.dayId, entryId };
    expect((await rider.request.post(`${riderUrl}/walk-up`, { data: payload })).status()).toBe(404);
    const refused = await page.request.post(riderUrl, { data: { dayId: list.dayId, bib: 100 } });
    expect(refused.status()).toBe(409);
    expect(await refused.json()).toMatchObject({ error: expect.stringContaining('No preassigned bib') });
    const mark = desk.getByRole('button', { name: /^Mark as walk-up/ });
    await expect(mark).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await mark.focus();
    await mark.press('Enter');
    await expect(desk.getByRole('status')).toBeFocused();
    await expect(desk.getByText('· Walk-up', { exact: true })).toBeVisible();
    const retry = await page.request.post(`${riderUrl}/walk-up`, { data: payload });
    expect(retry.status()).toBe(200);
    expect(await retry.json()).toMatchObject({
      bib: null,
      checkedInAt: null,
      entries: [expect.objectContaining({ id: entryId, walkUp: true })],
    });
    await page.reload();
    await expect(lookup).toHaveValue('');
    await lookup.fill('Alex Demo');
    await lookup.press('Enter');
    await expect(desk.getByText('· Walk-up', { exact: true })).toBeVisible();
    await expect(mark).toHaveCount(0);
    await desk.getByRole('button', { name: /Check in and issue/ }).click();
    await expect(page.getByRole('region', { name: 'Rider check-in' })).toContainText('100');
    const lists = await (await page.request.get(`/api/events/${eventId}/start-lists`)).json();
    expect(lists.races.flatMap((r: { rows: { firstName: string }[] }) => r.rows).filter((r: { firstName: string }) => r.firstName === 'Alex')).toHaveLength(1);
  } finally { await context.close(); }
});

test('unpublished event does not expose a registration handoff', async ({ page }) => {
  const { eventId } = (await (await page.request.post('/api/demo')).json());
  await page.goto(`/#/events/${eventId}/check-in`);
  await page.getByRole('button', { name: 'Register a walk-up' }).click();
  const panel = page.getByRole('region', { name: 'Rider phone registration' });
  await expect(panel).toContainText('Publish this event before sharing');
  await expect(panel.getByRole('img')).toHaveCount(0);
  await expect(panel.getByRole('link')).toHaveCount(0);
});

test('walk-up distinguishes a closed registration window from an open waitlist', async ({ page, browser }) => {
  const eventId = await seedRegistrationCase(page.request, 'criterium');
  const eventUrl = `/api/events/${eventId}`;
  const { config, revision } = await (await page.request.get(eventUrl)).json() as { config: EventConfig; revision: number };
  const full = config.categories.find((category) => category.timingCode === 'DVC-M35')!;
  const closed = config.categories.find((category) => category.timingCode === 'DVC-M45')!;
  config.registration.demoIgnoreWindows = false;
  full.registration.opensAt = null;
  full.registration.closesAt = null;
  full.waitlistEnabled = true;
  closed.registration.opensAt = null;
  closed.registration.closesAt = '2000-01-01T09:00';
  expect((await page.request.put(`${eventUrl}/config`, { data: { config, revision } })).ok()).toBe(true);
  expect((await page.request.post(`${eventUrl}/publish`, { data: { acknowledgeWarnings: true, acknowledgeImpact: true } })).ok()).toBe(true);

  const readStartLists = async () => {
    const response = await page.request.get(`${eventUrl}/start-lists`);
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const before = await readStartLists();
  await page.goto(`/#/events/${eventId}/check-in`);
  await page.getByRole('button', { name: 'Register a walk-up' }).click();
  const address = await page.getByLabel('Public registration address').inputValue();

  const email = 'waitlisted.walkup@example.test';
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    extraHTTPHeaders: { Authorization: `Bearer test:${email}` },
  });
  try {
    const rider = await context.newPage();
    await rider.addInitScript((account) => sessionStorage.setItem('cyclereg.test-session', account), email);
    await rider.goto(address);
    await rider.getByLabel('Racing age').fill('40');
    await rider.getByLabel('License category').selectOption('4');
    await rider.getByLabel('Competition class').selectOption({ label: 'Men' });
    const closedOption = rider.getByRole('checkbox', { name: /DVC-M45/ });
    await expect(closedOption).toHaveAttribute('aria-disabled', 'true');
    await expect(closedOption).toHaveAccessibleDescription('Registration closed');
    await closedOption.press('Space');
    await expect(closedOption).toHaveAttribute('aria-checked', 'false');

    const option = rider.getByRole('checkbox', { name: /DVC-M35/ });
    await expect(option).toHaveAttribute('aria-disabled', 'true');
    await expect(option).toHaveAttribute('aria-checked', 'false');
    await rider.getByRole('button', { name: 'Join the waitlist', exact: true }).click();
    const form = rider.getByRole('form', { name: `Join the waitlist for ${full.name}` });
    await form.getByLabel('First name').fill('Waitlisted');
    await form.getByLabel('Last name').fill('Fictional');
    await form.getByLabel('Email', { exact: true }).fill(email);
    await form.getByRole('button', { name: 'Join the waitlist' }).click();
    await expect(rider.getByRole('status').filter({ hasText: 'You are number 1 on the waitlist' })).toBeVisible();
    await expect(option).toHaveAttribute('aria-checked', 'false');
    await rider.getByRole('button', { name: 'Continue to racer details' }).click();
    await expect(rider.locator('.error-summary')).toContainText('Choose at least one race');
    const mine = await rider.request.get('/api/rider/registrations');
    expect(mine.ok()).toBe(true);
    expect(await mine.json()).toEqual([]);
  } finally {
    await context.close();
  }

  const waitlist = await page.request.get(`${eventUrl}/waitlist`);
  expect(waitlist.ok()).toBe(true);
  expect((await waitlist.json()).entries).toEqual([expect.objectContaining({ categoryId: full.id, email, status: 'waiting' })]);
  const checkIn = await page.request.get(`${eventUrl}/check-in`, { params: { q: 'Waitlisted Fictional' } });
  expect(checkIn.ok()).toBe(true);
  expect((await checkIn.json()).riders).toEqual([]);
  expect(await readStartLists()).toEqual(before);
});

test('a junior walk-up reaches check-in after guardian consent and simulated payment', async ({ page, browser }) => {
  const eventId = await seedRegistrationCase(page.request, 'criterium');
  const eventUrl = `/api/events/${eventId}`;
  const bibSettings = await page.request.put(`${eventUrl}/bib-settings`, {
    data: { scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 199 }] },
  });
  expect(bibSettings.ok()).toBe(true);
  await page.goto(`/#/events/${eventId}/check-in`);
  await page.getByRole('button', { name: 'Register a walk-up' }).click();
  const address = await page.getByLabel('Public registration address').inputValue();

  const email = 'guardian.walkup@example.test';
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    extraHTTPHeaders: { Authorization: `Bearer test:${email}` },
  });
  try {
    const guardian = await context.newPage();
    await guardian.addInitScript((account) => sessionStorage.setItem('cyclereg.test-session', account), email);
    await guardian.goto(address);
    await guardian.getByLabel('Use a demo rider (fake data)').selectOption('rider-casey');
    await guardian.getByRole('checkbox', { name: /DVC-J1014/ }).click();
    await guardian.getByRole('button', { name: 'Continue to racer details' }).click();
    await guardian.getByLabel('Last name (required)', { exact: true }).fill('Walkup');
    await guardian.getByLabel('Guardian name', { exact: true }).fill('Jordan Demo');
    await guardian.getByLabel('Guardian email', { exact: true }).fill(email);
    await guardian.getByRole('button', { name: 'Continue to the waiver' }).click();
    await expect(guardian.getByRole('heading', { name: 'Waiver' })).toBeVisible();

    await guardian.getByLabel('I have read the whole waiver').check();
    await guardian.getByLabel(/Type your full name to sign/).fill('Jordan Demo');
    await guardian.getByLabel('As parent or guardian, I agree to this waiver for the rider', { exact: true }).check();
    await guardian.getByRole('button', { name: 'Sign and review the order' }).click();

    const pay = guardian.getByRole('button', { name: /Complete simulated payment/ });
    await expect(pay).toBeVisible();
    const search = page.getByRole('searchbox', { name: 'Find a rider' });
    await search.fill('Casey Walkup');
    await search.press('Enter');
    const checkInPanel = page.getByRole('region', { name: 'Rider check-in' });
    await expect(checkInPanel).toContainText('Payment not complete');
    await expect(checkInPanel).not.toContainText('Guardian has not accepted the waiver');
    await expect(checkInPanel.getByRole('button', { name: /Check in and issue/ })).toHaveCount(0);

    await pay.click();
    await expect(guardian.locator('.done__entry')).toContainText('Guardian signature recorded');

    const registrations = await guardian.request.get('/api/rider/registrations');
    expect(registrations.ok()).toBe(true);
    expect(await registrations.json()).toContainEqual(expect.objectContaining({
      eventId,
      placedByYou: true,
      rider: expect.objectContaining({ firstName: 'Casey', lastName: 'Walkup' }),
    }));
    await search.press('Enter');
    await expect(checkInPanel).toContainText('Ready to race');
    await checkInPanel.getByRole('button', { name: /^Mark as walk-up/ }).click();
    await checkInPanel.getByRole('button', { name: /Check in and issue/ }).click();
    await expect(checkInPanel).toContainText('Checked in. Hand over the bib below.');
    await expect(checkInPanel.locator('.ci-bib__number')).toHaveText('100');
  } finally {
    await context.close();
  }
});

test('shared test kiosk clears the receipt and draft between rider sessions on the same device', async ({ page, browser }) => {
  const eventId = await seedRegistrationCase(page.request, 'criterium');
  await page.goto(`/?staff-context=fictional#/events/${eventId}/check-in`);
  await page.getByRole('button', { name: 'Register a walk-up' }).click();
  const address = new URL(await page.getByLabel('Test kiosk address').inputValue());
  expect([...address.searchParams]).toEqual([['kiosk', eventId]]);
  expect(address.hash).toBe('');

  // Override the organizer fixture's header so the kiosk's own sign-in authenticates requests.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, extraHTTPHeaders: {} });
  try {
    const kiosk = await context.newPage();
    await kiosk.goto(address.href);
    const start = kiosk.getByRole('button', { name: 'Sign in to register' });
    const signIn = async (email: string) => {
      await start.click();
      await expect(kiosk.getByLabel('Test email')).toBeEmpty();
      await kiosk.getByLabel('Test email').fill(email);
      await kiosk.getByRole('button', { name: 'Sign in', exact: true }).click();
    };
    await signIn('kiosk.first@example.test');
    await kiosk.getByLabel('Use a demo rider (fake data)').selectOption('rider-alex');
    const race = kiosk.getByRole('checkbox', { name: /DVC-M45/ });
    await race.check();
    const details = kiosk.getByRole('button', { name: 'Continue to racer details' });
    await details.click();
    await kiosk.getByRole('button', { name: 'Continue to the waiver' }).click();
    await kiosk.getByLabel('I have read the whole waiver').check();
    await kiosk.getByLabel(/Type your full name to sign/).fill('Alex Demo');
    await kiosk.getByLabel('I agree to this waiver', { exact: true }).check();
    await kiosk.getByRole('button', { name: 'Sign and review the order' }).click();
    await kiosk.getByRole('button', { name: /Complete simulated payment/ }).click();
    await expect(kiosk.getByRole('heading', { name: 'You’re entered' })).toBeVisible();
    await expect(kiosk.getByText(/Alex Demo · order/)).toBeVisible();
    expect(kiosk.url()).toBe(address.href);
    expect(await kiosk.evaluate(() => Object.keys(sessionStorage))).toEqual([]);
    const orders = await kiosk.request.get('/api/rider/registrations', { headers: { Authorization: 'Bearer test:kiosk.first@example.test' } });
    expect(orders.ok()).toBe(true);
    const [order] = await orders.json();
    expect(order).toMatchObject({ eventId, placedByYou: true, rider: { firstName: 'Alex' } });

    // A hash navigation cannot open another screen inside the kiosk. Back still shows the signed-out landing page.
    await kiosk.evaluate((id) => { window.location.hash = `#/orders/${id}`; }, order.id);
    await kiosk.getByRole('button', { name: 'End kiosk session' }).click();
    await expect(start).toBeFocused();
    await kiosk.goBack();
    await expect(start).toBeVisible();
    await expect(kiosk.getByRole('heading', { name: 'You’re entered' })).toHaveCount(0);

    await signIn('kiosk.second@example.test');
    await expect(race).not.toBeChecked();
    await kiosk.getByLabel('Use a demo rider (fake data)').selectOption('rider-alex');
    await race.check();
    await details.click();
    const firstName = kiosk.getByLabel('First name (required)', { exact: true });
    await expect(firstName).toHaveAttribute('autocomplete', 'off');
    await firstName.fill('Second session draft');
    expect(await kiosk.evaluate(() => Object.keys(sessionStorage))).toEqual([]);
    await kiosk.reload();
    await expect(start).toBeVisible();
    await expect(firstName).toHaveCount(0);
    await signIn('kiosk.third@example.test');
    await expect(kiosk.getByLabel('Use a demo rider (fake data)')).toHaveValue('');
    await expect(race).not.toBeChecked();
    await expect(kiosk.getByRole('heading', { name: 'You’re entered' })).toHaveCount(0);
    await kiosk.goto(new URL('/#/register', address).href);
    await kiosk.goBack();
    await expect(start).toBeVisible();
    await expect(race).toHaveCount(0);
    await expect(page.getByLabel('Test kiosk address')).toHaveValue(address.href);
  } finally {
    await context.close();
  }
});

test('staff suggest race choices and the rider confirms them before checkout', async ({ page, browser }) => {
  const eventId = await seedRegistrationCase(page.request, 'criterium');
  await page.goto(`/?staff-context=fictional#/events/${eventId}/check-in`);
  await page.getByRole('button', { name: 'Register a walk-up' }).click();
  const panel = page.getByRole('region', { name: 'Rider phone registration' });
  await panel.getByRole('button', { name: 'Prepare race choices' }).click();
  const choice = panel.getByRole('checkbox', { name: /DVC-M45/ });
  await expect(choice).toBeVisible();
  await expect(panel.getByRole('checkbox', { name: /DVC-M35/ })).toHaveCount(0);
  await choice.check();
  await expect(panel.getByRole('img', { name: 'QR code to review suggested races' })).toBeVisible();
  const address = new URL(await panel.getByLabel('Race choices address').inputValue());
  expect(address.search).toBe('');
  const [path, categoryParams] = address.hash.split('?');
  expect(path).toBe(`#/register/${eventId}`);
  const params = new URLSearchParams(categoryParams);
  const publicEvent = await (await page.request.get(`/api/public/events/${eventId}`)).json();
  const suggested = publicEvent.config.categories.find((category: { timingCode: string }) => category.timingCode === 'DVC-M45');
  expect([...params]).toEqual([['walkUpCategory', suggested.id]]);
  await choice.uncheck();
  await expect(panel.getByLabel('Race choices address')).toHaveCount(0);

  const email = 'walkup.suggestion@example.test';
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, extraHTTPHeaders: {} });
  try {
    const rider = await context.newPage();
    await rider.addInitScript((value) => sessionStorage.setItem('cyclereg.test-session', value), email);
    // A previously shared category can disappear before the rider opens the URL.
    params.append('walkUpCategory', 'no-longer-published');
    address.hash = `${path}?${params}`;
    await rider.goto(address.href);
    const suggestedChoices = rider.getByRole('region', { name: 'Suggested race choices' });
    await expect(suggestedChoices).toContainText('Some suggested choices are unavailable');
    await expect(suggestedChoices).toContainText('DVC-M45');
    const category = rider.getByRole('checkbox', { name: /DVC-M45/ });
    await expect(category).not.toBeChecked();
    expect(await rider.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

    const accept = suggestedChoices.getByRole('button', { name: 'Use suggested choices' });
    await accept.focus();
    await accept.press('Enter');
    await expect(rider.getByRole('heading', { name: 'About you' })).toBeFocused();
    await expect(category).toBeChecked();
    await rider.reload();
    await expect(category).toBeChecked();
    await expect(suggestedChoices).toHaveCount(0);
    await rider.getByLabel('Use a demo rider (fake data)').selectOption('rider-alex');
    await rider.getByRole('button', { name: 'Continue to racer details' }).click();
    await rider.getByRole('button', { name: 'Continue to the waiver' }).click();
    await rider.getByLabel('I have read the whole waiver').check();
    await rider.getByLabel(/Type your full name to sign/).fill('Alex Demo');
    await rider.getByLabel('I agree to this waiver', { exact: true }).check();
    await rider.getByRole('button', { name: 'Sign and review the order' }).click();
    await rider.getByRole('button', { name: /Complete simulated payment/ }).click();
    await expect(rider.getByRole('heading', { name: 'You’re entered' })).toBeVisible();

    const registrations = await rider.request.get('/api/rider/registrations', { headers: { Authorization: `Bearer test:${email}` } });
    expect(registrations.ok()).toBe(true);
    expect(await registrations.json()).toEqual([expect.objectContaining({
      eventId,
      placedByYou: true,
      entries: [expect.objectContaining({ code: 'DVC-M45' })],
    })]);
    const staff = await page.request.get('/api/rider/registrations');
    expect(staff.ok()).toBe(true);
    expect((await staff.json()).filter((order: { eventId: string }) => order.eventId === eventId)).toEqual([]);
  } finally {
    await context.close();
  }
});

test('an unattended test kiosk warns, then signs out while a completed payment response is delayed', async ({ page, browser }) => {
  const eventId = await seedRegistrationCase(page.request, 'criterium');
  const email = `kiosk.idle.${eventId}@example.test`;
  const minute = 60_000;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, extraHTTPHeaders: {} });
  const personal = await browser.newContext({ extraHTTPHeaders: {} });
  let paymentSaved!: () => void;
  let resumeResponse!: () => void;
  const committed = new Promise<void>((resolve) => { paymentSaved = resolve; });
  const delayed = new Promise<void>((resolve) => { resumeResponse = resolve; });
  try {
    const kiosk = await context.newPage();
    await kiosk.clock.install({ time: new Date() });
    await kiosk.goto(`/?kiosk=${eventId}`);
    const start = kiosk.getByRole('button', { name: 'Sign in to register' });
    const signIn = async (address: string) => {
      await start.click();
      await kiosk.getByLabel('Test email').fill(address);
      await kiosk.getByRole('button', { name: 'Sign in', exact: true }).click();
    };
    await signIn(email);
    await kiosk.getByLabel('Use a demo rider (fake data)').selectOption('rider-alex');
    await kiosk.getByRole('checkbox', { name: /DVC-M45/ }).check();
    const continueButton = kiosk.getByRole('button', { name: 'Continue to racer details' });
    await continueButton.focus();
    await kiosk.keyboard.press('Shift');

    const warning = kiosk.getByRole('dialog', { name: 'This kiosk session is about to end' });
    await kiosk.clock.fastForward(3.5 * minute);
    await expect(warning).toHaveCount(0);
    await kiosk.clock.fastForward(0.5 * minute + 1_000);
    const keepWorking = warning.getByRole('button', { name: 'Keep working' });
    await expect(keepWorking).toBeFocused();
    expect(await kiosk.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await keepWorking.press('Enter');
    await expect(warning).toHaveCount(0);
    await expect(continueButton).toBeFocused();
    await kiosk.clock.fastForward(minute);
    await expect(kiosk.getByRole('checkbox', { name: /DVC-M45/ })).toBeChecked();
    await kiosk.clock.fastForward(3 * minute + 1_000);
    await expect(warning).toBeVisible();
    await kiosk.keyboard.press('Escape');
    await expect(warning).toHaveCount(0);
    await expect(continueButton).toBeFocused();
    await kiosk.clock.fastForward(minute);
    await expect(kiosk.getByRole('checkbox', { name: /DVC-M45/ })).toBeChecked();

    await continueButton.click();
    await kiosk.getByRole('button', { name: 'Continue to the waiver' }).click();
    await kiosk.getByLabel('I have read the whole waiver').check();
    await kiosk.getByLabel(/Type your full name to sign/).fill('Alex Demo');
    await kiosk.getByLabel('I agree to this waiver', { exact: true }).check();
    await kiosk.getByRole('button', { name: 'Sign and review the order' }).click();
    await kiosk.route('**/api/orders/*/payment', async (route) => {
      const response = await route.fetch();
      paymentSaved();
      await delayed;
      await route.fulfill({ response });
    });
    await kiosk.getByRole('button', { name: /Complete simulated payment/ }).click();
    await committed;
    await kiosk.clock.fastForward(4 * minute + 1_000);
    await expect(warning).toBeVisible();
    await kiosk.clock.fastForward(minute);
    await expect(start).toBeFocused();
    const startBox = await start.boundingBox();
    expect(startBox).not.toBeNull();
    await expect(kiosk.getByRole('status')).toContainText('My registrations on your own device');
    await expect(kiosk.getByRole('heading', { name: 'Review your order' })).toHaveCount(0);
    expect(await kiosk.evaluate(() => Object.keys(sessionStorage))).toEqual([]);
    resumeResponse();
    await kiosk.unrouteAll({ behavior: 'wait' });

    await signIn('kiosk.after-idle@example.test');
    await expect(kiosk.getByRole('checkbox', { name: /DVC-M45/ })).not.toBeChecked();
    await expect(kiosk.getByRole('heading', { name: 'You’re entered' })).toHaveCount(0);

    // Moving wall time without running timers models the first tap after the browser was suspended.
    const later = await kiosk.evaluate(() => Date.now()) + 5 * minute + 1_000;
    await kiosk.clock.setSystemTime(later);
    await kiosk.touchscreen.tap(startBox!.x + startBox!.width / 2, startBox!.y + startBox!.height / 2);
    await expect(start).toBeFocused();
    await expect(kiosk.getByRole('heading', { name: 'Sign in for testing' })).toHaveCount(0);
    await start.press('Enter');
    await expect(kiosk.getByRole('heading', { name: 'Sign in for testing' })).toBeVisible();

    const rider = await personal.newPage();
    await rider.addInitScript((address) => sessionStorage.setItem('cyclereg.test-session', address), email);
    await rider.goto('/#/my-registrations');
    const registrations = rider.getByRole('list', { name: 'Your registrations' });
    await expect(registrations.getByRole('listitem')).toHaveCount(1);
    await expect(registrations).toContainText('Confirmed');
    await registrations.getByRole('link').click();
    await expect(rider.getByRole('heading', { name: 'You’re entered' })).toBeVisible();
  } finally {
    resumeResponse();
    await Promise.all([context.close(), personal.close()]);
  }
});
