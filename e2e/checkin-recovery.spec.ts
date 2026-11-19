import { expect, test } from './fixtures';
import type { CheckInList, CheckInRider } from '../src/shared/checkin';

for (const mobile of [false, true]) {
  for (const committed of [false, true]) {
    test(`check-in recovers when ${committed ? 'the committed response is lost' : 'the request never reaches the server'} (${mobile ? 'phone' : 'desktop'})`, async ({ page, browser }) => {
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
        const list: CheckInList = await (await volunteer.request.get(`/api/events/${eventId}/check-in`)).json();
        expect(list.roles).toEqual(['check_in_volunteer']);
        const [rider, next] = list.riders.filter((r) => r.result.ready && r.bib === null);
        if (!rider?.checkInCode || !next?.checkInCode) throw new Error('The fictional fixture needs two ready, unassigned riders with check-in codes');
        await volunteer.goto(`/#/events/${eventId}/check-in`);
        const search = volunteer.getByRole('searchbox', { name: 'Find a rider' });
        const detail = volunteer.getByRole('region', { name: 'Rider check-in' });
        const lookupUrl = (url: URL) => url.pathname === `/api/events/${eventId}/check-in` && url.searchParams.get('q') === rider.checkInCode;
        const searchResults = volunteer.waitForResponse((response) => lookupUrl(new URL(response.url())) && response.ok());
        await search.fill(rider.checkInCode);
        // Let the debounced search settle before interrupting the action below.
        await searchResults;
        await search.press('Enter');
        await expect(detail).toContainText('Ready to race');

        const url = `**/api/events/${eventId}/check-in/${rider.orderId}`;
        let interrupted = 0;
        await volunteer.route(url, async (route) => {
          interrupted++;
          if (committed) expect((await route.fetch()).status()).toBe(200);
          await route.abort('connectionfailed');
        });
        await detail.getByRole('button', { name: 'Check in and issue next bib', exact: true }).click();
        const warning = detail.getByRole('alert');
        await expect(warning).toContainText('Check-in may have been recorded. Look up this rider again.');
        expect(interrupted).toBe(1);
        if (!committed) await expect(detail.locator('.ci-bib__number')).toHaveCount(0);
        await volunteer.unroute(url);

        const afterFailure: CheckInList = await (await volunteer.request.get(`/api/events/${eventId}/check-in`)).json();
        const recorded = afterFailure.riders.find((r) => r.orderId === rider.orderId)!;
        expect(recorded.bib).toBe(committed ? 100 : null);
        expect(recorded.checkedInAt !== null).toBe(committed);
        expect(recorded.bibHistory).toHaveLength(committed ? 1 : 0);
        expect(recorded.payment).toBe(rider.payment);
        expect(recorded.entries).toEqual(rider.entries);
        expect(recorded.result).toEqual(rider.result);
        expect(recorded.readiness).toEqual(rider.readiness);

        // A lookup that also loses its response must leave the original warning in place.
        await volunteer.route(lookupUrl, (route) => route.abort('connectionfailed'));
        const failedLookup = volunteer.waitForEvent('requestfailed', (request) => lookupUrl(new URL(request.url())));
        await search.press('Enter');
        await failedLookup;
        await expect(warning).toContainText('Check-in may have been recorded');
        await volunteer.unroute(lookupUrl);

        // Follow the desk guide: look up the existing rider before another action.
        const freshLookup = volunteer.waitForResponse((response) => lookupUrl(new URL(response.url())) && response.ok());
        await search.press('Enter');
        await freshLookup;
        if (!committed) {
          await expect(warning).toContainText('If they are still ready and unchecked, retry check-in.');
          await expect(detail.locator('.ci-bib__number')).toHaveCount(0);
          await detail.getByRole('button', { name: 'Check in and issue next bib', exact: true }).click();
        }
        await expect(detail.getByRole('status')).toContainText('Checked in. Hand over the bib below.');
        await expect(warning).toHaveCount(0);
        await expect(detail.locator('.ci-bib__number')).toHaveText('100');
        await expect(detail.getByText(/^Checked in at /)).toBeVisible();
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
