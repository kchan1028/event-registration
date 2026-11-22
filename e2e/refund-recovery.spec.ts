import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';
import { publishReviewed } from './support/publish';

for (const committed of [true, false]) test(`recovers an interrupted refund after refresh (committed: ${committed}) without duplicates`, async ({ page }) => {
  const { eventId } = await (await page.request.post('/api/demo')).json();
  await publishReviewed(page.request, `/api/events/${eventId}`, { acknowledgeWarnings: true });
  const { config } = await (await page.request.get(`/api/events/${eventId}`)).json();
  const rider = { firstName: 'Recovery', lastName: 'Fictional', email: 'recovery@example.test', team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Example Contact', phone: '555-555-0199' } };
  const order = await (await page.request.post(`/api/rider/events/${eventId}/orders`, { data: { clientRequestId: 'refund-recovery-browser', categoryIds: [config.categories.find((c: { timingCode: string }) => c.timingCode === 'RR-M35-34').id], rider, waiver: { version: config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Recovery Fictional', signerRole: 'rider' } } })).json();
  const paid = await page.request.post(`/api/orders/${order.id}/payment`, { data: { attemptId: `refund-recovery-browser-payment-${committed}`, outcome: 'success' } });
  expect(paid.status()).toBe(200);
  expect((await paid.json()).status).toBe('confirmed');
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.goto(`/#/events/${eventId}/registrations`);
  await page.getByRole('button', { name: 'Refund Recovery Fictional', exact: true }).click();
  await page.getByLabel('Amount (USD)').fill('1.00');
  const reason = `Fictional interrupted partial refund${committed ? '' : ' ' + 'A'.repeat(240)}`;
  await page.getByLabel('Reason for the refund (required)').fill(reason);
  let body: Record<string, unknown> | null = null;
  let interrupt = true;
  let releaseSubmission!: () => void;
  const submitting = new Promise<void>((resolve) => { releaseSubmission = resolve; });
  await page.route(`**/api/orders/${order.id}/refunds`, async (route) => {
    if (route.request().method() === 'POST' && interrupt) {
      body = route.request().postDataJSON();
      await submitting;
      if (committed) { const saved = await route.fetch(); expect(saved.status()).toBe(200); }
      await route.abort('failed'); // server committed; the browser never receives its response
    } else if (interrupt) await route.abort('failed'); // status lookup is interrupted too
    else await route.continue();
  });
  await page.getByRole('button', { name: 'Refund', exact: true }).click();
  const recovery = page.getByRole('region', { name: 'Recover refund for Recovery Fictional' });
  await expect(recovery).toBeVisible();
  await expect(recovery).toBeFocused();
  await expect(recovery.getByRole('heading')).toHaveText('Submitting refund');
  await expect(recovery).not.toContainText('Its response is unconfirmed');
  await expect(recovery.getByRole('button', { name: 'Retry original refund' })).toBeDisabled();
  releaseSubmission();
  await expect(recovery.getByRole('button', { name: 'Retry original refund' })).toBeEnabled();
  await expect(recovery).toContainText(reason);
  const stored = await page.evaluate(() => Object.entries(sessionStorage).filter(([key]) => key.startsWith('cyclereg.refund.')));
  expect(stored).toHaveLength(1);
  expect(JSON.parse(stored[0][1]).clientRequestId).toBe(body!.clientRequestId);
  await page.reload();
  await expect(recovery).toBeVisible();
  for (const theme of ['light','dark']) {
    const toggle = page.getByRole('button', { name: new RegExp(`Switch to ${theme} theme`) });
    if (await toggle.count()) await toggle.click();
    for (const width of [360,390,1440]) {
      await page.setViewportSize({ width,height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await recovery.screenshot({ path: `test-results/refund-recovery-${committed}-${theme}-${width}.png` });
    }
    expect((await new AxeBuilder({ page }).include('[aria-label="Recover refund for Recovery Fictional"]').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
  }
  interrupt = false;
  if (!committed) {
    await recovery.getByRole('button', { name: 'Check refund status' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alert')).toContainText('No saved refund found yet');
    await expect(recovery).toBeFocused();
  }
  await recovery.getByRole('button', { name: 'Retry original refund' }).click();
  await expect(recovery).toBeHidden();
  await expect(page.getByRole('button', { name: 'Refund Recovery Fictional', exact: true })).toBeFocused();
  await expect(page.getByRole('status').filter({ hasText: 'Last refund request:' })).toContainText('Refunded');
  await page.setViewportSize({ width: 360,height: 1000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await page.getByRole('list', { name: 'Refunds for Recovery Fictional', exact: true }).screenshot({ path: `test-results/refund-history-${committed}-dark-360.png` });
  const refunds = await (await page.request.get(`/api/orders/${order.id}/refunds`)).json();
  expect(refunds.refunds).toHaveLength(1);
  expect(refunds.refunds[0]).toMatchObject({ clientRequestId: body!.clientRequestId, amountCents: 100, reason, status: 'succeeded' });
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter((key) => key.startsWith('cyclereg.refund.')))).toEqual([]);
  const finalOrder = await (await page.request.get(`/api/orders/${order.id}`)).json();
  expect(finalOrder.entries[0].status).toBe('confirmed');
});
