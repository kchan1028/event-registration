import { expect, test } from '@playwright/test';

// Signed out: organizer pages ask for sign-in, rider event pages stay open, and checkout asks
// for sign-in before details. Uses the local-only test sign-in (playwright.config.ts).

test('organizer pages ask for sign-in, then show the workspace', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in to CycleReg' })).toBeVisible();
  expect((await page.request.get('/api/organizations')).status()).toBe(401);

  await page.getByRole('button', { name: 'Sign in with email' }).click();
  await page.getByLabel('Test email').fill('new.organizer@example.test');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your organizations' })).toBeVisible();
  await expect(page.getByText('new.organizer@example.test')).toBeVisible();
  await expect(page.getByText('You are not on any organization')).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to CycleReg' })).toBeVisible();
});

test('riders browse events signed out and sign in before entering details', async ({ page }) => {
  const seeded = await page.request.post('/api/demo/purchase-flow', { headers: { Authorization: 'Bearer test:organizer@example.test' } });
  expect([200, 201]).toContain(seeded.status());

  await page.goto('/#/register');
  // .first(): parallel first loads of the shared fixture can create it twice (unlocked demo loader).
  await page.getByRole('link', { name: /Demo Valley Criterium/ }).first().click();
  await expect(page.getByRole('heading', { name: 'About you' })).toBeVisible();
  await page.getByLabel('Use a demo rider (fake data)').selectOption('rider-alex');
  await page.getByRole('checkbox', { name: /DVC-M45/ }).click();
  await page.getByRole('button', { name: 'Continue to racer details' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to continue your registration' })).toBeVisible();
  await expect(page.getByLabel('First name (required)')).toHaveCount(0);

  // After sign-in the rider picks up where they left off.
  await page.getByRole('button', { name: 'Sign in with email' }).click();
  await page.getByLabel('Test email').fill('alex.rider@example.test');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByLabel('First name (required)')).toHaveValue('Alex');
});
