import AxeBuilder from '@axe-core/playwright';
import type { CheckInList } from '../src/shared/checkin';
import { expect, test } from './fixtures';

for (const theme of ['light', 'dark']) {
  test(`phone roster keeps snapshot readiness visible and prints tables (${theme})`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('cyclereg-theme', value), theme);
    const { eventId } = await (await page.request.post('/api/demo')).json();
    await page.request.post(`/api/events/${eventId}/publish`, { data: { acknowledgeWarnings: true } });
    await page.request.post(`/api/events/${eventId}/check-in-demo-riders`);
    await page.request.put(`/api/events/${eventId}/bib-settings`, { data: { scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 199 }] } });
    let list: CheckInList = await (await page.request.get(`/api/events/${eventId}/check-in`)).json();
    const ready = list.riders.find((r) => r.result.ready)!;
    const longName = 'FictionalLongRiderNameWithoutSpaces'.repeat(2).slice(0, 60);
    expect((await page.request.post(`/api/orders/${ready.orderId}/rider-corrections`, { data: { changes: { firstName: longName, team: 'FictionalLongTeamNameWithoutSpaces'.repeat(3).slice(0, 80) }, reason: 'Fictional long-content rendering exercise' } })).status()).toBe(200);
    expect((await page.request.post(`/api/events/${eventId}/check-in/${ready.orderId}`, { data: { dayId: list.dayId, bib: null } })).status()).toBe(200);
    list = await (await page.request.get(`/api/events/${eventId}/check-in`)).json();
    const checked = list.riders.find((r) => r.orderId === ready.orderId)!;
    const blocked = list.riders.find((r) => !r.result.ready)!;
    const waiting = list.riders.find((r) => r.result.ready && !r.checkedInAt)!;
    await page.goto(`/#/events/${eventId}/roster`);
    await expect(page.getByRole('button', { name: 'Print roster' })).toBeEnabled();
    const day = page.getByRole('region', { name: /^Roster for / }).first();
    const desktopNames = await day.locator('.roster__scroll .roster__name').allTextContents();
    const columns = ['Rider', 'Team', 'Age', 'Races', 'Snapshot status', 'Recorded bib'];
    await expect(day.locator('.roster__scroll').getByRole('columnheader')).toHaveText(columns);
    await expect(day.getByRole('list', { name: /^Riders,/ })).toHaveCount(0);

    for (const width of [320, 390, 640]) {
      await page.setViewportSize({ width, height: 844 });
      const cards = day.getByRole('list', { name: /^Riders,/ }).getByRole('listitem');
      await expect(cards).toHaveCount(list.riders.length);
      expect(await cards.getByRole('heading').allTextContents()).toEqual(desktopNames);
      await expect(day.getByRole('table')).toHaveCount(0);
      const checkedCard = cards.filter({ has: page.getByRole('heading', { name: checked.name, exact: true }) });
      await expect(checkedCard).toContainText('Snapshot statusChecked in');
      await expect(checkedCard).toContainText('Recorded bib100');
      await expect(checkedCard).toContainText(checked.team);
      const blockedCard = cards.filter({ has: page.getByRole('heading', { name: blocked.name, exact: true }) });
      await expect(blockedCard).toContainText('NOT READY');
      await expect(blockedCard).toContainText('Do not issue a bib');
      await expect(blockedCard).toContainText('Next step');
      for (const blocker of blocked.result.blockers) await expect(blockedCard).toContainText(blocker.action);
      await expect(cards.filter({ has: page.getByRole('heading', { name: waiting.name, exact: true }) })).toContainText('Snapshot statusReady');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      expect(await cards.evaluateAll((items) => items.some((item) => item.scrollWidth > item.clientWidth))).toBe(false);
      await expect(day).toContainText('Reference only');
      await expect(day).toContainText('adding a name to the printed sheet does not create an entry');
      if (width === 390) {
        expect((await new AxeBuilder({ page }).include('.roster').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
        await checkedCard.screenshot({ path: `test-results/roster-phone-${theme}.png` });
        await blockedCard.screenshot({ path: `test-results/roster-blocked-${theme}.png` });
      }
    }
    await page.setViewportSize({ width: 641, height: 900 });
    await expect(day.locator('.roster__scroll').getByRole('table')).toBeVisible();
    await expect(day.getByRole('list', { name: /^Riders,/ })).toHaveCount(0);
    // Printing while the screen is phone-sized must also select the table presentation.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ media: 'print' });
    await expect(day.getByRole('list', { name: /^Riders,/ })).toHaveCount(0);
    await expect(day.locator('.roster__scroll').getByRole('columnheader')).toHaveText(columns);
    await expect(day.getByRole('heading', { name: 'Exception checklist' })).toBeVisible();
    await expect(day.getByRole('columnheader', { name: 'Lead review notes' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Print roster' })).toBeHidden();
    await page.setViewportSize({ width: 816, height: 1056 });
    await expect(day.locator('.roster__scroll .roster__name')).toHaveText(desktopNames);
    await expect(page.locator('body')).not.toContainText('@example.com');
    const { eventId: emptyId } = await (await page.request.post('/api/demo')).json();
    await page.emulateMedia({ media: 'screen' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/#/events/${emptyId}/roster`);
    await expect(page.getByRole('button', { name: 'Print roster' })).toBeEnabled();
    for (const section of await page.getByRole('region', { name: /^Roster for / }).all()) {
      await expect(section).toContainText('No registered riders for this day');
      await expect(section).toContainText('Reference only');
      await expect(section.getByRole('list', { name: /^Riders,/ })).toHaveCount(0);
      await expect(section.getByRole('table')).toHaveCount(0);
    }

  });
}
