import { expect, test } from './fixtures';

/*
 * Race-day check-in search. A barcode scanner types the check-in code and presses Enter at once,
 * before the debounced search has returned, so Enter must look up the typed text itself.
 */

type Rider = { orderId: string; name: string; checkInCode: string; result: { ready: boolean } };

test('Enter right after a scanned code or a unique name opens that rider', async ({ page }) => {
  const api = page.request;
  const { eventId } = await (await api.post('/api/demo')).json();
  await api.post(`/api/events/${eventId}/publish`, { data: { acknowledgeWarnings: true } });
  await api.post(`/api/events/${eventId}/check-in-demo-riders`);
  await api.put(`/api/events/${eventId}/bib-settings`, { data: { scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 299 }] } });
  const list = await (await api.get(`/api/events/${eventId}/check-in?q=`)).json();
  const riders: Rider[] = list.riders;
  expect(riders.length).toBeGreaterThan(1);
  const ready = riders.find((r) => r.result.ready)!;
  const blocked = riders.find((r) => !r.result.ready)!;

  await page.goto(`/#/events/${eventId}/check-in`);
  const search = page.getByRole('searchbox', { name: 'Find a rider' });
  const detail = page.getByRole('region', { name: 'Rider check-in' });
  await expect(page.getByText(`${riders.length} riders on`)).toBeVisible();

  // Scanner style: lowercase code without the dash, Enter with no pause.
  await search.fill(ready.checkInCode.replace('-', '').toLowerCase());
  await search.press('Enter');
  await expect(detail).toContainText(ready.name);
  await expect(detail).toContainText('Ready to race');

  await detail.getByRole('button', { name: /Check in and issue/ }).click();
  await detail.getByRole('button', { name: 'Next rider' }).click();
  await expect(search).toBeFocused();

  // A unique name works the same way, and a blocked rider gets no check-in button.
  await search.fill(blocked.name);
  await search.press('Enter');
  await expect(detail).toContainText(blocked.name);
  await expect(detail).toContainText('Not ready');
  await expect(detail.getByRole('button', { name: /Check in and issue/ })).toHaveCount(0);
});

test('fallback roster lists every rider and puts blocked riders on the exception checklist', async ({ page }) => {
  const api = page.request;
  const { eventId } = await (await api.post('/api/demo')).json();
  await api.post(`/api/events/${eventId}/publish`, { data: { acknowledgeWarnings: true } });
  await api.post(`/api/events/${eventId}/check-in-demo-riders`);
  const list = await (await api.get(`/api/events/${eventId}/check-in?q=`)).json();
  const riders: Rider[] = list.riders;
  const blocked = riders.find((r) => !r.result.ready)!;

  await page.goto(`/#/events/${eventId}/check-in`);
  await page.getByRole('link', { name: 'Fallback roster' }).click();
  const day = page.getByRole('region', { name: /^Roster for / }).first();
  await expect(day).toContainText('Fallback roster printed');
  for (const r of riders) await expect(day.getByRole('cell', { name: r.name, exact: true }).first()).toBeVisible();
  await expect(day.getByRole('heading', { name: 'Exception checklist' })).toBeVisible();
  await expect(day).toContainText(`NOT READY`);
  await expect(day.locator('table').nth(1)).toContainText(blocked.name);
  await expect(page.getByRole('button', { name: 'Print roster' })).toBeEnabled();
  await expect(page.locator('body')).not.toContainText('@example.com');
});
