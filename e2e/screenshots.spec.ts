import { expect, test } from '@playwright/test';

// Regenerates docs/screenshots from the demonstration event.
// Run with: SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts
test.skip(!process.env.SCREENSHOTS, 'Set SCREENSHOTS=1 to capture documentation screenshots.');

const out = (name: string) => `docs/screenshots/${name}.png`;

test('capture documentation screenshots', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Load demonstration event' }).click();
  await expect(page.getByRole('heading', { name: 'Saturday road race', level: 2 })).toBeVisible();
  const eventUrl = page.url();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Build a race schedule/ })).toBeVisible();
  await page.screenshot({ path: out('01-home') });

  await page.goto(eventUrl);
  await expect(page.locator('.cat-row').first()).toBeVisible();
  await page.screenshot({ path: out('02-category-schedule') });

  await page.setViewportSize({ width: 1440, height: 1300 });
  await page.screenshot({ path: out('03-field-board') });
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.locator('.cat-row', { hasText: 'Masters 35+ Cat 3/4' }).click();
  await expect(page.locator('.editor')).toBeVisible();
  await page.locator('.main').evaluate((el) => el.scrollTo(0, 0));
  await page.screenshot({ path: out('04-category-editor') });

  await page.getByRole('link', { name: 'Rider preview' }).click();
  await expect(page.locator('.preview')).toBeVisible();
  await page.getByLabel('Racing age', { exact: true }).fill('52');
  await page.getByLabel('License category').selectOption('3');
  await page.getByLabel('Competition class').selectOption('women');
  await expect(page.locator('.status--eligible').first()).toBeVisible();
  await page.locator('.checker').scrollIntoViewIfNeeded();
  await page.screenshot({ path: out('05-rider-preview') });

  await page.goto(eventUrl.replace(/#.*$/, '') + '#' + new URL(eventUrl).hash.slice(1).replace(/\/race\/.*$/, '') + '/publish');
  await expect(page.getByRole('heading', { name: 'Review and publish' })).toBeVisible();
  await page.screenshot({ path: out('06-review-and-publish') });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(eventUrl);
  await expect(page.locator('.cat-row').first()).toBeVisible();
  await page.screenshot({ path: out('07-mobile-schedule') });
  await page.locator('.cat-row', { hasText: 'Masters 60+' }).click();
  await expect(page.locator('.inspector.is-open')).toBeVisible();
  await page.screenshot({ path: out('08-mobile-editor') });
});

test('capture rider checkout screenshots', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open the rider demo' }).click();
  await expect(page.getByRole('heading', { name: 'Choose an event' })).toBeVisible();
  await page.screenshot({ path: out('09-register-choose-event') });

  await page.getByRole('link', { name: /Demo Valley Criterium/ }).click();
  const eventId = new URL(page.url()).hash.split('/')[2];
  await page.getByLabel('Use a demo rider (fake data)').selectOption('rider-alex');
  await page.getByRole('checkbox', { name: /DVC-M45/ }).click();
  await page.getByRole('checkbox', { name: /DVC-O45E/ }).click();
  await page.locator('.sched-day').first().evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.mouse.move(0, 0);
  await page.screenshot({ path: out('10-register-choose-races') });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.sched-day').first().evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: out('11-mobile-register') });
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.getByRole('button', { name: 'Continue to racer details' }).click();
  await page.getByLabel('First name (required)').fill('');
  await page.getByRole('button', { name: 'Continue to the waiver' }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: out('12-register-error-summary') });
  await page.getByLabel('First name (required)').fill('Alex');
  await page.getByRole('button', { name: 'Continue to the waiver' }).click();
  await page.getByLabel('I have read the whole waiver').check();
  await page.getByLabel(/Type your full name to sign/).fill('Alex Demo');
  await page.getByLabel(/agree to this waiver/).check();
  await page.locator('.waiver').scrollIntoViewIfNeeded();
  await page.screenshot({ path: out('13-register-waiver-signature') });
  await page.getByRole('button', { name: 'Sign and review the order' }).click();
  await expect(page.locator('.hold')).toBeVisible();
  await page.locator('.paybox').scrollIntoViewIfNeeded();
  await page.screenshot({ path: out('14-register-review-and-pay') });

  await page.getByRole('button', { name: /Complete simulated payment/ }).click();
  await expect(page.getByRole('heading', { name: 'You’re entered' })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1400 });
  await page.screenshot({ path: out('15-registration-confirmed') });
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto(`/#/events/${eventId}/registrations`);
  await expect(page.locator('.order').first()).toBeVisible();
  await page.screenshot({ path: out('16-organizer-registrations') });
});
