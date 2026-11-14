import { expect, test, type Page } from '@playwright/test';

async function publishedDemo(page: Page): Promise<string> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Load demonstration event' }).click();
  await expect(page.getByRole('heading', { name: 'Saturday road race', level: 2 })).toBeVisible();
  await page.getByRole('link', { name: 'Review and publish' }).last().click();
  const ack = page.getByLabel(/I have reviewed the/);
  if (await ack.count()) await ack.check();
  await page.getByRole('button', { name: /Publish version 1/ }).click();
  await expect(page.locator('.publish-box .note')).toContainText('Published as version 1');
  await page.getByRole('link', { name: /Open rider registration/ }).click();
  await expect(page.getByRole('heading', { name: 'About you' })).toBeVisible();
  return page.url();
}

test('rider enters both days with the bundle, survives a declined payment, and gets a check-in code', async ({ page }) => {
  await publishedDemo(page);

  await page.getByLabel('Racing age').fill('42');
  await page.getByLabel('License category').selectOption('3');
  await page.getByLabel('Competition class').selectOption('men');

  await page.getByRole('checkbox', { name: /RR-M35-34/ }).click();
  await expect(page.locator('.tray')).toContainText('Add an entry in Sunday criterium');
  await page.getByRole('checkbox', { name: /CR-M35-34/ }).click();
  await expect(page.locator('.tray')).toContainText('Weekend omnium entry');
  await expect(page.getByRole('checkbox', { name: /RR-P12/ })).toHaveAttribute('aria-disabled', 'true');

  await page.getByRole('button', { name: 'Continue to your details' }).click();
  await page.getByLabel('First name').fill('Test');
  await page.getByLabel('Last name').fill('Rider');
  await page.getByLabel('Email for your receipt').fill('test.rider@example.test');
  await page.getByRole('button', { name: 'Continue to the waiver' }).click();

  await expect(page.getByText('SAMPLE WAIVER FOR THE PROTOTYPE')).toBeVisible();
  await page.getByLabel('I have read and accept this waiver').check();
  await page.getByRole('button', { name: 'Hold my places and review' }).click();

  await expect(page.locator('.hold')).toContainText('Your places are held for');
  await page.getByRole('button', { name: 'Simulate a declined payment' }).click();
  await expect(page.getByRole('alert')).toContainText('declined');
  await page.getByRole('button', { name: /\(simulated\)/ }).click();

  await expect(page.getByRole('heading', { name: 'You’re entered' })).toBeVisible();
  await expect(page.locator('.ticket__code')).toHaveText(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
  await expect(page.locator('.done__entry').first()).toContainText('License not verified');
});

test('a junior entry requires a guardian, and the organizer can clear a license review', async ({ page }) => {
  const registerUrl = await publishedDemo(page);
  const eventId = new URL(registerUrl).hash.split('/')[2];

  await page.getByLabel('Racing age').fill('16');
  await page.getByRole('checkbox', { name: /RR-J1516/ }).click();
  await page.getByRole('button', { name: 'Continue to your details' }).click();
  await page.getByLabel('First name').fill('Junior');
  await page.getByLabel('Last name').fill('Tester');
  await page.getByLabel('Email for your receipt').fill('family@example.test');
  await page.getByRole('button', { name: 'Continue to the waiver' }).click();
  await expect(page.getByText('Enter the guardian’s name.')).toBeVisible();
  await page.getByLabel('Guardian name').fill('Parent Tester');
  await page.getByLabel('Relationship to rider').fill('Parent');
  await page.getByRole('button', { name: 'Continue to the waiver' }).click();

  await page.getByLabel('I have read and accept this waiver').check();
  await expect(page.getByRole('button', { name: 'Hold my places and review' })).toBeDisabled();
  await page.getByLabel(/As parent or guardian/).check();
  await page.getByRole('button', { name: 'Hold my places and review' }).click();
  await page.getByRole('button', { name: /\(simulated\)/ }).click();
  await expect(page.getByRole('heading', { name: 'You’re entered' })).toBeVisible();
  await expect(page.locator('.done__entry')).toContainText('Guardian accepted the waiver');

  await page.goto(`/#/events/${eventId}/registrations`);
  await page.getByRole('button', { name: /License review/ }).click();
  const order = page.locator('.order', { hasText: 'Junior Tester' });
  await order.getByRole('button', { name: 'Review license' }).click();
  await order.getByRole('textbox').fill('One-day license confirmed at the desk');
  await order.getByRole('button', { name: 'Mark reviewed' }).click();
  // Handled: it leaves the license-review filter, and shows as reviewed under All.
  await expect(order).toHaveCount(0);
  await page.getByRole('button', { name: /^All/ }).click();
  await expect(page.locator('.order', { hasText: 'Junior Tester' })).toContainText('License reviewed: One-day license confirmed at the desk');
});
