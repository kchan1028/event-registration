import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';
import { seedRegistrationCase } from './support/registration-case';

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
    await page.getByRole('searchbox', { name: 'Find a rider' }).fill('Alex Demo');
    await page.getByRole('searchbox', { name: 'Find a rider' }).press('Enter');
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
    await page.getByRole('searchbox', { name: 'Find a rider' }).press('Enter');
    await expect(page.getByRole('region', { name: 'Rider check-in' })).toContainText('Ready to race');
    await page.getByRole('button', { name: /Check in and issue/ }).click();
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
