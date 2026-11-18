import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from './fixtures';
import type { CancellationExecutionInput } from '../src/shared/cancellations';

async function setup(page: Page, policy: 'full_refund' | 'credit' | null = 'full_refund', keepTests = false) {
  const { eventId, organizationId } = await (await page.request.post('/api/demo')).json();
  if (!keepTests) expect((await page.request.delete(`/api/events/${eventId}/test-entries`)).status()).toBe(200);
  const event = await (await page.request.get(`/api/events/${eventId}`)).json();
  event.config.registration.refundRules = policy ? { tiers: [], returnAs: 'cash', organizerCancellation: policy } : null;
  expect((await page.request.put(`/api/events/${eventId}/config`, { data: { revision: event.revision, config: event.config } })).status()).toBe(200);
  expect((await page.request.post(`/api/events/${eventId}/publish`, { data: { acknowledgeWarnings: true } })).status()).toBe(200);
  const cat = event.config.categories.find((c: { timingCode: string }) => c.timingCode === 'RR-M35-34');
  const rider = { firstName: 'Execution', lastName: 'Fictional', email: 'execution@example.test', team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Fictional Contact', phone: '555-555-0199' } };
  const created = await page.request.post(`/api/rider/events/${eventId}/orders`, { data: { clientRequestId: `execution-screen-${eventId}`, categoryIds: [cat.id], rider, waiver: { version: event.config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Execution Fictional', signerRole: 'rider' } } });
  expect(created.status()).toBe(201); const order = await created.json();
  expect((await page.request.post(`/api/orders/${order.id}/payment`, { data: { attemptId: `execution-pay-${eventId}`, outcome: 'success' } })).status()).toBe(200);
  await page.goto(`/#/events/${eventId}/registrations`);
  const preview = page.getByRole('region', { name: 'Cancellation preview', exact: true });
  const confirmation = page.getByRole('region', { name: 'Reviewed plan confirmation', exact: true });
  await preview.getByRole('button', { name: 'Preview cancellation impact', exact: true }).click();
  await confirmation.getByLabel('Reason for the reviewed plan').fill('Fictional weather cancellation'); await confirmation.getByRole('checkbox').check();
  const savedPlan = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/cancellation-confirmations'));
  await confirmation.getByRole('button', { name: 'Record plan confirmation' }).click();
  const plan = await (await savedPlan).json();
  await expect(confirmation.getByRole('status', { name: 'Plan confirmation status' })).toContainText('Reviewed plan recorded.');
  const execution = page.getByRole('region', { name: 'Simulated cancellation execution', exact: true });
  return { eventId, organizationId, order, plan, preview, confirmation, execution,
    check: () => execution.getByRole('button', { name: 'Check execution eligibility', exact: true }).click(),
    acknowledge: () => execution.getByRole('checkbox').check(),
    execute: () => execution.getByRole('button', { name: 'Execute simulated cancellation', exact: true }).click(),
  };
}

async function inspect(page: Page, state: string) {
  const region = page.getByRole('region', { name: 'Simulated cancellation execution', exact: true });
  for (const theme of ['light', 'dark']) {
    const toggle = page.getByRole('button', { name: /^Theme: / }); if (await toggle.getAttribute('data-current') !== theme) await toggle.click();
    await expect(toggle).toHaveAttribute('data-current', theme);
    for (const width of [360, 1440]) {
      await page.setViewportSize({ width, height: 1200 }); expect(await page.locator('body').evaluate((e) => e.scrollWidth <= innerWidth)).toBe(true);
      await region.screenshot({ path: `test-results/execution-controls-${state}-${theme}-${width}.png`, animations: 'disabled' });
      expect((await new AxeBuilder({ page }).include('[aria-label="Simulated cancellation execution"]').analyze()).violations).toEqual([]);
    }
  }
}

test('checks actual eligibility, requires a separate acknowledgement, executes and restores verified evidence', async ({ page }) => {
  const s = await setup(page); let posts = 0; page.on('request', (r) => { if (r.method() === 'POST' && r.url().endsWith('/cancellation-executions')) posts++; });
  await expect(s.execution.getByRole('button', { name: 'Execute simulated cancellation' })).toHaveCount(0);
  await s.check();
  await expect(s.execution.getByText('1 active entry will be cancelled', { exact: false })).toBeVisible();
  await s.execute(); await expect(s.execution.getByRole('checkbox')).toHaveAttribute('aria-invalid', 'true'); expect(posts).toBe(0);
  await inspect(page, 'eligible'); await s.acknowledge(); await s.execution.getByRole('button', { name: 'Execute simulated cancellation', exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(s.execution.getByRole('status', { name: 'Execution status' })).toHaveText('Simulated cancellation recorded.');
  await expect(page.getByText('Cancelled by organizer', { exact: true })).toBeVisible(); expect(posts).toBe(1);
  await inspect(page, 'recorded'); await page.reload();
  await expect(s.execution.getByRole('status', { name: 'Execution status' })).toHaveText('Simulated cancellation recorded.'); expect(posts).toBe(1);
  const saved = (await (await page.request.get(`/api/events/${s.eventId}/cancellation-confirmations/${s.plan.id}/execution-check`)).json()).execution;
  await s.confirmation.getByRole('button', { name: 'Review another plan' }).click(); await expect(s.execution).toHaveCount(0);
  await s.preview.getByRole('button', { name: 'Preview cancellation impact', exact: true }).click();
  await s.confirmation.getByLabel('Reason for the reviewed plan').fill('Fictional separate review'); await s.confirmation.getByRole('checkbox').check();
  await s.confirmation.getByRole('button', { name: 'Record plan confirmation' }).click(); await s.check(); await expect(s.execution).toContainText('overlaps a previous cancellation');
  expect((await page.request.get(`/api/events/${s.eventId}/cancellation-executions/${saved.id}`)).status()).toBe(200); expect(posts).toBe(1);
});

test('keeps an unknown original request across refresh and never treats a missing result as proof of refusal', async ({ page }) => {
  const s = await setup(page); await s.check(); await s.acknowledge(); let body!: CancellationExecutionInput; let posts = 0;
  await page.route(`**/api/events/${s.eventId}/cancellation-executions`, async (route) => { posts++; body = route.request().postDataJSON(); return route.abort('failed'); });
  await s.execute(); await expect(s.execution.getByRole('alert')).toContainText('unresolved');
  await s.execution.getByRole('button', { name: 'Check saved execution result' }).click();
  await expect(s.execution.getByRole('alert')).toContainText('may still be running');
  await expect(s.confirmation.getByRole('button', { name: 'Review another plan' })).toHaveAttribute('aria-disabled', 'true');
  await page.reload(); await expect(s.execution.getByText('The original execution result needs resolution.')).toBeVisible(); expect(posts).toBe(1);
  const original = body; await page.unroute(`**/api/events/${s.eventId}/cancellation-executions`);
  let retried: CancellationExecutionInput | null = null; page.on('request', (r) => { if (r.method() === 'POST' && r.url().endsWith('/cancellation-executions')) retried = r.postDataJSON(); });
  await s.execution.getByRole('button', { name: 'Retry original execution request' }).click();
  await expect(s.execution.getByRole('status', { name: 'Execution status' })).toHaveText('Simulated cancellation recorded.'); expect(retried).toEqual(original);
});


test('recovers a committed lost response without duplicate submission or another write', async ({ page }) => {
  const s = await setup(page); await s.check(); await s.acknowledge(); let posts = 0; let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; }); let committed = false;
  await page.route(`**/api/events/${s.eventId}/cancellation-executions`, async (route) => { posts++; const response = await route.fetch(); expect(response.status()).toBe(200); committed = true; await gate; await route.abort('failed'); });
  try {
    await s.execute(); await expect.poll(() => committed).toBe(true);
    const retry = s.execution.getByRole('button', { name: 'Retry original execution request' }); await expect(retry).toHaveAttribute('aria-disabled', 'true');
    await retry.evaluate((b: HTMLButtonElement) => { b.click(); b.click(); }); expect(posts).toBe(1);
    await inspect(page, 'pending');
  } finally { release(); }
  await expect(s.execution.getByRole('alert')).toContainText('unresolved'); await page.reload(); expect(posts).toBe(1);
  await s.execution.getByRole('button', { name: 'Check saved execution result' }).click();
  await expect(s.execution.getByRole('status', { name: 'Execution status' })).toHaveText('Simulated cancellation recorded.'); expect(posts).toBe(1);
  expect((await (await page.request.get(`/api/orders/${s.order.id}`)).json()).refunds).toHaveLength(1);
});

test('requires a fresh review after a server-proven stale refusal', async ({ page }) => {
  const s = await setup(page); await s.check(); await s.acknowledge();
  expect((await page.request.post(`/api/order-entries/${s.order.entries[0].id}/withdraw`, { data: { reason: 'Fictional changed impact' } })).status()).toBe(200);
  await s.execute(); await expect(s.execution.getByRole('alert')).toContainText('This execution request did not run.');
  await expect(s.execution.getByRole('button', { name: 'Execute simulated cancellation' })).toHaveCount(0);
  await expect(s.confirmation.getByRole('button', { name: 'Review another plan' })).toHaveAttribute('aria-disabled', 'false');
  await inspect(page, 'refused'); await s.confirmation.getByRole('button', { name: 'Review another plan' }).click();
  await expect(s.preview.getByRole('button', { name: 'Preview cancellation impact', exact: true })).toBeFocused();
  expect((await (await page.request.get(`/api/orders/${s.order.id}`)).json()).refunds).toEqual([]);
});

for (const policy of ['credit', null] as const) test(`blocks an unsupported accepted policy (${policy})`, async ({ page }) => {
  const s = await setup(page, policy); let posts = 0; page.on('request', (r) => { if (r.method() === 'POST' && r.url().endsWith('/cancellation-executions')) posts++; });
  await s.check(); await expect(s.execution).toContainText('does not support automatic simulated cash return');
  await expect(s.execution.getByRole('button', { name: 'Execute simulated cancellation' })).toHaveCount(0); expect(posts).toBe(0);
  if (policy === 'credit') await inspect(page, 'blocked');
});

test('blocks selected test capacity through the same operational checks as execution', async ({ page }) => {
  const s = await setup(page, 'full_refund', true); await s.check(); await expect(s.execution).toContainText('Remove the selected test entries');
  await expect(s.execution.getByRole('button', { name: 'Execute simulated cancellation' })).toHaveCount(0);
});

test('preserves saved evidence lookup failures and retry focus', async ({ page }) => {
  const s = await setup(page); await s.check(); await s.acknowledge(); await s.execute();
  await expect(s.execution.getByRole('status', { name: 'Execution status' })).toHaveText('Simulated cancellation recorded.'); let reads = 0;
  await page.route(`**/api/events/${s.eventId}/cancellation-executions/*`, (route) => ++reads <= 2 ? route.fulfill({ status: 503, json: { error: 'Fictional evidence lookup failure' } }) : route.continue());
  await page.reload(); await expect(s.execution.getByRole('alert')).toContainText('Saved execution evidence could not be loaded');
  const retry = s.execution.getByRole('button', { name: 'Retry execution evidence lookup' }); await retry.click();
  await expect(s.execution.getByRole('alert')).toContainText('Fictional evidence lookup failure'); await expect(retry).toBeFocused();
  await inspect(page, 'lookup-error'); await retry.click(); await expect(s.execution.getByRole('status', { name: 'Execution status' })).toHaveText('Simulated cancellation recorded.'); expect(reads).toBe(3);
});

test('keeps the original request in memory when execution storage is blocked', async ({ page }) => {
  await page.addInitScript(() => {
    const get = Storage.prototype.getItem; const set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) { if (key.startsWith('cyclereg.cancellation-execution.')) throw new DOMException('Blocked', 'SecurityError'); return get.call(this, key); };
    Storage.prototype.setItem = function (key, value) { if (key.startsWith('cyclereg.cancellation-execution.')) throw new DOMException('Blocked', 'SecurityError'); return set.call(this, key, value); };
  });
  const s = await setup(page); await expect(s.execution).toContainText('Browser storage is unavailable'); await s.check(); await s.acknowledge(); let original!: CancellationExecutionInput;
  await page.route(`**/api/events/${s.eventId}/cancellation-executions`, async (route) => { original = route.request().postDataJSON(); return route.abort('failed'); });
  await s.execute(); await expect(s.execution.getByRole('alert')).toContainText('unresolved'); await inspect(page, 'blocked-storage');
  await page.unroute(`**/api/events/${s.eventId}/cancellation-executions`); let retried: CancellationExecutionInput | null = null;
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().endsWith('/cancellation-executions')) retried = r.postDataJSON(); });
  await s.execution.getByRole('button', { name: 'Retry original execution request' }).click();
  await expect(s.execution.getByRole('status', { name: 'Execution status' })).toHaveText('Simulated cancellation recorded.'); expect(retried).toEqual(original);
});

for (const raw of ['{bad-json', '{"state":"recorded","id":"../../members","confirmationId":"plan_fake"}']) test(`blocks corrupt execution recovery (${raw})`, async ({ page }) => {
  const s = await setup(page); const account = (await (await page.request.get('/api/me')).json()).account;
  await page.evaluate(({ key, value }) => sessionStorage.setItem(key, value), { key: `cyclereg.cancellation-execution.${account.id}.${s.eventId}`, value: raw }); await page.reload();
  await expect(s.execution).toContainText('Saved execution recovery data is unreadable'); await expect(s.execution.getByRole('button')).toHaveCount(0);
  await expect(s.confirmation.getByRole('button', { name: 'Review another plan' })).toHaveAttribute('aria-disabled', 'true');
  if (raw === '{bad-json') await inspect(page, 'corrupt-storage');
});

test('loads another operator’s verified execution rather than submitting a new request', async ({ page }) => {
  const s = await setup(page); const email = 'other-finance@execution.test';
  expect((await page.request.post(`/api/organizations/${s.organizationId}/members`, { data: { email, role: 'finance' } })).status()).toBe(200);
  await page.request.get('/api/me', { headers: { Authorization: `Bearer test:${email}` } });
  expect((await page.request.post(`/api/events/${s.eventId}/cancellation-executions`, { headers: { Authorization: `Bearer test:${email}` }, data: { clientRequestId: `other-operator-${s.eventId}`, confirmationId: s.plan.id, acknowledgeSimulatedCancellation: true } })).status()).toBe(200);
  let posts = 0; page.on('request', (r) => { if (r.method() === 'POST' && r.url().endsWith('/cancellation-executions')) posts++; });
  await s.check(); await expect(s.execution).toContainText('by another account.'); await expect(s.execution.getByRole('status', { name: 'Execution status' })).toHaveText('Simulated cancellation recorded.'); expect(posts).toBe(0);
});

test('keeps the execution outcome when refreshing registrations fails', async ({ page }) => {
  const s = await setup(page); await s.check(); await s.acknowledge();
  await page.route(`**/api/events/${s.eventId}/orders`, (route) => route.fulfill({ status: 503, json: { error: 'Fictional registration refresh failed' } }));
  await s.execute(); await expect(s.execution.getByRole('status', { name: 'Execution status' })).toHaveText('Simulated cancellation recorded.');
  await expect(page.getByText('Fictional registration refresh failed', { exact: true })).toBeVisible();
  await page.unroute(`**/api/events/${s.eventId}/orders`); await s.execution.getByRole('button', { name: 'Refresh registrations' }).click();
  await expect(page.getByText('Cancelled by organizer', { exact: true })).toBeVisible();
});

test('preserves a conflicting request instead of interpreting every 409 as unexecuted', async ({ page }) => {
  const s = await setup(page); await s.check(); await s.acknowledge();
  const event = await (await page.request.get(`/api/events/${s.eventId}`)).json();
  const raceId = event.config.categories.find((c: { timingCode: string }) => c.timingCode === 'CR-M35-34').raceId;
  const preview = await (await page.request.post(`/api/events/${s.eventId}/cancellation-confirmation-preview`, { data: { scope: 'race', raceId } })).json();
  const alternate = await (await page.request.post(`/api/events/${s.eventId}/cancellation-confirmations`, { data: { clientRequestId: `alternate-plan-${s.eventId}`, selection: preview.preview.selection, previewFingerprint: preview.fingerprint, reason: 'Fictional other scope', acknowledgePlanOnly: true } })).json();
  let posts = 0;
  await page.route(`**/api/events/${s.eventId}/cancellation-executions`, async (route) => {
    posts++; const original: CancellationExecutionInput = route.request().postDataJSON();
    const prior = await page.request.post(`/api/events/${s.eventId}/cancellation-executions`, { data: { ...original, confirmationId: alternate.id } }); expect(prior.status()).toBe(200);
    await route.continue();
  });
  await s.execute(); await expect(s.execution.getByRole('alert')).toContainText('unresolved');
  await expect(s.execution.getByRole('alert')).toContainText('different plan');
  await s.execution.getByRole('button', { name: 'Check saved execution result' }).click(); await expect(s.execution.getByRole('alert')).toContainText('may still be running');
  await page.reload(); await expect(s.execution.getByText('The original execution result needs resolution.')).toBeVisible(); expect(posts).toBe(1);
});

test('isolates unknown execution intent by event and authoritative account', async ({ page, browser }) => {
  const s = await setup(page); await s.check(); await s.acknowledge(); let posts = 0;
  await page.route(`**/api/events/${s.eventId}/cancellation-executions`, async (route) => { posts++; return route.abort('failed'); });
  await s.execute(); await expect(s.execution.getByRole('alert')).toContainText('unresolved');
  const other = await setup(page); await expect(other.execution.getByRole('button', { name: 'Retry original execution request' })).toHaveCount(0); expect(posts).toBe(1);
  const email = 'isolated-finance@execution.test'; await page.request.post(`/api/organizations/${s.organizationId}/members`, { data: { email, role: 'finance' } });
  await page.request.get('/api/me', { headers: { Authorization: `Bearer test:${email}` } });
  const items = await page.evaluate(() => Object.fromEntries(Object.entries(sessionStorage)));
  const context = await browser.newContext({ extraHTTPHeaders: { Authorization: `Bearer test:${email}` } });
  await context.addInitScript(({ saved, account }) => { for (const [key, value] of Object.entries(saved)) sessionStorage.setItem(key, value); sessionStorage.setItem('cyclereg.test-session', account); }, { saved: items, account: email });
  const financePage = await context.newPage(); let financePosts = 0;
  financePage.on('request', (r) => { if (r.method() === 'POST' && r.url().endsWith('/cancellation-executions')) financePosts++; });
  try {
    await financePage.goto(`/#/events/${s.eventId}/registrations`);
    await expect(financePage.getByRole('region', { name: 'Reviewed plan confirmation', exact: true })).toContainText('Load and review a current cancellation preview');
    await financePage.getByRole('button', { name: 'Preview cancellation impact', exact: true }).click();
    await expect(financePage.getByLabel('Reason for the reviewed plan')).toBeVisible();
    await expect(financePage.getByRole('region', { name: 'Simulated cancellation execution', exact: true })).toHaveCount(0); expect(financePosts).toBe(0);
  } finally { await context.close(); }
});

test('ignores an older eligibility response after starting another plan review', async ({ page }) => {
  const s = await setup(page); let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; }); let captured = false;
  const oldResponse = page.waitForResponse((r) => r.url().includes(`/cancellation-confirmations/${s.plan.id}/execution-check`));
  await page.route(`**/api/events/${s.eventId}/cancellation-confirmations/${s.plan.id}/execution-check`, async (route) => { const response = await route.fetch(); captured = true; await gate; await route.fulfill({ response }); });
  try {
    await s.check(); await expect.poll(() => captured).toBe(true);
    await s.confirmation.getByRole('button', { name: 'Review another plan' }).click();
    await s.preview.getByRole('button', { name: 'Preview cancellation impact', exact: true }).click();
    await s.confirmation.getByLabel('Reason for the reviewed plan').fill('Fictional newer plan review'); await s.confirmation.getByRole('checkbox').check();
    await s.confirmation.getByRole('button', { name: 'Record plan confirmation' }).click();
    await s.check(); await expect(s.execution.getByRole('button', { name: 'Execute simulated cancellation' })).toBeVisible();
  } finally { release(); }
  await (await oldResponse).finished(); await page.screenshot({ path: 'test-results/execution-newer-review.png', animations: 'disabled' });
  await expect(s.execution).toContainText('Fictional newer plan review');
  await expect(s.execution.getByRole('button', { name: 'Execute simulated cancellation' })).toBeVisible();
});

test('recovers a lost terminal refusal by retrying the exact original request', async ({ page }) => {
  const s = await setup(page); await s.check(); await s.acknowledge();
  await page.request.post(`/api/order-entries/${s.order.entries[0].id}/withdraw`, { data: { reason: 'Fictional changed impact' } });
  let original!: CancellationExecutionInput;
  await page.route(`**/api/events/${s.eventId}/cancellation-executions`, async (route) => { original = route.request().postDataJSON(); const response = await route.fetch(); expect(response.status()).toBe(409); expect((await response.json()).details.code).toBe('cancellation_not_executed'); await route.abort('failed'); });
  await s.execute(); await expect(s.execution.getByRole('alert')).toContainText('unresolved'); await page.reload();
  await s.execution.getByRole('button', { name: 'Check saved execution result' }).click(); await expect(s.execution.getByRole('alert')).toContainText('may still be running');
  await page.unroute(`**/api/events/${s.eventId}/cancellation-executions`); let retry: CancellationExecutionInput | null = null;
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().endsWith('/cancellation-executions')) retry = r.postDataJSON(); });
  await s.execution.getByRole('button', { name: 'Retry original execution request' }).click();
  await expect(s.execution.getByRole('alert')).toContainText('This execution request did not run.'); expect(retry).toEqual(original);
  await expect(s.confirmation.getByRole('button', { name: 'Review another plan' })).toHaveAttribute('aria-disabled', 'false');
  expect((await (await page.request.get(`/api/orders/${s.order.id}`)).json()).refunds).toEqual([]);
});
