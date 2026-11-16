import { expect, test } from './fixtures';

for (const hasTouch of [false, true]) {
  test.describe(hasTouch ? 'coarse pointer' : 'fine pointer', () => {
    test.use({ hasTouch });

    test('check-in navigation targets remain usable by touch and keyboard', async ({ page }) => {
      const { eventId } = await (await page.request.post('/api/demo')).json();
      const event = await (await page.request.get(`/api/events/${eventId}`)).json();
      // Short but valid day labels must still provide a usable hit area.
      event.config.days.forEach((day: { label: string }, index: number) => { day.label = String(index + 1); });
      expect((await page.request.put(`/api/events/${eventId}/config`, { data: { config: event.config, revision: event.revision } })).status()).toBe(200);
      await page.request.post(`/api/events/${eventId}/publish`, { data: { acknowledgeWarnings: true } });
      await page.goto(`/#/events/${eventId}/check-in`);
      const builder = page.getByRole('link', { name: 'Builder', exact: true });
      const days = page.getByRole('radiogroup', { name: 'Race day' });
      await expect(days).toBeVisible();
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(hasTouch);

      for (const theme of ['light', 'dark']) {
        await page.evaluate((value) => localStorage.setItem('cyclereg-theme', value), theme);
        await page.reload();
        await expect(days).toBeVisible();
        for (const width of [320, 390, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          const targets = [builder, ...await days.locator('label').all()];
          const sizes = await Promise.all(targets.map(async (target) => ({ name: await target.innerText(), box: await target.boundingBox() })));
          for (const size of sizes) {
            expect(size.box, JSON.stringify(sizes)).not.toBeNull();
            expect(size.box!.height, JSON.stringify(sizes)).toBeGreaterThanOrEqual(44);
            expect(size.box!.width, JSON.stringify(sizes)).toBeGreaterThanOrEqual(44);
          }
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
          await builder.focus();
          await page.keyboard.press('Tab');
          await expect(days.getByRole('radio', { checked: true })).toBeFocused();
          await days.getByRole('radio').first().focus();
          await page.keyboard.press('ArrowRight');
          await expect(days.getByRole('radio').nth(1)).toBeChecked();
          await expect(days.getByRole('radio').nth(1)).toBeFocused();
          await page.keyboard.press('ArrowLeft');
          await expect(days.getByRole('radio').first()).toBeChecked();
          await expect(days.getByRole('radio').first()).toBeFocused();
          expect(await days.locator('label').first().evaluate((label) => getComputedStyle(label).outlineStyle)).not.toBe('none');
          if ((!hasTouch && theme === 'light' && width === 1440) || (hasTouch && theme === 'dark' && width === 390)) {
            await page.locator('.ci__bar').screenshot({ path: `test-results/checkin-navigation-${hasTouch ? 'phone-dark' : 'desktop-light'}.png` });
          }
        }
      }
      await builder.focus();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(new URL(`/#/events/${eventId}`, page.url()).href);
      await expect(page.locator('.cat-row').first()).toBeVisible();
    });
  });
}
