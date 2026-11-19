import { expect, test } from './fixtures';
import type { CheckInList } from '../src/shared/checkin';

for (const hasTouch of [false, true]) {
  test.describe(hasTouch ? 'coarse pointer' : 'fine pointer', () => {
    test.use({ hasTouch });

    test('check-in navigation targets remain usable by touch and keyboard', async ({ page }) => {
      const { eventId } = await (await page.request.post('/api/demo')).json();
      const event = await (await page.request.get(`/api/events/${eventId}`)).json();
      // Short but valid day labels must still provide a usable hit area.
      event.config.days.forEach((day: { label: string }, index: number) => { day.label = String(index + 1); });
      expect((await page.request.put(`/api/events/${eventId}/config`, { data: { config: event.config, revision: event.revision } })).status()).toBe(200);
      await page.request.post(`/api/events/${eventId}/publish`, { data: { acknowledgeWarnings: true } });
      await page.goto(`/#/events/${eventId}/check-in`);
      const builder = page.getByRole('link', { name: 'Builder', exact: true });
      const days = page.getByRole('radiogroup', { name: 'Race day' });
      await expect(days).toBeVisible();
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(hasTouch);

      for (const theme of ['light', 'dark']) {
        await page.evaluate((value) => localStorage.setItem('cyclereg-theme', value), theme);
        await page.reload();
        await expect(days).toBeVisible();
        for (const width of [320, 390, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          const targets = [builder, ...await days.locator('label').all()];
          const sizes = await Promise.all(targets.map(async (target) => ({ name: await target.innerText(), box: await target.boundingBox() })));
          for (const size of sizes) {
            expect(size.box, JSON.stringify(sizes)).not.toBeNull();
            expect(size.box!.height, JSON.stringify(sizes)).toBeGreaterThanOrEqual(44);
            expect(size.box!.width, JSON.stringify(sizes)).toBeGreaterThanOrEqual(44);
          }
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
          await builder.focus();
          await page.keyboard.press('Tab');
          await expect(days.getByRole('radio', { checked: true })).toBeFocused();
          await days.getByRole('radio').first().focus();
          await page.keyboard.press('ArrowRight');
          await expect(days.getByRole('radio').nth(1)).toBeChecked();
          await expect(days.getByRole('radio').nth(1)).toBeFocused();
          await page.keyboard.press('ArrowLeft');
          await expect(days.getByRole('radio').first()).toBeChecked();
          await expect(days.getByRole('radio').first()).toBeFocused();
          expect(await days.locator('label').first().evaluate((label) => getComputedStyle(label).outlineStyle)).not.toBe('none');
          if ((!hasTouch && theme === 'light' && width === 1440) || (hasTouch && theme === 'dark' && width === 390)) {
            await page.locator('.ci__bar').screenshot({ path: `test-results/checkin-navigation-${hasTouch ? 'phone-dark' : 'desktop-light'}.png` });
          }
        }
      }
      await builder.focus();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(new URL(`/#/events/${eventId}`, page.url()).href);
      await expect(page.locator('.cat-row').first()).toBeVisible();
    });
  });
}

for (const width of [390, 1440]) {
  test(`volunteer can look up riders and issue a bib with only the keyboard at ${width}px`, async ({ page, browser }) => {
    const { eventId, organizationId } = await (await page.request.post('/api/demo')).json();
    const checkInUrl = `/api/events/${eventId}/check-in`;
    expect((await page.request.post(`/api/events/${eventId}/publish`, { data: { acknowledgeWarnings: true } })).ok()).toBe(true);
    expect((await page.request.post(`/api/events/${eventId}/check-in-demo-riders`)).ok()).toBe(true);
    expect((await page.request.put(`/api/events/${eventId}/bib-settings`, {
      data: { scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 199 }] },
    })).ok()).toBe(true);
    const email = 'keyboard.volunteer@example.test';
    expect((await page.request.post(`/api/organizations/${organizationId}/members`, {
      data: { email, role: 'check_in_volunteer' },
    })).ok()).toBe(true);
    const headers = { Authorization: `Bearer test:${email}` };
    const context = await browser.newContext({ viewport: { width, height: 900 }, extraHTTPHeaders: {} });

    try {
      await context.addInitScript((address) => sessionStorage.setItem('cyclereg.test-session', address), email);
      const desk = await context.newPage();
      const initial: CheckInList = await (await desk.request.get(checkInUrl, { headers })).json();
      expect(initial.roles).toEqual(['check_in_volunteer']);
      const ready = initial.riders.find((rider) => rider.result.ready && rider.bib === null);
      const blocked = initial.riders.find((rider) => rider.payment === 'confirmed' && !rider.result.ready);
      if (!ready?.checkInCode || !blocked?.checkInCode) throw new Error('Keyboard check-in needs a ready and a blocked fictional rider');

      await desk.goto(`/#/events/${eventId}/check-in`);
      const search = desk.getByRole('searchbox', { name: 'Find a rider' });
      const detail = desk.getByRole('region', { name: 'Rider check-in' });
      const issue = detail.getByRole('button', { name: 'Check in and issue next bib', exact: true });
      await expect(search).toBeFocused();
      await desk.keyboard.type(ready.checkInCode);
      await desk.keyboard.press('Enter');
      await expect(detail.getByRole('heading', { name: ready.name, exact: true })).toBeVisible();
      await expect(detail.getByRole('status')).toContainText('Ready to race');
      await expect(detail).toBeFocused();

      await desk.keyboard.press('Tab');
      await expect(detail.getByRole('textbox', { name: /Bib/ })).toBeFocused();
      await desk.keyboard.press('Tab');
      await expect(issue).toBeFocused();
      const issueRequest = desk.waitForRequest((request) => (
        request.method() === 'POST' && new URL(request.url()).pathname === `${checkInUrl}/${ready.orderId}`
      ));
      await desk.keyboard.press('Enter');
      expect((await (await issueRequest).allHeaders()).authorization).toBe(headers.Authorization);
      await expect(detail.getByText('100', { exact: true })).toBeVisible();
      await expect(detail.getByRole('button', { name: 'Next rider', exact: true })).toBeFocused();
      await desk.keyboard.press('Enter');
      await expect(search).toBeFocused();
      await expect(search).toHaveValue('');

      await desk.keyboard.type(blocked.checkInCode);
      await desk.keyboard.press('Enter');
      await expect(detail.getByRole('heading', { name: blocked.name, exact: true })).toBeVisible();
      await expect(detail).toBeFocused();
      await expect(detail.getByRole('status')).toContainText('Not ready');
      await expect(detail.getByRole('button', { name: /Check in and issue/ })).toHaveCount(0);

      const refusal = await desk.request.post(`${checkInUrl}/${blocked.orderId}`, {
        headers,
        data: { dayId: initial.dayId, bib: null },
      });
      expect(refusal.status()).toBe(409);
      expect(await refusal.json()).toMatchObject({ error: expect.stringMatching(/^Not ready to race/) });
      const final: CheckInList = await (await desk.request.get(checkInUrl, { headers })).json();
      expect(final.riders.find((rider) => rider.orderId === ready.orderId)).toMatchObject({ bib: 100, checkedInAt: expect.any(String) });
      expect(final.riders.find((rider) => rider.orderId === blocked.orderId)).toMatchObject({ bib: null, checkedInAt: null });
    } finally {
      await context.close();
    }
  });
}
