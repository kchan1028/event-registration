import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

test('an expired-invitation notice explains recovery and disappears after access is restored', async ({ page }) => {
  let expired = true;
  let failed = false;
  // API tests exercise real expiry and recipient isolation; this fixture checks presentation.
  await page.route('**/api/rider/expired-invitations', (route) => failed ? route.fulfill({ status: 503, json: { error: 'Fictional temporary failure' } }) : route.fulfill({ json: expired ? [{ id: 'mch_fake_expired', organizationName: 'Fictional Velo Club', role: 'finance', at: '2027-03-16T18:00:00.000Z' }] : [] }));
  for (const theme of ['light', 'dark']) {
    await page.goto('/');
    await page.evaluate((value) => localStorage.setItem('cyclereg-theme', value), theme);
    await page.reload();
    const notice = page.getByRole('region', { name: 'Invitation expired' });
    await expect(notice).toContainText('Fictional Velo Club · Finance');
    await expect(notice).toContainText("Ask the organization's owner to add your role again");
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await expect(notice).toBeVisible();
      await notice.screenshot({ path: `test-results/invitation-${theme}-${width}.png` });
    }
    expect((await new AxeBuilder({ page }).include('[aria-labelledby="expired-invitations-title"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  }
  expired = false;
  await page.reload();
  await expect(page.getByRole('region', { name: 'Invitation expired' })).toHaveCount(0);
  failed = true;
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Invitation status could not load');
  failed = false;
  await page.reload();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
