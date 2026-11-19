import { E2E_ORGANIZER, expect, test } from './fixtures';
import type { CheckInList } from '../src/shared/checkin';
import { parseCsv } from '../src/shared/csv';
import type { StartLists } from '../src/server/startlists';

test('successor takes ownership in a separate account while outgoing roles remain scoped', async ({ page, browser }) => {
  const { organizationId, eventId } = await (await page.request.post('/api/demo')).json();
  await page.request.post(`/api/events/${eventId}/publish`, { data: { acknowledgeWarnings: true } });
  await page.request.post(`/api/events/${eventId}/check-in-demo-riders`);
  await page.request.put(`/api/events/${eventId}/bib-settings`, { data: { scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 199 }] } });
  expect((await page.request.post(`/api/organizations/${organizationId}/members`, { data: { email: E2E_ORGANIZER, role: 'registration_manager' } })).status()).toBe(200);
  const successorEmail = 'successor.organizer@example.test';
  const context = await browser.newContext({ extraHTTPHeaders: { Authorization: `Bearer test:${successorEmail}` } });
  try {
    const successor = await context.newPage();
    await successor.addInitScript((email) => sessionStorage.setItem('cyclereg.test-session', email), successorEmail);
    await successor.goto('/');
    await expect(successor.getByRole('heading', { name: 'Your organizations' })).toBeVisible();
    await page.goto('/');
    const organization = page.getByRole('article').filter({ has: page.locator(`a[href="#/events/${eventId}"]`) });
    await organization.getByRole('button', { name: 'Team and roles', exact: true }).click();
    const team = organization.getByRole('region', { name: /^Team and roles for / });
    await team.getByLabel('Email', { exact: true }).fill(successorEmail);
    await team.getByLabel('Role', { exact: true }).selectOption('registration_manager');
    await team.getByRole('button', { name: 'Add to team', exact: true }).click();
    await expect(team.getByLabel('New owner')).toBeEnabled();
    await team.getByLabel('New owner').selectOption(successorEmail);
    await team.getByRole('button', { name: 'Hand over ownership', exact: true }).click();
    await team.getByRole('button', { name: 'Keep ownership', exact: true }).click();
    await expect(team.getByRole('button', { name: `Hand over to ${successorEmail}`, exact: true })).toHaveCount(0);
    expect((await page.request.get(`/api/organizations/${organizationId}/members`)).status()).toBe(200);
    await team.getByRole('button', { name: 'Hand over ownership', exact: true }).click();
    await team.getByRole('button', { name: `Hand over to ${successorEmail}`, exact: true }).click();
    await expect(team.getByRole('status')).toContainText('You are no longer an owner');
    await page.reload();
    await expect(organization.getByRole('button', { name: 'Team and roles', exact: true })).toHaveCount(0);
    expect((await page.request.get(`/api/organizations/${organizationId}/members`)).status()).toBe(403);
    expect((await page.request.post(`/api/organizations/${organizationId}/ownership-transfer`, { data: { email: successorEmail } })).status()).toBe(403);
    expect((await page.request.get(`/api/events/${eventId}/orders`)).status()).toBe(200);
    expect((await page.request.get(`/api/events/${eventId}/exports/ledger.csv`)).status()).toBe(403);
    await successor.reload();
    const successorOrg = successor.getByRole('article').filter({ has: successor.locator(`a[href="#/events/${eventId}"]`) });
    await successorOrg.getByRole('button', { name: 'Team and roles', exact: true }).click();
    const successorTeam = successorOrg.getByRole('region', { name: /^Team and roles for / });
    await expect(successorTeam).toContainText(`${E2E_ORGANIZER} handed ownership to ${successorEmail}`);
    const members = await (await successor.request.get(`/api/organizations/${organizationId}/members`)).json();
    expect(members.members.filter((m: { role: string }) => m.role === 'owner').map((m: { email: string }) => m.email)).toEqual([successorEmail]);
    expect(members.history.filter((h: { action: string }) => h.action === 'ownership_transferred')).toHaveLength(1);
    expect(members.history.find((h: { action: string }) => h.action === 'ownership_transferred')).toMatchObject({ email: successorEmail, by: E2E_ORGANIZER });
    expect((await successor.request.get(`/api/events/${eventId}/exports/ledger.csv`)).status()).toBe(200);
    const list: CheckInList = await (await successor.request.get(`/api/events/${eventId}/check-in`)).json();
    const ready = list.riders.find((r) => r.result.ready);
    expect(ready, 'The fictional check-in fixture must include a ready rider').toBeDefined();
    if (!ready) throw new Error('No ready rider in the fictional check-in fixture');
    await successor.goto(`/#/events/${eventId}/check-in`);
    await successor.getByRole('searchbox', { name: 'Find a rider' }).fill(ready.checkInCode!);
    await successor.getByRole('searchbox', { name: 'Find a rider' }).press('Enter');
    await expect(successor.getByRole('region', { name: 'Rider check-in' })).toContainText('Ready to race');
    await successor.getByRole('button', { name: /Check in and issue/ }).click();
    await expect(successor.getByRole('region', { name: 'Rider check-in' }).locator('.ci-bib__number')).toHaveText('100');
    const lists = await (await successor.request.get(`/api/events/${eventId}/start-lists`)).json();
    const race = lists.races.find((r: { rows: { entryId: string }[] }) => r.rows.some((row) => row.entryId === ready.entries[0].id));
    expect(race, 'The checked-in rider must appear in a start list').toBeDefined();
    await successor.goto(`/#/events/${eventId}/startlists`);
    await expect(successor.getByRole('heading', { name: 'Start lists and timer export', exact: true })).toBeVisible();
    await successor.getByRole('radio', { name: race.raceName, exact: true }).check();
    const response = successor.waitForResponse((r) => r.url().endsWith(`/start-lists/${race.raceId}/snapshots`) && r.request().method() === 'POST');
    await successor.getByRole('button', { name: 'Save snapshot', exact: true }).click();
    const snapshotResponse = await response;
    expect(snapshotResponse.status()).toBe(201);
    const snapshot = await snapshotResponse.json();
    await expect(successor.getByRole('status').filter({ hasText: `Saved snapshot v${snapshot.version}` })).toBeVisible();
    const csvResponse = successor.waitForResponse((r) => r.url().includes(`/start-lists/${race.raceId}/csv?snapshot=${snapshot.version}`));
    await successor.getByRole('link', { name: `Download v${snapshot.version}`, exact: true }).click();
    const csv = await csvResponse;
    expect(csv.status()).toBe(200);
    expect(await csv.text()).toContain(ready.entries[0].id);
  } finally { await context.close(); }
});

test('timer role downloads a locked start list and sees the desk revision', async ({ page, browser }) => {
  const { organizationId, eventId } = await (await page.request.post('/api/demo')).json();
  const eventUrl = `/api/events/${eventId}`;
  const listsUrl = `${eventUrl}/start-lists`;
  expect((await page.request.post(`${eventUrl}/publish`, { data: { acknowledgeWarnings: true } })).ok()).toBe(true);
  expect((await page.request.post(`${eventUrl}/check-in-demo-riders`)).ok()).toBe(true);
  expect((await page.request.put(`${eventUrl}/bib-settings`, {
    data: { scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 199 }] },
  })).ok()).toBe(true);
  const desk: CheckInList = await (await page.request.get(`${eventUrl}/check-in`)).json();
  const rider = desk.riders.find((candidate) => candidate.result.ready && candidate.bib === null);
  if (!rider) throw new Error('The fixture needs a ready rider without a bib');
  const entryId = rider.entries[0].id;

  const email = 'rehearsal.timer@example.test';
  expect((await page.request.post(`/api/organizations/${organizationId}/members`, {
    data: { email, role: 'timer_export' },
  })).ok()).toBe(true);
  const context = await browser.newContext({ extraHTTPHeaders: { Authorization: `Bearer test:${email}` } });
  try {
    await context.addInitScript((user) => sessionStorage.setItem('cyclereg.test-session', user), email);
    const timer = await context.newPage();
    await timer.goto(`/#/events/${eventId}/startlists`);
    await expect(timer.getByRole('heading', { name: 'Start lists and timer export', exact: true })).toBeVisible();
    const response = await timer.request.get(listsUrl);
    expect(response.ok()).toBe(true);
    const lists: Awaited<ReturnType<StartLists['overview']>> = await response.json();
    const race = lists.races.find((candidate) => candidate.rows.some((row) => row.entryId === entryId));
    if (!race) throw new Error('The ready rider must appear in a start list');
    const raceUrl = `${listsUrl}/${race.raceId}`;

    const checkInUrl = `${eventUrl}/check-in/${rider.orderId}`;
    const checkInData = { dayId: desk.dayId, bib: null };
    expect((await timer.request.get(`${eventUrl}/check-in`)).status()).toBe(403);
    expect((await timer.request.post(checkInUrl, { data: checkInData })).status()).toBe(403);
    expect((await timer.request.get(`${eventUrl}/exports/ledger.csv`)).status()).toBe(403);

    await timer.getByRole('radio', { name: race.raceName, exact: true }).check();
    const locked = timer.waitForResponse((res) => res.url().endsWith(`${raceUrl}/lock`) && res.request().method() === 'POST');
    await timer.getByRole('button', { name: 'Lock start list', exact: true }).click();
    const lock = await locked;
    expect(lock.status()).toBe(201);
    const { version } = await lock.json();
    const lockedUrl = `${raceUrl}/csv?snapshot=${version}`;
    const downloaded = timer.waitForResponse((res) => res.url().endsWith(lockedUrl));
    await timer.getByRole('link', { name: 'Download the locked list', exact: true }).click();
    const csv = await downloaded;
    expect(csv.status()).toBe(200);
    const saved = await csv.text();
    const [columns, ...rows] = parseCsv(saved);
    const savedEntry = rows.find((row) => row[columns.indexOf('entry_id')] === entryId);
    expect(savedEntry?.[columns.indexOf('bib')]).toBe('');
    expect(savedEntry?.[columns.indexOf('checked_in')]).toBe('N');

    const issued = await page.request.post(checkInUrl, { data: checkInData });
    expect(issued.ok()).toBe(true);
    const { bib } = await issued.json();
    expect(bib).toBe(100);
    await timer.reload();
    await timer.getByRole('radio', { name: race.raceName, exact: true }).check();
    await expect(timer.getByRole('region', { name: `Revisions since the lock (v${version})` })).toContainText(`bib none → ${bib}`);
    const repeated = await timer.request.get(lockedUrl);
    expect(repeated.status()).toBe(200);
    expect(await repeated.text()).toBe(saved);
  } finally {
    await context.close();
  }
});

test('incoming desk volunteer sees the existing bib and can check in the next rider', async ({ page, browser, baseURL }) => {
  const { organizationId, eventId } = await (await page.request.post('/api/demo')).json();
  const eventUrl = `/api/events/${eventId}`;
  expect((await page.request.post(`${eventUrl}/publish`, { data: { acknowledgeWarnings: true } })).ok()).toBe(true);
  expect((await page.request.post(`${eventUrl}/check-in-demo-riders`)).ok()).toBe(true);
  expect((await page.request.put(`${eventUrl}/bib-settings`, {
    data: { scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 199 }] },
  })).ok()).toBe(true);
  const desk: CheckInList = await (await page.request.get(`${eventUrl}/check-in`)).json();
  const [first, next] = desk.riders.filter((rider) => rider.result.ready && rider.bib === null);
  if (!first?.checkInCode || !next?.checkInCode) throw new Error('The shift rehearsal needs two ready riders with check-in codes');
  const firstCode = first.checkInCode;
  const nextCode = next.checkInCode;

  const openDesk = async (email: string) => {
    expect((await page.request.post(`/api/organizations/${organizationId}/members`, {
      data: { email, role: 'check_in_volunteer' },
    })).ok()).toBe(true);
    const context = await browser.newContext({
      baseURL, extraHTTPHeaders: { Authorization: `Bearer test:${email}` },
    });
    await context.addInitScript((user) => sessionStorage.setItem('cyclereg.test-session', user), email);
    const volunteer = await context.newPage();
    const readDesk = async () => {
      const response = await volunteer.request.get(`${eventUrl}/check-in?day=${desk.dayId}`);
      expect(response.ok()).toBe(true);
      return await response.json() as CheckInList;
    };
    const detail = volunteer.getByRole('region', { name: 'Rider check-in' });
    const search = volunteer.getByRole('searchbox', { name: 'Find a rider' });
    const lookup = async (code: string) => {
      await search.fill(code);
      await search.press('Enter');
    };
    await volunteer.goto(`/#/events/${eventId}/check-in`);
    expect((await readDesk()).roles).toEqual(['check_in_volunteer']);
    return { context, detail, lookup, readDesk };
  };

  const outgoing = await openDesk('outgoing.volunteer@example.test');
  let before: CheckInList['riders'][number] | undefined;
  try {
    await outgoing.lookup(firstCode);
    await outgoing.detail.getByRole('button', { name: 'Check in and issue next bib', exact: true }).click();
    await expect(outgoing.detail.locator('.ci-bib__number')).toHaveText('100');
    before = (await outgoing.readDesk()).riders.find((rider) => rider.orderId === first.orderId);
    expect(before).toMatchObject({
      bib: 100, checkedInAt: expect.any(String), bibHistory: [expect.objectContaining({ bib: 100 })],
    });
  } finally {
    await outgoing.context.close();
  }

  const incoming = await openDesk('incoming.volunteer@example.test');
  try {
    await incoming.lookup(firstCode);
    await expect(incoming.detail.getByRole('status')).toContainText('Checked in.');
    await expect(incoming.detail.locator('.ci-bib__number')).toHaveText('100');
    await expect(incoming.detail.getByRole('button', { name: /Check in and issue/ })).toHaveCount(0);

    await incoming.detail.getByRole('button', { name: 'Next rider', exact: true }).click();
    await incoming.lookup(nextCode);
    await incoming.detail.getByRole('button', { name: 'Check in and issue next bib', exact: true }).click();
    await expect(incoming.detail.locator('.ci-bib__number')).toHaveText('101');
    const final = await incoming.readDesk();
    expect(final.riders.find((rider) => rider.orderId === first.orderId)).toEqual(before);
    expect(final.riders.find((rider) => rider.orderId === next.orderId)).toMatchObject({
      bib: 101, checkedInAt: expect.any(String), bibHistory: [expect.objectContaining({ bib: 101 })],
    });
  } finally {
    await incoming.context.close();
  }
});
