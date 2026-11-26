import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

test('an uncertain invitation can be retried without promising extra days', async ({ page }) => {
  const { organizationId, eventId } = await (await page.request.post('/api/demo')).json();
  const expiresAt = '2027-06-01T12:00:00.000Z';
  const teamList = {
    asOf: '2027-05-01T12:00:00.000Z',
    members: [{ accountId: 'acct_owner', email: 'organizer@example.test', role: 'owner' }],
    invitations: [
      { email: 'timer@example.test', role: 'finance', expiresAt, revision: 'rev_lost', earlierEmail: false, suppressed: null, lastEmail: { attemptId: 'eml_lost', status: 'uncertain', at: '2027-05-01T12:00:00.000Z' } },
      { email: 'seeded@example.test', role: 'finance', expiresAt, revision: 'rev_seeded', earlierEmail: false, suppressed: 'bounced', lastEmail: null },
      { email: 'earlier@example.test', role: 'finance', expiresAt, revision: 'rev_earlier', earlierEmail: true, suppressed: 'bounced', lastEmail: null },
      { email: 'delivered@example.test', role: 'finance', expiresAt, revision: 'rev_delivered', earlierEmail: false, suppressed: null, lastEmail: { attemptId: 'eml_delivered', status: 'sent', at: '2027-05-01T12:00:00.000Z', delivery: 'delivered' } },
      { email: 'bounced@example.test', role: 'finance', expiresAt, revision: 'rev_bounced', earlierEmail: false, suppressed: 'bounced', lastEmail: { attemptId: 'eml_bounced', status: 'sent', at: '2027-05-01T12:00:00.000Z', delivery: 'bounced' } },
      { email: 'complained@example.test', role: 'finance', expiresAt, revision: 'rev_complained', earlierEmail: false, suppressed: 'complained', lastEmail: { attemptId: 'eml_complained', status: 'sent', at: '2027-05-01T12:00:00.000Z', delivery: 'complained' } },
      { email: 'ended@example.test', role: 'finance', expiresAt: '2020-01-01T00:00:00.000Z', revision: 'rev_ended', earlierEmail: false, suppressed: 'bounced', lastEmail: { attemptId: 'eml_ended', status: 'sent', at: '2020-01-01T00:00:00.000Z' } },
    ],
    stoppedEmails: [
      { email: 'seeded@example.test', reason: 'bounced' },
      { email: 'earlier@example.test', reason: 'bounced' },
      { email: 'bounced@example.test', reason: 'bounced' },
      { email: 'complained@example.test', reason: 'complained' },
      { email: 'ended@example.test', reason: 'bounced' },
    ],
    history: [],
  };
  await page.route(`**/api/organizations/${organizationId}/members`, (route) => route.fulfill({ json: teamList }));
  const safeSends: unknown[] = [];
  await page.route(`**/api/organizations/${organizationId}/invitations/send-without-extending`, async (route) => {
    safeSends.push(route.request().postDataJSON());
    await route.fulfill({ json: teamList });
  });
  for (const theme of ['light', 'dark']) {
    await page.clock.setFixedTime(new Date(theme === 'light' ? '2030-01-01T00:00:00Z' : '2019-01-01T00:00:00Z'));
    await page.goto('/');
    await page.evaluate((value) => localStorage.setItem('cyclereg-theme', value), theme);
    await page.reload();
    const organization = page.getByRole('article').filter({ has: page.locator(`a[href="#/events/${eventId}"]`) });
    await organization.getByRole('button', { name: 'Team and roles', exact: true }).click();
    const team = organization.getByRole('region', { name: /^Team and roles for / });
    await expect(team.getByText('Email might have been sent', { exact: true })).toBeVisible();
    await expect(team.getByText('Delivered', { exact: true })).toBeVisible();
    await expect(team.getByText('Bounced', { exact: true })).toBeVisible();
    await expect(team.getByText('Complaint received', { exact: true })).toBeVisible();
    await expect(team.getByText('Mail stopped')).toHaveCount(5);
    const seeded = team.getByRole('listitem').filter({ hasText: 'seeded@example.test' });
    await expect(seeded.getByText('Mail stopped', { exact: true })).toBeVisible();
    await expect(seeded.getByRole('button', { name: /Send without extending/ })).toBeVisible();
    const ended = team.getByRole('listitem').filter({ hasText: 'ended@example.test' });
    await expect(ended.getByText('Expired', { exact: true })).toBeVisible();
    await expect(ended.getByRole('button', { name: /Send without extending/ })).toHaveCount(0);
    await team.getByLabel('Email').fill('ended@example.test');
    await expect(team.getByRole('button', { name: 'Allow one new invitation to ended@example.test. This starts a new 14-day invitation.' })).toBeEnabled();
    const safe = team.getByRole('button', { name: 'Send without extending the invitation to bounced@example.test. This does not add days.' });
    await expect(safe).toBeVisible();
    await expect(team.getByRole('button', { name: 'Send without extending the invitation to complained@example.test. This does not add days.' })).toBeVisible();
    await expect(team.getByRole('button', { name: /Resend invitation to delivered@example.test/ })).toBeVisible();
    await expect(team.getByRole('button', { name: /Resend invitation to bounced@example.test/ })).toHaveCount(0);
    const retry = team.getByRole('button', { name: /Retry send/ });
    await expect(retry).toHaveAccessibleName('Retry send of the invitation email to timer@example.test without extending it');
    const earlier = team.getByRole('listitem').filter({ hasText: 'earlier@example.test' });
    await expect(earlier).toContainText('An earlier email might have been sent. To send a new one, cancel and invite again.');
    await expect(earlier).toContainText('Mail stopped');
    await expect(earlier.getByRole('button')).toHaveCount(1);
    await expect(team.getByRole('status')).toBeEmpty();
    const openUntil = team.locator('time').first();
    await expect(openUntil).toHaveAttribute('datetime', expiresAt);
    const beforeSafe = safeSends.length;
    await safe.click();
    expect(safeSends[beforeSafe]).toEqual({ email: 'bounced@example.test', role: 'finance', revision: 'rev_bounced' });
    await expect(openUntil).toHaveAttribute('datetime', expiresAt);
    await expect(team.getByRole('status')).toBeEmpty();
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

for (const trigger of ['deadline', 'visibility'] as const) {
  test(`Team refreshes an invitation after its ${trigger} changes`, async ({ page }) => {
    const { organizationId, eventId } = await (await page.request.post('/api/demo')).json();
    const openedAt = new Date('2027-05-01T12:00:00.000Z');
    const expiresAt = new Date(openedAt.getTime() + 60_000).toISOString();
    await page.clock.install({ time: openedAt });
    let asOf = openedAt.toISOString();
    const address = 'near.deadline@example.test';
    await page.route(`**/api/organizations/${organizationId}/members`, (route) => route.fulfill({ json: {
      asOf,
      members: [],
      invitations: [{ email: address, role: 'check_in_volunteer', expiresAt, revision: 'rev_deadline', earlierEmail: false, suppressed: 'bounced', lastEmail: null }],
      stoppedEmails: [{ email: address, reason: 'bounced' }],
      history: [],
    } }));

    await page.goto('/');
    const organization = page.getByRole('article').filter({ has: page.locator(`a[href="#/events/${eventId}"]`) });
    await organization.getByRole('button', { name: 'Team and roles', exact: true }).click();
    const team = organization.getByRole('region', { name: /^Team and roles for / });
    const send = team.getByRole('button', { name: /Send without extending/ });
    await team.getByLabel('Email').fill(address);
    await expect(send).toBeVisible();

    if (trigger === 'deadline') {
      await page.clock.fastForward(60_001);
    } else {
      asOf = expiresAt;
      // The server reaches the deadline while browser elapsed time is still before it.
      await page.evaluate(() => {
        let visibility = 'hidden';
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
        document.dispatchEvent(new Event('visibilitychange'));
        visibility = 'visible';
        document.dispatchEvent(new Event('visibilitychange'));
      });
    }

    await expect(team.getByText('Expired', { exact: true })).toBeVisible();
    await expect(send).toHaveCount(0);
    await expect(team.getByRole('button', { name: /Allow one new invitation/ })).toBeEnabled();
  });
}

for (const action of ['closing Team', 'cancelling the invitation'] as const) {
  test(`Team ignores a delayed visibility refresh after ${action}`, async ({ page }) => {
    const { organizationId, eventId } = await (await page.request.post('/api/demo')).json();
    const base = `/api/organizations/${organizationId}`;
    const asOf = '2027-05-01T12:00:00.000Z';
    const expiresAt = '2027-05-01T12:04:00.000Z';
    const invitation = { email: 'original@example.test', role: 'finance', expiresAt, revision: 'rev_original', earlierEmail: false, suppressed: null, lastEmail: null };
    const initial = { asOf, members: [], invitations: [invitation], stoppedEmails: [], history: [] };
    const newer = { ...initial, invitations: [] };
    const stale = { ...initial, invitations: [{ ...invitation, email: 'stale@example.test' }] };
    let reads = 0;
    let releaseRefresh: (() => void) | undefined;
    await page.route(`**${base}/members`, async (route) => {
      if (++reads === 1) return route.fulfill({ json: initial });
      await new Promise<void>((resolve) => { releaseRefresh = resolve; });
      await route.fulfill({ json: stale });
    });
    await page.route(`**${base}/invitations/cancel`, (route) => route.fulfill({ json: newer }));

    await page.clock.install({ time: new Date(asOf) });
    await page.goto('/');
    await page.evaluate(() => {
      const browser: Window = window;
      const set = browser.setTimeout;
      const clear = browser.clearTimeout;
      let deadlineTimer: number | undefined;
      browser.setTimeout = (...args) => {
        const id = set(...args);
        // The fixture's four-minute invitation is the only timer in this range.
        if (args[1] !== undefined && args[1] > 230_000 && args[1] <= 240_000) {
          deadlineTimer = id;
          document.documentElement.dataset.testDeadlineTimer = 'scheduled';
        }
        return id;
      };
      browser.clearTimeout = (id) => {
        if (deadlineTimer !== undefined && id === deadlineTimer) {
          document.documentElement.dataset.testDeadlineTimer = 'cancelled';
        }
        clear(id);
      };
    });

    const organization = page.getByRole('article').filter({ has: page.locator(`a[href="#/events/${eventId}"]`) });
    const openTeam = organization.getByRole('button', { name: 'Team and roles', exact: true });
    const team = organization.getByRole('region', { name: /^Team and roles for / });
    await openTeam.click();
    await expect(team.getByText(invitation.email, { exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-test-deadline-timer', 'scheduled');

    const changeVisibility = (state: DocumentVisibilityState) => page.evaluate((visibility) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: visibility });
      document.dispatchEvent(new Event('visibilitychange'));
    }, state);
    await changeVisibility('hidden');
    await page.clock.runFor(100);
    expect(reads).toBe(1);
    await changeVisibility('visible');
    await expect.poll(() => reads).toBe(2);

    try {
      if (action === 'closing Team') {
        await team.getByRole('button', { name: 'Close', exact: true }).click();
        await expect(team).toHaveCount(0);
        await expect(page.locator('html')).toHaveAttribute('data-test-deadline-timer', 'cancelled');
      } else {
        await team.getByRole('button', { name: `Cancel invitation for ${invitation.email}` }).click();
        await expect(team.getByText(invitation.email, { exact: true })).toHaveCount(0);
      }
    } finally {
      const received = page.waitForResponse((response) => response.url().endsWith(`${base}/members`));
      releaseRefresh?.();
      await (await received).finished();
    }
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

    if (action === 'closing Team') {
      await openTeam.click();
      await expect(team.getByText(invitation.email, { exact: true })).toBeVisible();
    }
    await expect(team.getByText('stale@example.test', { exact: true })).toHaveCount(0);
  });
}

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

  const renewed = (await (await page.request.get(members)).json()).invitations.find((i: { email: string }) => i.email === invited.email);
  expect((await page.request.post(`/api/organizations/${organizationId}/invitations/cancel`, { data: { ...invited, revision: renewed.revision } })).ok()).toBe(true);
  await resend.click();
  await expect(team.getByRole('alert')).toContainText('This invitation changed');
  await expect(team.getByText(invited.email, { exact: true }).and(team.locator('.team__email'))).toHaveCount(0);
  expect((await (await page.request.get(members)).json()).invitations.map((i: { email: string }) => i.email)).not.toContain(invited.email);
});

test('Cancel on an outdated screen keeps a role the invitation became, and Remove still works', async ({ page, browser }) => {
  const { organizationId, eventId } = await (await page.request.post('/api/demo')).json();
  const members = `/api/organizations/${organizationId}/members`;
  const invited = { email: 'cancel.stale@example.test', role: 'finance' };
  expect((await page.request.post(members, { data: invited })).ok()).toBe(true);
  await page.goto('/');
  const organization = page.getByRole('article').filter({ has: page.locator(`a[href="#/events/${eventId}"]`) });
  await organization.getByRole('button', { name: 'Team and roles', exact: true }).click();
  const team = organization.getByRole('region', { name: /^Team and roles for / });
  const cancel = team.getByRole('button', { name: `Cancel invitation for ${invited.email}` });
  await expect(cancel).toBeVisible();

  const recipient = await browser.newContext({ extraHTTPHeaders: { Authorization: `Bearer test:${invited.email}` } });
  try {
    expect((await recipient.request.get('/api/me')).ok()).toBe(true);
    await cancel.click();
    await expect(team.getByRole('alert')).toContainText('it was not canceled and no role was removed');
    await expect(cancel).toHaveCount(0);
    const revoke = team.getByRole('button', { name: new RegExp(`^Remove .* role from ${invited.email}$`) });
    await expect(revoke).toBeVisible();
    expect((await recipient.request.get(`/api/events/${eventId}/orders`)).status()).toBe(200);
    await revoke.click();
    await expect(revoke).toHaveCount(0);
    expect((await recipient.request.get(`/api/events/${eventId}/orders`)).status()).toBe(404);
  } finally {
    await recipient.close();
  }
});
