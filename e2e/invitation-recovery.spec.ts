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

test('a recipient can hide an expired-invitation notice, and a failed hide says so', async ({ page }) => {
  // API tests cover real expiry, recipient isolation and the saved dismissal; this fixture checks presentation.
  let notices = [
    { id: 'mch_fake_one', organizationName: 'Fictional Velo Club', role: 'finance', at: '2027-03-16T18:00:00.000Z' },
    { id: 'mch_fake_two', organizationName: 'Sample Wheelers', role: 'timer_export', at: '2027-03-15T18:00:00.000Z' },
  ];
  let failDismiss = false;
  let goneElsewhere = false;
  let releaseSlow: (() => void) | null = null;
  await page.route('**/api/rider/expired-invitations', (route) => route.fulfill({ json: notices }));
  await page.route('**/api/rider/expired-invitations/*/dismiss', async (route) => {
    if (failDismiss) return route.fulfill({ status: 503, json: { error: 'Fictional temporary failure' } });
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-2) ?? '');
    notices = notices.filter((notice) => notice.id !== id);
    // Hidden in another tab first: the list no longer has it and this request is refused.
    if (goneElsewhere) return route.fulfill({ status: 404, json: { error: 'That notice is not on your list.' } });
    if (releaseSlow === null) await new Promise<void>((resolve) => { releaseSlow = resolve; });
    return route.fulfill({ json: notices });
  });
  await page.goto('/');
  const notice = page.getByRole('region', { name: 'Invitation expired' });
  await expect(notice.getByRole('listitem')).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect((await new AxeBuilder({ page }).include('[aria-labelledby="expired-invitations-title"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);

  const first = notice.getByRole('button', { name: 'Hide the expired Fictional Velo Club Finance invitation' });
  const second = notice.getByRole('button', { name: /Hide the expired Sample Wheelers/ });
  failDismiss = true;
  await first.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toContainText('The notice could not be hidden');
  await expect(notice.getByRole('listitem')).toHaveCount(2);
  await expect(first).toBeFocused();

  failDismiss = false;
  await page.keyboard.press('Enter');
  // While the hide is slow, the user moves focus elsewhere; the finished hide must not pull it back.
  const elsewhere = page.getByRole('button', { name: /Switch to/ });
  await elsewhere.focus();
  releaseSlow!();
  await expect(notice.getByRole('listitem')).toHaveCount(1);
  await expect(elsewhere).toBeFocused();
  await expect(notice).toContainText('Sample Wheelers');
  await expect(page.getByRole('status').filter({ hasText: 'Hid the expired Fictional Velo Club Finance invitation.' })).toHaveCount(1);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await notice.screenshot({ path: 'test-results/invitation-hide-390.png' });

  goneElsewhere = true;
  await second.focus();
  await page.keyboard.press('Enter');
  // A 404 refreshes the list, so the stale notice disappears instead of failing on every retry.
  await expect(page.getByRole('region', { name: 'Invitation expired' })).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  // With no notices left, focus moves to the organizations heading instead of the page body.
  await expect(page.getByRole('heading', { name: 'Your organizations' })).toBeFocused();
});
