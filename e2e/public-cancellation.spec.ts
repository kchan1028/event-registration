import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from './fixtures';

async function fixture(page: Page) {
  const { eventId } = await (await page.request.post('/api/demo')).json();
  expect((await page.request.delete(`/api/events/${eventId}/test-entries`)).status()).toBe(200);
  expect((await page.request.post(`/api/events/${eventId}/publish`, { data: { acknowledgeWarnings: true } })).status()).toBe(200);
  const { config } = await (await page.request.get(`/api/events/${eventId}`)).json();
  const rr = config.categories.find((c: { timingCode: string }) => c.timingCode === 'RR-M35-34');
  const cr = config.categories.find((c: { timingCode: string }) => c.timingCode === 'CR-M35-34');
  const cancel = async (selection: object) => {
    const preview = await (await page.request.post(`/api/events/${eventId}/cancellation-confirmation-preview`, { data: selection })).json();
    const plan = await page.request.post(`/api/events/${eventId}/cancellation-confirmations`, { data: { clientRequestId: `public-label-plan-${eventId}`, selection, previewFingerprint: preview.fingerprint, reason: 'Fictional weather cancellation', acknowledgePlanOnly: true } });
    expect(plan.status()).toBe(200);
    const execution = await page.request.post(`/api/events/${eventId}/cancellation-executions`, { data: { clientRequestId: `public-label-execution-${eventId}`, confirmationId: (await plan.json()).id, acknowledgeSimulatedCancellation: true } });
    expect(execution.status(), await execution.text()).toBe(200);
  };
  return { eventId, config, rr, cr, cancel };
}

for (const scope of ['event', 'day', 'race'] as const) {
  test(`shows ${scope} cancellation and prevents new selections without hiding the schedule`, async ({ page }) => {
    const s = await fixture(page);
    await s.cancel(scope === 'event' ? { scope } : scope === 'day' ? { scope, dayId: s.config.races.find((r: { id: string }) => r.id === s.rr.raceId).dayId } : { scope, raceId: s.rr.raceId });
    await page.goto(`/#/register/${s.eventId}`);
    await expect(page.getByRole('heading', { name: scope === 'event' ? 'Event cancelled' : 'Part of this event was cancelled', exact: true })).toBeVisible();
    for (const day of s.config.days) {
      const heading = page.locator(`#day-${day.id}`);
      await expect(heading).toBeVisible();
      const dayCancelled = scope === 'event' || (scope === 'day' && s.config.races.some((race: { id: string; dayId: string }) => race.id === s.rr.raceId && race.dayId === day.id));
      await expect(heading.getByText('Cancelled', { exact: true })).toHaveCount(dayCancelled ? 1 : 0);
      for (const race of s.config.races.filter((race: { dayId: string }) => race.dayId === day.id)) {
        const raceHeading = page.getByRole('heading', { level: 3, name: race.name });
        await expect(raceHeading).toBeVisible();
        await expect(raceHeading.getByText('Cancelled', { exact: true })).toHaveCount(dayCancelled || (scope === 'race' && race.id === s.rr.raceId) ? 1 : 0);
      }
    }
    const closed = page.locator(`#opt-${s.rr.id}`);
    await expect(closed).toHaveAttribute('aria-disabled', 'true');
    await closed.click({ force: true }); await expect(closed).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator(`#opt-${s.rr.id}-why`)).toContainText('Cancelled by organizer');
    await expect(closed).not.toContainText(/places left|Places open|Your place is held/);
    if (scope === 'event') await expect(page.getByRole('button', { name: 'Continue to racer details', exact: true })).toBeDisabled();
    if (scope !== 'event') {
      await page.locator(`#opt-${s.cr.id}`).click();
      await expect(page.locator(`#opt-${s.cr.id}`)).toHaveAttribute('aria-checked', 'true');
    }
    for (const theme of ['light', 'dark']) {
      const toggle = page.getByRole('button', { name: /^Theme: / });
      if (await toggle.getAttribute('data-current') !== theme) await toggle.click();
      for (const width of [360, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate(async () => { await Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))); });
        expect(await page.locator('body').evaluate((e) => e.scrollWidth <= innerWidth)).toBe(true);
        expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
        await page.screenshot({ path: `test-results/public-cancel-${scope}-${theme}-${width}.png`, fullPage: true, animations: 'disabled' });
      }
    }
  });
}

test('refresh preserves selected entries for explicit removal and blocks a saved later-step draft', async ({ page }) => {
  const s = await fixture(page); await page.goto(`/#/register/${s.eventId}`);
  await page.getByLabel('Racing age').fill('40');
  await page.getByLabel('License category').selectOption('3');
  await page.getByLabel('Competition class').selectOption({ label: 'Men' });
  await page.locator(`#opt-${s.rr.id}`).click();
  await page.getByRole('checkbox', { name: /I want the/ }).check();
  await s.cancel({ scope: 'race', raceId: s.rr.raceId });
  await page.getByRole('button', { name: 'Refresh registration status', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Part of this event was cancelled' })).toBeVisible();
  await expect(page.locator(`#opt-${s.rr.id}`)).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Continue to racer details', exact: true }).click();
  await expect(page.getByText(`${s.rr.name} was cancelled. Remove this entry to continue.`, { exact: true })).toBeVisible();
  await expect(page.getByText('Your selected package includes a cancelled race. Uncheck the package to continue with unaffected races.', { exact: true })).toBeVisible();
  await expect(page.getByText(`Choose one eligible race in ${s.rr.name}.`, { exact: true })).toHaveCount(0);
  for (const step of ['details', 'waiver']) {
    await page.evaluate(({ id, step }) => {
      const key = `cyclereg.register.${id}`;
      const draft = JSON.parse(sessionStorage.getItem(key)!);
      draft.step = step;
      draft.reached = step === 'details' ? 1 : 2;
      draft.details.firstName = 'Saved Fictional';
      sessionStorage.setItem(key, JSON.stringify(draft));
    }, { id: s.eventId, step });
    await page.reload();
    await expect(page.getByRole('region', { name: 'Cancelled race selection' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Racer details', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Sign and review the order' })).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Review race selection' }).click();
  await page.locator(`#opt-${s.rr.id}`).click();
  await expect(page.locator(`#opt-${s.rr.id}`)).toHaveAttribute('aria-checked', 'false');
  await page.locator(`#opt-${s.cr.id}`).click();
  await expect(page.locator(`#opt-${s.cr.id}`)).toHaveAttribute('aria-checked', 'true');
  const bundle = page.getByRole('checkbox', { name: /I want the/ });
  await expect(bundle).toBeChecked();
  await bundle.uncheck();
  await expect(bundle).toBeDisabled();
  await page.getByRole('button', { name: 'Continue to racer details', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Racer details', exact: true })).toBeVisible();
  await expect(page.getByLabel('First name (required)', { exact: true })).toHaveValue('Saved Fictional');
});

test('refresh keeps an existing cancelled review order visible after race cancellation', async ({ page }) => {
  const s = await fixture(page);
  const rider = { firstName: 'Review', lastName: 'Fictional', email: 'review@example.test', team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Fictional Contact', phone: '555-555-0199' } };
  const response = await page.request.post(`/api/rider/events/${s.eventId}/orders`, { data: {
    clientRequestId: 'public-label-review-order', categoryIds: [s.rr.id], rider,
    waiver: { version: s.config.registration.waiverVersion, signatureName: 'Review Fictional', read: true, agreed: true, signerRole: 'rider' },
  } });
  expect(response.status(), await response.text()).toBe(201);
  const order = await response.json();
  await page.goto(`/#/register/${s.eventId}`);
  await page.locator(`#opt-${s.rr.id}`).click();
  await page.evaluate(({ eventId, orderId }) => {
    const key = `cyclereg.register.${eventId}`;
    const draft = JSON.parse(sessionStorage.getItem(key)!);
    Object.assign(draft, { step: 'review', reached: 3, orderId });
    sessionStorage.setItem(key, JSON.stringify(draft));
  }, { eventId: s.eventId, orderId: order.id });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Review your order' })).toBeVisible();
  const payment = page.getByRole('button', { name: /^Complete simulated payment/ });
  await expect(payment).toBeEnabled();
  // Organizer execution refuses an unsettled order. Release the rider's hold first.
  expect((await page.request.post(`/api/orders/${order.id}/cancel`)).status()).toBe(200);
  await s.cancel({ scope: 'race', raceId: s.rr.raceId });
  await page.getByRole('button', { name: 'Refresh registration status', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Part of this event was cancelled' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Review your order' })).toBeVisible();
  await expect(page.getByText('Your reservation was cancelled. Change your entries to start again.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change my entries', exact: true })).toBeVisible();
  await expect(payment).toBeDisabled();
  expect(await page.evaluate((id) => JSON.parse(sessionStorage.getItem(`cyclereg.register.${id}`)!).orderId, s.eventId)).toBe(order.id);
});

test('retains loaded status after refresh failure and retries without changing reservation intent', async ({ page }) => {
  const s = await fixture(page); await page.goto(`/#/register/${s.eventId}`);
  await page.locator(`#opt-${s.rr.id}`).click();
  const request = { clientRequestId: 'unresolved-public-label-request', categoryIds: [s.rr.id], rider: { firstName: 'Pending', lastName: 'Fictional' }, waiver: { version: s.config.registration.waiverVersion, signatureName: 'Pending Fictional', read: true, agreed: true, signerRole: 'rider' } };
  await page.evaluate(({ id, request, waiverText }) => { const key = `cyclereg.register.${id}`; const d = JSON.parse(sessionStorage.getItem(key)!); d.step = 'waiver'; d.reached = 2; d.pendingReservation = { request, waiverText }; sessionStorage.setItem(key, JSON.stringify(d)); }, { id: s.eventId, request, waiverText: s.config.registration.waiverText });
  await s.cancel({ scope: 'event' }); await page.reload();
  await expect(page.getByRole('button', { name: 'Retry reservation', exact: true })).toBeVisible();
  await page.route(`**/api/public/events/${s.eventId}`, (route) => route.abort());
  await page.getByRole('button', { name: 'Refresh registration status', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Could not refresh registration status' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Event cancelled', exact: true })).toBeVisible();
  await page.unroute(`**/api/public/events/${s.eventId}`);
  await page.getByRole('button', { name: 'Refresh registration status', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Could not refresh registration status' })).toHaveCount(0);
  expect(await page.evaluate((id) => JSON.parse(sessionStorage.getItem(`cyclereg.register.${id}`)!).pendingReservation.request, s.eventId)).toEqual(request);
});

test('uses plain historical labels when a cancelled scope is no longer published', async ({ page }) => {
  const s = await fixture(page);
  await page.route(`**/api/public/events/${s.eventId}`, async (route) => {
    const response = await route.fetch(); const value = await response.json();
    value.cancellation = { scopes: [{ scope: 'race', raceId: 'removed-fictional-race' }, { scope: 'day', dayId: 'removed-fictional-day' }], categoryIds: [] };
    await route.fulfill({ response, json: value });
  });
  await page.goto(`/#/register/${s.eventId}`);
  await expect(page.getByText('A previously published race: cancelled', { exact: true })).toBeVisible();
  await expect(page.getByText('A previously published race day: cancelled', { exact: true })).toBeVisible();
  await expect(page.locator('main')).not.toContainText('removed-fictional');
});

test('cancellation overrides a saved offer and full-category waitlist invitation', async ({ page }) => {
  const s = await fixture(page); await page.goto(`/#/register/${s.eventId}`);
  await page.locator(`#opt-${s.rr.id}`).click();
  await page.evaluate(({ id, categoryId }) => { const key = `cyclereg.register.${id}`; const d = JSON.parse(sessionStorage.getItem(key)!); d.selected = []; d.offerToken = 'fictional-expired-offer'; d.offerCategoryId = categoryId; sessionStorage.setItem(key, JSON.stringify(d)); }, { id: s.eventId, categoryId: s.rr.id });
  await s.cancel({ scope: 'race', raceId: s.rr.raceId });
  await page.route(`**/api/public/events/${s.eventId}`, async (route) => {
    const response = await route.fetch(); const value = await response.json();
    value.remaining[s.rr.id] = 0; value.waitlist[s.rr.id] = { waiting: 0 };
    await route.fulfill({ response, json: value });
  });
  await page.route('**/api/rider/offers/fictional-expired-offer', (route) => route.fulfill({ json: { eventId: s.eventId, categoryId: s.rr.id, status: 'offered', rider: { firstName: 'Offer', lastName: 'Fictional', email: 'offer@example.test', racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null } } }));
  await page.goto(`/#/register/${s.eventId}?offer=fictional-expired-offer`);
  const loadedOffer = page.waitForResponse('**/api/rider/offers/fictional-expired-offer');
  await page.reload();
  await (await loadedOffer).finished();
  await page.waitForLoadState('networkidle');
  const option = page.locator(`#opt-${s.rr.id}`);
  await expect(option).toHaveAttribute('aria-disabled', 'true');
  await expect(option).toHaveAttribute('aria-checked', 'false');
  await expect(option).not.toContainText('Your place is held');
  const status = page.locator(`#opt-${s.rr.id}-why`);
  await expect(status).toContainText('Cancelled by organizer');
  await expect(status.getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: /I want the/ })).toBeDisabled();
});

for (const cancelled of [false, true]) {
  test(`retries a failed offer status check without reload (race cancelled before retry: ${cancelled})`, async ({ page }) => {
    const s = await fixture(page);
    const token = 'fictional-retry-offer';
    let offerReads = 0;
    let eventReads = 0;
    await page.route(`**/api/rider/offers/${token}`, async (route) => {
      offerReads++;
      await route.fulfill({ json: {
        eventId: s.eventId, categoryId: s.rr.id, categoryName: s.rr.name, status: 'offered', offerExpiresAt: '2027-04-17T18:00:00Z',
        rider: { firstName: 'Offer', lastName: 'Fictional', email: 'offer@example.test', racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null },
      } });
    });
    await page.route(`**/api/public/events/${s.eventId}`, (route) => {
      eventReads++;
      return eventReads === 2 ? route.abort() : route.continue();
    });
    await page.goto(`/#/register/${s.eventId}?offer=${token}`);
    const option = page.locator(`#opt-${s.rr.id}`);
    await expect(option).toHaveAttribute('aria-checked', 'false');
    await expect(option).not.toContainText('Your place is held');
    const alert = page.getByRole('alert').filter({ hasText: 'Could not check registration status for this waitlist offer' });
    await expect(alert).toBeVisible();
    expect(offerReads).toBe(1);
    if (cancelled) await s.cancel({ scope: 'race', raceId: s.rr.raceId });
    const retry = page.getByRole('button', { name: 'Retry waitlist offer' });
    if (!cancelled) {
      for (const theme of ['light', 'dark']) {
        const toggle = page.getByRole('button', { name: /^Theme: / });
        if (await toggle.getAttribute('data-current') !== theme) await toggle.click();
        const width = theme === 'dark' ? 360 : 1440;
        await page.setViewportSize({ width, height: 1000 });
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(retry).toBeVisible();
        expect((await retry.boundingBox())?.height).toBeGreaterThanOrEqual(44);
        await page.evaluate(async () => {
          await Promise.all(document.getAnimations().filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity).map((animation) => animation.finished.catch(() => {})));
        });
        expect(await page.locator('main').evaluate((main) => main.scrollWidth <= innerWidth)).toBe(true);
        expect((await new AxeBuilder({ page }).include('.reg__event').analyze()).violations).toEqual([]);
        await page.locator('.reg__event').screenshot({ path: `test-results/offer-retry-${theme}-${width}.png` });
      }
    }
    await retry.click();
    await expect(alert).toHaveCount(0);
    expect(offerReads).toBe(2);
    expect(eventReads).toBe(3);
    if (cancelled) {
      await expect(option).toHaveAttribute('aria-disabled', 'true');
      await expect(option).toHaveAttribute('aria-checked', 'false');
      await expect(option).not.toContainText('Your place is held');
      await expect(page.getByText('Waitlist offer:', { exact: true })).toHaveCount(0);
    } else {
      await expect(option).toHaveAttribute('aria-checked', 'true');
      await expect(option).toContainText('Your place is held');
      await expect(page.getByLabel('Racing age')).toHaveValue('40');
    }
  });
}

test('signed-out and invalid offer links leave the public schedule available', async ({ page, browser }) => {
  const s = await fixture(page);
  const path = `/#/register/${s.eventId}?offer=fictional-missing-offer`;
  const signedOut = await browser.newPage({ extraHTTPHeaders: {} });
  try {
    let offerReads = 0;
    signedOut.on('request', (request) => { if (request.url().includes('/api/rider/offers/')) offerReads++; });
    await signedOut.goto(path);
    await expect(signedOut.getByRole('heading', { name: 'Sign in to use your waitlist offer' })).toBeVisible();
    await expect(signedOut.locator(`#opt-${s.rr.id}`)).toHaveAttribute('aria-checked', 'false');
    expect(offerReads).toBe(0);
    expect((await signedOut.request.get('/api/rider/offers/fictional-missing-offer')).status()).toBe(401);
  } finally {
    await signedOut.close();
  }
  await page.goto(path);
  await expect(page.getByRole('alert').filter({ hasText: 'This waitlist offer was not found.' })).toBeVisible();
  await expect(page.locator(`#opt-${s.rr.id}`)).toHaveAttribute('aria-checked', 'false');
});
