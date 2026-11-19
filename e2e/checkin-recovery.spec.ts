import type { Route } from '@playwright/test';
import { expect, test, type Page } from './fixtures';
import type { CheckInList, CheckInRider } from '../src/shared/checkin';

async function selectRaceDay(page: Page, label: string) {
  const days = page.getByRole('radiogroup', { name: 'Race day' });
  await days.getByText(label, { exact: true }).click();
  await expect(days.getByRole('radio', { name: label, exact: true })).toBeChecked();
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
      expect((await page.request.post(`/api/events/${eventId}/publish`, { data: { acknowledgeWarnings: true } })).ok()).toBe(true);
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
        if (!rider?.checkInCode || !next?.checkInCode) throw new Error('The fictional fixture needs two ready, unassigned riders with check-in codes');
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
        if (!reload) await volunteer.unroute(url);

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
          await volunteer.reload();
          await expect(search).toHaveValue('');
          await expect(detail).toContainText('Search for a rider or scan their check-in code.');
          await expect(detail.getByRole('alert')).toHaveCount(0);
          await expect(volunteer.getByRole('radio', { name: 'Saturday', exact: true })).toBeChecked();
          await selectRaceDay(volunteer, 'Sunday');
          await search.fill(rider.checkInCode);
          await search.press('Enter');
          await expect(detail.getByRole('heading', { name: rider.name })).toBeVisible();
          expect(interrupted).toBe(1);
          await volunteer.unroute(url);

          if (!committed) {
            await expect(detail.locator('.ci-bib__number')).toHaveCount(0);
            await detail.getByRole('button', { name: 'Check in and issue next bib', exact: true }).click();
          }
          await expect(detail.locator('.ci-bib__number')).toHaveText('100');
          await expect(detail.getByRole('status')).toContainText('Checked in. Hand over the bib below.');
          const recovered = (await readList(list.dayId)).riders.find((candidate) => candidate.orderId === rider.orderId);
          expect(recovered).toMatchObject({
            bib: 100,
            checkedInAt: committed ? recorded.checkedInAt : expect.any(String),
            payment: rider.payment,
            entries: rider.entries,
            readiness: rider.readiness,
          });
          expect(recovered?.bibHistory).toHaveLength(1);
          return;
        }

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
