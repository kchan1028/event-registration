import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

for (const scope of ['event', 'day', 'race'] as const) {
  test(`prints ${scope} cancellation notices with day-specific safety instructions`, async ({ page }) => {
    const { eventId } = await (await page.request.post('/api/demo')).json();
    expect((await page.request.delete(`/api/events/${eventId}/test-entries`)).status()).toBe(200);
    expect((await page.request.post(`/api/events/${eventId}/publish`, { data: { acknowledgeWarnings: true } })).status()).toBe(200);
    const { config } = await (await page.request.get(`/api/events/${eventId}`)).json();
    const race = config.races[0]; const day = config.days.find((d: { id: string }) => d.id === race.dayId);
    const selection = scope === 'event' ? { scope } : scope === 'day' ? { scope, dayId: day.id } : { scope, raceId: race.id };
    const otherCategory = config.categories.find((c: { raceId: string }) => c.raceId === config.races[1].id && c.timingCode === 'CR-M35-34');
    const created = await page.request.post(`/api/rider/events/${eventId}/orders`, { data: {
      clientRequestId: `roster-unaffected-${eventId}`, categoryIds: [otherCategory.id],
      rider: { firstName: 'Unaffected', lastName: 'Fictional', email: 'unaffected@example.test', team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Fictional Contact', phone: '555-555-0199' } },
      waiver: { version: config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Unaffected Fictional', signerRole: 'rider' },
    } });
    expect(created.status()).toBe(201);
    expect((await page.request.post(`/api/orders/${(await created.json()).id}/payment`, { data: { attemptId: `roster-paid-${eventId}`, outcome: 'success' } })).status()).toBe(200);
    const preview = await (await page.request.post(`/api/events/${eventId}/cancellation-confirmation-preview`, { data: selection })).json();
    const plan = await page.request.post(`/api/events/${eventId}/cancellation-confirmations`, { data: { clientRequestId: `roster-plan-${eventId}`, selection, previewFingerprint: preview.fingerprint, reason: 'Fictional weather cancellation', acknowledgePlanOnly: true } });
    expect(plan.status()).toBe(200);
    expect((await page.request.post(`/api/events/${eventId}/cancellation-executions`, { data: { clientRequestId: `roster-execute-${eventId}`, confirmationId: (await plan.json()).id, acknowledgeSimulatedCancellation: true } })).status()).toBe(200);
    await page.goto(`/#/events/${eventId}/roster`);
    const sections = page.getByRole('region', { name: /^Roster for / });
    await expect(sections).toHaveCount(config.days.length);
    const affected = page.getByRole('region', { name: `Roster for ${day.label}`, exact: true });
    await expect(affected.getByRole('region', { name: /^Cancellation notice/ })).toBeVisible();
    await expect(affected.getByRole('heading', { name: scope === 'event' ? 'Event cancelled' : scope === 'day' ? 'Race day cancelled' : 'Cancelled races on this day', exact: true })).toBeVisible();
    await expect(affected).toContainText(`${race.name}: cancelled`);
    for (const section of await sections.all()) {
      await expect(section).toContainText('This snapshot does not authorize offline registration');
      if (scope === 'event' || await section.getAttribute('aria-label') === `Roster for ${day.label}`) await expect(section).toContainText('No registered riders for this day.');
      else await expect(section).toContainText('Unaffected Fictional');
    }
    if (scope !== 'event') await expect(sections.filter({ hasNotText: day.label }).getByRole('region', { name: /^Cancellation notice/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Print roster' })).toBeEnabled();
    for (const theme of ['light', 'dark'] as const) {
      await page.evaluate((theme) => localStorage.setItem('cyclereg-theme', theme), theme);
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(sections).toHaveCount(config.days.length);
      for (const width of [360, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        expect(await page.locator('body').evaluate((e) => e.scrollWidth <= innerWidth)).toBe(true);
        expect((await new AxeBuilder({ page }).include('.roster').analyze()).violations).toEqual([]);
        await page.screenshot({ path: `test-results/roster-cancellation-${scope}-${theme}-${width}.png`, fullPage: true });
      }
    }
    await page.setViewportSize({ width: 816, height: 1056 }); await page.emulateMedia({ media: 'print' });
    await expect(page.getByRole('button', { name: 'Print roster' })).toBeHidden();
    await expect(affected.getByRole('region', { name: /^Cancellation notice/ })).toBeVisible();
    await expect(affected).toContainText('Do not issue bibs or clear riders for cancelled races.');
    await expect(affected).toContainText('does not confirm refunds');
    await page.screenshot({ path: `test-results/roster-cancellation-${scope}-print.png`, fullPage: true });
  });
}
