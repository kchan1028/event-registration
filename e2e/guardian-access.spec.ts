import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';
import type { EventConfig } from '../src/shared/schema';

// Acceptance is exercised through the actual local API; no acceptance-management screen is claimed.
test('an explicitly accepted guardian sees shared orders with accurate provenance on desktop and phone', async ({ page, browser }, testInfo) => {
  const { eventId } = await (await page.request.post('/api/demo')).json();
  expect((await page.request.post(`/api/events/${eventId}/publish`, { data: { acknowledgeWarnings: true } })).ok()).toBe(true);
  const { config } = await (await page.request.get(`/api/events/${eventId}`)).json() as { config: EventConfig };
  const categoryId = config.categories.find((c) => c.timingCode === 'RR-J1516')!.id;
  const parent = 'parent@guardian-browser.test';
  const second = 'second@guardian-browser.test';
  const junior = 'junior@guardian-browser.test';
  const headers = (email: string) => ({ Authorization: `Bearer test:${email}` });
  const created = await page.request.post(`/api/rider/events/${eventId}/orders`, { headers: headers(parent), data: {
    clientRequestId: 'guardian-browser-original', categoryIds: [categoryId],
    rider: { firstName: 'Sam', lastName: 'Example', email: '', team: '', racingAge: 16, licenseCategory: null, licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: { name: 'Pat Example', relationship: 'Parent', email: parent, phone: '' }, emergencyContact: { name: 'Pat Example', phone: '555-555-0199' } },
    waiver: { version: config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Pat Example', signerRole: 'guardian' },
  } });
  expect(created.status(), await created.text()).toBe(201);
  const original = await created.json();
  const [sam] = await (await page.request.get('/api/rider/juniors', { headers: headers(parent) })).json();
  const [invitation] = await (await page.request.post(`/api/rider/juniors/${sam.id}/guardian-invitations`, { headers: headers(parent), data: { email: second } })).json();
  expect((await page.request.get(`/api/orders/${original.id}`, { headers: headers(second) })).status()).toBe(404);
  expect((await page.request.post(`/api/rider/guardian-invitations/${invitation.id}/accept`, { headers: headers(second), data: { acknowledge: true } })).status()).toBe(200);
  expect((await page.request.post(`/api/orders/${original.id}/payment`, { headers: headers(second), data: { attemptId: 'guardian-browser-payment', outcome: 'success' } })).ok()).toBe(true);
  expect((await page.request.post(`/api/rider/juniors/${sam.id}/viewer`, { headers: headers(second), data: { email: junior } })).ok()).toBe(true);
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, extraHTTPHeaders: headers(second) });
  try {
    const guardian = await context.newPage();
    await guardian.addInitScript((email) => sessionStorage.setItem('cyclereg.test-session', email), second);
    for (const theme of ['light', 'dark']) {
      await guardian.goto('/#/my-registrations');
      await guardian.evaluate((value) => localStorage.setItem('cyclereg-theme', value), theme);
      await guardian.reload();
      await expect(guardian.getByText('Registered by another guardian', { exact: true })).toBeVisible();
      await expect(guardian.getByText('Registered by your guardian', { exact: true })).toHaveCount(0);
      await expect(guardian.getByRole('heading', { name: 'Juniors you manage' })).toBeVisible();
      for (const width of [390, 1440]) {
        await guardian.setViewportSize({ width, height: 900 });
        expect(await guardian.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        await guardian.locator('main').screenshot({ path: `test-results/guardian-access-${theme}-${width}.png` });
      }
      expect((await new AxeBuilder({ page: guardian }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
    }
    const registration = guardian.getByRole('list', { name: 'Your registrations' }).getByRole('link');
    await registration.focus();
    await expect(registration).toBeFocused();
    await registration.press('Enter');
    await expect(guardian.getByRole('heading', { name: 'You’re entered' })).toBeVisible();
    await expect(guardian.locator('main')).toContainText('Sam Example');
  } finally { await context.close(); }
  const viewerContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL, extraHTTPHeaders: headers(junior) });
  try {
    const viewer = await viewerContext.newPage();
    await viewer.addInitScript((email) => sessionStorage.setItem('cyclereg.test-session', email), junior);
    await viewer.goto('/#/my-registrations');
    await expect(viewer.getByText('Registered by your guardian', { exact: true })).toBeVisible();
    await expect(viewer.getByRole('heading', { name: 'Juniors you manage' })).toHaveCount(0);
    expect((await viewer.request.post(`/api/orders/${original.id}/cancel`)).status()).toBe(404);
    const shared = await (await page.request.get(`/api/orders/${original.id}`, { headers: headers(second) })).json();
    expect(shared.waiverEvidence).toEqual(original.waiverEvidence);
    expect(shared.waiver).toEqual(original.waiver);
    expect(shared.quote).toEqual(original.quote);
  } finally { await viewerContext.close(); }
});
