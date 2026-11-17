import pg from 'pg';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, E2E_ORGANIZER } from './fixtures';
import { buildApp } from '../src/server/app';
import { localEmail } from '../src/server/email';
import type { PaymentProvider, ProviderEvent } from '../src/server/payments';
import { HttpError } from '../src/server/repo';
import { as, fakeAuth } from '../tests/support/auth';
import { adminUrl, TEST_SERVER_URL } from '../tests/support/server';

// An isolated local app returns an actual failed refund through its API; the provider is fake.
for (const storageAvailable of [true, false]) test(`recovers the exact failed refund without another provider call (storage available: ${storageAvailable})`, async ({ page }) => {
  const database = `cyclereg_failed_refund_${process.pid}_${Date.now()}_e2e`;
  const url = new URL(process.env.E2E_DATABASE_URL ?? TEST_SERVER_URL);
  expect(['localhost', '127.0.0.1', '::1', '[::1]']).toContain(url.hostname);
  const admin = new pg.Client({ connectionString: adminUrl(url.toString()) });
  await admin.connect();
  let created = false;
  let app: ReturnType<typeof buildApp>['app'] | undefined;
  let refundCalls = 0;
  try {
    await admin.query(`CREATE DATABASE "${database}"`); created = true;
    url.pathname = `/${database}`;
    const provider: PaymentProvider = {
      mode: 'stripe_test',
      async createCheckout(req) { return { id: 'cs_fake_failed_refund', url: 'https://checkout.fictional.test/session', expiresAt: new Date(req.expiresAt * 1000).toISOString() }; },
      async refund(req) { refundCalls++; return { providerId: 're_fake_failed_refund', refundId: req.refundId, status: 'failed', failureReason: 'Fictional provider rejection' }; },
      parseWebhook(raw, signature) { if (signature !== 'fictional-test-notification') throw new HttpError(400, 'Fictional signature refused.'); return JSON.parse(raw) as ProviderEvent; },
    };
    app = buildApp({ databaseUrl: url.toString(), serveWeb: true, auth: fakeAuth(), payments: provider, email: localEmail(), appUrl: 'http://127.0.0.1', now: () => new Date('2027-03-01T18:00:00Z') }).app;
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const call = (method: 'GET' | 'POST', path: string, payload?: object) => app!.inject({ method, url: path, headers: as(E2E_ORGANIZER), payload });
    const { eventId } = (await call('POST', '/api/demo')).json();
    expect((await call('POST', `/api/events/${eventId}/publish`, { acknowledgeWarnings: true })).statusCode).toBe(200);
    const { config } = (await call('GET', `/api/events/${eventId}`)).json();
    const ordered = await call('POST', `/api/rider/events/${eventId}/orders`, {
      clientRequestId: 'failed-refund-browser-order', categoryIds: [config.categories.find((c: { timingCode: string }) => c.timingCode === 'RR-M35-34').id],
      rider: { firstName: 'Failed', lastName: 'Fictional', email: 'failed@fictional.test', team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Example Contact', phone: '555-555-0199' } },
      waiver: { version: config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Failed Fictional', signerRole: 'rider' },
    });
    expect(ordered.statusCode).toBe(201);
    const order = ordered.json();
    expect((await call('POST', `/api/orders/${order.id}/checkout-session`)).statusCode).toBe(200);
    const paid = await app.inject({ method: 'POST', url: '/api/payments/stripe/webhook', headers: { 'content-type': 'application/json', 'stripe-signature': 'fictional-test-notification' }, payload: JSON.stringify({ id: 'evt_fake_paid_refund', type: 'checkout.session.completed', outcome: 'paid', sessionId: 'cs_fake_failed_refund', orderId: order.id, amountCents: order.totalCents, currency: 'usd', paymentRef: 'pi_fake_failed_refund' } satisfies ProviderEvent) });
    expect(paid.statusCode).toBe(200);
    if (!storageAvailable) await page.addInitScript(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith('cyclereg.refund.')) throw new DOMException('Fictional blocked storage', 'SecurityError');
        return original.call(this, key, value);
      };
    });
    await page.goto(`${address}/#/events/${order.eventId}/registrations`);
    await page.getByRole('button', { name: 'Refund Failed Fictional', exact: true }).click();
    await page.getByLabel('Amount (USD)').fill('1.00');
    await page.getByLabel('Reason for the refund (required)').fill('Fictional failed provider result');
    let interrupted = true;
    let body: { clientRequestId: string } | undefined;
    await page.route(`**/api/orders/${order.id}/refunds`, async (route) => {
      if (!interrupted) return route.continue();
      if (route.request().method() === 'POST') {
        body = route.request().postDataJSON();
        const saved = await route.fetch(); expect(saved.ok()).toBe(true);
      }
      await route.abort('failed');
    });
    await page.getByRole('button', { name: 'Refund', exact: true }).click();
    const recovery = page.getByRole('region', { name: 'Recover refund for Failed Fictional' });
    await expect(recovery.getByRole('button', { name: 'Retry original refund' })).toBeEnabled();
    expect(refundCalls).toBe(1);
    if (storageAvailable) await page.reload();
    else expect(await page.evaluate(() => Object.keys(sessionStorage).filter((key) => key.startsWith('cyclereg.refund.')))).toEqual([]);
    await expect(recovery).toBeVisible();
    await expect(recovery).toContainText('when browser storage is available');
    for (const theme of ['light', 'dark']) {
      const toggle = page.getByRole('button', { name: /^Theme: / });
      await expect(toggle).toBeVisible();
      if (await toggle.getAttribute('data-current') !== theme) await toggle.click();
      await expect(toggle).toHaveAttribute('data-current', theme);
      for (const width of [360, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        await recovery.screenshot({ path: `test-results/failed-refund-${theme}-${width}.png` });
      }
      expect((await new AxeBuilder({ page }).include('[aria-label="Recover refund for Failed Fictional"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
    }
    interrupted = false;
    await recovery.getByRole('button', { name: 'Retry original refund' }).focus();
    await page.keyboard.press('Enter');
    await expect(recovery).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: 'Last refund request:' })).toContainText('Failed');
    await expect(page.getByRole('button', { name: 'Refund Failed Fictional', exact: true })).toBeFocused();
    const history = await (await call('GET', `/api/orders/${order.id}/refunds`)).json();
    expect(history.refunds).toHaveLength(1);
    expect(history.refunds[0]).toMatchObject({ clientRequestId: body!.clientRequestId, amountCents: 100, status: 'failed', failureReason: 'Fictional provider rejection' });
    expect(refundCalls).toBe(1);
    const after = (await call('GET', `/api/orders/${order.id}`)).json();
    expect(after.status).toBe('confirmed');
    expect(after.entries.map((entry: { status: string }) => entry.status)).toEqual(['confirmed']);
    expect(after.totalCents).toBe(order.totalCents);
    expect(await page.evaluate(() => Object.keys(sessionStorage).filter((key) => key.startsWith('cyclereg.refund.')))).toEqual([]);
  } finally {
    try { await app?.close(); }
    finally { try { if (created) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`); } finally { await admin.end(); } }
  }
});
