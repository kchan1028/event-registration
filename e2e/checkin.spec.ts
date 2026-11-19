import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';
import type { CheckInList } from '../src/shared/checkin';
import type { EventConfig } from '../src/shared/schema';

/*
 * Race-day check-in search. A barcode scanner types the check-in code and presses Enter at once,
 * before the debounced search has returned, so Enter must look up the typed text itself.
 */

type Rider = { orderId: string; name: string; checkInCode: string; result: { ready: boolean } };

test('typed code and name lookup work after camera permission is denied', async ({ page }) => {
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

  await page.addInitScript(() => {
    Object.defineProperty(window, 'BarcodeDetector', { configurable: true, value: class {} });
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('Test camera permission denied', 'NotAllowedError');
    };
  });
  await page.goto(`/#/events/${eventId}/check-in`);
  const search = page.getByRole('searchbox', { name: 'Find a rider' });
  const detail = page.getByRole('region', { name: 'Rider check-in' });
  await expect(page.getByText(`${riders.length} riders on`)).toBeVisible();

  await page.getByRole('button', { name: 'Scan with camera', exact: true }).click();
  const cameraError = page.getByRole('alert').filter({ hasText: 'The camera could not be opened.' });
  await expect(cameraError).toContainText('type the code instead');
  await page.getByRole('button', { name: 'Stop camera', exact: true }).click();
  await expect(cameraError).toHaveCount(0);

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

test('stopping the scanner releases a stream returned after the camera request', async ({ page }) => {
  const { eventId } = await (await page.request.post('/api/demo')).json();
  await page.addInitScript(() => {
    Object.defineProperty(window, 'BarcodeDetector', { configurable: true, value: class {} });
    navigator.mediaDevices.getUserMedia = () => new Promise<MediaStream>((resolve) => {
      document.documentElement.dataset.cameraRequest = 'pending';
      window.addEventListener('resolve-test-camera', () => {
        const stream = document.createElement('canvas').captureStream();
        const [track] = stream.getVideoTracks();
        Object.defineProperty(window, 'testCameraTrack', { value: track });
        resolve(stream);
      }, { once: true });
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/#/events/${eventId}/check-in`);
  await page.getByRole('button', { name: 'Scan with camera' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-camera-request', 'pending');
  await page.getByRole('button', { name: 'Stop camera' }).click();
  await expect(page.getByLabel('Camera view for scanning a check-in QR code')).toHaveCount(0);

  // Resolve the stand-in for the browser permission prompt only after closing the scanner.
  await page.evaluate(() => window.dispatchEvent(new Event('resolve-test-camera')));
  await expect.poll(() => page.evaluate(
    () => (window as Window & { testCameraTrack?: MediaStreamTrack }).testCameraTrack?.readyState,
  )).toBe('ended');
  await expect(page.getByRole('searchbox', { name: 'Find a rider' })).toBeEditable();
});

test('a volunteer distinguishes riders with the same name by their details or confirmation code', async ({ page, browser }) => {
  const api = page.request;
  const { eventId, organizationId } = await (await api.post('/api/demo')).json();
  const eventUrl = `/api/events/${eventId}`;
  expect((await api.post(`${eventUrl}/publish`, { data: { acknowledgeWarnings: true } })).ok()).toBe(true);
  expect((await api.post(`${eventUrl}/check-in-demo-riders`)).ok()).toBe(true);
  expect((await api.put(`${eventUrl}/bib-settings`, {
    data: { scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 199 }] },
  })).ok()).toBe(true);

  const initial: CheckInList = await (await api.get(`${eventUrl}/check-in`)).json();
  const ready = initial.riders.find((rider) => rider.result.ready && rider.bib === null);
  const blocked = initial.riders.find((rider) => !rider.result.ready && rider.bib === null);
  if (!ready?.checkInCode || !blocked?.checkInCode) throw new Error('The fixture needs one ready and one blocked rider with check-in codes');
  expect(ready.checkInCode).not.toBe(blocked.checkInCode);
  for (const [rider, team] of [[ready, 'Blue Demo Team'], [blocked, 'Gold Demo Team']] as const) {
    expect((await api.post(`/api/orders/${rider.orderId}/rider-corrections`, {
      data: { changes: { firstName: 'Taylor', lastName: 'Fictional', team }, reason: 'Prepare a same-name rehearsal' },
    })).ok()).toBe(true);
  }

  const email = 'lookup.volunteer@example.test';
  expect((await api.post(`/api/organizations/${organizationId}/members`, {
    data: { email, role: 'check_in_volunteer' },
  })).ok()).toBe(true);
  const context = await browser.newContext({
    extraHTTPHeaders: { Authorization: `Bearer test:${email}` },
    viewport: { width: 390, height: 844 },
  });
  try {
    await context.addInitScript((user) => sessionStorage.setItem('cyclereg.test-session', user), email);
    const volunteer = await context.newPage();
    await volunteer.goto(`/#/events/${eventId}/check-in`);
    const search = volunteer.getByRole('searchbox', { name: 'Find a rider' });
    const detail = volunteer.getByRole('region', { name: 'Rider check-in' });
    await search.fill('Taylor Fictional');
    await search.press('Enter');
    await expect(volunteer.getByText('2 matches', { exact: true })).toBeVisible();
    await expect(detail).toContainText('Search for a rider or scan their check-in code.');

    for (const [rider, team] of [[ready, 'Blue Demo Team'], [blocked, 'Gold Demo Team']] as const) {
      const match = volunteer.getByRole('button', { name: new RegExp(`Taylor Fictional.*${team}`) });
      await match.click();
      await expect(match).toHaveAttribute('aria-current', 'true');
      await expect(detail).toContainText(`${team} · racing age ${rider.racingAge}`);
      await expect(detail.getByRole('heading', { name: 'Racing today', exact: true })).toBeVisible();
      const entries = detail.locator('.ci-entries').getByRole('listitem');
      await expect(entries).toHaveCount(rider.entries.length);
      for (const [index, entry] of rider.entries.entries()) {
        await expect(entries.nth(index)).toContainText(entry.categoryName);
        await expect(entries.nth(index)).toContainText(entry.raceName);
      }
      await expect(detail.getByRole('status')).toContainText(rider.result.ready ? 'Ready to race' : 'Not ready');
    }

    await search.fill(ready.checkInCode);
    await search.press('Enter');
    await expect(detail).toContainText('Blue Demo Team');
    await expect(detail).toContainText('Ready to race');
    await detail.getByRole('button', { name: 'Check in and issue next bib' }).click();
    await expect(detail.locator('.ci-bib__number')).toHaveText('100');

    await search.fill(blocked.checkInCode);
    await search.press('Enter');
    await expect(detail).toContainText('Gold Demo Team');
    await expect(detail).toContainText('Not ready');
    await expect(detail.getByRole('button', { name: /Check in and issue/ })).toHaveCount(0);

    const result = await volunteer.request.get(`${eventUrl}/check-in`, { params: { q: 'Taylor Fictional' } });
    expect(result.ok()).toBe(true);
    const saved: CheckInList = await result.json();
    expect(saved.roles).toEqual(['check_in_volunteer']);
    expect(saved.riders).toHaveLength(2);
    expect(saved.riders).toEqual(expect.arrayContaining([
      expect.objectContaining({ orderId: ready.orderId, bib: 100, checkedInAt: expect.any(String) }),
      expect.objectContaining({ orderId: blocked.orderId, bib: null, checkedInAt: null }),
    ]));
  } finally {
    await context.close();
  }
});

test('a paid rider can receive a bib only on a day they entered', async ({ page }) => {
  const api = page.request;
  const { eventId } = await (await api.post('/api/demo')).json();
  const eventUrl = `/api/events/${eventId}`;
  expect((await api.post(`${eventUrl}/publish`, { data: { acknowledgeWarnings: true } })).ok()).toBe(true);
  const event = await api.get(eventUrl);
  expect(event.ok()).toBe(true);
  const { config } = await event.json() as { config: EventConfig };
  const category = config.categories.find((row) => row.timingCode === 'RR-M35-34')!;
  const reservation = await api.post(`/api/rider/events/${eventId}/orders`, { data: {
    clientRequestId: 'wrong-day-rehearsal',
    categoryIds: [category.id],
    rider: { firstName: 'Taylor', lastName: 'Fictional', email: 'wrong-day@example.test', team: '',
      racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men',
      collegiateDivision: null, guardian: null, emergencyContact: { name: 'Fictional Contact', phone: '555-555-0199' } },
    waiver: { version: config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Taylor Fictional', signerRole: 'rider' },
  } });
  expect(reservation.status()).toBe(201);
  const order = await reservation.json();
  expect((await api.post(`/api/orders/${order.id}/payment`, {
    data: { attemptId: 'wrong-day-payment', outcome: 'success' },
  })).ok()).toBe(true);
  expect((await api.post(`/api/order-entries/${order.entries[0].id}/license-review`, {
    data: { note: 'Fictional license reviewed for race-day rehearsal' },
  })).ok()).toBe(true);
  expect((await api.put(`${eventUrl}/bib-settings`, {
    data: { scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 199 }] },
  })).ok()).toBe(true);

  const list = async (params?: Record<string, string>): Promise<CheckInList> => {
    const response = await api.get(`${eventUrl}/check-in`, { params });
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const first = await list();
  const [entered, other] = first.days;
  const rider = first.riders.find((candidate) => candidate.orderId === order.id);
  if (!rider?.checkInCode) throw new Error('The paid entry must appear on the first day with a check-in code');
  expect(rider.result.ready).toBe(true);
  const code = rider.checkInCode;

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/#/events/${eventId}/check-in`);
  const days = page.getByRole('radiogroup', { name: 'Race day' });
  const selectDay = async (label: string) => {
    await days.getByText(label, { exact: true }).click();
    await expect(days.getByRole('radio', { name: label, exact: true })).toBeChecked();
  };
  const search = page.getByRole('searchbox', { name: 'Find a rider' });
  const detail = page.getByRole('region', { name: 'Rider check-in' });
  await selectDay(other.label);
  await search.fill(code);
  await search.press('Enter');
  await expect(detail).toContainText(rider.name);
  await expect(detail).toContainText('Not ready');
  await expect(detail).toContainText('No entry on this race day');
  await expect(detail.getByRole('button', { name: /Check in and issue/ })).toHaveCount(0);

  const refused = await api.post(`${eventUrl}/check-in/${rider.orderId}`, { data: { dayId: other.id, bib: null } });
  expect(refused.status()).toBe(409);
  expect(await refused.json()).toMatchObject({ error: expect.stringMatching(/no entry on this race day/i) });
  const afterRefusal = await list({ day: other.id, q: code });
  expect(afterRefusal.riders).toEqual([expect.objectContaining({
    orderId: rider.orderId, payment: 'confirmed', entries: [], bib: null, checkedInAt: null, bibHistory: [],
  })]);

  await selectDay(entered.label);
  await search.press('Enter');
  await expect(detail).toContainText('Ready to race');
  await detail.getByRole('button', { name: 'Check in and issue next bib' }).click();
  await expect(detail.locator('.ci-bib__number')).toHaveText('100');
  const correctDay = await list({ day: entered.id, q: code });
  expect(correctDay.riders).toEqual([expect.objectContaining({
    orderId: rider.orderId, entries: rider.entries, bib: 100, checkedInAt: expect.any(String),
  })]);
  const wrongDay = await list({ day: other.id, q: code });
  expect(wrongDay.riders).toEqual([expect.objectContaining({
    orderId: rider.orderId, entries: [], checkedInAt: null,
  })]);
});

test('a volunteer can retry check-in after the organizer resolves missing and exhausted bib ranges', async ({ page, browser }) => {
  const api = page.request;
  const { eventId, organizationId } = await (await api.post('/api/demo')).json();
  const eventUrl = `/api/events/${eventId}`;
  expect((await api.post(`${eventUrl}/publish`, { data: { acknowledgeWarnings: true } })).ok()).toBe(true);
  expect((await api.post(`${eventUrl}/check-in-demo-riders`)).ok()).toBe(true);
  const setRange = async (last?: number) => {
    expect((await api.put(`${eventUrl}/bib-settings`, {
      data: { scope: 'weekend', ranges: last === undefined ? [] : [{ scope: 'weekend', first: 100, last }] },
    })).ok()).toBe(true);
  };
  await setRange();
  const readList = async (): Promise<CheckInList> => {
    const response = await api.get(`${eventUrl}/check-in`);
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const initial = await readList();
  const [first, next] = initial.riders.filter((rider) => rider.result.ready && rider.bib === null);
  if (!first || !next?.checkInCode) throw new Error('The demo needs two ready riders without bibs');
  const email = 'range.volunteer@example.test';
  expect((await api.post(`/api/organizations/${organizationId}/members`, {
    data: { email, role: 'check_in_volunteer' },
  })).ok()).toBe(true);
  const context = await browser.newContext({
    extraHTTPHeaders: { Authorization: `Bearer test:${email}` },
    viewport: { width: 390, height: 844 },
  });
  try {
    await context.addInitScript((user) => sessionStorage.setItem('cyclereg.test-session', user), email);
    const volunteer = await context.newPage();
    await volunteer.goto(`/#/events/${eventId}/check-in`);
    const search = volunteer.getByRole('searchbox', { name: 'Find a rider' });
    const detail = volunteer.getByRole('region', { name: 'Rider check-in' });
    await search.fill(next.checkInCode);
    await search.press('Enter');
    await expect(detail).toContainText(next.name);
    await expect(detail).toContainText('Ready to race');
    const issue = detail.getByRole('button', { name: 'Check in and issue next bib' });
    const verifyRefusal = async (message: string) => {
      await issue.click();
      await expect(detail.getByRole('alert')).toContainText(message);
      const afterFailure = await readList();
      expect(afterFailure.riders.find((rider) => rider.orderId === next.orderId)).toMatchObject({
        bib: null, checkedInAt: null, bibHistory: [], entries: next.entries, result: next.result,
      });
    };
    await verifyRefusal('No bib range covers every applicable entry. Set bib ranges before checking riders in.');

    // Staff issue the only configured bib to the first rider before retrying this one.
    await setRange(100);
    const issued = await api.post(`${eventUrl}/check-in/${first.orderId}`, { data: { dayId: initial.dayId, bib: null } });
    expect(issued.ok()).toBe(true);
    const recordedFirst = await issued.json();
    expect(recordedFirst).toMatchObject({ bib: 100, checkedInAt: expect.any(String) });
    await verifyRefusal('Every bib from 100 to 100 is in use. Extend the bib range.');

    await setRange(101);
    await issue.click();
    await expect(detail.locator('.ci-bib__number')).toHaveText('101');
    const afterRetry = await readList();
    expect(afterRetry.riders.find((rider) => rider.orderId === next.orderId)).toMatchObject({
      bib: 101, checkedInAt: expect.any(String), entries: next.entries,
    });
    expect(afterRetry.riders.find((rider) => rider.orderId === first.orderId)).toMatchObject({
      bib: 100, checkedInAt: recordedFirst.checkedInAt, bibHistory: recordedFirst.bibHistory,
    });
  } finally {
    await context.close();
  }
});

test('undoing the wrong rider check-in releases the bib for the intended rider', async ({ page }) => {
  const api = page.request;
  const { eventId } = await (await api.post('/api/demo')).json();
  const eventUrl = `/api/events/${eventId}`;
  expect((await api.post(`${eventUrl}/publish`, { data: { acknowledgeWarnings: true } })).ok()).toBe(true);
  expect((await api.post(`${eventUrl}/check-in-demo-riders`)).ok()).toBe(true);
  expect((await api.put(`${eventUrl}/bib-settings`, {
    data: { scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 100 }] },
  })).ok()).toBe(true);

  const list = async (): Promise<CheckInList> => {
    const response = await api.get(`${eventUrl}/check-in`);
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const { riders } = await list();
  const [wrong, intended] = riders.filter((rider) => rider.result.ready && rider.bib === null);
  if (!wrong?.checkInCode || !intended?.checkInCode) throw new Error('The demo needs two ready riders with check-in codes and no bibs');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/#/events/${eventId}/check-in`);
  const search = page.getByRole('searchbox', { name: 'Find a rider' });
  const detail = page.getByRole('region', { name: 'Rider check-in' });
  const find = async (code: string, name: string) => {
    await search.fill(code);
    await search.press('Enter');
    await expect(detail.getByRole('heading', { name, exact: true })).toBeVisible();
  };
  const issue = detail.getByRole('button', { name: 'Check in and issue next bib', exact: true });
  const undo = detail.getByRole('button', { name: 'Undo check-in', exact: true });
  await find(wrong.checkInCode, wrong.name);
  await issue.click();
  await expect(detail.locator('.ci-bib__number')).toHaveText('100');
  await undo.click();
  await detail.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(detail.locator('.ci-bib__number')).toHaveText('100');

  // Simulate that staff have recovered the physical bib before releasing it.
  const reason = 'Wrong rider checked in. Demo bib recovered.';
  await undo.click();
  await detail.getByRole('textbox', { name: 'Reason' }).fill(reason);
  await undo.click();
  await expect(issue).toBeVisible();
  await expect(detail.locator('.ci-bib__number')).toHaveCount(0);

  await find(intended.checkInCode, intended.name);
  await issue.click();
  await expect(detail.locator('.ci-bib__number')).toHaveText('100');
  const saved = await list();
  expect(saved.riders.find((rider) => rider.orderId === wrong.orderId)).toMatchObject({
    bib: null, checkedInAt: null, entries: wrong.entries,
    undoneCheckIns: [expect.objectContaining({ bib: 100, bibReleased: true, reason })],
  });
  expect(saved.riders.find((rider) => rider.orderId === intended.orderId)).toMatchObject({
    bib: 100, checkedInAt: expect.any(String), entries: intended.entries, undoneCheckIns: [],
  });
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
  const sections = page.getByRole('region', { name: /^Roster for / });
  await expect(sections).toHaveCount(list.days.length);
  for (const section of await sections.all()) {
    await expect(section).toContainText('Fallback roster printed');
    await expect(section).toContainText('This snapshot does not authorize offline registration');
    await expect(section).toContainText('Without one, pause issuance and contact the registration lead');
    await expect(section).toContainText('reconcile notes with current records');
    await expect(section).toContainText('adding a name to the printed sheet does not create an entry, reserve capacity or authorize a bib');
    await expect(section.getByRole('columnheader', { name: 'Snapshot status', exact: true })).toBeVisible();
    await expect(section.getByRole('columnheader', { name: 'Recorded bib', exact: true })).toBeVisible();
    expect(await section.getByRole('cell', { name: 'Not assigned', exact: true }).count()).toBeGreaterThan(0);
    await expect(section.getByRole('columnheader', { name: 'Notes recorded', exact: true })).toHaveCount(0);
  }
  await expect(day).toContainText('notes on this sheet do not clear requirements');
  await expect(day.getByRole('columnheader', { name: 'Lead review notes', exact: true })).toBeVisible();
  await expect(page.getByText('Cleared by, how', { exact: true })).toHaveCount(0);
  for (const r of riders) await expect(day.getByRole('cell', { name: r.name, exact: true }).first()).toBeVisible();
  await expect(day.getByRole('heading', { name: 'Exception checklist' })).toBeVisible();
  await expect(day).toContainText(`NOT READY`);
  await expect(day.locator('table').nth(1)).toContainText(blocked.name);
  await expect(page.getByRole('button', { name: 'Print roster' })).toBeEnabled();
  await expect(page.locator('body')).not.toContainText('@example.com');
  await page.screenshot({ path: 'test-results/roster-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: 'Check-in', exact: true }).click();
  await page.getByRole('button', { name: /Switch to dark/ }).click();
  await page.getByRole('link', { name: 'Fallback roster' }).click();
  await expect(page.getByRole('button', { name: 'Print roster' })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/roster-mobile-dark.png', fullPage: true });
  await page.setViewportSize({ width: 816, height: 1056 });
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('button', { name: 'Print roster' })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(816);
  for (const section of await sections.all()) {
    await expect(section.getByText('Reference only.', { exact: true })).toBeVisible();
    await expect(section).toContainText('pause issuance and contact the registration lead');
  }
  await day.screenshot({ path: 'test-results/roster-print.png' });
});

test('empty fallback roster retains recording limits without riders or exceptions', async ({ page }) => {
  const { eventId } = await (await page.request.post('/api/demo')).json();
  await page.goto(`/#/events/${eventId}/roster`);
  await expect(page.getByRole('button', { name: 'Print roster' })).toBeEnabled();
  const sections = page.getByRole('region', { name: /^Roster for / });
  expect(await sections.count()).toBeGreaterThan(0);
  for (const section of await sections.all()) {
    await expect(section).toContainText('No registered riders for this day');
    await expect(section).toContainText('No riders are blocked for this day');
    await expect(section).toContainText('This snapshot does not authorize offline registration');
    await expect(section).toContainText('adding a name to the printed sheet does not create an entry');
    await expect(section.getByRole('columnheader', { name: 'Question for registration lead', exact: true })).toBeVisible();
  }
  await page.emulateMedia({ media: 'print' });
  for (const section of await sections.all()) {
    await expect(section.getByText('Reference only.', { exact: true })).toBeVisible();
  }
});

for (const mobile of [false, true]) {
  test(`bulk bib preview and apply preserves blocked readiness (${mobile ? 'mobile' : 'desktop'})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const api = page.request;
    const { eventId } = await (await api.post('/api/demo')).json();
    await api.post(`/api/events/${eventId}/publish`, { data: { acknowledgeWarnings: true } });
    await api.post(`/api/events/${eventId}/check-in-demo-riders`);
    await api.put(`/api/events/${eventId}/bib-settings`, { data: { scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 299 }] } });
    const original = await (await api.get(`/api/events/${eventId}/check-in`)).json();
    const blocked = original.riders.find((r: { payment: string; result: { ready: boolean } }) => r.payment === 'confirmed' && !r.result.ready);
    await page.goto(`/#/events/${eventId}/check-in`);
    // Batch selection loads the whole day independently of the volunteer's search.
    await page.getByRole('searchbox', { name: 'Find a rider' }).fill('Alex');
    await page.getByRole('button', { name: 'Assign bibs', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Bulk bib assignment', exact: true });
    await panel.getByRole('checkbox', { name: blocked.name }).check();
    await panel.getByRole('button', { name: 'Preview bib assignments', exact: true }).click();
    const preview = panel.getByRole('region', { name: 'Proposed bib assignments' });
    await expect(preview).toContainText(blocked.name);
    await expect(preview.getByRole('cell', { name: '100', exact: true })).toBeVisible();
    await panel.getByLabel('Assign in order').selectOption('start');
    await expect(preview).toHaveCount(0);
    await panel.getByRole('button', { name: 'Preview bib assignments', exact: true }).click();
    await panel.getByRole('combobox', { name: 'Category', exact: true }).selectOption(blocked.entries[0].categoryId);
    await expect(preview).toHaveCount(0);
    await expect(panel.getByText('0 selected · maximum 1,000 per batch')).toBeVisible();
    await panel.getByRole('checkbox', { name: blocked.name }).check();
    await panel.getByRole('button', { name: 'Preview bib assignments', exact: true }).click();
    if (mobile) {
      await page.screenshot({ path: 'test-results/bib-batch-mobile-light.png', fullPage: true, animations: 'disabled' });
      await page.getByRole('button', { name: /Switch to dark/ }).click();
      await page.screenshot({ path: 'test-results/bib-batch-mobile-dark.png', fullPage: true, animations: 'disabled' });
    } else {
      await page.screenshot({ path: 'test-results/bib-batch-desktop.png', fullPage: true, animations: 'disabled' });
    }
    expect((await new AxeBuilder({ page }).include('.ci-batch').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
    await panel.getByRole('button', { name: 'Apply 1 bib assignment', exact: true }).click();
    await expect(panel.getByText('1 bib assigned. Readiness and check-in are unchanged.')).toBeVisible();
    const updated = await (await api.get(`/api/events/${eventId}/check-in`)).json();
    expect(updated.riders.find((r: { orderId: string }) => r.orderId === blocked.orderId)).toMatchObject({ bib: 100, checkedInAt: null, result: { ready: false } });
    await expect(panel.getByRole('checkbox', { name: blocked.name })).toBeDisabled();
    await expect(panel.getByRole('row', { name: new RegExp(blocked.name) })).toContainText('Already has a bib');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('a stale batch preview is refused and requires a new preview', async ({ page }) => {
  const api = page.request;
  const { eventId } = await (await api.post('/api/demo')).json();
  await api.post(`/api/events/${eventId}/publish`, { data: { acknowledgeWarnings: true } });
  await api.post(`/api/events/${eventId}/check-in-demo-riders`);
  await api.put(`/api/events/${eventId}/bib-settings`, { data: { scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 299 }] } });
  const list = await (await api.get(`/api/events/${eventId}/check-in`)).json();
  const alex = list.riders.find((r: Rider) => r.name.startsWith('Alex'));
  const blake = list.riders.find((r: Rider) => r.name.startsWith('Blake'));
  await page.goto(`/#/events/${eventId}/check-in`);
  await page.getByRole('button', { name: 'Assign bibs', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Bulk bib assignment', exact: true });
  await panel.getByRole('checkbox', { name: alex.name }).check();
  await panel.getByRole('button', { name: 'Preview bib assignments', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Apply 1 bib assignment', exact: true })).toBeEnabled();
  expect((await api.post(`/api/events/${eventId}/check-in/${blake.orderId}`, { data: { dayId: list.dayId, bib: 100 } })).ok()).toBe(true);
  await panel.getByRole('button', { name: 'Apply 1 bib assignment', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('Bib preview changed');
  await expect(panel.getByRole('region', { name: 'Proposed bib assignments' })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Preview bib assignments', exact: true }).click();
  await expect(panel.getByRole('region', { name: 'Proposed bib assignments' }).getByRole('cell', { name: '101', exact: true })).toBeVisible();
  expect((await api.post(`/api/events/${eventId}/check-in/${alex.orderId}`, { data: { dayId: list.dayId, bib: 101 } })).ok()).toBe(true);
  await panel.getByRole('button', { name: 'Apply 1 bib assignment', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('Already has a bib');
  await expect(panel.getByRole('checkbox', { name: alex.name })).toBeDisabled();
  await expect(panel.getByText('0 selected · maximum 1,000 per batch')).toBeVisible();
});

test('volunteers can check in riders but cannot open or call bulk assignment', async ({ page, browser, baseURL }) => {
  const api = page.request;
  const { eventId, organizationId } = await (await api.post('/api/demo')).json();
  await api.post(`/api/events/${eventId}/publish`, { data: { acknowledgeWarnings: true } });
  const email = 'bib-volunteer@example.test';
  expect((await api.post(`/api/organizations/${organizationId}/members`, { data: { email, role: 'check_in_volunteer' } })).ok()).toBe(true);
  const volunteerContext = await browser.newContext({ extraHTTPHeaders: { Authorization: `Bearer test:${email}` } });
  await volunteerContext.addInitScript((user) => sessionStorage.setItem('cyclereg.test-session', user), email);
  const volunteer = await volunteerContext.newPage();
  await volunteer.goto(`${baseURL}/#/events/${eventId}/check-in`);
  await expect(volunteer.getByRole('searchbox', { name: 'Find a rider' })).toBeVisible();
  await expect(volunteer.getByRole('button', { name: 'Assign bibs', exact: true })).toHaveCount(0);
  await volunteerContext.close();
  const refused = await api.post(`/api/events/${eventId}/bibs/preview`, { headers: { Authorization: `Bearer test:${email}` }, data: {} });
  expect(refused.status()).toBe(403);
});

test('an assigned bib stays visible when the following list refresh fails', async ({ page }) => {
  const api = page.request;
  const { eventId } = await (await api.post('/api/demo')).json();
  await api.post(`/api/events/${eventId}/publish`, { data: { acknowledgeWarnings: true } });
  await api.post(`/api/events/${eventId}/check-in-demo-riders`);
  await api.put(`/api/events/${eventId}/bib-settings`, { data: { scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 299 }] } });
  await page.goto(`/#/events/${eventId}/check-in`);
  await page.getByRole('button', { name: 'Assign bibs', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Bulk bib assignment', exact: true });
  await panel.getByRole('checkbox', { name: 'Alex Demo', exact: true }).check();
  await panel.getByRole('button', { name: 'Preview bib assignments', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Apply 1 bib assignment', exact: true })).toBeEnabled();
  await page.route(`**/api/events/${eventId}/check-in?*`, (route) => route.abort());
  await panel.getByRole('button', { name: 'Apply 1 bib assignment', exact: true }).click();
  await expect(panel.getByText('1 bib assigned. Readiness and check-in are unchanged.')).toBeVisible();
  await expect(panel.getByRole('alert')).toContainText('Numbers were assigned, but the rider list could not refresh');
  await expect(panel.getByRole('checkbox', { name: 'Alex Demo', exact: true })).toBeDisabled();
  await expect(panel.getByRole('row', { name: /Alex Demo/ })).toContainText('100');
});

for (const mobile of [false, true]) {
  test(`automatic assignment is opt-in after registration close (${mobile ? 'mobile' : 'desktop'})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const api = page.request;
    const { eventId } = await (await api.post('/api/demo')).json();
    await api.post(`/api/events/${eventId}/publish`, { data: { acknowledgeWarnings: true } });
    await page.goto(`/#/events/${eventId}/check-in`);
    await page.getByRole('button', { name: 'Bib ranges', exact: true }).click();
    const ranges = page.getByRole('form', { name: 'Bib ranges', exact: true });
    await ranges.getByRole('textbox', { name: 'First', exact: true }).fill('100');
    await ranges.getByRole('textbox', { name: 'Last', exact: true }).fill('199');
    await ranges.getByRole('button', { name: 'Save bib ranges', exact: true }).click();
    await expect(ranges.getByText('Saved', { exact: true })).toBeVisible();
    const panel = page.getByRole('region', { name: 'Automatic bib assignment', exact: true });
    await expect(panel.getByText('Automatic assignment is off.', { exact: true })).toBeVisible();
    await panel.getByRole('combobox', { name: 'Sort riders' }).selectOption('registration');
    await panel.getByRole('button', { name: 'Enable after-close assignment', exact: true }).click();
    await expect(panel.getByRole('button', { name: 'Cancel automatic assignment', exact: true })).toBeEnabled();
    await expect(panel.getByText('Enabled: waiting for allocation to complete.', { exact: true })).toBeFocused();
    const jobs = await (await api.get(`/api/events/${eventId}/automatic-bibs`)).json();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ sort: 'registration', completedAt: null, cancelledAt: null });
    await expect(panel).toContainText('after every published category closes');
    expect((await new AxeBuilder({ page }).include('[aria-label="Automatic bib assignment"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
    await page.screenshot({ path: `test-results/automatic-bibs-${mobile ? 'mobile' : 'desktop'}.png`, fullPage: true, animations: 'disabled' });
    if (mobile) {
      await page.getByRole('button', { name: /Switch to dark/ }).click();
      await page.screenshot({ path: 'test-results/automatic-bibs-mobile-dark.png', fullPage: true, animations: 'disabled' });
      expect((await new AxeBuilder({ page }).include('[aria-label="Automatic bib assignment"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
    }
    await panel.getByRole('button', { name: 'Cancel automatic assignment', exact: true }).click();
    await expect(panel.getByText('Automatic assignment is off.', { exact: true })).toBeVisible();
    await expect(panel.getByText('Automatic assignment is off.', { exact: true })).toBeFocused();
    const cancelled = await (await api.get(`/api/events/${eventId}/automatic-bibs`)).json();
    expect(cancelled[0].cancelledAt).not.toBeNull();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

for (const mobile of [false, true]) {
  test(`protected bib changes offer explicit numbers and resequencing (${mobile ? 'mobile' : 'desktop'})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const api = page.request;
    const { eventId } = await (await api.post('/api/demo')).json();
    await api.post(`/api/events/${eventId}/publish`, { data: { acknowledgeWarnings: true } });
    await api.post(`/api/events/${eventId}/check-in-demo-riders`);
    await api.put(`/api/events/${eventId}/bib-settings`, { data: { scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 199 }] } });
    const initial = await (await api.get(`/api/events/${eventId}/check-in`)).json();
    const alex = initial.riders.find((r: Rider) => r.name.startsWith('Alex'));
    const blake = initial.riders.find((r: Rider) => r.name.startsWith('Blake'));
    const batch = { dayId: initial.dayId, orderIds: [alex.orderId, blake.orderId] };
    const allocation = await (await api.post(`/api/events/${eventId}/bibs/preview`, { data: batch })).json();
    expect((await api.post(`/api/events/${eventId}/bibs/apply`, { data: { ...batch, fingerprint: allocation.fingerprint } })).ok()).toBe(true);
    expect((await api.post(`/api/events/${eventId}/check-in/${alex.orderId}`, { data: { dayId: initial.dayId } })).ok()).toBe(true);
    const lists = await (await api.get(`/api/events/${eventId}/start-lists`)).json();
    for (const race of lists.races) await api.post(`/api/events/${eventId}/start-lists/${race.raceId}/lock`);
    await page.goto(`/#/events/${eventId}/check-in`);
    await page.getByRole('button', { name: 'Reassign bibs', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Bulk bib reassignment', exact: true });
    await panel.getByRole('button', { name: 'Select all assigned (1)', exact: true }).click();
    await expect(panel.getByRole('checkbox', { name: alex.name, exact: true })).not.toBeChecked();
    await panel.getByRole('checkbox', { name: 'I approve changing checked-in riders’ bibs. Select those riders individually.', exact: true }).check();
    await panel.getByRole('checkbox', { name: alex.name, exact: true }).check();
    await panel.getByRole('checkbox', { name: blake.name, exact: true }).check();
    await panel.getByRole('textbox', { name: 'Reason for bib changes' }).fill('Swap demo numbers for the timer handoff');
    await panel.getByRole('textbox', { name: `New bib for ${alex.name}`, exact: true }).fill('101');
    await panel.getByRole('textbox', { name: `New bib for ${blake.name}`, exact: true }).fill('100');
    await panel.getByRole('button', { name: 'Preview bib changes', exact: true }).click();
    const preview = panel.getByRole('region', { name: 'Proposed bib changes', exact: true });
    await expect(preview.getByRole('row', { name: new RegExp(alex.name) })).toContainText('Saturday');
    await expect(panel).toContainText('Whole event');
    await expect(panel).toContainText('Sunday criterium');
    await panel.getByRole('combobox', { name: 'Replacement numbers', exact: true }).selectOption('sequence');
    await expect(preview).toHaveCount(0);
    await panel.getByRole('button', { name: 'Preview bib changes', exact: true }).click();
    await expect(panel.getByText('The numbers already match this selection and order. No changes are needed.', { exact: true })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Apply 0 bib changes', exact: true })).toBeDisabled();
    await panel.getByRole('combobox', { name: 'Replacement numbers', exact: true }).selectOption('manual');
    await panel.getByRole('button', { name: 'Preview bib changes', exact: true }).click();
    await expect(panel.getByRole('note')).toContainText('Alex Demo (Saturday)');
    if (mobile) {
      const ridersTable = panel.getByRole('region', { name: 'Riders for bib reassignment', exact: true });
      await ridersTable.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
      const selection = await panel.getByRole('checkbox', { name: 'Alex Demo', exact: true }).boundingBox();
      const tableBounds = await ridersTable.boundingBox();
      expect(selection!.x).toBeGreaterThanOrEqual(tableBounds!.x);
      expect(selection!.x + selection!.width).toBeLessThanOrEqual(tableBounds!.x + tableBounds!.width);
    }
    expect((await new AxeBuilder({ page }).include('[aria-label="Bulk bib reassignment"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
    await page.screenshot({ path: `test-results/bib-reassignment-${mobile ? 'mobile' : 'desktop'}.png`, fullPage: true, animations: 'disabled' });
    if (mobile) {
      await page.getByRole('button', { name: /Switch to dark/ }).click();
      await page.screenshot({ path: 'test-results/bib-reassignment-mobile-dark.png', fullPage: true, animations: 'disabled' });
      expect((await new AxeBuilder({ page }).include('[aria-label="Bulk bib reassignment"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
    }
    await panel.getByRole('button', { name: 'Apply 2 bib changes', exact: true }).click();
    await expect(panel.getByText('2 bibs changed; start-list revisions saved. Readiness and check-in are unchanged.', { exact: true })).toBeVisible();
    const swapped = await (await api.get(`/api/events/${eventId}/check-in`)).json();
    expect(swapped.riders.find((r: Rider) => r.orderId === alex.orderId)).toMatchObject({ bib: 101, checkedInAt: expect.any(String) });
    expect(swapped.riders.find((r: Rider) => r.orderId === blake.orderId)).toMatchObject({ bib: 100, checkedInAt: null });
    await expect(panel.getByRole('checkbox', { name: 'I approve changing checked-in riders’ bibs. Select those riders individually.', exact: true })).not.toBeChecked();
    await panel.getByRole('checkbox', { name: 'I approve changing checked-in riders’ bibs. Select those riders individually.', exact: true }).check();
    await panel.getByRole('combobox', { name: 'Replacement numbers', exact: true }).selectOption('sequence');
    await panel.getByRole('checkbox', { name: alex.name, exact: true }).check();
    await panel.getByRole('checkbox', { name: blake.name, exact: true }).check();
    await panel.getByRole('textbox', { name: 'Reason for bib changes' }).fill('Restore the demo field to name order');
    await panel.getByRole('button', { name: 'Preview bib changes', exact: true }).click();
    await panel.getByRole('button', { name: 'Apply 2 bib changes', exact: true }).click();
    await expect(panel.getByText('2 bibs changed; start-list revisions saved. Readiness and check-in are unchanged.', { exact: true })).toBeVisible();
    const ordered = await (await api.get(`/api/events/${eventId}/check-in`)).json();
    expect(ordered.riders.find((r: Rider) => r.orderId === alex.orderId)?.bib).toBe(100);
    expect(ordered.riders.find((r: Rider) => r.orderId === blake.orderId)?.bib).toBe(101);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('individual correction recovers from stale and conflicting previews without checking the rider in', async ({ page }) => {
  const api = page.request;
  const { eventId } = await (await api.post('/api/demo')).json();
  await api.post(`/api/events/${eventId}/publish`, { data: { acknowledgeWarnings: true } });
  await api.post(`/api/events/${eventId}/check-in-demo-riders`);
  await api.put(`/api/events/${eventId}/bib-settings`, { data: { scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 199 }] } });
  const initial = await (await api.get(`/api/events/${eventId}/check-in`)).json();
  const alex = initial.riders.find((r: Rider) => r.name.startsWith('Alex'));
  const batch = { dayId: initial.dayId, orderIds: [alex.orderId] };
  const plan = await (await api.post(`/api/events/${eventId}/bibs/preview`, { data: batch })).json();
  await api.post(`/api/events/${eventId}/bibs/apply`, { data: { ...batch, fingerprint: plan.fingerprint } });
  await page.goto(`/#/events/${eventId}/check-in`);
  const search = page.getByRole('searchbox', { name: 'Find a rider' });
  await search.fill(alex.name);
  await search.press('Enter');
  const detail = page.getByRole('region', { name: 'Rider check-in', exact: true });
  await expect(detail.getByText('Assigned bib (before check-in)', { exact: true })).toBeVisible();
  await detail.getByRole('button', { name: 'Change bib', exact: true }).click();
  const form = detail.getByRole('form', { name: 'Change rider bib', exact: true });
  await form.getByRole('textbox', { name: 'New bib', exact: true }).fill('130');
  await form.getByRole('textbox', { name: 'Reason', exact: true }).fill('Replace a damaged demo number');
  await form.getByRole('button', { name: 'Preview bib change', exact: true }).click();
  await expect(form.getByRole('region', { name: 'Proposed bib changes', exact: true })).toContainText('130');
  await form.getByRole('textbox', { name: 'Reason', exact: true }).fill('Use a fresh demo bib after checking the range');
  await expect(form.getByRole('region', { name: 'Proposed bib changes', exact: true })).toHaveCount(0);
  await form.getByRole('button', { name: 'Preview bib change', exact: true }).click();
  const apply = form.getByRole('button', { name: 'Apply bib change', exact: true });
  await expect(apply).toBeVisible();

  // The organizer changes the range while the old preview is open. Both numbers still fit.
  const before = await api.get(`/api/events/${eventId}/check-in`);
  expect(before.ok()).toBe(true);
  const beforeRiders = (await before.json() as CheckInList).riders;
  const original = beforeRiders.find((rider) => rider.orderId === alex.orderId);
  expect(original).toMatchObject({ bib: 100, checkedInAt: null });
  expect((await api.put(`/api/events/${eventId}/bib-settings`, {
    data: { scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 200 }] },
  })).ok()).toBe(true);
  await apply.click();
  await expect(detail.getByRole('alert')).toContainText('Bib preview changed. Review a new preview before applying.');
  await expect(apply).toHaveCount(0);
  await expect(detail.locator('.ci-bib__number')).toHaveText('100');
  const refused = await api.get(`/api/events/${eventId}/check-in`);
  expect(refused.ok()).toBe(true);
  expect((await refused.json() as CheckInList).riders.find((rider) => rider.orderId === alex.orderId)).toEqual(original);

  await form.getByRole('button', { name: 'Preview bib change', exact: true }).click();
  await expect(form.getByRole('region', { name: 'Proposed bib changes', exact: true })).toContainText('130');
  const other = beforeRiders.find(
    (rider) => rider.orderId !== alex.orderId && rider.result.ready && rider.bib === null,
  );
  if (!other) throw new Error('The demo needs another ready rider without a bib');
  const claimed = await api.post(`/api/events/${eventId}/check-in/${other.orderId}`, { data: { dayId: initial.dayId, bib: 130 } });
  expect(claimed.ok()).toBe(true);
  const otherAssignment = await claimed.json();
  expect(otherAssignment).toMatchObject({ bib: 130, checkedInAt: expect.any(String) });

  await apply.click();
  await expect(detail.getByRole('alert')).toContainText('Bib 130 belongs to a rider outside this batch.');
  await expect(apply).toHaveCount(0);
  await expect(detail.locator('.ci-bib__number')).toHaveText('100');
  const conflict = await api.get(`/api/events/${eventId}/check-in`);
  expect(conflict.ok()).toBe(true);
  const atConflict = (await conflict.json() as CheckInList).riders;
  expect(atConflict.find((rider) => rider.orderId === alex.orderId)).toEqual(original);
  expect(atConflict.find((rider) => rider.orderId === other.orderId)).toEqual(otherAssignment);

  await form.getByRole('textbox', { name: 'New bib', exact: true }).fill('131');
  await form.getByRole('button', { name: 'Preview bib change', exact: true }).click();
  await expect(form.getByRole('region', { name: 'Proposed bib changes', exact: true })).toContainText('131');
  await apply.click();
  await expect(detail.locator('.ci-bib__number')).toHaveText('131');
  const after = await api.get(`/api/events/${eventId}/check-in`);
  expect(after.ok()).toBe(true);
  const final = (await after.json() as CheckInList).riders;
  expect(final.find((rider) => rider.orderId === alex.orderId)).toMatchObject({ bib: 131, checkedInAt: null });
  expect(final.find((rider) => rider.orderId === other.orderId)).toEqual(otherAssignment);
});

for (const mobile of [false, true]) {
  test(`issued bib correction after withdrawal preserves blocked readiness (${mobile ? 'mobile' : 'desktop'})`, async ({ page }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const api = page.request;
    const { eventId } = await (await api.post('/api/demo')).json();
    await api.post(`/api/events/${eventId}/publish`, { data: { acknowledgeWarnings: true } });
    await api.post(`/api/events/${eventId}/check-in-demo-riders`);
    await api.put(`/api/events/${eventId}/bib-settings`, { data: { scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 199 }] } });
    const initial = await (await api.get(`/api/events/${eventId}/check-in`)).json();
    const alex = initial.riders.find((r: Rider) => r.name.startsWith('Alex'));
    expect((await api.post(`/api/events/${eventId}/check-in/${alex.orderId}`, { data: { dayId: initial.dayId } })).ok()).toBe(true);
    const order = await (await api.get(`/api/orders/${alex.orderId}`)).json();
    for (const entry of order.entries) expect((await api.post(`/api/order-entries/${entry.id}/withdraw`, { data: { reason: 'Demo rider withdrew after bib handoff' } })).ok()).toBe(true);
    await page.goto(`/#/events/${eventId}/check-in`);
    const search = page.getByRole('searchbox', { name: 'Find a rider' });
    await search.fill(alex.name);
    await search.press('Enter');
    const detail = page.getByRole('region', { name: 'Rider check-in', exact: true });
    await expect(detail.getByText('No entry on this race day', { exact: true })).toBeVisible();
    await detail.getByRole('button', { name: 'Change bib', exact: true }).click();
    const form = detail.getByRole('form', { name: 'Change rider bib', exact: true });
    await form.getByRole('textbox', { name: 'New bib', exact: true }).fill('130');
    await form.getByRole('textbox', { name: 'Reason', exact: true }).fill('Record the replacement demo bib after withdrawal');
    await form.getByRole('button', { name: 'Preview bib change', exact: true }).click();
    await expect(detail.getByRole('alert')).toContainText('Acknowledge');
    await form.getByRole('checkbox').check();
    await form.getByRole('button', { name: 'Preview bib change', exact: true }).click();
    await expect(form.getByRole('note')).toContainText('Alex Demo (Saturday)');
    expect((await new AxeBuilder({ page }).include('[aria-label="Rider check-in"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
    await page.screenshot({ path: `test-results/bib-followups-${mobile ? 'mobile' : 'desktop'}.png`, fullPage: true, animations: 'disabled' });
    if (mobile) {
      await page.getByRole('button', { name: /Switch to dark/ }).click();
      await page.screenshot({ path: 'test-results/bib-followups-mobile-dark.png', fullPage: true, animations: 'disabled' });
    }
    await form.getByRole('button', { name: 'Apply bib change', exact: true }).click();
    await expect(detail.locator('.ci-bib__number')).toHaveText('130');
    const after = await (await api.get(`/api/orders/${alex.orderId}`)).json();
    expect(after.entries.map((e: { status: string }) => e.status)).toEqual(order.entries.map(() => 'withdrawn'));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
