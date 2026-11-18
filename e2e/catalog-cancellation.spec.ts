import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

for (const scope of ['event', 'day', 'race'] as const) {
  test(`labels ${scope} cancellation without hiding the event or promising availability`, async ({ page }) => {
    const { eventId } = await (await page.request.post('/api/demo')).json();
    expect((await page.request.delete(`/api/events/${eventId}/test-entries`)).status()).toBe(200);
    expect((await page.request.post(`/api/events/${eventId}/publish`, { data: { acknowledgeWarnings: true } })).status()).toBe(200);
    const { config } = await (await page.request.get(`/api/events/${eventId}`)).json();
    const selection = scope === 'event' ? { scope } : scope === 'day' ? { scope, dayId: config.days[0].id } : { scope, raceId: config.races[0].id };
    const preview = await (await page.request.post(`/api/events/${eventId}/cancellation-confirmation-preview`, { data: selection })).json();
    const plan = await page.request.post(`/api/events/${eventId}/cancellation-confirmations`, { data: { clientRequestId: `catalog-plan-${eventId}`, selection, previewFingerprint: preview.fingerprint, reason: 'Fictional weather cancellation', acknowledgePlanOnly: true } });
    expect(plan.status()).toBe(200);
    await page.goto('/#/register');
    const link = page.locator(`.event-pick__link[href="#/register/${eventId}"]`);
    await expect(link).toBeVisible(); await expect(link).not.toContainText(/Event cancelled|cancellations recorded/);
    expect((await page.request.post(`/api/events/${eventId}/cancellation-executions`, { data: { clientRequestId: `catalog-execute-${eventId}`, confirmationId: (await plan.json()).id, acknowledgeSimulatedCancellation: true } })).status()).toBe(200);
    for (const theme of ['light', 'dark']) {
      await page.evaluate((theme) => localStorage.setItem('cyclereg-theme', theme), theme); await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(link).toContainText(scope === 'event' ? 'Event cancelled. View details.' : 'Race or day cancellations recorded. Review event details.');
      await expect(link).toContainText('configured categories');
      await expect(link).not.toContainText('Unaffected races remain available');
      for (const width of [360, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        expect(await page.locator('body').evaluate((e) => e.scrollWidth <= innerWidth)).toBe(true);
        expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
        await page.screenshot({ path: `test-results/catalog-cancellation-${scope}-${theme}-${width}.png`, fullPage: true });
      }
    }
    await link.focus(); await expect(link).toBeFocused(); await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: scope === 'event' ? 'Event cancelled' : 'Part of this event was cancelled', exact: true })).toBeVisible();
  });
}
