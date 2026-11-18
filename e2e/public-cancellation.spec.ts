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
  await page.evaluate((id) => { const key = `cyclereg.register.${id}`; const d = JSON.parse(sessionStorage.getItem(key)!); d.step = 'waiver'; d.reached = 2; sessionStorage.setItem(key, JSON.stringify(d)); }, s.eventId);
  await page.reload();
  await expect(page.getByRole('region', { name: 'Cancelled race selection' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign and review the order' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Review race selection' }).click();
  await page.locator(`#opt-${s.rr.id}`).click();
  await expect(page.locator(`#opt-${s.rr.id}`)).toHaveAttribute('aria-checked', 'false');
  await page.locator(`#opt-${s.cr.id}`).click();
  await expect(page.locator(`#opt-${s.cr.id}`)).toHaveAttribute('aria-checked', 'true');
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
