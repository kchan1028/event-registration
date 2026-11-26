import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from './fixtures';
import { publishReviewed } from './support/publish';

test('a paid weekend shows day and race counts without splitting the rider', async ({ page }) => {
  const eventId = await paidWeekend(page);
  await page.goto(`/#/events/${eventId}/registrations`);
  const summary = page.getByRole('region', { name: 'Summary', exact: true });
  await expect(summary).toBeVisible();
  await expect(stat(summary, 'Riders')).toHaveText('1');
  await expect(stat(summary, 'Paid entries')).toHaveText('2');
  await summary.locator('summary', { hasText: 'Paid entries by day' }).click();
  await summary.locator('summary', { hasText: 'Paid entries by race' }).click();
  await summary.locator('summary', { hasText: 'Paid entries by category' }).click();
  const day = summary.getByRole('region', { name: 'Paid entries by day' });
  const race = summary.getByRole('region', { name: 'Paid entries by race' });
  await expect(day.getByRole('row').nth(1)).toContainText('Saturday');
  await expect(day.getByRole('row').nth(2)).toContainText('Sunday');
  await expect(race.getByRole('row').nth(1)).toContainText('Saturday road race');
  await expect(race.getByRole('row').nth(2)).toContainText('Sunday criterium');
  for (const row of [day.getByRole('row').nth(1), day.getByRole('row').nth(2), race.getByRole('row').nth(1), race.getByRole('row').nth(2)]) {
    await expect(row.getByRole('cell').nth(1)).toHaveText('1');
    await expect(row.getByRole('cell').nth(2)).toHaveText('1');
    await expect(row.getByRole('cell').nth(3)).toHaveText('1');
  }
  await expect(summary).toContainText('The riders total above still counts that person once.');
  await expect(summary.getByRole('region', { name: 'Paid entries by category' }).getByRole('row').nth(1)).toContainText('Saturday road race');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await summary.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include('[aria-labelledby="summary-title"]').analyze()).violations).toEqual([]);
  }
  await page.locator('html').evaluate((root) => root.setAttribute('data-theme', 'dark'));
  await page.setViewportSize({ width: 390, height: 900 });
  expect(await summary.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).include('[aria-labelledby="summary-title"]').analyze()).violations).toEqual([]);
});

function stat(summary: ReturnType<Page['getByRole']>, name: string) {
  return summary.locator('.stat-grid div', { hasText: name }).locator('dd');
}

async function paidWeekend(page: Page) {
  const { eventId } = await (await page.request.post('/api/demo')).json();
  expect((await publishReviewed(page.request, `/api/events/${eventId}`, { acknowledgeWarnings: true })).status()).toBe(200);
  const { config } = await (await page.request.get(`/api/events/${eventId}`)).json();
  const categoryId = (code: string) => config.categories.find((c: { timingCode: string }) => c.timingCode === code).id;
  const created = await page.request.post(`/api/rider/events/${eventId}/orders`, {
    data: {
      clientRequestId: `summary-weekend-${eventId}`,
      categoryIds: [categoryId('RR-M35-34'), categoryId('CR-M35-34')],
      rider: { firstName: 'Summary', lastName: 'Fictional', email: 'summary@example.test', team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Fictional Contact', phone: '555-555-0199' } },
      waiver: { version: config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Summary Fictional', signerRole: 'rider' },
    },
  });
  const order = await created.json();
  expect(created.status(), JSON.stringify(order)).toBe(201);
  expect((await page.request.post(`/api/orders/${order.id}/payment`, { data: { attemptId: `summary-pay-${eventId}`, outcome: 'success' } })).status()).toBe(200);
  return eventId as string;
}
