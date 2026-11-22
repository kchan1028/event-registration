import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

test('an uncertain invitation can be retried without promising extra days', async ({ page }) => {
  const { organizationId, eventId } = await (await page.request.post('/api/demo')).json();
  const expiresAt = '2027-06-01T12:00:00.000Z';
  await page.route(`**/api/organizations/${organizationId}/members`, (route) => route.fulfill({
    json: {
      members: [{ accountId: 'acct_owner', email: 'organizer@example.test', role: 'owner' }],
      invitations: [{ email: 'timer@example.test', role: 'finance', expiresAt, revision: 'rev_lost', earlierEmail: false, lastEmail: { attemptId: 'eml_lost', status: 'uncertain', at: '2027-05-01T12:00:00.000Z' } },
        { email: 'earlier@example.test', role: 'finance', expiresAt, revision: 'rev_earlier', earlierEmail: true, lastEmail: null }],
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
    await expect(team.getByText('Email might have been sent', { exact: true })).toBeVisible();
    const retry = team.getByRole('button', { name: /Retry send/ });
    await expect(retry).toHaveAccessibleName('Retry send of the invitation email to timer@example.test without extending it');
    const earlier = team.getByRole('listitem').filter({ hasText: 'earlier@example.test' });
    await expect(earlier).toContainText('An earlier email might have been sent. To send a new one, cancel and invite again.');
    await expect(earlier.getByRole('button')).toHaveCount(1);
    await expect(team.getByRole('status')).toBeEmpty();
    const openUntil = team.locator('time').first();
    await expect(openUntil).toHaveAttribute('datetime', expiresAt);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await expect(retry).toBeVisible();
      if (width === 390) expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    const posted = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/members'));
    const answered = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/members'));
    await retry.click();
    expect((await posted).postDataJSON()).toEqual({ email: 'timer@example.test', role: 'finance', retryAttempt: 'eml_lost' });
    await answered;
    await expect(team.getByRole('status')).toHaveText('timer@example.test: Email might have been sent.');
    await expect(openUntil).toHaveAttribute('datetime', expiresAt);
    expect((await new AxeBuilder({ page }).include('section.team').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  }
});

test('Resend names the invitation on screen and refreshes when it has changed', async ({ page }) => {
  const { organizationId, eventId } = await (await page.request.post('/api/demo')).json();
  const members = `/api/organizations/${organizationId}/members`;
  const invited = { email: 'resend.stale@example.test', role: 'finance' };
  expect((await page.request.post(members, { data: invited })).ok()).toBe(true);
  await page.goto('/');
  const organization = page.getByRole('article').filter({ has: page.locator(`a[href="#/events/${eventId}"]`) });
  await organization.getByRole('button', { name: 'Team and roles', exact: true }).click();
  const team = organization.getByRole('region', { name: /^Team and roles for / });
  const resend = team.getByRole('button', { name: /^Resend invitation to resend\.stale@example\.test/ });
  await expect(resend).toBeVisible();

  const { revision } = (await (await page.request.get(members)).json()).invitations.find((i: { email: string }) => i.email === invited.email);
  const sent = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/invitations/resend'));
  await resend.click();
  const response = await sent;
  expect(response.request().postDataJSON()).toEqual({ ...invited, revision });
  expect(response.status()).toBe(200);

  expect((await page.request.post(`${members}/remove`, { data: invited })).ok()).toBe(true);
  await resend.click();
  await expect(team.getByRole('alert')).toContainText('This invitation changed');
  await expect(team.getByText(invited.email, { exact: true }).and(team.locator('.team__email'))).toHaveCount(0);
  expect((await (await page.request.get(members)).json()).invitations.map((i: { email: string }) => i.email)).not.toContain(invited.email);
});
