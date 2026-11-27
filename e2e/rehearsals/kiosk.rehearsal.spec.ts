// Rehearsal: shared test kiosk. Runbook: docs/runbooks/walkup-registration.md (Run the shared test kiosk 1-4).
// The browser clock stands in for five real idle minutes. Fictional data only.
import { expect, test } from '../fixtures';
import { seedRegistrationCase } from '../support/registration-case';

test.use({ trace: 'on', screenshot: 'on' });

const minute = 60_000;

test('@rehearsal shared kiosk: two checkouts, the idle warning, and sign-out at five idle minutes', async ({ page, browser }, testInfo) => {
  test.setTimeout(180_000);
  const shot = (who: typeof page, name: string) => who.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
  const eventId = await seedRegistrationCase(page.request, 'criterium');
  // One fictional account per rider per event, so a rerun on the same database starts with no orders.
  const FIRST = `kiosk.first.${eventId}@example.test`;
  const SECOND = `kiosk.second.${eventId}@example.test`;
  let address = '';

  await test.step('Kiosk 1: copy the Test kiosk address from the walk-up panel to a dedicated browser', async () => {
    await page.goto(`/?staff-context=fictional#/events/${eventId}/check-in`);
    await page.getByRole('button', { name: 'Register a walk-up' }).click();
    address = await page.getByLabel('Test kiosk address').inputValue();
    expect(new URL(address).searchParams.get('kiosk')).toBe(eventId);
    await shot(page, '01-kiosk-address');
  });

  // A dedicated kiosk browser with no staff header; each rider signs in on the kiosk itself.
  const kioskContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, extraHTTPHeaders: {} });
  const personal = await browser.newContext({ extraHTTPHeaders: {} });
  let paymentSaved!: () => void;
  let releaseResponse!: () => void;
  const saved = new Promise<void>((resolve) => { paymentSaved = resolve; });
  const held = new Promise<void>((resolve) => { releaseResponse = resolve; });
  try {
    const kiosk = await kioskContext.newPage();
    await kiosk.clock.install({ time: new Date() });
    await kiosk.goto(address);
    const start = kiosk.getByRole('button', { name: 'Sign in to register' });
    const warning = kiosk.getByRole('dialog', { name: 'This kiosk session is about to end' });
    const race = kiosk.getByRole('checkbox', { name: /DVC-M45/ });
    const signIn = async (email: string) => {
      await start.click();
      await kiosk.getByLabel('Test email').fill(email);
      await kiosk.getByRole('button', { name: 'Sign in', exact: true }).click();
    };
    const toReview = async () => {
      await kiosk.getByRole('button', { name: 'Continue to racer details' }).click();
      await kiosk.getByRole('button', { name: 'Continue to the waiver' }).click();
      await kiosk.getByLabel('I have read the whole waiver').check();
      await kiosk.getByLabel(/Type your full name to sign/).fill('Alex Demo');
      await kiosk.getByLabel('I agree to this waiver', { exact: true }).check();
      await kiosk.getByRole('button', { name: 'Sign and review the order' }).click();
    };

    await test.step('Kiosk 2: the first rider uses their own account and completes checkout', async () => {
      await signIn(FIRST);
      await kiosk.getByLabel('Use a demo rider (fake data)').selectOption('rider-alex');
      await race.check();
      await toReview();
      await kiosk.getByRole('button', { name: /Complete simulated payment/ }).click();
      await expect(kiosk.getByRole('heading', { name: 'You’re entered' })).toBeVisible();
      await shot(kiosk, '02-first-receipt');
    });

    await test.step('Kiosk 3: End kiosk session returns to Sign in to register with no receipt', async () => {
      await kiosk.getByRole('button', { name: 'End kiosk session' }).click();
      await expect(start).toBeFocused();
      await expect(kiosk.getByRole('heading', { name: 'You’re entered' })).toHaveCount(0);
      expect(await kiosk.evaluate(() => Object.keys(sessionStorage))).toEqual([]);
      await shot(kiosk, '03-ended');
    });

    await test.step('Kiosk 3: the second rider sees the one-minute warning and chooses Keep working, then Escape', async () => {
      await signIn(SECOND);
      await expect(race).not.toBeChecked();
      await kiosk.getByLabel('Use a demo rider (fake data)').selectOption('rider-alex');
      await race.check();
      await kiosk.clock.fastForward(3.5 * minute);
      await expect(warning).toHaveCount(0);
      await kiosk.clock.fastForward(0.5 * minute + 1_000);
      await expect(warning).toBeVisible();
      await shot(kiosk, '04-warning');
      await warning.getByRole('button', { name: 'Keep working' }).click();
      await expect(warning).toHaveCount(0);
      await kiosk.clock.fastForward(4 * minute + 1_000);
      await expect(warning).toBeVisible();
      await kiosk.keyboard.press('Escape');
      await expect(warning).toHaveCount(0);
      await expect(race).toBeChecked();
    });

    await test.step('Kiosk 3-4: five idle minutes end the session while a saved payment response is still on its way', async () => {
      await toReview();
      await kiosk.route('**/api/orders/*/payment', async (route) => {
        const response = await route.fetch();
        paymentSaved();
        await held;
        await route.fulfill({ response });
      });
      // Pause the browser clock so server latency and the explicit advances below are the only time that counts.
      await kiosk.clock.pauseAt(await kiosk.evaluate(() => Date.now() + 100));
      const lateResponse = kiosk.waitForResponse('**/api/orders/*/payment');
      await kiosk.getByRole('button', { name: /Complete simulated payment/ }).click();
      await saved;
      await kiosk.clock.fastForward(4 * minute + 1_000);
      await expect(warning).toBeVisible();
      // Two seconds before the five-minute deadline the session is still open.
      await kiosk.clock.fastForward(minute - 3_000);
      await expect(warning).toBeVisible();
      await expect(start).toHaveCount(0);
      await kiosk.clock.fastForward(3_000);
      await expect(start).toBeFocused();
      await expect(kiosk.getByRole('status')).toContainText('My registrations on your own device');
      await expect(kiosk.getByRole('heading', { name: 'Review your order' })).toHaveCount(0);
      expect(await kiosk.evaluate(() => Object.keys(sessionStorage))).toEqual([]);
      await shot(kiosk, '05-idle-ended');
      releaseResponse();
      await lateResponse;
      await kiosk.unrouteAll({ behavior: 'wait' });
      await kiosk.clock.resume();
      // Let the app handle the late response and render before checking it did not bring the receipt back.
      await kiosk.evaluate(() => new Promise<void>((resolve) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())), 0)));
      await expect(start).toBeVisible();
      await expect(kiosk.getByRole('heading', { name: 'You’re entered' })).toHaveCount(0);
    });

    await test.step('Kiosk 4: the second rider finds the one saved order in My registrations on a personal browser', async () => {
      const own = await personal.newPage();
      await own.addInitScript((email) => sessionStorage.setItem('cyclereg.test-session', email), SECOND);
      await own.goto('/#/my-registrations');
      const registrations = own.getByRole('list', { name: 'Your registrations' });
      await expect(registrations.getByRole('listitem')).toHaveCount(1);
      await expect(registrations).toContainText('Confirmed');
      await shot(own, '06-my-registrations');
    });

    await test.step('Kiosk 3: the next session on the kiosk starts clean', async () => {
      await signIn(`kiosk.third.${eventId}@example.test`);
      await expect(race).not.toBeChecked();
      await expect(kiosk.getByRole('heading', { name: 'You’re entered' })).toHaveCount(0);
    });
  } finally {
    releaseResponse();
    await Promise.all([kioskContext.close(), personal.close()]);
  }

  testInfo.annotations.push({
    type: 'not-rehearsed',
    description: 'The browser clock stood in for five real idle minutes. A hosted kiosk, hosted sign-in and payment return, and staying with the device through handover were not rehearsed.',
  });
});
