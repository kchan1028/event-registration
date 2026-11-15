import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/*
 * Automated accessibility checks (ACCESSIBILITY.md, "How accessibility will be checked").
 * axe-core with the WCAG 2.0, 2.1 and 2.2 level A and AA rules, on every main screen, in both
 * display themes. Automated checks find only part of the barriers; the keyboard, screen-reader,
 * and real-phone passes are still required before a flow is Verified.
 */

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectNoViolations(page: Page, screen: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.help}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  expect(summary, `Accessibility violations on ${screen}`).toEqual([]);
}

type Setup = { eventId: string; readyRider: string; blockedRider: string; fixtureEventId: string };

async function setUp(page: Page): Promise<Setup> {
  const api = page.request;
  const { eventId } = await (await api.post('/api/demo')).json();
  await api.post(`/api/events/${eventId}/publish`, { data: { acknowledgeWarnings: true } });
  await api.post(`/api/events/${eventId}/check-in-demo-riders`);
  await api.put(`/api/events/${eventId}/bib-settings`, { data: { scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 299 }] } });
  const list = await (await api.get(`/api/events/${eventId}/check-in?q=`)).json();
  const ready = list.riders.find((r: { result: { ready: boolean } }) => r.result.ready);
  const blocked = list.riders.find((r: { result: { ready: boolean } }) => !r.result.ready);
  await api.post(`/api/events/${eventId}/check-in/${ready.orderId}`, { data: { dayId: list.dayId, bib: null } });
  const { eventIds } = await (await api.post('/api/demo/purchase-flow')).json();
  return { eventId, readyRider: ready.name, blockedRider: blocked.name, fixtureEventId: eventIds[0] };
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      // Set the theme before the page draws, as a returning visitor would, so no color transition runs during a check.
      await page.addInitScript((t) => localStorage.setItem('cyclereg-theme', t), theme);
    });

    test('organizer screens', async ({ page }) => {
      const s = await setUp(page);
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoViolations(page, 'home');

      const views = ['', '/setup', '/pools', '/import', '/registrations', '/startlists', '/publish', '/preview'];
      for (const view of views) {
        await page.goto(`/#/events/${s.eventId}${view}`);
        await page.waitForLoadState('networkidle');
        await expectNoViolations(page, `builder${view || ' schedule'}`);
      }

      await page.goto(`/#/events/${s.eventId}`);
      await page.locator('.cat-row').first().click();
      await expect(page.locator('.editor')).toBeVisible();
      await expectNoViolations(page, 'category editor');
    });

    test('check-in screens', async ({ page }) => {
      const s = await setUp(page);
      await page.goto(`/#/events/${s.eventId}/check-in`);
      await expect(page.getByRole('heading', { name: 'Race-day check-in' })).toBeVisible();
      await expectNoViolations(page, 'check-in list');

      await page.getByRole('button', { name: new RegExp(s.readyRider) }).click();
      await expect(page.locator('.ci-result--ready')).toBeVisible();
      await expectNoViolations(page, 'check-in, ready rider');

      await page.getByRole('button', { name: new RegExp(s.blockedRider) }).click();
      await expect(page.locator('.ci-result--blocked')).toBeVisible();
      await expectNoViolations(page, 'check-in, blocked rider');

      await page.getByRole('button', { name: 'Bib ranges' }).click();
      await expectNoViolations(page, 'check-in, bib ranges');
    });

    test('rider registration, every step', async ({ page }) => {
      const s = await setUp(page);
      await page.goto('/#/register');
      await expect(page.getByRole('heading', { name: 'Choose an event' })).toBeVisible();
      await expectNoViolations(page, 'choose an event');

      await page.goto(`/#/register/${s.fixtureEventId}`);
      await expect(page.getByRole('heading', { name: 'About you' })).toBeVisible();
      await page.getByRole('button', { name: 'Continue to racer details' }).click();
      await expect(page.locator('.error-summary')).toBeVisible();
      await expectNoViolations(page, 'choose races, with errors');

      await page.getByLabel('Use a demo rider (fake data)').selectOption('rider-alex');
      await page.getByRole('checkbox', { name: /DVC-M45/ }).click();
      await expectNoViolations(page, 'choose races');
      await page.getByRole('button', { name: 'Continue to racer details' }).click();
      await expect(page.getByLabel('First name (required)')).toHaveValue('Alex');
      await expectNoViolations(page, 'racer details');

      await page.getByRole('button', { name: 'Continue to the waiver' }).click();
      await page.getByRole('button', { name: 'Sign and review the order' }).click();
      await expect(page.locator('.error-summary')).toBeVisible();
      await expectNoViolations(page, 'waiver, with errors');

      await page.getByLabel('I have read the whole waiver').check();
      await page.getByLabel(/Type your full name to sign/).fill('Alex Demo');
      await page.getByLabel(/agree to this waiver/).check();
      await page.getByRole('button', { name: 'Sign and review the order' }).click();
      await expect(page.getByRole('button', { name: /Complete simulated payment/ })).toBeVisible();
      await expectNoViolations(page, 'review and simulated payment');

      await page.getByRole('button', { name: /Complete simulated payment/ }).click();
      await expect(page.getByRole('heading', { name: 'You’re entered' })).toBeVisible();
      await expectNoViolations(page, 'confirmation');
    });
  });
}
