import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

test('shows cancelled entries separately from payment and active race readiness', async ({ page }) => {
  const { eventId } = await (await page.request.post('/api/demo')).json();
  expect((await page.request.delete(`/api/events/${eventId}/test-entries`)).status()).toBe(200);
  const event = await (await page.request.get(`/api/events/${eventId}`)).json();
  expect((await page.request.post(`/api/events/${eventId}/publish`, { data: { acknowledgeWarnings: true } })).status()).toBe(200);
  const rider = { firstName: 'Cancel', lastName: 'Fictional', email: 'cancel@example.test', team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Fictional Contact', phone: '555-555-0199' } };
  const created = await page.request.post(`/api/rider/events/${eventId}/orders`, { data: { clientRequestId: `cancel-screen-${eventId}`, categoryIds: [event.config.categories.find((c: { timingCode: string }) => c.timingCode === 'RR-M35-34').id], rider, waiver: { version: event.config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Cancel Fictional', signerRole: 'rider' } } });
  expect(created.status()).toBe(201); const order = await created.json();
  expect((await page.request.post(`/api/orders/${order.id}/payment`, { data: { attemptId: `cancel-screen-payment-${eventId}`, outcome: 'success' } })).status()).toBe(200);
  const preview = await (await page.request.post(`/api/events/${eventId}/cancellation-confirmation-preview`, { data: { scope: 'event' } })).json();
  const plan = await page.request.post(`/api/events/${eventId}/cancellation-confirmations`, { data: { clientRequestId: `cancel-plan-${eventId}`, selection: preview.preview.selection, previewFingerprint: preview.fingerprint, reason: 'Fictional weather cancellation', acknowledgePlanOnly: true } });
  expect(plan.status()).toBe(200);
  const executed = await page.request.post(`/api/events/${eventId}/cancellation-executions`, { data: { clientRequestId: `cancel-execute-${eventId}`, confirmationId: (await plan.json()).id, acknowledgeSimulatedCancellation: true } });
  expect(executed.status(), await executed.text()).toBe(200);
  for (const surface of ['receipt', 'organizer']) {
    await page.goto(surface === 'receipt' ? `/#/orders/${order.id}` : `/#/events/${eventId}/registrations`);
    if (surface === 'receipt') {
      await expect(page.getByRole('heading', { name: 'Registration history' })).toBeVisible();
      await expect(page.getByText('Cancelled by the organizer. This entry no longer races.')).toBeVisible();
      await expect(page.getByText('Check-in code', { exact: true })).toHaveCount(0);
      await expect(page.getByText('Everything below is done.', { exact: false })).toHaveCount(0);
    } else {
      await expect(page.getByText('Cancelled by organizer', { exact: true })).toBeVisible();
      await expect(page.getByText('Cancelled entries', { exact: true })).toBeVisible();
    }
    for (const theme of ['light', 'dark']) {
      const toggle = page.getByRole('button', { name: /^Theme: / });
      if (await toggle.getAttribute('data-current') !== theme) await toggle.click();
      await expect(toggle).toHaveAttribute('data-current', theme);
      for (const width of [360, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        expect(await page.locator('body').evaluate((e) => e.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: `test-results/cancellation-${surface}-${theme}-${width}.png`, fullPage: true, animations: 'disabled' });
        expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
      }
    }
  }
});
