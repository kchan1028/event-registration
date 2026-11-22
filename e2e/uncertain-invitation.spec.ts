import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

test('an uncertain invitation can be retried without promising extra days', async ({ page }) => {
  const { organizationId, eventId } = await (await page.request.post('/api/demo')).json();
  const expiresAt = '2027-06-01T12:00:00.000Z';
  await page.route(`**/api/organizations/${organizationId}/members`, (route) => route.fulfill({
    json: {
      members: [{ accountId: 'acct_owner', email: 'organizer@example.test', role: 'owner' }],
      invitations: [{ email: 'timer@example.test', role: 'finance', expiresAt, lastEmail: { attemptId: 'eml_lost', status: 'uncertain', at: '2027-05-01T12:00:00.000Z' } }],
      history: [],
    },
  }));
  for (const theme of ['light', 'dark']) {
    await page.goto('/');
    await page.evaluate((value) => localStorage.setItem('cyclereg-theme', value), theme);
    await page.reload();
    const organization = page.getByRole('article').filter({ has: page.locator(`a[href="#/events/${eventId}"]`) });
    await organization.getByRole('button', { name: 'Team and roles', exact: true }).click();
    const team = organization.getByRole('region', { name: /^Team and roles for / });
    await expect(team.getByText('Email might have been sent')).toBeVisible();
    const retry = team.getByRole('button', { name: /Retry send/ });
    await expect(retry).toHaveAccessibleName('Retry send of the invitation email to timer@example.test without extending it');
    const openUntil = team.locator('time');
    await expect(openUntil).toHaveAttribute('datetime', expiresAt);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await expect(retry).toBeVisible();
    }
    const posted = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/members'));
    const answered = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/members'));
    await retry.click();
    expect((await posted).postDataJSON()).toEqual({ email: 'timer@example.test', role: 'finance', retryAttempt: 'eml_lost' });
    await answered;
    await expect(openUntil).toHaveAttribute('datetime', expiresAt);
    expect((await new AxeBuilder({ page }).include('section.team').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  }
});
