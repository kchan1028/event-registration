import type { Route } from '@playwright/test';
import { expect, test, type Page } from './fixtures';
import type { CheckInList, CheckInRider } from '../src/shared/checkin';
import { publishReviewed } from './support/publish';

async function selectRaceDay(page: Page, label: string) {
  const days = page.getByRole('radiogroup', { name: 'Race day' });
  await days.getByText(label, { exact: true }).click();
  await expect(days.getByRole('radio', { name: label, exact: true })).toBeChecked();
}

const connectionError = 'Cannot reach the CycleReg server. Check that it is running, then try again.';
const staleLookupName = 'Stale Lookup Body';

async function flushPaint(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

/** Records a ready card that appears after the saved card, even if a later paint covers it. */
async function watchForReadyCardReturn(page: Page) {
  await page.evaluate(() => {
    const w = window as Window & { __ciReadyReturned?: boolean };
    w.__ciReadyReturned = false;
    const returned = () => {
      const detail = document.querySelector('[aria-label="Rider check-in"]');
      if (!detail) return true;
      const text = detail.textContent ?? '';
      if (!text.includes('Checked in. Hand over the bib below.')) return true;
      if (!detail.querySelector('.ci-bib__number')) return true;
      return Array.from(detail.querySelectorAll('button')).some((button) => (button.textContent ?? '').includes('Check in and issue'));
    };
    const observer = new MutationObserver(() => {
      if (returned()) w.__ciReadyReturned = true;
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  });
}

async function readyCardReturned(page: Page) {
  return page.evaluate(() => (window as Window & { __ciReadyReturned?: boolean }).__ciReadyReturned === true);
}

/** Records whether text appears, including a paint that a later update removes. */
async function watchForText(page: Page, text: string) {
  await page.evaluate((needle) => {
    const w = window as Window & { __ciSawText?: boolean };
    w.__ciSawText = (document.body.textContent ?? '').includes(needle);
    const observer = new MutationObserver(() => {
      if ((document.body.textContent ?? '').includes(needle)) w.__ciSawText = true;
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }, text);
}

async function sawWatchedText(page: Page) {
  return page.evaluate(() => (window as Window & { __ciSawText?: boolean }).__ciSawText === true);
}

async function watchAlertCount(page: Page, text: string) {
  await page.evaluate((needle) => {
    const w = window as Window & { __ciMaxAlerts?: number };
    const count = () => Array.from(document.querySelectorAll('[role="alert"]')).filter((el) => (el.textContent ?? '').includes(needle)).length;
    w.__ciMaxAlerts = count();
    const observer = new MutationObserver(() => {
      w.__ciMaxAlerts = Math.max(w.__ciMaxAlerts ?? 0, count());
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }, text);
}

async function maxAlertCount(page: Page) {
  return page.evaluate(() => (window as Window & { __ciMaxAlerts?: number }).__ciMaxAlerts ?? 0);
}

function withStaleName(body: CheckInList): CheckInList {
  return { ...body, riders: body.riders.map((rider) => ({ ...rider, name: staleLookupName })) };
}

const scenarios = [
  ...['unreceived request', 'lost response', 'gateway timeout', 'unreadable response', 'invalid response']
    .map((failure) => ({ failure, reload: false })),
  { failure: 'unreceived request', reload: true },
  { failure: 'lost response', reload: true },
];

for (const mobile of [false, true]) {
  for (const { failure, reload } of scenarios) {
    const committed = failure !== 'unreceived request';
    test(`check-in recovery (${failure}, ${mobile ? 'phone' : 'desktop'}${reload ? ', after full reload' : ''})`, async ({ page, browser }) => {
      const { eventId, organizationId } = await (await page.request.post('/api/demo')).json();
      expect((await publishReviewed(page.request, `/api/events/${eventId}`, { acknowledgeWarnings: true })).ok()).toBe(true);
      expect((await page.request.post(`/api/events/${eventId}/check-in-demo-riders`)).ok()).toBe(true);
      expect((await page.request.put(`/api/events/${eventId}/bib-settings`, { data: { scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 199 }] } })).ok()).toBe(true);
      const email = 'recovery.volunteer@example.test';
      expect((await page.request.post(`/api/organizations/${organizationId}/members`, { data: { email, role: 'check_in_volunteer' } })).ok()).toBe(true);
      const context = await browser.newContext({
        extraHTTPHeaders: { Authorization: `Bearer test:${email}` },
        viewport: { width: mobile ? 390 : 1440, height: 900 },
      });
      try {
        await context.addInitScript((user) => sessionStorage.setItem('cyclereg.test-session', user), email);
        const volunteer = await context.newPage();
        const listUrl = `/api/events/${eventId}/check-in`;
        const readList = async (day?: string): Promise<CheckInList> => (
          await (await volunteer.request.get(listUrl, { params: day ? { day } : {} })).json()
        );
        const initial = await readList();
        const sunday = initial.days.find((day) => day.label === 'Sunday');
        if (reload && !sunday) throw new Error('The reload rehearsal needs a second race day');
        const list = reload ? await readList(sunday?.id) : initial;
        expect(list.roles).toEqual(['check_in_volunteer']);
        const [rider, next] = list.riders.filter((r) => r.result.ready && r.bib === null);
        if (!rider?.checkInCode) throw new Error('The fictional fixture needs a ready, unassigned rider with a check-in code');
        await volunteer.goto(`/#/events/${eventId}/check-in`);
        if (reload) await selectRaceDay(volunteer, 'Sunday');
        const search = volunteer.getByRole('searchbox', { name: 'Find a rider' });
        const detail = volunteer.getByRole('region', { name: 'Rider check-in' });
        await search.fill(rider.checkInCode);
        await search.press('Enter');
        await expect(detail).toContainText('Ready to race');

        const url = `**/api/events/${eventId}/check-in/${rider.orderId}`;
        let interrupted = 0;
        await volunteer.route(url, async (route) => {
          interrupted++;
          if (committed) expect((await route.fetch()).status()).toBe(200);
          if (failure === 'gateway timeout') await route.fulfill({ status: 504 });
          else if (failure === 'unreadable response') await route.fulfill({ status: 200, body: '' });
          else if (failure === 'invalid response') await route.fulfill({ status: 200, json: {} });
          else await route.abort('connectionfailed');
        });
        await detail.getByRole('button', { name: 'Check in and issue next bib', exact: true }).click();
        await expect(detail.getByRole('alert')).toHaveText('Check-in could not be confirmed.');
        await expect(detail.getByRole('status')).toContainText('Search for this rider’s check-in code or narrow the search to one match before handing over a bib or retrying check-in.');
        await expect(detail.getByRole('button', { name: /Check in and issue/ })).toHaveCount(0);
        await expect(detail.locator('.ci-bib__number')).toHaveCount(0);
        expect(interrupted).toBe(1);
        await volunteer.unroute(url);

        const afterFailure = await readList(list.dayId);
        const recorded = afterFailure.riders.find((r) => r.orderId === rider.orderId)!;
        expect(recorded.bib).toBe(committed ? 100 : null);
        expect(recorded.checkedInAt !== null).toBe(committed);
        expect(recorded.bibHistory).toHaveLength(committed ? 1 : 0);
        expect(recorded.payment).toBe(rider.payment);
        expect(recorded.entries).toEqual(rider.entries);
        expect(recorded.result).toEqual(rider.result);
        expect(recorded.readiness).toEqual(rider.readiness);

        if (reload) {
          let requestsAfterReload = 0;
          volunteer.on('request', (request) => {
            if (request.method() === 'POST' && new URL(request.url()).pathname === `${listUrl}/${rider.orderId}`) {
              requestsAfterReload++;
            }
          });
          await volunteer.reload();
          await expect(search).toHaveValue('');
          await expect(detail).toContainText('Search for a rider or scan their check-in code.');
          await expect(detail.getByRole('alert')).toHaveCount(0);
          const days = volunteer.getByRole('radiogroup', { name: 'Race day' });
          await expect(days.getByRole('radio', { name: 'Saturday', exact: true })).toBeChecked();
          await selectRaceDay(volunteer, 'Sunday');
          await search.fill(rider.checkInCode);
          await search.press('Enter');
          await expect(detail.getByRole('heading', { name: rider.name })).toBeVisible();
          expect(requestsAfterReload).toBe(0);

          if (!committed) {
            await expect(detail.locator('.ci-bib__number')).toHaveCount(0);
            await detail.getByRole('button', { name: 'Check in and issue next bib', exact: true }).click();
          }
          await expect(detail.locator('.ci-bib__number')).toHaveText('100');
          await expect(detail.getByRole('status')).toContainText('Checked in. Hand over the bib below.');
          await expect(detail.getByRole('button', { name: /Check in and issue/ })).toHaveCount(0);
          const recovered = (await readList(list.dayId)).riders.find((candidate) => candidate.orderId === rider.orderId);
          expect(recovered).toMatchObject({
            bib: 100,
            checkedInAt: committed ? recorded.checkedInAt : expect.any(String),
            payment: rider.payment,
            entries: rider.entries,
            readiness: rider.readiness,
          });
          expect(recovered?.bibHistory).toHaveLength(1);
          if (!recovered?.checkedInAt) throw new Error('The recovered check-in has no recorded time');
          const time = await volunteer.evaluate((recordedAt) => (
            new Date(recordedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
          ), recovered.checkedInAt);
          await expect(detail).toContainText(`Checked in at ${time}.`);
          expect(requestsAfterReload).toBe(committed ? 0 : 1);
          return;
        }

        if (!next?.checkInCode) throw new Error('Same-page recovery needs a second ready rider with a check-in code');

        // A failed fresh lookup cannot resolve the pending result.
        const lookupUrl = (url: URL) => url.pathname === `/api/events/${eventId}/check-in`;
        await volunteer.route(lookupUrl, (route) => route.abort('connectionfailed'));
        await search.press('Enter');
        await expect(volunteer.getByText(/Cannot reach the CycleReg server/)).toBeVisible();
        await expect(detail.getByRole('alert')).toHaveText('Check-in could not be confirmed.');
        await volunteer.unroute(lookupUrl);

        if (failure === 'lost response' && !mobile) {
          await selectRaceDay(volunteer, 'Sunday');
          await search.press('Enter');
          await expect(detail.getByRole('heading', { name: rider.name })).toBeVisible();
          await expect(detail.getByRole('status')).not.toContainText('Lookup confirmed');
          await selectRaceDay(volunteer, 'Saturday');
        }

        // Neither another rider's lookup nor a background results refresh resolves this rider's warning.
        await search.fill(next.checkInCode);
        await search.press('Enter');
        await expect(detail.getByRole('heading', { name: next.name })).toBeVisible();
        await expect(detail.getByRole('alert')).toHaveCount(0);
        await search.fill(rider.checkInCode);
        const row = volunteer.getByRole('complementary', { name: 'Find a rider' })
          .getByRole('button', { name: new RegExp(rider.name) });
        await expect(row).toContainText('Verify check-in');
        await row.click();
        await expect(detail).toBeFocused();
        await expect(detail.getByRole('alert')).toHaveText('Check-in could not be confirmed.');
        await expect(detail.locator('.ci-bib__number')).toHaveCount(0);

        // Hold the debounced search and let the explicit lookup return first.
        const delayed: Route[] = [];
        const riderNameLookup = (url: URL) => lookupUrl(url) && url.searchParams.get('q') === rider.name;
        if (failure === 'lost response') {
          await volunteer.route(riderNameLookup, async (route) => {
            if (delayed.length === 0) delayed.push(route);
            else await route.continue();
          });
          await search.fill(rider.name);
          await expect.poll(() => delayed.length).toBe(1);
        }

        // Follow the desk guide: look up the existing rider before another action.
        await search.press('Enter');
        await expect(detail.getByRole('status')).toContainText(committed
          ? 'Lookup confirmed check-in with bib 100.'
          : 'Lookup confirmed check-in was not recorded.');
        await expect(detail.getByRole('alert')).toHaveCount(0);
        if (delayed.length > 0) {
          const delivered = volunteer.waitForResponse((response) => riderNameLookup(new URL(response.url())));
          await delayed[0].fulfill({ json: { ...list, riders: [rider] } });
          expect(await (await delivered).finished()).toBeNull();
          // Let the browser deliver the stale body and flush any queued render.
          await volunteer.evaluate(() => new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          }));
          await expect(detail.getByRole('status')).toContainText('Lookup confirmed check-in with bib 100.');
          await volunteer.unroute(riderNameLookup);
        }
        if (!committed) {
          await expect(detail.locator('.ci-bib__number')).toHaveCount(0);
          await detail.getByRole('button', { name: 'Check in and issue next bib', exact: true }).click();
          await expect(detail.getByRole('status')).not.toContainText('Lookup confirmed');
        }
        await expect(detail.getByRole('status')).toContainText('Checked in. Hand over the bib below.');
        await expect(detail.locator('.ci-bib__number')).toHaveText('100');
        await expect(detail.getByRole('button', { name: /Check in and issue/ })).toHaveCount(0);

        const repeated = await volunteer.request.post(`/api/events/${eventId}/check-in/${rider.orderId}`, { data: { dayId: list.dayId, bib: null } });
        expect(repeated.status()).toBe(200);
        const again: CheckInRider = await repeated.json();
        expect(again.bib).toBe(100);
        expect(again.bibHistory).toHaveLength(1);
        if (committed) expect(again.checkedInAt).toBe(recorded.checkedInAt);

        await detail.getByRole('button', { name: 'Next rider', exact: true }).click();
        await search.fill(next.checkInCode);
        await search.press('Enter');
        await detail.getByRole('button', { name: 'Check in and issue next bib', exact: true }).click();
        await expect(detail.locator('.ci-bib__number')).toHaveText('101');
        const final: CheckInList = await (await volunteer.request.get(`/api/events/${eventId}/check-in`)).json();
        expect(final.riders.find((r) => r.orderId === next.orderId)).toMatchObject({ bib: 101 });
        expect(final.riders.filter((r) => r.bib === 100).map((r) => r.orderId)).toEqual([rider.orderId]);
        expect(final.riders.filter((r) => r.bib === 101).map((r) => r.orderId)).toEqual([next.orderId]);
      } finally { await context.close(); }
    });
  }
}

test('a list read started before check-in does not restore the ready card', async ({ page }) => {
  const { eventId } = await (await page.request.post('/api/demo')).json();
  expect((await publishReviewed(page.request, `/api/events/${eventId}`, { acknowledgeWarnings: true })).ok()).toBe(true);
  expect((await page.request.post(`/api/events/${eventId}/check-in-demo-riders`)).ok()).toBe(true);
  expect((await page.request.put(`/api/events/${eventId}/bib-settings`, { data: { scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 199 }] } })).ok()).toBe(true);
  const list: CheckInList = await (await page.request.get(`/api/events/${eventId}/check-in`)).json();
  const rider = list.riders.find((candidate) => candidate.result.ready && candidate.bib === null && candidate.checkInCode);
  if (!rider?.checkInCode) throw new Error('The fictional fixture needs a ready, unassigned rider with a check-in code');

  const openedAt = new Date('2026-06-01T12:00:00Z');
  await page.clock.install({ time: openedAt });
  await page.goto(`/#/events/${eventId}/check-in`);
  const search = page.getByRole('searchbox', { name: 'Find a rider' });
  const detail = page.getByRole('region', { name: 'Rider check-in' });
  await expect(search).toBeVisible();
  await expect(page.locator('.ci__count')).toContainText('riders on');
  // pauseAt freezes the debounce so a slow Enter cannot start that read first.
  await page.clock.pauseAt(new Date(openedAt.getTime() + 2_000));
  const held: { route: Route; response: Awaited<ReturnType<Route['fetch']>> }[] = [];
  let codeGets = 0;
  await page.route(`**/api/events/${eventId}/check-in?*`, async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== 'GET' || url.searchParams.get('q') !== rider.checkInCode) {
      await route.continue();
      return;
    }
    codeGets += 1;
    if (codeGets === 1) {
      await route.continue();
      return;
    }
    held.push({ route, response: await route.fetch() });
  });

  await search.fill(rider.checkInCode);
  await search.press('Enter');
  await expect(detail.getByRole('status')).toContainText('Ready to race');
  await page.clock.runFor(150);
  await expect.poll(() => held.length).toBe(1);
  await page.clock.resume();

  await detail.getByRole('button', { name: 'Check in and issue next bib', exact: true }).click();
  await expect.poll(() => held.length).toBe(2);
  await held[1].route.fulfill({ response: held[1].response });
  await expect(detail.getByRole('status')).toContainText('Checked in. Hand over the bib below.');
  await expect(detail.locator('.ci-bib__number')).toHaveText('100');
  await watchForReadyCardReturn(page);

  const staleListRead = held[0].route.request();
  const deliveredList = page.waitForResponse((response) => response.request() === staleListRead);
  await held[0].route.fulfill({ response: held[0].response });
  expect(await (await deliveredList).finished()).toBeNull();
  await flushPaint(page);
  expect(await readyCardReturned(page)).toBe(false);
  await expect(detail.getByRole('status')).toContainText('Checked in. Hand over the bib below.');
  await expect(detail.locator('.ci-bib__number')).toHaveText('100');
  await expect(detail.getByRole('button', { name: /Check in and issue/ })).toHaveCount(0);
});

test('saving bib ranges refreshes the search on screen', async ({ page }) => {
  const { eventId } = await (await page.request.post('/api/demo')).json();
  expect((await publishReviewed(page.request, `/api/events/${eventId}`, { acknowledgeWarnings: true })).ok()).toBe(true);
  expect((await page.request.post(`/api/events/${eventId}/check-in-demo-riders`)).ok()).toBe(true);
  const list: CheckInList = await (await page.request.get(`/api/events/${eventId}/check-in`)).json();
  const rider = list.riders.find((candidate) => candidate.checkInCode);
  if (!rider?.checkInCode) throw new Error('The fictional fixture needs a rider with a check-in code');

  await page.goto(`/#/events/${eventId}/check-in`);
  await page.getByRole('button', { name: 'Bib ranges', exact: true }).click();
  const ranges = page.getByRole('form', { name: 'Bib ranges', exact: true });
  await ranges.getByRole('textbox', { name: 'First', exact: true }).fill('100');
  await ranges.getByRole('textbox', { name: 'Last', exact: true }).fill('199');

  let releaseSave: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => { releaseSave = resolve; });
  let saveStarted = false;
  await page.route(`**/api/events/${eventId}/bib-settings`, async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    saveStarted = true;
    await gate;
    await route.fulfill({ response });
  });
  await ranges.getByRole('button', { name: 'Save bib ranges', exact: true }).click();
  await expect.poll(() => saveStarted).toBe(true);

  let codeReplies = 0;
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (response.request().method() === 'GET' && url.pathname === `/api/events/${eventId}/check-in` && url.searchParams.get('q') === rider.checkInCode) {
      codeReplies += 1;
    }
  });
  const search = page.getByRole('searchbox', { name: 'Find a rider' });
  const detail = page.getByRole('region', { name: 'Rider check-in' });
  await search.fill(rider.checkInCode);
  await search.press('Enter');
  await expect(detail.getByRole('heading', { name: rider.name, exact: true })).toBeVisible();
  await expect.poll(() => codeReplies).toBeGreaterThanOrEqual(2);

  const refresh = page.waitForResponse((response) => (
    response.request().method() === 'GET' && new URL(response.url()).pathname === `/api/events/${eventId}/check-in`
  ));
  releaseSave?.();
  expect(new URL((await refresh).url()).searchParams.get('q')).toBe(rider.checkInCode);
  await expect(detail.getByRole('heading', { name: rider.name, exact: true })).toBeVisible();
});

test('a failed search does not count the previous riders as matches', async ({ page }) => {
  const { eventId } = await (await page.request.post('/api/demo')).json();
  expect((await publishReviewed(page.request, `/api/events/${eventId}`, { acknowledgeWarnings: true })).ok()).toBe(true);
  expect((await page.request.post(`/api/events/${eventId}/check-in-demo-riders`)).ok()).toBe(true);
  await page.goto(`/#/events/${eventId}/check-in`);
  const search = page.getByRole('searchbox', { name: 'Find a rider' });
  await expect(search).toBeVisible();
  const count = page.locator('.ci__count');
  await expect(count).toContainText('riders on');
  await page.route(`**/api/events/${eventId}/check-in?*`, (route) => route.abort());
  await search.fill('x'.repeat(81));
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(count).not.toContainText('matches');
});

test('an explicit lookup started before check-in does not restore the ready card', async ({ page }) => {
  const { eventId } = await (await page.request.post('/api/demo')).json();
  expect((await publishReviewed(page.request, `/api/events/${eventId}`, { acknowledgeWarnings: true })).ok()).toBe(true);
  expect((await page.request.post(`/api/events/${eventId}/check-in-demo-riders`)).ok()).toBe(true);
  expect((await page.request.put(`/api/events/${eventId}/bib-settings`, { data: { scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 199 }] } })).ok()).toBe(true);
  const list: CheckInList = await (await page.request.get(`/api/events/${eventId}/check-in`)).json();
  const rider = list.riders.find((candidate) => candidate.result.ready && candidate.bib === null && candidate.checkInCode);
  if (!rider?.checkInCode) throw new Error('The fictional fixture needs a ready, unassigned rider with a check-in code');

  const openedAt = new Date('2026-06-01T12:00:00Z');
  await page.clock.install({ time: openedAt });
  await page.goto(`/#/events/${eventId}/check-in`);
  const search = page.getByRole('searchbox', { name: 'Find a rider' });
  const detail = page.getByRole('region', { name: 'Rider check-in' });
  await expect(page.locator('.ci__count')).toContainText('riders on');
  await page.clock.pauseAt(new Date(openedAt.getTime() + 2_000));
  await page.getByRole('button', { name: rider.name }).click();
  await expect(detail.getByRole('status')).toContainText('Ready to race');

  const held: { route: Route; response: Awaited<ReturnType<Route['fetch']>> }[] = [];
  let finishedCodeReads = 0;
  page.on('response', (response) => {
    if (!response.ok() || response.request().method() !== 'GET') return;
    const url = new URL(response.url());
    if (url.pathname === `/api/events/${eventId}/check-in` && url.searchParams.get('q') === rider.checkInCode) finishedCodeReads += 1;
  });
  await page.route(`**/api/events/${eventId}/check-in?*`, async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== 'GET' || url.searchParams.get('q') !== rider.checkInCode || held.length > 0) {
      await route.continue();
      return;
    }
    held.push({ route, response: await route.fetch() });
  });

  await search.fill(rider.checkInCode);
  await search.press('Enter');
  await expect.poll(() => held.length).toBe(1);
  const readsBeforeSave = finishedCodeReads;
  await page.clock.resume();

  await detail.getByRole('button', { name: 'Check in and issue next bib', exact: true }).click();
  await expect(detail.getByRole('status')).toContainText('Checked in. Hand over the bib below.');
  await expect(detail.locator('.ci-bib__number')).toHaveText('100');
  // The debounced search and the check-in refresh both have to finish before the older lookup is delivered.
  await expect.poll(() => finishedCodeReads).toBeGreaterThanOrEqual(readsBeforeSave + 2);
  await watchForReadyCardReturn(page);

  const staleLookup = held[0].route.request();
  const deliveredLookup = page.waitForResponse((response) => response.request() === staleLookup);
  await held[0].route.fulfill({ response: held[0].response });
  expect(await (await deliveredLookup).finished()).toBeNull();
  await flushPaint(page);
  expect(await readyCardReturned(page)).toBe(false);
  await expect(detail.getByRole('status')).toContainText('Checked in. Hand over the bib below.');
  await expect(detail.locator('.ci-bib__number')).toHaveText('100');
  await expect(detail.getByRole('button', { name: /Check in and issue/ })).toHaveCount(0);
});

test('a lookup started during check-in still opens that rider after the save', async ({ page }) => {
  const { eventId } = await (await page.request.post('/api/demo')).json();
  expect((await publishReviewed(page.request, `/api/events/${eventId}`, { acknowledgeWarnings: true })).ok()).toBe(true);
  expect((await page.request.post(`/api/events/${eventId}/check-in-demo-riders`)).ok()).toBe(true);
  expect((await page.request.put(`/api/events/${eventId}/bib-settings`, { data: { scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 199 }] } })).ok()).toBe(true);
  const list: CheckInList = await (await page.request.get(`/api/events/${eventId}/check-in`)).json();
  const ready = list.riders.find((candidate) => candidate.result.ready && candidate.bib === null && candidate.checkInCode);
  const other = list.riders.find((candidate) => candidate.checkInCode && candidate.checkInCode !== ready?.checkInCode);
  if (!ready?.checkInCode || !other?.checkInCode) throw new Error('The fictional fixture needs two riders with check-in codes');

  const openedAt = new Date('2026-06-01T12:00:00Z');
  await page.clock.install({ time: openedAt });
  await page.goto(`/#/events/${eventId}/check-in`);
  const search = page.getByRole('searchbox', { name: 'Find a rider' });
  const detail = page.getByRole('region', { name: 'Rider check-in' });
  await expect(page.locator('.ci__count')).toContainText('riders on');
  await page.clock.pauseAt(new Date(openedAt.getTime() + 2_000));
  await page.getByRole('button', { name: ready.name }).click();
  await expect(detail.getByRole('status')).toContainText('Ready to race');

  let releaseSave: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => { releaseSave = resolve; });
  let saveHeld = false;
  await page.route(`**/api/events/${eventId}/check-in/${ready.orderId}`, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    saveHeld = true;
    await gate;
    await route.fulfill({ response });
  });
  await detail.getByRole('button', { name: 'Check in and issue next bib', exact: true }).click();
  await expect.poll(() => saveHeld).toBe(true);

  const queued: { route: Route; response: Awaited<ReturnType<Route['fetch']>> }[] = [];
  let allowNew = false;
  let readsAfterDelivery = 0;
  await page.route(`**/api/events/${eventId}/check-in?*`, async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== 'GET' || url.searchParams.get('q') !== other.checkInCode) {
      await route.continue();
      return;
    }
    if (!allowNew) {
      queued.push({ route, response: await route.fetch() });
      return;
    }
    readsAfterDelivery += 1;
    await route.continue();
  });
  await search.fill(other.checkInCode);
  await search.press('Enter');
  await expect.poll(() => queued.length).toBeGreaterThanOrEqual(1);
  const explicit = queued[0];
  // The debounced search and the save's refresh stay held so neither can cover the lookup.
  await page.clock.runFor(150);
  await expect.poll(() => queued.length).toBeGreaterThanOrEqual(2);
  await page.clock.resume();
  releaseSave?.();
  await expect(detail.getByRole('status')).toContainText('Checked in. Hand over the bib below.');
  await expect(detail.locator('.ci-bib__number')).toHaveText('100');
  await expect.poll(() => queued.length).toBeGreaterThanOrEqual(3);
  const heldBody = await explicit.response.json() as CheckInList;
  if (heldBody.riders.length !== 1) throw new Error('The held lookup should match one rider');
  await watchForText(page, staleLookupName);
  allowNew = true;
  await explicit.route.fulfill({
    status: explicit.response.status(),
    contentType: 'application/json',
    body: JSON.stringify(withStaleName(heldBody)),
  });
  await expect.poll(() => readsAfterDelivery).toBeGreaterThanOrEqual(1);
  await flushPaint(page);
  await expect(detail.getByRole('heading', { name: other.name, exact: true })).toBeVisible();
  expect(await sawWatchedText(page)).toBe(false);
  await expect(page.getByText(staleLookupName)).toHaveCount(0);
  const final: CheckInList = await (await page.request.get(`/api/events/${eventId}/check-in`)).json();
  expect(final.riders.find((candidate) => candidate.orderId === ready.orderId)).toMatchObject({ bib: 100, checkedInAt: expect.any(String) });
  await Promise.all(queued.slice(1).map((item) => item.route.abort()));
});

test('a failed enter lookup does not present the following empty search as the result', async ({ page }) => {
  const { eventId } = await (await page.request.post('/api/demo')).json();
  expect((await publishReviewed(page.request, `/api/events/${eventId}`, { acknowledgeWarnings: true })).ok()).toBe(true);
  expect((await page.request.post(`/api/events/${eventId}/check-in-demo-riders`)).ok()).toBe(true);
  const openedAt = new Date('2026-06-01T12:00:00Z');
  await page.clock.install({ time: openedAt });
  await page.goto(`/#/events/${eventId}/check-in`);
  const search = page.getByRole('searchbox', { name: 'Find a rider' });
  const count = page.locator('.ci__count');
  await expect(count).toContainText('riders on');
  await page.clock.pauseAt(new Date(openedAt.getTime() + 2_000));
  let enterAborted = false;
  await page.route(`**/api/events/${eventId}/check-in?*`, (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const query = new URL(route.request().url()).searchParams.get('q');
    if (query === 'Nonexistent Person' && !enterAborted) {
      enterAborted = true;
      return route.abort();
    }
    return route.continue();
  });
  await search.fill('Nonexistent Person');
  await search.press('Enter');
  const debounced = page.waitForResponse((response) => {
    if (!response.ok() || response.request().method() !== 'GET') return false;
    const url = new URL(response.url());
    return url.pathname === `/api/events/${eventId}/check-in` && url.searchParams.get('q') === 'Nonexistent Person';
  });
  await page.clock.runFor(150);
  await debounced;
  await expect(page.getByRole('alert')).toHaveCount(1);
  await expect(count).toHaveText('The list could not be updated.');
  await expect(page.getByText('No rider matches. Check the spelling, or try the team or check-in code.')).toHaveCount(0);
});

test('a failed search does not present the previous empty list as the result', async ({ page }) => {
  const { eventId } = await (await page.request.post('/api/demo')).json();
  expect((await publishReviewed(page.request, `/api/events/${eventId}`, { acknowledgeWarnings: true })).ok()).toBe(true);
  expect((await page.request.post(`/api/events/${eventId}/check-in-demo-riders`)).ok()).toBe(true);
  await page.goto(`/#/events/${eventId}/check-in`);
  const search = page.getByRole('searchbox', { name: 'Find a rider' });
  const count = page.locator('.ci__count');
  await expect(count).toContainText('riders on');
  await search.fill('zzzzzz');
  await expect(page.getByText('No rider matches. Check the spelling, or try the team or check-in code.')).toBeVisible();
  await page.route(`**/api/events/${eventId}/check-in?*`, (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.abort();
  });
  await search.fill('ada');
  await expect(page.getByRole('alert').first()).toBeVisible();
  await expect(page.getByText('No rider matches. Check the spelling, or try the team or check-in code.')).toHaveCount(0);
  await expect(page.getByText('No registered riders for this day yet.')).toHaveCount(0);
  await expect(count).toHaveText('The list could not be updated.');
  const cleared = page.waitForEvent('requestfailed', (request) => {
    if (request.method() !== 'GET') return false;
    const url = new URL(request.url());
    return url.pathname === `/api/events/${eventId}/check-in` && url.searchParams.get('q') === '';
  });
  await search.fill('');
  await cleared;
  await page.waitForTimeout(400);
  await expect(count).toHaveText('The list could not be updated.');
  await expect(page.getByText('No registered riders for this day yet.')).toHaveCount(0);
});

test('a failed refresh of an empty day does not say that nobody is registered', async ({ page }) => {
  const { eventId } = await (await page.request.post('/api/demo')).json();
  expect((await publishReviewed(page.request, `/api/events/${eventId}`, { acknowledgeWarnings: true })).ok()).toBe(true);
  await page.goto(`/#/events/${eventId}/check-in`);
  const count = page.locator('.ci__count');
  await expect(page.getByText('No registered riders for this day yet.')).toBeVisible();
  await page.route(`**/api/events/${eventId}/check-in?*`, (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.abort();
  });
  await page.getByRole('button', { name: 'Add fictional demo riders', exact: true }).click();
  await expect(page.getByRole('alert').first()).toBeVisible();
  await expect(count).toHaveText('The list could not be updated.');
  await expect(page.getByText('No registered riders for this day yet.')).toHaveCount(0);
  await expect(page.getByText('No rider matches. Check the spelling, or try the team or check-in code.')).toHaveCount(0);
});

test('a failed enter and its search show one connection error', async ({ page }) => {
  const { eventId } = await (await page.request.post('/api/demo')).json();
  expect((await publishReviewed(page.request, `/api/events/${eventId}`, { acknowledgeWarnings: true })).ok()).toBe(true);
  expect((await page.request.post(`/api/events/${eventId}/check-in-demo-riders`)).ok()).toBe(true);
  const openedAt = new Date('2026-06-01T12:00:00Z');
  await page.clock.install({ time: openedAt });
  await page.goto(`/#/events/${eventId}/check-in`);
  await expect(page.locator('.ci__count')).toContainText('riders on');
  await page.clock.pauseAt(new Date(openedAt.getTime() + 2_000));
  let failedNamedReads = 0;
  page.on('requestfailed', (request) => {
    if (request.method() !== 'GET') return;
    const url = new URL(request.url());
    if (url.pathname === `/api/events/${eventId}/check-in` && url.searchParams.get('q') === 'Nonexistent Person') {
      failedNamedReads += 1;
    }
  });
  await page.route(`**/api/events/${eventId}/check-in?*`, (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.abort();
  });
  await watchAlertCount(page, connectionError);
  const search = page.getByRole('searchbox', { name: 'Find a rider' });
  await search.fill('Nonexistent Person');
  await search.press('Enter');
  await page.clock.runFor(150);
  await expect.poll(() => failedNamedReads).toBeGreaterThanOrEqual(2);
  // A paused clock never runs the frame flushPaint waits on.
  await page.clock.resume();
  await flushPaint(page);
  await expect(page.getByRole('alert').filter({ hasText: connectionError })).toHaveCount(1);
  expect(await maxAlertCount(page)).toBe(1);
});

test('a failed refresh after check-in keeps the saved card', async ({ page }) => {
  const { eventId } = await (await page.request.post('/api/demo')).json();
  expect((await publishReviewed(page.request, `/api/events/${eventId}`, { acknowledgeWarnings: true })).ok()).toBe(true);
  expect((await page.request.post(`/api/events/${eventId}/check-in-demo-riders`)).ok()).toBe(true);
  expect((await page.request.put(`/api/events/${eventId}/bib-settings`, { data: { scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 199 }] } })).ok()).toBe(true);
  const list: CheckInList = await (await page.request.get(`/api/events/${eventId}/check-in`)).json();
  const rider = list.riders.find((candidate) => candidate.result.ready && candidate.bib === null && candidate.checkInCode);
  if (!rider) throw new Error('The fictional fixture needs a ready, unassigned rider');
  await page.goto(`/#/events/${eventId}/check-in`);
  const detail = page.getByRole('region', { name: 'Rider check-in' });
  await expect(page.locator('.ci__count')).toContainText('riders on');
  await page.getByRole('button', { name: rider.name }).click();
  await expect(detail.getByRole('status')).toContainText('Ready to race');
  let refreshAborted = false;
  await page.route(`**/api/events/${eventId}/check-in?*`, (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    refreshAborted = true;
    return route.abort();
  });
  await detail.getByRole('button', { name: 'Check in and issue next bib', exact: true }).click();
  await expect.poll(() => refreshAborted).toBe(true);
  await expect(page.getByRole('alert').filter({ hasText: connectionError })).toHaveCount(1);
  await flushPaint(page);
  await expect(detail.getByRole('heading', { name: rider.name, exact: true })).toBeVisible();
  await expect(detail.getByRole('status')).toContainText('Checked in. Hand over the bib below.');
  await expect(detail.locator('.ci-bib__number')).toHaveText('100');
  await expect(detail.getByRole('button', { name: /Check in and issue/ })).toHaveCount(0);
});
