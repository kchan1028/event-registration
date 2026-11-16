import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

for (const mode of ['light', 'dark']) {
  test(`TTT research is readable without registration on desktop and mobile (${mode})`, async ({ browser, request, baseURL }) => {
    const bbc = await (await request.post('/api/demo/bbc-team-time-trial')).json();
    const pinole = await (await request.post('/api/demo/pinole-team-time-trial')).json();
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await page.addInitScript((theme) => {
      localStorage.setItem('cyclereg-theme', theme);
      sessionStorage.removeItem('cyclereg.test-session');
    }, mode);
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.goto('/#/register');
      const item = page.locator('.event-pick li', { hasText: 'Pinole Team Time Trial' });
      await expect(item).toContainText('Research example');
      await expect(item).toContainText('Registration unavailable');
      await expect(item).not.toContainText('November 15');
      await item.getByRole('link').click();
      await expect(page.getByRole('heading', { name: 'Registration unavailable' })).toBeVisible();
      await expect(page.getByRole('heading', { name: /Pinole Team Time Trial/ })).toBeVisible();
      await expect(page.getByRole('textbox')).toHaveCount(0);
      await expect(page.getByRole('checkbox')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Continue|payment/i })).toHaveCount(0);
      await expect(page.locator('main')).toContainText('NOT an event date');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.screenshot({ path: test.info().outputPath(`ttt-research-${mode}-${viewport.width}.png`), fullPage: true });
      await page.getByRole('link', { name: 'Back to events' }).click();
      await expect(page.getByRole('heading', { name: 'Choose an event' })).toBeVisible();
      await page.goto(`/#/register/${bbc.eventIds[0]}`);
      await expect(page.getByRole('heading', { name: /Berkeley Bicycle Club Team Time Trial/ })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Registration unavailable' })).toBeVisible();
    }
    expect(pinole.eventIds).toHaveLength(1);
    await context.close();
  });
}
