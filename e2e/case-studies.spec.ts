import { expect, test } from './fixtures';
import { parseCsv } from '../src/shared/csv';
import type { CheckInList, CheckInRider } from '../src/shared/checkin';
import type { StartLists } from '../src/server/startlists';
import type { OrderView } from '../src/server/orders';

test('generated omnium supports a complete rider purchase and organizer recovery journey', async ({ page }) => {
  const seeded = await page.request.post('/api/demo/case-studies/omnium');
  expect([200, 201]).toContain(seeded.status());
  const eventId = 'evt_demo_case_omnium';

  await page.goto(`/#/register/${eventId}`);
  await page.getByLabel('Racing age').fill('40');
  await page.getByLabel('License category').selectOption('3');
  await page.getByLabel(/I want the/).check();
  await page.getByRole('checkbox', { name: /DRW-RR-M35/ }).click();
  await expect(page.locator('.error-summary')).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue to racer details' }).click();
  await expect(page.locator('.error-summary')).toContainText('needs one eligible race on each day');
  await page.getByRole('checkbox', { name: /DRW-CR-M35/ }).click();
  await expect(page.locator('.tray .quote__total')).toContainText('$80.25');
  await page.getByRole('button', { name: 'Continue to racer details' }).click();

  await page.getByLabel('First name (required)').fill('Ávery');
  await page.getByLabel('Last name (required)').fill('Example-Longname');
  await page.getByLabel('Email for the receipt (required)').fill('avery@example.test');
  await page.getByLabel('Contact name').fill('Jordan Example');
  await page.getByLabel('Contact phone').fill('202-555-0188');
  await page.getByRole('button', { name: 'Continue to the waiver' }).click();
  await page.getByLabel('I have read the whole waiver').check();
  await page.getByLabel(/Type your full name to sign/).fill('Ávery Example-Longname');
  await page.getByLabel(/agree to this waiver/).check();
  await page.getByRole('button', { name: 'Sign and review the order' }).click();
  await page.getByRole('button', { name: 'Simulate a declined payment' }).click();
  await expect(page.getByRole('alert')).toContainText('declined');
  await page.getByRole('button', { name: /Complete simulated payment/ }).click();
  await expect(page.getByRole('heading', { name: 'You’re entered' })).toBeVisible();
  await expect(page.locator('.done__entry').first()).toContainText('License needs review');

  await page.goto(`/#/events/${eventId}/registrations`);
  await expect(page.getByRole('link', { name: 'Download entries (CSV)' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download ledger (CSV)' })).toBeVisible();
  const order = page.locator('.order', { hasText: 'Ávery Example-Longname' });
  await order.getByRole('button', { name: 'Review license' }).first().click();
  await order.getByRole('textbox').fill('Fictional license reviewed for browser test');
  await order.getByRole('button', { name: 'Mark reviewed' }).click();
  await page.getByRole('button', { name: /^All/ }).click();
  await expect(page.locator('.order', { hasText: 'Ávery Example-Longname' })).toContainText('License reviewed');

  // Continue the fictional two-day desk rehearsal through immutable timer copies and close-out.
  const orders: OrderView[] = await (await page.request.get(`/api/events/${eventId}/orders`)).json();
  const weekend = orders.find((o) => o.rider.firstName === 'Ávery')!;
  expect(weekend.entries).toHaveLength(2);
  for (const entry of weekend.entries.filter((e) => !e.licenseReviewed)) {
    expect((await page.request.post(`/api/order-entries/${entry.id}/license-review`, { data: { note: 'Fictional second-day license review for local rehearsal' } })).status()).toBe(200);
  }
  expect((await page.request.put(`/api/events/${eventId}/bib-settings`, { data: { scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 199 }] } })).status()).toBe(200);
  const first: CheckInList = await (await page.request.get(`/api/events/${eventId}/check-in`)).json();
  expect(new Set(weekend.entries.map((entry) => entry.dayId)).size).toBe(2);
  expect(first.days).toHaveLength(2);
  for (const day of first.days) {
    const list: CheckInList = await (await page.request.get(`/api/events/${eventId}/check-in?day=${day.id}`)).json();
    expect(list.riders.find((r) => r.orderId === weekend.id)?.result.ready).toBe(true);
    const checked = await page.request.post(`/api/events/${eventId}/check-in/${weekend.id}`, { data: { dayId: day.id, bib: null } });
    expect(checked.status()).toBe(200);
    const original: CheckInRider = await checked.json();
    expect(original.bib).toBe(100);
    const repeated = await page.request.post(`/api/events/${eventId}/check-in/${weekend.id}`, { data: { dayId: day.id, bib: null } });
    expect(repeated.status()).toBe(200);
    expect(await repeated.json()).toMatchObject({ bib: 100, checkedInAt: original.checkedInAt });
  }
  const currentCsv = await page.request.get(`/api/events/${eventId}/start-lists/all/csv`);
  expect(currentCsv.status()).toBe(200);
  const [header, ...rows] = parseCsv(await currentCsv.text());
  const ours = rows.filter((r) => r[header.indexOf('rider_id')] === weekend.id);
  expect(ours.map((row) => row[header.indexOf('entry_id')]).sort()).toEqual(weekend.entries.map((entry) => entry.id).sort());
  for (const row of ours) {
    expect(row[header.indexOf('bib')]).toBe('100');
    expect(row[header.indexOf('checked_in')]).toBe('Y');
  }
  const overviewUrl = `/api/events/${eventId}/start-lists`;
  const overviewResponse = await page.request.get(overviewUrl);
  expect(overviewResponse.status()).toBe(200);
  const overview: Awaited<ReturnType<StartLists['overview']>> = await overviewResponse.json();
  const riderRaces = overview.races.filter((race) => race.rows.some((row) => row.riderId === weekend.id));
  expect(riderRaces).toHaveLength(2);
  const copies = [];
  for (const race of riderRaces) {
    const path = `${overviewUrl}/${race.raceId}`;
    const snapshot = await page.request.post(`${path}/lock`);
    expect(snapshot.status()).toBe(201);
    const { version } = await snapshot.json();
    const url = `${path}/csv?snapshot=${version}`;
    const csv = await page.request.get(url);
    expect(csv.status()).toBe(200);
    const contents = await csv.text();
    const [columns, ...snapshotRows] = parseCsv(contents);
    const entryRows = snapshotRows.filter((row) => row[columns.indexOf('rider_id')] === weekend.id);
    expect(entryRows.map((row) => row[columns.indexOf('bib')])).toEqual(['100']);
    copies.push({ url, contents });
  }

  const [, secondDay] = [...first.days].sort((a, b) => a.date.localeCompare(b.date));
  const withdrawn = weekend.entries.find((entry) => entry.dayId === secondDay.id)!;
  const retained = weekend.entries.find((entry) => entry.id !== withdrawn.id)!;
  expect((await page.request.post(`/api/order-entries/${withdrawn.id}/withdraw`, { data: { reason: 'Fictional second-day withdrawal after desk rehearsal' } })).status()).toBe(200);
  const refund = await page.request.post(`/api/orders/${weekend.id}/refunds`, { data: { clientRequestId: crypto.randomUUID(), entryId: withdrawn.id, amountCents: 1000, reason: 'Fictional partial refund for local close-out' } });
  expect(refund.status()).toBe(200);
  const refunded: OrderView = await refund.json();
  expect(refunded.entries.find((e) => e.id === withdrawn.id)?.status).toBe('withdrawn');
  expect(refunded.entries.find((e) => e.id === retained.id)?.status).toBe('confirmed');
  const latest = await page.request.get(`/api/events/${eventId}/start-lists/all/csv`);
  expect(latest.status()).toBe(200);
  const [latestHeader, ...latestRows] = parseCsv(await latest.text());
  const remaining = latestRows.filter((row) => row[latestHeader.indexOf('rider_id')] === weekend.id);
  expect(remaining.map((row) => row[latestHeader.indexOf('entry_id')])).toEqual([retained.id]);
  const revisedResponse = await page.request.get(overviewUrl);
  expect(revisedResponse.status()).toBe(200);
  const revised: typeof overview = await revisedResponse.json();
  expect(revised.races.flatMap((race) => race.changesSinceLock?.removed.map((row) => row.entryId) ?? [])).toEqual([withdrawn.id]);
  const ledger = await page.request.get(`/api/events/${eventId}/exports/ledger.csv`);
  expect(ledger.status()).toBe(200);
  const [ledgerHeader, ...ledgerRows] = parseCsv(await ledger.text());
  expect(ledgerRows.filter((r) => r[ledgerHeader.indexOf('order_number')] === weekend.orderNumber && r[ledgerHeader.indexOf('kind')] === 'refund').map((r) => r[ledgerHeader.indexOf('amount')])).toEqual(['-10']);
  for (const copy of copies) {
    const frozen = await page.request.get(copy.url);
    expect(frozen.status()).toBe(200);
    expect(await frozen.text()).toBe(copy.contents);
  }
});
test('generated empty and large cases remain usable organizer states', async ({ page }) => {
  expect([200, 201]).toContain((await page.request.post('/api/demo/case-studies/empty-event')).status());
  expect([200, 201]).toContain((await page.request.post('/api/demo/case-studies/large-event')).status());

  await page.goto('/#/events/evt_demo_case_empty/schedule');
  await expect(page.getByRole('button', { name: 'Add category' })).toBeVisible();
  await expect(page.locator('.cat-row')).toHaveCount(0);

  await page.goto('/#/events/evt_demo_case_large/schedule');
  await expect(page.locator('.cat-row')).toHaveCount(120);
  await expect(page.getByRole('button', { name: 'Élite women, novice riders, collegiate riders, and open field with a deliberately long category name', exact: true })).toBeVisible();
});
