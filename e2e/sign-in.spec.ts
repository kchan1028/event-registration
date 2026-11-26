import { seedRegistrationCase } from './support/registration-case';
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

test('riders sign in during checkout and later retrieve their check-in code on a phone', async ({ page, browser, baseURL }) => {
  const email = 'alex.rider@example.test';
  const eventId = await seedRegistrationCase(page.request, 'criterium');
  await page.goto('/#/register');
  const event = page.locator(`a[href="#/register/${eventId}"]`);
  await expect(event).toBeVisible();
  await event.click();
  await expect(page.getByRole('heading', { name: 'About you' })).toBeVisible();
  // Riders can sign in before choosing races, so checkout is not interrupted.
  await expect(page.getByRole('note').filter({ hasText: 'Sign in now so checkout is not interrupted' })).toBeVisible();
  await page.getByLabel('Use a demo rider (fake data)').selectOption('rider-alex');
  await page.getByRole('checkbox', { name: /DVC-M45/ }).click();
  await page.getByRole('button', { name: 'Continue to racer details' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to continue your registration' })).toBeFocused();
  await expect(page.getByLabel('First name (required)')).toHaveCount(0);

  // After sign-in the rider picks up where they left off.
  await page.getByRole('button', { name: 'Sign in with email' }).click();
  await page.getByLabel('Test email').fill(email);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByLabel('First name (required)')).toHaveValue('Alex');
  await page.getByRole('button', { name: 'Continue to the waiver' }).click();
  await page.getByLabel('I have read the whole waiver').check();
  await page.getByLabel(/Type your full name to sign/).fill('Alex Demo');
  await page.getByLabel('I agree to this waiver', { exact: true }).check();
  await page.getByRole('button', { name: 'Sign and review the order' }).click();
  await page.getByRole('button', { name: /Complete simulated payment/ }).click();
  await expect(page.getByRole('heading', { name: 'You’re entered' })).toBeVisible();
  const originalCode = page.locator('.ticket__code');
  await expect(originalCode).toHaveText(/\S/);
  const code = await originalCode.innerText();
  const orderUrl = page.url();

  await test.step('Retrieve the confirmed receipt in a fresh phone session', async () => {
    const phone = await browser.newPage({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    try {
      await phone.goto('/#/my-registrations');
      await expect(phone.getByRole('heading', { name: 'Sign in to CycleReg' })).toBeVisible();
      await phone.getByRole('button', { name: 'Sign in with email' }).click();
      await phone.getByLabel('Test email').fill(email);
      await phone.getByRole('button', { name: 'Sign in', exact: true }).click();
      const registrations = phone.getByRole('list', { name: 'Your registrations' });
      const receipt = phone.locator(`a[href="${new URL(orderUrl).hash}"]`);
      const registration = registrations.getByRole('listitem').filter({ has: receipt });
      await expect(registration).toContainText('Confirmed');
      await registration.getByRole('link', { name: /Alex Demo/ }).click();
      await expect(phone).toHaveURL(orderUrl);
      await expect(phone.getByRole('heading', { name: 'You’re entered' })).toBeVisible();
      await expect(phone.locator('.ticket__code')).toHaveText(code);
      await expect(phone.getByRole('img', { name: `QR code for check-in code ${code}` })).toBeVisible();
    } finally {
      await phone.close();
    }
  });
});
