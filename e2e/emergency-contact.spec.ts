import type { Browser, Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';

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
  await api.post(`/api/events/${eventId}/publish`, { data: { acknowledgeWarnings: true } });
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
  await api.post(`/api/events/${eventId}/publish`, { data: { acknowledgeWarnings: true } });
  await api.post(`/api/events/${eventId}/check-in-demo-riders`);
  const finance = 'finance.lookup@example.test';
  const timer = 'timer.lookup@example.test';
  expect((await api.post(`/api/organizations/${organizationId}/members`, { data: { email: finance, role: 'finance' } })).ok()).toBe(true);
  expect((await api.post(`/api/organizations/${organizationId}/members`, { data: { email: timer, role: 'timer_export' } })).ok()).toBe(true);

  const financeSession = await rolePage(browser, finance, `/#/events/${eventId}/registrations`);
  try {
    await showAndHide(financeSession.page, 'Alex Demo');
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
