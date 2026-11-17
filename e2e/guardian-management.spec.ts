import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';
import type { EventConfig } from '../src/shared/schema';

// Management uses the screen; a separate fictional guardian accepts through the existing API.
for (const recovery of ['refresh', 'retry'] as const) test(`guardians manage invitations and recover an interrupted removal by ${recovery}`, async ({ page, browser }, testInfo) => {
  const recoveryAction = `management-${recovery}`;
  const { eventId } = await (await page.request.post('/api/demo')).json();
  expect((await page.request.post(`/api/events/${eventId}/publish`, { data: { acknowledgeWarnings: true } })).ok()).toBe(true);
  const { config } = await (await page.request.get(`/api/events/${eventId}`)).json() as { config: EventConfig };
  const categoryId = config.categories.find((c) => c.timingCode === 'RR-J1516')!.id;
  const parent = `parent-${recoveryAction}@guardian-browser.test`;
  const second = `second-${recoveryAction}@guardian-browser.test`;
  const junior = `junior-${recoveryAction}@guardian-browser.test`;
  const headers = (email: string) => ({ Authorization: `Bearer test:${email}` });
  const created = await page.request.post(`/api/rider/events/${eventId}/orders`, { headers: headers(parent), data: {
    clientRequestId: 'guardian-browser-original', categoryIds: [categoryId],
    rider: { firstName: 'Sam', lastName: 'Example', email: '', team: '', racingAge: 16, licenseCategory: null, licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: { name: 'Pat Example', relationship: 'Parent', email: parent, phone: '' }, emergencyContact: { name: 'Pat Example', phone: '555-555-0199' } },
    waiver: { version: config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Pat Example', signerRole: 'guardian' },
  } });
  expect(created.status(), await created.text()).toBe(201);
  const original = await created.json();
  const [sam] = await (await page.request.get('/api/rider/juniors', { headers: headers(parent) })).json();
  await page.request.post(`/api/rider/juniors/${sam.id}/viewer`, { headers: headers(parent), data: { email: junior } });
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, extraHTTPHeaders: headers(parent) });
  try {
    const guardian = await context.newPage();
    await guardian.addInitScript((email) => sessionStorage.setItem('cyclereg.test-session', email), parent);
    await guardian.goto('/#/my-registrations');
    const management = guardian.getByRole('region', { name: 'Guardian access for Sam Example', exact: true });
    await expect(management.getByRole('heading', { name: 'Guardian access', exact: true })).toBeVisible();
    const invite = async () => {
      await management.getByLabel('Other guardian’s email', { exact: true }).fill(second);
      await management.getByRole('button', { name: 'Record guardian invitation' }).click();
      await expect(management.getByRole('status').filter({ hasText: 'Guardian invitation recorded' })).toBeVisible();
      await expect(management.getByRole('button', { name: `Cancel invitation for ${second}` })).toBeVisible();
    };
    await management.getByLabel('Other guardian’s email', { exact: true }).fill(junior);
    await management.getByRole('button', { name: 'Record guardian invitation' }).click();
    await expect(management.getByRole('alert')).toContainText('different guardian email');
    await invite();
    await expect(management.getByRole('status').filter({ hasText: 'Guardian invitation recorded' })).toBeFocused();
    expect((await guardian.request.get(`/api/orders/${original.id}`, { headers: headers(second) })).status()).toBe(404);
    await management.getByRole('button', { name: `Cancel invitation for ${second}` }).click();
    await expect(management.getByRole('status').filter({ hasText: 'cancelled' })).toBeVisible();
    await expect(management.getByRole('button', { name: `Cancel invitation for ${second}` })).toHaveCount(0);
    await invite();
    const history = await (await page.request.get(`/api/rider/juniors/${sam.id}/guardian-invitations`, { headers: headers(parent) })).json();
    expect(history).toHaveLength(2);
    const pending = history.find((i: { status: string }) => i.status === 'pending');
    expect((await page.request.post(`/api/rider/guardian-invitations/${pending.id}/accept`, { headers: headers(second), data: { acknowledge: true } })).ok()).toBe(true);
    await management.getByRole('button', { name: 'Refresh guardian access' }).click();
    const removeButton = management.getByRole('button', { name: `Remove guardian access for ${second}` });
    await expect(removeButton).toBeVisible();
    await expect(management.getByRole('button', { name: `Remove guardian access for ${parent}` })).toHaveCount(0);
    await removeButton.click();
    await management.getByRole('button', { name: 'Keep guardian access' }).click();
    await expect(management.getByRole('status').filter({ hasText: 'Guardian access kept' })).toBeFocused();
    await removeButton.click();
    const removal = management.getByRole('form', { name: `Remove guardian access for ${second}` });
    await expect(removal.getByLabel('Reason for removing guardian access', { exact: true })).toBeFocused();
    await expect(removal.getByRole('button', { name: 'Confirm guardian removal' })).toBeDisabled();
    await removal.getByLabel('Reason for removing guardian access', { exact: true }).fill('😀😀');
    await removal.getByRole('checkbox').check();
    await removal.getByRole('button', { name: 'Confirm guardian removal' }).click();
    await expect(management.getByRole('alert')).toContainText('3 to 300 characters');
    await removal.getByLabel('Reason for removing guardian access', { exact: true }).fill('Fictional access change ' + 'R'.repeat(240));
    for (const theme of ['light', 'dark']) {
      const toggle = guardian.getByRole('button', { name: `Switch to ${theme} theme` });
      if (await toggle.count()) await toggle.click();
      for (const width of [360, 1440]) {
        await guardian.setViewportSize({ width, height: 1000 });
        expect(await guardian.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        await management.screenshot({ path: `test-results/guardian-management-${theme}-${width}.png` });
      }
      expect((await new AxeBuilder({ page: guardian }).include('[aria-label="Guardian access for Sam Example"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
    }
    let removalRequests = 0;
    await guardian.route('**/api/rider/juniors/*/guardians/*/remove', async (route) => {
      removalRequests++;
      if (removalRequests === 1) { expect((await route.fetch()).ok()).toBe(true); await route.abort('failed'); }
      else await route.continue();
    });
    await removal.getByRole('button', { name: 'Confirm guardian removal' }).click();
    await expect(management.getByRole('alert')).toContainText('Refresh guardian access');
    if (recovery === 'refresh') await management.getByRole('button', { name: 'Refresh guardian access' }).click();
    else await removal.getByRole('button', { name: 'Confirm guardian removal' }).click();
    await expect(removeButton).toHaveCount(0);
    await expect(removal).toHaveCount(0);
    expect((await page.request.get(`/api/orders/${original.id}`, { headers: headers(second) })).status()).toBe(404);
    const final = await (await page.request.get(`/api/orders/${original.id}`, { headers: headers(parent) })).json();
    expect(final.waiver).toEqual(original.waiver);
    expect(final.waiverEvidence).toEqual(original.waiverEvidence);
    expect(final.quote).toEqual(original.quote);
    const relationships = await (await page.request.get(`/api/rider/juniors/${sam.id}/guardians`, { headers: headers(parent) })).json();
    expect(relationships.filter((g: { revokedAt: string | null }) => !g.revokedAt)).toHaveLength(1);
    expect(relationships.filter((g: { removalReason: string | null }) => g.removalReason)).toHaveLength(1);
  } finally { await context.close(); }
});
