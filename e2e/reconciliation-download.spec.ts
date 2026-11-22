import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { parseCsv } from '../src/shared/csv';
import { expect, test, type Page } from './fixtures';
import { publishReviewed } from './support/publish';

async function fixture(page: Page) {
  const { eventId, organizationId } = await (await page.request.post('/api/demo')).json();
  expect((await publishReviewed(page.request, `/api/events/${eventId}`, { acknowledgeWarnings: true })).status()).toBe(200);
  const { config } = await (await page.request.get(`/api/events/${eventId}`)).json();
  const created = await page.request.post(`/api/rider/events/${eventId}/orders`, { data: {
    clientRequestId: `recon-control-order-${eventId}`, categoryIds: [config.categories.find((c: { timingCode: string }) => c.timingCode === 'RR-M35-34').id],
    rider: { firstName: 'Download', lastName: 'Fictional', email: 'download@example.test', team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Fictional Contact', phone: '555-555-0199' } },
    waiver: { version: config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Download Fictional', signerRole: 'rider' },
  } });
  expect(created.status()).toBe(201); const order = await created.json();
  expect((await page.request.post(`/api/orders/${order.id}/payment`, { data: { attemptId: `recon-control-pay-${eventId}`, outcome: 'success' } })).status()).toBe(200);
  return { eventId, organizationId, order };
}

test('owner downloads the full event evidence with progress, interpretation and responsive access', async ({ page }) => {
  const s = await fixture(page); await page.goto(`/#/events/${s.eventId}/registrations`);
  const section = page.getByRole('region', { name: 'Local reconciliation records' });
  await expect(section).toBeVisible();
  await expect(section).toContainText('Registration search and filters do not narrow this file.');
  await expect(section).toContainText('do not sum amounts across kinds');
  await expect(section).toContainText('Blank amounts mean unknown.');
  await page.getByRole('searchbox', { name: 'Find a registration' }).fill('No matching fictional rider');
  await page.getByRole('button', { name: /^Unpaid holds/ }).click();
  const before = await (await page.request.get(`/api/orders/${s.order.id}`)).json();
  let release!: () => void; const gate = new Promise<void>((r) => { release = r; }); let gets = 0;
  await page.route(`**/api/events/${s.eventId}/exports/reconciliation.csv`, async (route) => { gets++; await gate; await route.continue(); });
  const button = section.getByRole('button', { name: 'Download local records (CSV)', exact: true });
  expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await button.focus(); await page.keyboard.press('Enter');
  await expect(section.getByRole('button', { name: 'Preparing CSV…' })).toBeDisabled();
  await expect(section.getByRole('status')).toContainText('Preparing local records'); await expect.poll(() => gets).toBe(1);
  await expect(section.getByRole('button', { name: 'Preparing CSV…' })).toBeFocused();
  await page.keyboard.press('Enter');
  const preparing = section.getByRole('button', { name: 'Preparing CSV…' });
  await expect(preparing).toHaveCSS('background-color', 'rgb(241, 241, 250)');
  await section.screenshot({ path: 'test-results/reconciliation-control-preparing.png' });
  // Switch the root theme without reloading the page or interrupting the held request.
  await page.locator('html').evaluate((root) => root.setAttribute('data-theme', 'dark'));
  await page.setViewportSize({ width: 360, height: 1000 });
  await expect(preparing).toHaveCSS('background-color', 'rgb(36, 37, 61)');
  await expect(preparing).toBeFocused();
  expect(await section.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).include('[aria-labelledby="reconciliation-records-title"]').analyze()).violations).toEqual([]);
  await section.screenshot({ path: 'test-results/reconciliation-control-preparing-dark-360.png' });
  await page.locator('html').evaluate((root) => root.setAttribute('data-theme', 'light'));
  await page.setViewportSize({ width: 1440, height: 900 });
  const pending = page.waitForEvent('download'); release(); const download = await pending;
  expect(download.suggestedFilename()).toContain('-reconciliation-LOCAL-RECORDS-DEMO.csv');
  const text = await readFile((await download.path())!, 'utf8'); const [header, ...rows] = parseCsv(text);
  expect(header).toContain('basis'); expect(rows).toHaveLength(1);
  expect(rows[0][header.indexOf('order_id')]).toBe(s.order.id);
  expect(rows[0][header.indexOf('basis')]).toBe('local_record_not_provider_settlement');
  await expect(section.getByRole('status')).toContainText('Download requested.');
  await expect(button).toBeFocused();
  await section.screenshot({ path: 'test-results/reconciliation-control-requested.png' });
  expect(await (await page.request.get(`/api/orders/${s.order.id}`)).json()).toEqual(before);
  expect(gets, 'only the initial activation should request the CSV').toBe(1);
  await page.unroute(`**/api/events/${s.eventId}/exports/reconciliation.csv`);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => localStorage.setItem('cyclereg-theme', theme), theme); await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme); await expect(section).toBeVisible();
    for (const width of [360, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await section.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
      expect((await new AxeBuilder({ page }).include('[aria-labelledby="reconciliation-records-title"]').analyze()).violations).toEqual([]);
      await section.screenshot({ path: `test-results/reconciliation-control-${theme}-${width}.png` });
    }
  }
});

test('failed read is visible and a retry requests the same event file', async ({ page }) => {
  const s = await fixture(page); await page.goto(`/#/events/${s.eventId}/registrations`);
  const section = page.getByRole('region', { name: 'Local reconciliation records' }); let fail = true; let gets = 0;
  await page.route(`**/api/events/${s.eventId}/exports/reconciliation.csv`, (route) => { gets++; return fail ? route.abort() : route.continue(); });
  await section.getByRole('button', { name: 'Download local records (CSV)' }).click();
  await expect(section.getByRole('alert')).toContainText('Refresh this page to check your access.');
  await expect(section.getByRole('status')).not.toContainText('Download requested');
  await page.setViewportSize({ width: 360, height: 1000 });
  expect((await new AxeBuilder({ page }).include('[aria-labelledby="reconciliation-records-title"]').analyze()).violations).toEqual([]);
  await section.screenshot({ path: 'test-results/reconciliation-control-error-360.png' });
  fail = false; const pending = page.waitForEvent('download');
  await section.getByRole('button', { name: 'Download local records (CSV)' }).click(); await pending;
  await expect(section.getByRole('alert')).toHaveCount(0); expect(gets).toBe(2);
});

test('finance can download while registration managers cannot, and revocation is enforced on download', async ({ page, browser }) => {
  const s = await fixture(page);
  for (const role of ['registration_manager', 'finance'] as const) {
    const email = `recon-control-${role}@example.test`;
    const context = await browser.newContext({ extraHTTPHeaders: { Authorization: `Bearer test:${email}` } });
    try {
      await context.request.get('/api/me');
      expect((await page.request.post(`/api/organizations/${s.organizationId}/members`, { data: { email, role } })).status()).toBe(200);
      const member = await context.newPage(); await member.addInitScript((email) => sessionStorage.setItem('cyclereg.test-session', email), email);
      await member.goto(`/#/events/${s.eventId}/registrations`);
      await expect(member.getByRole('heading', { name: 'Registrations', exact: true })).toBeVisible();
      const section = member.getByRole('region', { name: 'Local reconciliation records' });
      if (role === 'registration_manager') await expect(section).toHaveCount(0);
      else {
        const pending = member.waitForEvent('download'); await section.getByRole('button', { name: 'Download local records (CSV)' }).click(); await pending;
        const team = await (await page.request.get(`/api/organizations/${s.organizationId}/members`)).json();
        const { revision } = team.members.find((m: { email: string; role: string }) => m.email === email && m.role === role);
        expect((await page.request.post(`/api/organizations/${s.organizationId}/members/revoke`, { data: { email, role, revision } })).status()).toBe(200);
        let downloads = 0; member.on('download', () => downloads++);
        const deniedResponse = member.waitForResponse(`**/api/events/${s.eventId}/exports/reconciliation.csv`);
        await section.getByRole('button', { name: 'Download local records (CSV)' }).click();
        const denied = await deniedResponse; expect(denied.status()).toBe(404);
        expect(denied.headers()['content-disposition']).toBeUndefined();
        await expect(section.getByRole('alert')).toContainText((await denied.json()).error); expect(downloads).toBe(0);
      }
    } finally { await context.close(); }
  }
});

test('unpublished events hide the control until publication', async ({ page }) => {
  const { eventId } = await (await page.request.post('/api/demo')).json();
  await page.goto(`/#/events/${eventId}/registrations`);
  await expect(page.getByRole('heading', { name: 'Registrations', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Local reconciliation records' })).toHaveCount(0);
  expect((await publishReviewed(page.request, `/api/events/${eventId}`, { acknowledgeWarnings: true })).status()).toBe(200);
  await page.reload(); await expect(page.getByRole('region', { name: 'Local reconciliation records' })).toBeVisible();
});
