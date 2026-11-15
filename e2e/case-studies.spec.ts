import { expect, test } from '@playwright/test';

test('generated omnium supports a complete rider purchase and organizer recovery journey', async ({ page }) => {
  const seeded = await page.request.post('/api/demo/case-studies/omnium');
  expect([200, 201]).toContain(seeded.status());
  const eventId = 'evt_demo_case_omnium';

  await page.goto(`/#/register/${eventId}`);
  await page.getByLabel('Racing age').fill('40');
  await page.getByLabel('License category').selectOption('3');
  await page.getByLabel(/I want the/).check();
  await page.getByRole('checkbox', { name: /DRW-RR-M35/ }).click();
  await expect(page.locator('.error-summary')).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue to racer details' }).click();
  await expect(page.locator('.error-summary')).toContainText('needs one eligible race on each day');
  await page.getByRole('checkbox', { name: /DRW-CR-M35/ }).click();
  await expect(page.locator('.tray .quote__total')).toContainText('$80.25');
  await page.getByRole('button', { name: 'Continue to racer details' }).click();

  await page.getByLabel('First name (required)').fill('Ávery');
  await page.getByLabel('Last name (required)').fill('Example-Longname');
  await page.getByLabel('Email for the receipt (required)').fill('avery@example.test');
  await page.getByLabel('Contact name').fill('Jordan Example');
  await page.getByLabel('Contact phone').fill('202-555-0188');
  await page.getByRole('button', { name: 'Continue to the waiver' }).click();
  await page.getByLabel('I have read the whole waiver').check();
  await page.getByLabel(/Type your full name to sign/).fill('Ávery Example-Longname');
  await page.getByLabel(/agree to this waiver/).check();
  await page.getByRole('button', { name: 'Sign and review the order' }).click();
  await page.getByRole('button', { name: 'Simulate a declined payment' }).click();
  await expect(page.getByRole('alert')).toContainText('declined');
  await page.getByRole('button', { name: /Complete simulated payment/ }).click();
  await expect(page.getByRole('heading', { name: 'You’re entered' })).toBeVisible();
  await expect(page.locator('.done__entry').first()).toContainText('License needs review');

  await page.goto(`/#/events/${eventId}/registrations`);
  await expect(page.getByRole('link', { name: 'Download entries (CSV)' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download ledger (CSV)' })).toBeVisible();
  const order = page.locator('.order', { hasText: 'Ávery Example-Longname' });
  await order.getByRole('button', { name: 'Review license' }).first().click();
  await order.getByRole('textbox').fill('Fictional license reviewed for browser test');
  await order.getByRole('button', { name: 'Mark reviewed' }).click();
  await page.getByRole('button', { name: /^All/ }).click();
  await expect(page.locator('.order', { hasText: 'Ávery Example-Longname' })).toContainText('License reviewed');
});
test('generated empty and large cases remain usable organizer states', async ({ page }) => {
  expect([200, 201]).toContain((await page.request.post('/api/demo/case-studies/empty-event')).status());
  expect([200, 201]).toContain((await page.request.post('/api/demo/case-studies/large-event')).status());

  await page.goto('/#/events/evt_demo_case_empty/schedule');
  await expect(page.getByRole('button', { name: 'Add category' })).toBeVisible();
  await expect(page.locator('.cat-row')).toHaveCount(0);

  await page.goto('/#/events/evt_demo_case_large/schedule');
  await expect(page.locator('.cat-row')).toHaveCount(120);
  await expect(page.getByRole('button', { name: 'Élite women, novice riders, collegiate riders, and open field with a deliberately long category name', exact: true })).toBeVisible();
});
