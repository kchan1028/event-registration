// Rehearsal: phone walk-up and shared test kiosk. Runbook: docs/runbooks/walkup-registration.md. Fictional data only.
import { devices } from '@playwright/test';
import { expect, test } from '../fixtures';
import { seedRegistrationCase } from '../support/registration-case';

test.use({ trace: 'on', screenshot: 'on' });

const RIDER = 'walkup.rider.rehearsal@example.test';

test('@rehearsal walk-up registration and shared test kiosk', async ({ page, browser }, testInfo) => {
  test.setTimeout(180_000);
  const shot = (who: typeof page, name: string) => who.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
  const eventId = await seedRegistrationCase(page.request, 'criterium');
  await page.request.put(`/api/events/${eventId}/bib-settings`, { data: { scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 199 }] } });

  testInfo.annotations.push({
    type: 'not-rehearsed',
    description: 'Before the desk: a loopback address is not a phone on another network. Physical QR scanning and a hosted kiosk were not rehearsed.',
  });

  await test.step('At the desk 1: Check-in opens Register a walk-up with a public address', async () => {
    await page.goto(`/#/events/${eventId}/check-in`);
    await page.getByRole('button', { name: 'Register a walk-up' }).click();
    await expect(page.getByLabel('Public registration address')).not.toHaveValue('');
    await shot(page, '01-walk-up-panel');
  });

  const address = await page.getByLabel('Public registration address').inputValue();

  await test.step('At the desk 2: the public address opens in a separate phone-sized browser', async () => {
    expect(address).toContain(eventId);
    await shot(page, '02-address');
  });

  const phone = await browser.newContext({ ...devices['iPhone 13'], extraHTTPHeaders: {} });
  const rider = await phone.newPage();
  try {
    await test.step('At the desk 3: the rider signs in on their own session and completes simulated payment', async () => {
      await rider.goto(address);
      await rider.getByRole('button', { name: 'Sign in with email' }).click();
      await rider.getByLabel('Test email').fill(RIDER);
      await rider.getByRole('button', { name: 'Sign in', exact: true }).click();
      await rider.getByLabel('Use a demo rider (fake data)').selectOption('rider-alex');
      await rider.getByRole('checkbox', { name: /DVC-M45/ }).check();
      await rider.getByRole('button', { name: 'Continue to racer details' }).click();
      await rider.getByRole('button', { name: 'Continue to the waiver' }).click();
      await rider.getByLabel('I have read the whole waiver').check();
      await rider.getByLabel(/Type your full name to sign/).fill('Alex Demo');
      await rider.getByLabel('I agree to this waiver', { exact: true }).check();
      await rider.getByRole('button', { name: 'Sign and review the order' }).click();
      await rider.getByRole('button', { name: /Complete simulated payment/ }).click();
      await expect(rider.getByRole('heading', { name: 'You’re entered' })).toBeVisible();
      await shot(rider, '03-rider-receipt');
    });

    await test.step('At the desk 4: staff find the rider by name and the unpaid path is not this receipt', async () => {
      const search = page.getByRole('searchbox', { name: 'Find a rider' });
      await search.fill('Alex Demo');
      await search.press('Enter');
      const detail = page.getByRole('region', { name: 'Rider check-in' });
      await expect(detail.getByRole('heading', { name: 'Alex Demo', exact: true })).toBeVisible();
      await expect(detail.getByRole('status')).toContainText('Ready to race');
      await shot(page, '04-staff-lookup');
    });

    await test.step('At the desk 5: mark the confirmed entry as a walk-up and issue the bib', async () => {
      const detail = page.getByRole('region', { name: 'Rider check-in' });
      await detail.getByRole('button', { name: /^Mark as walk-up/ }).click();
      await expect(detail).toContainText('Walk-up');
      await detail.getByRole('button', { name: /Check in and issue/ }).click();
      await expect(detail.locator('.ci-bib__number')).toHaveText('100');
      await expect(detail.getByRole('status')).toContainText('Checked in.');
      await shot(page, '05-issued');
    });

    await test.step('Suggest races 1: Prepare race choices opens on the walk-up panel', async () => {
      await page.getByRole('button', { name: 'Prepare race choices' }).click();
      await expect(page.getByRole('button', { name: 'Prepare race choices' })).toBeVisible();
      await shot(page, '06-choices');
    });

    testInfo.annotations.push({
      type: 'not-rehearsed',
      description: 'Suggest races 2 and 3: sharing a suggestion QR with a second physical phone, and continuing an existing draft on that phone, were not rehearsed. The choices panel opened on the staff screen.',
    });

    await test.step('Kiosk 1: copy the test kiosk address into a dedicated browser', async () => {
      const kioskAddress = new URL(await page.getByLabel('Test kiosk address').inputValue());
      expect(kioskAddress.searchParams.get('kiosk')).toBe(eventId);
      const kioskContext = await browser.newContext({ viewport: { width: 390, height: 844 }, extraHTTPHeaders: {} });
      const kiosk = await kioskContext.newPage();
      try {
        await kiosk.goto(kioskAddress.href);
        await expect(kiosk.getByRole('button', { name: 'Sign in to register' })).toBeVisible();
        await shot(kiosk, '07-kiosk-start');
        await test.step('Kiosk 3: End kiosk session returns to Sign in to register', async () => {
          await kiosk.getByRole('button', { name: 'Sign in to register' }).click();
          await kiosk.getByLabel('Test email').fill('kiosk.rehearsal@example.test');
          await kiosk.getByRole('button', { name: 'Sign in', exact: true }).click();
          await kiosk.getByRole('button', { name: 'End kiosk session' }).click();
          await expect(kiosk.getByRole('button', { name: 'Sign in to register' })).toBeVisible();
          await shot(kiosk, '08-kiosk-ended');
        });
      } finally {
        await kioskContext.close();
      }
    });

    testInfo.annotations.push({
      type: 'not-rehearsed',
      description: 'Kiosk 2 and 4: a full second checkout on the kiosk, five idle minutes, and a hosted Stripe phone payment were not rehearsed. The rider receipt above used simulated payment in a separate phone-sized browser.',
    });
  } finally {
    await phone.close();
  }
});
