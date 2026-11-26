import { expect, test } from './fixtures';
import { seedRegistrationCase } from './support/registration-case';

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: shared headers reflow and keep account actions usable`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('cyclereg-theme', value), theme);
    const eventId = await seedRegistrationCase(page.request, 'criterium');
    const routes = ['/', '/#/my-registrations', '/#/register', `/#/register/${eventId}`];
    for (const [index, route] of routes.entries()) {
      await page.goto(route);
      await expect(page.getByRole('link', { name: 'My registrations', exact: true })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => document.fonts.ready);
      for (const width of [320, 360, 390, 720, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        for (const action of [
          page.getByRole('button', { name: /Switch to .* theme|Use system theme/ }),
          page.getByRole('link', { name: 'My registrations', exact: true }),
          page.getByRole('button', { name: 'Sign out', exact: true }),
        ]) {
          await expect(action).toBeInViewport();
          const box = (await action.boundingBox())!;
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(width);
        }
        if (width === 390 || width === 1440) {
          await page.locator('header').screenshot({ path: `test-results/header-${theme}-${index}-${width}.png` });
        }
      }
      // Compare the same DOM against the original declarations at desktop width.
      const geometry = () => ({
        pageHeight: document.documentElement.scrollHeight,
        headerHeight: document.querySelector('header')!.getBoundingClientRect().height,
        controls: [...document.querySelectorAll('header a, header button')].map((el) => {
          const { x, y, width, height } = el.getBoundingClientRect();
          return { x, y, width, height };
        }),
      });
      const fixed = await page.evaluate(geometry);
      const original = await page.addStyleTag({ content: '.home__bar,.reg__bar,.reg__bar-end{flex-wrap:nowrap}.reg__bar-note{flex:0 1 auto}.reg__bar-end{max-width:none}' });
      expect(await page.evaluate(geometry)).toEqual(fixed);
      await original.evaluate((el) => el.parentNode?.removeChild(el));
      await page.setViewportSize({ width: 320, height: 900 });
      await page.getByRole('button', { name: /Switch to .* theme|Use system theme/ }).focus();
      await page.keyboard.press('Tab');
      await expect(page.getByRole('link', { name: 'My registrations', exact: true })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeFocused();
    }
    await page.getByRole('link', { name: 'My registrations', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'My registrations', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Sign out', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Sign in to CycleReg', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
}

test.describe('touch header', () => {
  test.use({ hasTouch: true });

  test('coarse-pointer account actions meet the mobile target without overflow', async ({ page }) => {
    const eventId = await seedRegistrationCase(page.request, 'criterium');
    for (const route of ['/', '/#/my-registrations', '/#/register', `/#/register/${eventId}`]) {
      await page.goto(route);
      await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
      await expect(page.locator('header a.brand')).toHaveCount(route === '/' ? 0 : 1);
      for (const width of [320, 390, 768]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        for (const action of [
          page.getByRole('button', { name: /Switch to .* theme|Use system theme/ }),
          page.getByRole('link', { name: 'My registrations', exact: true }),
          page.getByRole('button', { name: 'Sign out', exact: true }),
          ...await page.locator('header a.brand').all(),
        ]) {
          const box = (await action.boundingBox())!;
          expect(box.height).toBeGreaterThanOrEqual(44);
          expect(box.width).toBeGreaterThanOrEqual(44);
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(width);
        }
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('header').screenshot({ path: 'test-results/header-touch-390.png' });
    await page.locator('header a.brand').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Choose an event' })).toBeVisible();
    await page.goto('/#/my-registrations');
    await page.locator('header a.brand').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Your organizations' })).toBeVisible();
  });
});
