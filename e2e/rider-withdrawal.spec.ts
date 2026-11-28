// @covers src/web/WithdrawalRequest.tsx
// @covers src/web/Register.tsx
// @covers src/web/api.ts
import AxeBuilder from '@axe-core/playwright';
import { formatDollars } from '../src/shared/format';
import { expect, test } from './fixtures';
import { publishReviewed } from './support/publish';
import { seedRegistrationCase } from './support/registration-case';

test('a rider sees the policy effect, asks to withdraw an entry, and the request waits for the organizer', { tag: '@smoke' }, async ({ page, browser, baseURL }) => {
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
    const paidCents = (await (await page.request.get(`/api/orders/${orderId}`)).json()).quote.lines[0].totalCents as number;
    await expect(form).toContainText(`withdrawing today returns ${formatDollars(paidCents)} (100% of the ${formatDollars(paidCents)} you paid; fees are not returned) as a refund.`);
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

    // If the organizer then moves the entry, the waiting message still names the category the rider asked about.
    const other = config.categories.find((row: { timingCode: string }) => row.timingCode === 'CR-M35-34');
    const entryId = (await (await page.request.get(`/api/orders/${orderId}`)).json()).entries[0].id;
    expect((await page.request.post(`/api/order-entries/${entryId}/transfer`, { data: { toCategoryId: other.id, reason: 'Organizer moved the rider' } })).status()).toBe(200);
    await rider.reload();
    await expect(rider.getByRole('status').filter({ hasText: `You asked to withdraw from ${category.name}.` })).toBeVisible();

    // Declining leaves the entry in the race. The rider can ask again, about the category it is in now.
    expect((await page.request.post(`${eventUrl}/withdrawal-requests/${requests[0].id}/decline`, { data: { reason: 'The entry stays in the race' } })).status()).toBe(200);
    await rider.reload();
    await expect(rider.getByRole('status').filter({ hasText: 'The organizer has not decided yet' })).toHaveCount(0);
    await expect(rider.getByRole('button', { name: `Ask to withdraw from ${other.name}` })).toBeVisible();
    await expect(rider.getByText('Withdrawn by the organizer')).toHaveCount(0);
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

test('a shared kiosk receipt does not offer withdrawal; the rider’s own receipt does', async ({ page, browser, baseURL }) => {
  const eventId = await seedRegistrationCase(page.request, 'criterium');
  const email = `kiosk.withdraw.${eventId}@example.test`;
  const kioskContext = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, extraHTTPHeaders: {} });
  try {
    const kiosk = await kioskContext.newPage();
    await kiosk.goto(`/?kiosk=${eventId}`);
    await kiosk.getByRole('button', { name: 'Sign in to register' }).click();
    await kiosk.getByLabel('Test email').fill(email);
    await kiosk.getByRole('button', { name: 'Sign in', exact: true }).click();
    await kiosk.getByLabel('Use a demo rider (fake data)').selectOption('rider-alex');
    await kiosk.getByRole('checkbox', { name: /DVC-M45/ }).check();
    await kiosk.getByRole('button', { name: 'Continue to racer details' }).click();
    await kiosk.getByRole('button', { name: 'Continue to the waiver' }).click();
    await kiosk.getByLabel('I have read the whole waiver').check();
    await kiosk.getByLabel(/Type your full name to sign/).fill('Alex Demo');
    await kiosk.getByLabel('I agree to this waiver', { exact: true }).check();
    await kiosk.getByRole('button', { name: 'Sign and review the order' }).click();
    await kiosk.getByRole('button', { name: /Complete simulated payment/ }).click();
    await expect(kiosk.getByRole('heading', { name: 'You’re entered' })).toBeVisible();
    await expect(kiosk.getByRole('button', { name: /Ask to withdraw/ })).toHaveCount(0);
    await expect(kiosk.getByRole('form', { name: /Ask to withdraw/ })).toHaveCount(0);
    expect((await (await page.request.get(`/api/events/${eventId}/withdrawal-requests`)).json())).toEqual([]);

    const orders = await kiosk.request.get('/api/rider/registrations', { headers: { Authorization: `Bearer test:${email}` } });
    expect(orders.ok()).toBe(true);
    const [order] = await orders.json();
    const own = await browser.newContext({ baseURL, extraHTTPHeaders: { Authorization: `Bearer test:${email}` } });
    try {
      await own.addInitScript((account) => sessionStorage.setItem('cyclereg.test-session', account), email);
      const rider = await own.newPage();
      await rider.goto(`/#/orders/${order.id}`);
      await expect(rider.getByRole('button', { name: /Ask to withdraw from / })).toBeVisible();
    } finally {
      await own.close();
    }
  } finally {
    await kioskContext.close();
  }
});

test('a junior viewing their own registration cannot ask to withdraw, and the guardian can until they cancel', async ({ page, browser, baseURL }) => {
  const { eventId } = await (await page.request.post('/api/demo')).json();
  const eventUrl = `/api/events/${eventId}`;
  const event = await (await page.request.get(eventUrl)).json();
  event.config.registration.refundRules = { tiers: [{ daysBefore: 0, percent: 100 }], returnAs: 'credit', organizerCancellation: 'credit' };
  expect((await page.request.put(`${eventUrl}/config`, { data: { revision: event.revision, config: event.config } })).status()).toBe(200);
  expect((await publishReviewed(page.request, eventUrl, { acknowledgeWarnings: true })).status()).toBe(200);
  const { config } = await (await page.request.get(eventUrl)).json();
  const category = config.categories.find((row: { timingCode: string }) => row.timingCode === 'RR-J1516');
  const parent = `parent-withdraw-${eventId}@example.test`;
  const juniorEmail = `junior-withdraw-${eventId}@example.test`;
  const headers = { Authorization: `Bearer test:${parent}` };
  const created = await page.request.post(`/api/rider/events/${eventId}/orders`, { headers, data: {
    clientRequestId: `junior-withdraw-${eventId}`.slice(0, 64),
    categoryIds: [category.id],
    rider: {
      firstName: 'Sam', lastName: 'Fictional', email: '', team: '', racingAge: 16, licenseCategory: null, licenseType: 'annual',
      competitionClass: 'men', collegiateDivision: null, guardian: { name: 'Pat Fictional', relationship: 'Parent', email: parent, phone: '' },
      emergencyContact: { name: 'Pat Fictional', phone: '555-555-0199' },
    },
    waiver: { version: config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Pat Fictional', signerRole: 'guardian' },
  } });
  expect(created.status(), await created.text()).toBe(201);
  const { id: orderId } = await created.json();

  const guardianContext = await browser.newContext({ baseURL, extraHTTPHeaders: headers });
  await guardianContext.addInitScript((account) => sessionStorage.setItem('cyclereg.test-session', account), parent);
  const guardian = await guardianContext.newPage();
  try {
    await guardian.goto(`/#/orders/${orderId}`);
    await expect(guardian.getByRole('heading', { name: 'Registration not finished' })).toBeVisible();
    await expect(guardian.getByRole('button', { name: /Ask to withdraw/ })).toHaveCount(0);

    const paid = await page.request.post(`/api/orders/${orderId}/payment`, { headers, data: { attemptId: `junior-withdraw-paid-${orderId}`, outcome: 'success' } });
    expect(paid.status(), await paid.text()).toBe(200);
    const entryId = (await paid.json()).entries[0].id as string;
    const paidCents = (await (await page.request.get(`/api/orders/${orderId}`)).json()).quote.lines[0].totalCents as number;
    const [sam] = await (await page.request.get('/api/rider/juniors', { headers })).json();
    expect((await page.request.post(`/api/rider/juniors/${sam.id}/viewer`, { headers, data: { email: juniorEmail } })).ok()).toBe(true);

    const juniorContext = await browser.newContext({ baseURL, extraHTTPHeaders: { Authorization: `Bearer test:${juniorEmail}` } });
    try {
      await juniorContext.addInitScript((account) => sessionStorage.setItem('cyclereg.test-session', account), juniorEmail);
      const junior = await juniorContext.newPage();
      const denied = junior.waitForResponse((res) => res.url().includes(`/api/rider/order-entries/${entryId}/withdrawal`) && res.request().method() === 'GET');
      await junior.goto(`/#/orders/${orderId}`);
      expect((await denied).status()).toBe(404);
      await expect(junior.getByRole('heading', { name: 'You’re entered' })).toBeVisible();
      await expect(junior.getByRole('button', { name: /Ask to withdraw/ })).toHaveCount(0);
      await expect(junior.getByRole('form', { name: /Ask to withdraw/ })).toHaveCount(0);
    } finally {
      await juniorContext.close();
    }

    await guardian.reload();
    const ask = guardian.getByRole('button', { name: `Ask to withdraw from ${category.name}` });
    await expect(ask).toBeVisible();
    await ask.click();
    const form = guardian.getByRole('form', { name: `Ask to withdraw from ${category.name}` });
    const amount = formatDollars(paidCents);
    await expect(form).toContainText(`withdrawing today returns ${amount} (100% of the ${amount} you paid; fees are not returned) as credit toward a later event by this organizer.`);
    await form.getByRole('textbox', { name: 'Why do you want to withdraw?' }).fill('Cannot travel');
    await form.getByRole('button', { name: 'Cancel' }).click();
    await expect(form).toHaveCount(0);
    await expect(ask).toBeVisible();
    expect((await (await page.request.get(`${eventUrl}/withdrawal-requests`)).json())).toEqual([]);

    await guardian.route(`**/api/rider/order-entries/${entryId}/withdrawal`, (route) => route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Fictional withdrawal status failure' }),
    }));
    await guardian.reload();
    await expect(guardian.getByText('Withdrawal options could not load. Refresh this page to try again.')).toBeVisible();
    await expect(guardian.getByRole('button', { name: /Ask to withdraw/ })).toHaveCount(0);
    await guardian.unroute(`**/api/rider/order-entries/${entryId}/withdrawal`);
    await guardian.reload();
    await expect(guardian.getByRole('button', { name: `Ask to withdraw from ${category.name}` })).toBeVisible();
  } finally {
    await guardianContext.close();
  }
});

test('a rider picks a category to move to, sees how its price compares, and the request waits for the organizer', async ({ page, browser, baseURL }) => {
  const { eventId } = await (await page.request.post('/api/demo')).json();
  const eventUrl = `/api/events/${eventId}`;
  expect((await publishReviewed(page.request, eventUrl, { acknowledgeWarnings: true })).status()).toBe(200);
  const { config } = await (await page.request.get(eventUrl)).json();
  const from = config.categories.find((row: { timingCode: string }) => row.timingCode === 'RR-M35-34');
  const to = config.categories.find((row: { timingCode: string }) => row.timingCode === 'CR-M35-34');
  const email = `mover-ui-${eventId}@example.test`;
  const headers = { Authorization: `Bearer test:${email}` };
  const created = await page.request.post(`/api/rider/events/${eventId}/orders`, { headers, data: {
    clientRequestId: `mover-ui-${eventId}`.slice(0, 64), categoryIds: [from.id],
    rider: { firstName: 'Sam', lastName: 'Fictional', email, team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Pat Fictional', phone: '555-555-0199' } },
    waiver: { version: config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Sam Fictional', signerRole: 'rider' },
  } });
  expect(created.status(), await created.text()).toBe(201);
  const { id: orderId } = await created.json();
  const paid = await page.request.post(`/api/orders/${orderId}/payment`, { headers, data: { attemptId: `mover-ui-paid-${orderId}`, outcome: 'success' } });
  const entryId = (await paid.json()).entries[0].id as string;
  const { options } = await (await page.request.get(`/api/rider/order-entries/${entryId}/transfer-options`, { headers })).json();
  const option = options.find((o: { categoryId: string }) => o.categoryId === to.id);

  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 900 }, extraHTTPHeaders: headers });
  await context.addInitScript((account) => sessionStorage.setItem('cyclereg.test-session', account), email);
  const rider = await context.newPage();
  try {
    await rider.goto(`/#/orders/${orderId}`);
    await rider.getByRole('button', { name: `Ask to move from ${from.name} to another category` }).click();
    const form = rider.getByRole('form', { name: `Ask to move from ${from.name} to another category` });
    // Both races have a "Masters 35+ Cat 3/4", so each choice names its timing code and race.
    const choice = form.getByRole('radio', { name: new RegExp(`^${option.code} `) });
    await expect(choice).toBeVisible();
    // The rider's current category is not offered.
    const fromCode = from.classifications[0]?.code || from.timingCode;
    const fromRace = config.races.find((r: { id: string }) => r.id === from.raceId).name;
    await expect(form.getByRole('radio', { name: `${fromCode} ${from.name} (${fromRace}):`, exact: false })).toHaveCount(0);
    await expect(form).toContainText('nothing is charged or refunded here');
    await expect(form.getByRole('radio').first()).toBeFocused();
    expect(await rider.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    expect((await new AxeBuilder({ page: rider }).include('form.correction').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);

    // A choice and a reason are both needed before anything is sent.
    await form.getByRole('textbox', { name: 'Why do you want to move?' }).fill('Prefer the criterium');
    await form.getByRole('button', { name: 'Send request' }).click();
    await expect(form.getByRole('alert')).toHaveText('Choose the category to move to.');
    expect(await (await page.request.get(`${eventUrl}/withdrawal-requests`)).json()).toEqual([]);

    await choice.check();
    await form.getByRole('button', { name: 'Send request' }).click();
    const waiting = rider.getByRole('status').filter({ hasText: `You asked to move this entry to ${option.code} ${to.name} (${option.raceName}).` });
    await expect(waiting).toBeFocused();
    await rider.screenshot({ path: 'test-results/rider-move-waiting-390.png', fullPage: true });
    const requests = await (await page.request.get(`${eventUrl}/withdrawal-requests`)).json();
    expect(requests).toEqual([expect.objectContaining({ kind: 'transfer', status: 'open', policy: expect.objectContaining({ transfer: expect.objectContaining({ categoryId: to.id, newPriceCents: option.newPriceCents }) }) })]);
  } finally {
    await context.close();
  }
});

test('the move form recovers from a failed load and drops a choice that a refresh no longer offers', async ({ page, browser, baseURL }) => {
  const { eventId } = await (await page.request.post('/api/demo')).json();
  const eventUrl = `/api/events/${eventId}`;
  expect((await publishReviewed(page.request, eventUrl, { acknowledgeWarnings: true })).status()).toBe(200);
  const { config } = await (await page.request.get(eventUrl)).json();
  const from = config.categories.find((row: { timingCode: string }) => row.timingCode === 'RR-M35-34');
  const email = `mover-recover-${eventId}@example.test`;
  const headers = { Authorization: `Bearer test:${email}` };
  const created = await page.request.post(`/api/rider/events/${eventId}/orders`, { headers, data: {
    clientRequestId: `mover-recover-${eventId}`.slice(0, 64), categoryIds: [from.id],
    rider: { firstName: 'Sam', lastName: 'Fictional', email, team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Pat Fictional', phone: '555-555-0199' } },
    waiver: { version: config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Sam Fictional', signerRole: 'rider' },
  } });
  expect(created.status(), await created.text()).toBe(201);
  const { id: orderId } = await created.json();
  expect((await page.request.post(`/api/orders/${orderId}/payment`, { headers, data: { attemptId: `mover-recover-paid-${orderId}`, outcome: 'success' } })).status()).toBe(200);

  const context = await browser.newContext({ baseURL, extraHTTPHeaders: headers });
  await context.addInitScript((account) => sessionStorage.setItem('cyclereg.test-session', account), email);
  const rider = await context.newPage();
  try {
    // A stalled first load can be closed while it is still loading; the next load fails, and the rider can close it too.
    let loads = 0;
    const stalled: { release?: () => void } = {};
    await rider.route('**/api/rider/order-entries/*/transfer-options', async (route) => {
      loads += 1;
      if (loads === 1) { await new Promise<void>((resolve) => { stalled.release = resolve; }); return route.abort(); }
      if (loads === 2) return route.fulfill({ status: 503, json: { error: 'Fictional temporary failure' } });
      return route.continue();
    });
    await rider.goto(`/#/orders/${orderId}`);
    const askMove = rider.getByRole('button', { name: `Ask to move from ${from.name} to another category` });
    await askMove.click();
    await expect(rider.getByRole('status').filter({ hasText: 'Loading the categories you can move to' })).toBeVisible();
    await rider.getByRole('button', { name: 'Close' }).click();
    await expect(rider.getByRole('button', { name: `Ask to withdraw from ${from.name}` })).toBeVisible();
    stalled.release?.();
    await askMove.click();
    await expect(rider.getByRole('alert')).toContainText('Move options could not load');
    // Try again cannot be pressed twice while a retry is in flight.
    const heldRetry: { release?: () => void } = {};
    await rider.route('**/api/rider/order-entries/*/transfer-options', async (route) => {
      await new Promise<void>((resolve) => { heldRetry.release = resolve; });
      return route.fulfill({ status: 503, json: { error: 'Fictional temporary failure' } });
    }, { times: 1 });
    await rider.getByRole('button', { name: 'Try again' }).click();
    await expect(rider.getByRole('button', { name: 'Trying again…' })).toBeDisabled();
    await expect.poll(() => heldRetry.release !== undefined).toBe(true);
    heldRetry.release?.();
    await expect(rider.getByRole('button', { name: 'Try again' })).toBeEnabled();
    await rider.getByRole('button', { name: 'Close' }).click();
    await expect(rider.getByRole('button', { name: `Ask to withdraw from ${from.name}` })).toBeVisible();
    await askMove.click();
    await expect(rider.getByRole('alert')).toHaveCount(0);
    const form = rider.getByRole('form', { name: `Ask to move from ${from.name} to another category` });
    const first = form.getByRole('radio').first();
    const firstValue = await first.getAttribute('value');
    await first.check();
    await form.getByRole('textbox', { name: 'Why do you want to move?' }).fill('Prefer another race');

    // The send is refused and the refreshed options no longer include the picked category.
    await rider.unroute('**/api/rider/order-entries/*/transfer-options');
    await rider.route('**/api/rider/order-entries/*/transfer-options', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.options = body.options.filter((o: { categoryId: string }) => o.categoryId !== firstValue);
      return route.fulfill({ response, json: body });
    });
    await rider.route('**/api/rider/order-entries/*/transfer-requests', (route) => route.fulfill({ status: 409, json: { error: 'The price of that category has changed since you looked. Review it and send your request again.' } }), { times: 1 });
    await form.getByRole('button', { name: 'Send request' }).click();
    await expect(form.getByRole('alert')).toContainText('has changed since you looked');
    await expect(form.locator(`input[type="radio"][value="${firstValue}"]`)).toHaveCount(0);
    await expect(form.getByRole('radio', { checked: true })).toHaveCount(0);
    await form.getByRole('button', { name: 'Send request' }).click();
    await expect(form.getByRole('alert')).toHaveText('Choose the category to move to.');
    expect(await (await page.request.get(`${eventUrl}/withdrawal-requests`)).json()).toEqual([]);
  } finally {
    await context.close();
  }
});

test('the move form keeps the reason when a refresh fails, refreshes after a closed target, and shows a request sent from another tab', async ({ page, browser, baseURL }) => {
  const { eventId } = await (await page.request.post('/api/demo')).json();
  const eventUrl = `/api/events/${eventId}`;
  expect((await publishReviewed(page.request, eventUrl, { acknowledgeWarnings: true })).status()).toBe(200);
  const { config } = await (await page.request.get(eventUrl)).json();
  const from = config.categories.find((row: { timingCode: string }) => row.timingCode === 'RR-M35-34');
  const to = config.categories.find((row: { timingCode: string }) => row.timingCode === 'CR-M35-34');
  const email = `mover-tabs-${eventId}@example.test`;
  const headers = { Authorization: `Bearer test:${email}` };
  const created = await page.request.post(`/api/rider/events/${eventId}/orders`, { headers, data: {
    clientRequestId: `mover-tabs-${eventId}`.slice(0, 64), categoryIds: [from.id],
    rider: { firstName: 'Sam', lastName: 'Fictional', email, team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Pat Fictional', phone: '555-555-0199' } },
    waiver: { version: config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Sam Fictional', signerRole: 'rider' },
  } });
  expect(created.status(), await created.text()).toBe(201);
  const { id: orderId } = await created.json();
  const paid = await page.request.post(`/api/orders/${orderId}/payment`, { headers, data: { attemptId: `mover-tabs-paid-${orderId}`, outcome: 'success' } });
  const entryId = (await paid.json()).entries[0].id as string;

  const context = await browser.newContext({ baseURL, extraHTTPHeaders: headers });
  await context.addInitScript((account) => sessionStorage.setItem('cyclereg.test-session', account), email);
  const rider = await context.newPage();
  try {
    await rider.goto(`/#/orders/${orderId}`);
    await rider.getByRole('button', { name: `Ask to move from ${from.name} to another category` }).click();
    const form = rider.getByRole('form', { name: `Ask to move from ${from.name} to another category` });
    const reason = form.getByRole('textbox', { name: 'Why do you want to move?' });
    await form.getByRole('radio').first().check();
    await reason.fill('Prefer another race');

    // A refused send whose refresh then fails keeps the form, the choice and the reason.
    let optionLoads = 0;
    await rider.route('**/api/rider/order-entries/*/transfer-requests', (route) => route.fulfill({ status: 409, json: { error: 'Something changed since you looked.' } }), { times: 1 });
    await rider.route('**/api/rider/order-entries/*/transfer-options', (route) => { optionLoads += 1; return route.fulfill({ status: 503, json: { error: 'Fictional temporary failure' } }); }, { times: 1 });
    await form.getByRole('button', { name: 'Send request' }).click();
    await expect(form.getByText('The choices could not refresh.')).toBeVisible();
    await expect(reason).toHaveValue('Prefer another race');
    await form.getByRole('button', { name: 'Refresh choices' }).click();
    await expect(form.getByText('The choices could not refresh.')).toHaveCount(0);
    await expect(reason).toHaveValue('Prefer another race');

    // A target that closed since the rider looked (422) also refreshes the choices.
    const loadsBefore = optionLoads;
    await rider.route('**/api/rider/order-entries/*/transfer-options', (route) => { optionLoads += 1; return route.continue(); });
    await rider.route('**/api/rider/order-entries/*/transfer-requests', (route) => route.fulfill({ status: 422, json: { error: 'That category is not open for entries.' } }), { times: 1 });
    await form.getByRole('radio').first().check();
    await form.getByRole('button', { name: 'Send request' }).click();
    await expect(form.getByRole('alert').filter({ hasText: 'not open for entries' })).toBeVisible();
    await expect.poll(() => optionLoads).toBeGreaterThan(loadsBefore);

    // Another tab sends a request first: this tab's send is refused and the waiting request is shown instead of the form.
    const { from: current, options } = await (await page.request.get(`/api/rider/order-entries/${entryId}/transfer-options`, { headers })).json();
    const option = options.find((o: { categoryId: string }) => o.categoryId === to.id);
    expect((await page.request.post(`/api/rider/order-entries/${entryId}/transfer-requests`, { headers, data: {
      clientRequestId: `mover-other-tab-${entryId}`, reason: 'Sent from another tab', toCategoryId: to.id, expectedCategoryId: current.categoryId, expectedNewPriceCents: option.newPriceCents,
    } })).status()).toBe(201);
    await form.getByRole('radio').first().check();
    await form.getByRole('button', { name: 'Send request' }).click();
    await expect(rider.getByRole('status').filter({ hasText: 'You asked to move this entry to' })).toBeVisible();
    await expect(form).toHaveCount(0);
    await expect(rider.getByRole('button', { name: /Ask to withdraw|Ask to move/ })).toHaveCount(0);
  } finally {
    await context.close();
  }
});

