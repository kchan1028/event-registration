import type { Browser, Locator, Page, Route } from '@playwright/test';
import { expect, test } from './fixtures';
import { publishReviewed } from './support/publish';

const PHONE = '555-555-0199';

async function rolePage(browser: Browser, email: string, path: string) {
  const context = await browser.newContext({ extraHTTPHeaders: { Authorization: `Bearer test:${email}` } });
  await context.addInitScript((user) => sessionStorage.setItem('cyclereg.test-session', user), email);
  const page = await context.newPage();
  await page.goto(path);
  return { context, page };
}

async function showAndHide(scope: Page | Locator, riderName: string) {
  const show = scope.getByRole('button', { name: `Emergency contact for ${riderName}` }).first();
  await show.click();
  const contact = scope.getByRole('status').filter({ hasText: 'Emergency contact' }).filter({ hasText: PHONE });
  await expect(contact.first()).toBeVisible();
  await scope.getByRole('button', { name: `Hide emergency contact for ${riderName}` }).first().click();
  await expect(scope.getByText(PHONE)).toHaveCount(0);
}

test('staff look up an emergency contact from check-in and can hide it', async ({ page }) => {
  const api = page.request;
  const { eventId } = await (await api.post('/api/demo')).json();
  await publishReviewed(api, `/api/events/${eventId}`, { acknowledgeWarnings: true });
  await api.post(`/api/events/${eventId}/check-in-demo-riders`);
  const list = await (await api.get(`/api/events/${eventId}/check-in`)).json();
  const alex = list.riders.find((rider: { name: string }) => rider.name.startsWith('Alex'));
  expect(alex.checkInCode).toBeTruthy();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/#/events/${eventId}/check-in`);
  const search = page.getByRole('searchbox', { name: 'Find a rider' });
  await search.fill(alex.checkInCode);
  await search.press('Enter');
  const detail = page.getByRole('region', { name: 'Rider check-in' });
  await expect(detail).toContainText(alex.name);
  await expect(detail).not.toContainText(PHONE);
  await showAndHide(detail, alex.name);

  await page.setViewportSize({ width: 390, height: 844 });
  await showAndHide(detail, alex.name);

  await page.goto(`/#/events/${eventId}/roster`);
  await expect(page.getByRole('row', { name: /Alex Demo/ }).or(page.getByText('Alex Demo')).first()).toBeVisible();
  await expect(page.getByText(PHONE)).toHaveCount(0);
});

test('finance and timer staff use the same lookup on their own screens', async ({ page, browser }) => {
  const api = page.request;
  const { eventId, organizationId } = await (await api.post('/api/demo')).json();
  await publishReviewed(api, `/api/events/${eventId}`, { acknowledgeWarnings: true });
  await api.post(`/api/events/${eventId}/check-in-demo-riders`);
  const finance = 'finance.lookup@example.test';
  const timer = 'timer.lookup@example.test';
  expect((await api.post(`/api/organizations/${organizationId}/members`, { data: { email: finance, role: 'finance' } })).ok()).toBe(true);
  expect((await api.post(`/api/organizations/${organizationId}/members`, { data: { email: timer, role: 'timer_export' } })).ok()).toBe(true);

  const registered: { id: string; rider: { firstName: string } }[] = await (await api.get(`/api/events/${eventId}/orders`)).json();
  const blake = registered.find((order) => order.rider.firstName === 'Blake')!;
  const typed = 'Call the new contact on 555-555-0188';
  expect((await api.post(`/api/orders/${blake.id}/rider-corrections`, { data: { changes: { emergencyContactPhone: '555-555-0188' }, reason: typed } })).ok()).toBe(true);
  const financeSession = await rolePage(browser, finance, `/#/events/${eventId}/registrations`);
  try {
    await showAndHide(financeSession.page, 'Alex Demo');
    await expect(financeSession.page.getByText('Reason: hidden, because it can contain the emergency contact')).toBeVisible();
    await expect(financeSession.page.getByText(typed)).toHaveCount(0);
  } finally {
    await financeSession.context.close();
  }

  const lists = await (await api.get(`/api/events/${eventId}/start-lists`)).json();
  const race = lists.races.find((item: { rows: { firstName: string; lastName: string }[]; raceName: string }) =>
    item.rows.some((row) => row.firstName === 'Alex' && row.lastName === 'Demo'));
  const timerSession = await rolePage(browser, timer, `/#/events/${eventId}/startlists`);
  try {
    await timerSession.page.getByRole('radio', { name: race.raceName }).check();
    await showAndHide(timerSession.page, 'Alex Demo');
    const csv = await (await timerSession.page.request.get(`/api/events/${eventId}/start-lists/${race.raceId}/csv`)).text();
    expect(csv).not.toContain(PHONE);
  } finally {
    await timerSession.context.close();
  }
});

test('a late emergency-contact lookup does not take focus from check-in', async ({ page }) => {
  const api = page.request;
  const { eventId } = await (await api.post('/api/demo')).json();
  expect((await publishReviewed(api, `/api/events/${eventId}`, { acknowledgeWarnings: true })).ok()).toBe(true);
  expect((await api.post(`/api/events/${eventId}/check-in-demo-riders`)).ok()).toBe(true);
  expect((await api.put(`/api/events/${eventId}/bib-settings`, {
    data: { scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 199 }] },
  })).ok()).toBe(true);
  const list = await (await api.get(`/api/events/${eventId}/check-in`)).json();
  const rider = list.riders.find((candidate: { result: { ready: boolean }; bib: number | null; checkInCode?: string; name: string; orderId: string }) => (
    candidate.result.ready && candidate.bib === null && candidate.checkInCode
  ));
  if (!rider?.checkInCode) throw new Error('The fictional fixture needs a ready rider with a check-in code');

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/#/events/${eventId}/check-in`);
  const search = page.getByRole('searchbox', { name: 'Find a rider' });
  await search.fill(rider.checkInCode);
  await search.press('Enter');
  const detail = page.getByRole('region', { name: 'Rider check-in' });
  await expect(detail.getByRole('heading', { name: rider.name, exact: true })).toBeVisible();

  const show = detail.getByRole('button', { name: `Emergency contact for ${rider.name}` });
  const hide = detail.getByRole('button', { name: `Hide emergency contact for ${rider.name}` });
  await show.click();
  await expect(hide).toBeFocused();
  await hide.click();
  await expect(show).toBeVisible();

  let holdContact = false;
  let releaseContact: () => void = () => {};
  const contactHeld = new Promise<void>((resolve) => { releaseContact = resolve; });
  let contactWaiting = 0;
  await page.route(`**/api/events/${eventId}/emergency-contact`, async (route: Route) => {
    if (!holdContact || route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    contactWaiting += 1;
    await contactHeld;
    await route.fulfill({ response });
  });
  let releaseCheckIn: () => void = () => {};
  const checkInHeld = new Promise<void>((resolve) => { releaseCheckIn = resolve; });
  await page.route(`**/api/events/${eventId}/check-in/${rider.orderId}`, async (route: Route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    await checkInHeld;
    await route.fulfill({ response });
  });

  holdContact = true;
  await show.click();
  await expect.poll(() => contactWaiting).toBe(1);
  const issue = detail.getByRole('button', { name: 'Check in and issue next bib', exact: true });
  await issue.click();
  await expect(detail.getByRole('button', { name: 'Checking in…' })).toBeDisabled();

  releaseContact();
  await expect(hide).toBeVisible();
  await expect(hide).not.toBeFocused();
  await expect(detail.getByText(PHONE)).toBeVisible();

  releaseCheckIn();
  const nextRider = detail.getByRole('button', { name: 'Next rider', exact: true });
  await expect(nextRider).toBeFocused();
  await expect(detail.getByText(PHONE)).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(search).toBeFocused();
});

test('holding Enter on the emergency-contact lookup records one lookup', async ({ page }) => {
  const api = page.request;
  const { eventId } = await (await api.post('/api/demo')).json();
  await publishReviewed(api, `/api/events/${eventId}`, { acknowledgeWarnings: true });
  await api.post(`/api/events/${eventId}/check-in-demo-riders`);
  const list = await (await api.get(`/api/events/${eventId}/check-in`)).json();
  const alex = list.riders.find((rider: { name: string; checkInCode?: string }) => rider.name.startsWith('Alex'));
  expect(alex.checkInCode).toBeTruthy();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/#/events/${eventId}/check-in`);
  const search = page.getByRole('searchbox', { name: 'Find a rider' });
  await search.fill(alex.checkInCode);
  await search.press('Enter');
  const detail = page.getByRole('region', { name: 'Rider check-in' });
  await expect(detail).toContainText(alex.name);

  const show = detail.getByRole('button', { name: `Emergency contact for ${alex.name}` });
  const hide = detail.getByRole('button', { name: `Hide emergency contact for ${alex.name}` });
  await show.focus();
  let lookups = 0;
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (request.method() === 'POST' && url.pathname === `/api/events/${eventId}/emergency-contact`) lookups += 1;
  });

  await page.keyboard.down('Enter');
  await expect(hide).toBeFocused();
  // A second keydown while Enter is held represents keyboard auto-repeat.
  await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  await expect(hide).toBeFocused();
  await expect(detail.getByText(PHONE)).toBeVisible();
  expect(lookups).toBe(1);

  await page.keyboard.down('Enter');
  await expect(show).toBeFocused();
  await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  await expect(show).toBeFocused();
  await expect(detail.getByText(PHONE)).toHaveCount(0);
  expect(lookups).toBe(1);
});
