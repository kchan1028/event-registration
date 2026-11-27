// Rehearsal: organizer handoff. Runbook: docs/runbooks/organizer-handoff.md. Fictional data only.
import type { CheckInList } from '../../src/shared/checkin';
import { E2E_ORGANIZER, expect, test } from '../fixtures';
import { publishReviewed } from '../support/publish';
import { rolePage } from './roles';

test.use({ trace: 'on', screenshot: 'on' });

const SUCCESSOR = 'successor.rehearsal@example.test';

test('@rehearsal organizer hands ownership to a signed-in successor', async ({ page, browser, baseURL }, testInfo) => {
  test.setTimeout(180_000);
  const shot = (who: typeof page, name: string) => who.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
  const demo = await (await page.request.post('/api/demo')).json() as { organizationId: string; eventId: string };
  const eventUrl = `/api/events/${demo.eventId}`;
  expect((await publishReviewed(page.request, eventUrl, { acknowledgeWarnings: true })).ok()).toBe(true);
  expect((await page.request.post(`${eventUrl}/check-in-demo-riders`)).ok()).toBe(true);
  expect((await page.request.put(`${eventUrl}/bib-settings`, {
    data: { scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 199 }] },
  })).ok()).toBe(true);
  expect((await page.request.post(`/api/organizations/${demo.organizationId}/members`, {
    data: { email: E2E_ORGANIZER, role: 'registration_manager' },
  })).ok()).toBe(true);
  const published = await (await page.request.get(eventUrl)).json() as { publishedVersion: number | null; config: { event: { name: string } } };
  const desk: CheckInList = await (await page.request.get(`${eventUrl}/check-in`)).json();
  const ready = desk.riders.find((rider) => rider.name === 'Alex Demo');
  const blocked = desk.riders.find((rider) => rider.name === 'Dana Demo');
  expect(ready?.checkInCode).toBeTruthy();
  expect(blocked?.result.ready).toBe(false);

  const successor = await rolePage(browser, baseURL, SUCCESSOR);
  try {
    await test.step('Before handing over 1: both accounts are fictional .test addresses in separate sessions', async () => {
      expect(E2E_ORGANIZER.endsWith('.test')).toBe(true);
      expect(SUCCESSOR.endsWith('.test')).toBe(true);
      await successor.page.goto('/');
      await expect(successor.page.getByRole('heading', { name: 'Your organizations' })).toBeVisible();
      await shot(successor.page, '01-successor-home');
    });

    testInfo.annotations.push({
      type: 'not-rehearsed',
      description: 'Before handing over 2: named support, finance and timer duties stay unassigned. A role in this rehearsal is not acceptance of those duties.',
    });
    testInfo.annotations.push({
      type: 'not-rehearsed',
      description: 'Before handing over 3: there is no in-app operating-pack upload. Event links and the published version are checked in the successor steps. Rider records are not copied into this repository.',
    });

    await test.step('Before handing over 4: the outgoing organizer keeps Registration manager and only the Owner role is transferred', async () => {
      const members = await (await page.request.get(`/api/organizations/${demo.organizationId}/members`)).json() as { members: { email: string; role: string }[] };
      expect(members.members.some((member) => member.email === E2E_ORGANIZER && member.role === 'registration_manager')).toBe(true);
      expect(members.members.some((member) => member.email === E2E_ORGANIZER && member.role === 'owner')).toBe(true);
    });

    await test.step('Current owner 1: open Home and Team and roles for this organization', async () => {
      await page.goto('/');
      const organization = page.getByRole('article').filter({ has: page.locator(`a[href="#/events/${demo.eventId}"]`) });
      await organization.getByRole('button', { name: 'Team and roles', exact: true }).click();
      await expect(organization.getByRole('region', { name: /^Team and roles for / })).toBeVisible();
      await shot(page, 'owner-01-team');
    });

    await test.step('Current owner 2: the successor is already signed in on a separate session', async () => {
      await expect(successor.page.getByRole('heading', { name: 'Your organizations' })).toBeVisible();
      expect((await successor.page.request.get(`/api/organizations/${demo.organizationId}/members`)).status()).toBe(404);
    });

    await test.step('Current owner 3: add the signed-in successor as Registration manager', async () => {
      const organization = page.getByRole('article').filter({ has: page.locator(`a[href="#/events/${demo.eventId}"]`) });
      const team = organization.getByRole('region', { name: /^Team and roles for / });
      await team.getByLabel('Email', { exact: true }).fill(SUCCESSOR);
      await team.getByLabel('Role', { exact: true }).selectOption('registration_manager');
      await team.getByRole('button', { name: 'Add to team', exact: true }).click();
      await expect(team.getByLabel('New owner')).toBeEnabled();
      await shot(page, 'owner-03-added');
    });

    await test.step('Current owner 4: choose that teammate as New owner', async () => {
      const organization = page.getByRole('article').filter({ has: page.locator(`a[href="#/events/${demo.eventId}"]`) });
      const team = organization.getByRole('region', { name: /^Team and roles for / });
      await team.getByLabel('New owner').selectOption(SUCCESSOR);
      await expect(team.getByLabel('New owner')).toHaveValue(SUCCESSOR);
    });

    await test.step('Current owner 5: Keep ownership cancels, then Hand over to the successor commits', async () => {
      const organization = page.getByRole('article').filter({ has: page.locator(`a[href="#/events/${demo.eventId}"]`) });
      const team = organization.getByRole('region', { name: /^Team and roles for / });
      await team.getByRole('button', { name: 'Hand over ownership', exact: true }).click();
      await team.getByRole('button', { name: 'Keep ownership', exact: true }).click();
      await expect(team.getByRole('button', { name: `Hand over to ${SUCCESSOR}`, exact: true })).toHaveCount(0);
      expect((await page.request.get(`/api/organizations/${demo.organizationId}/members`)).status()).toBe(200);
      await team.getByRole('button', { name: 'Hand over ownership', exact: true }).click();
      await team.getByRole('button', { name: `Hand over to ${SUCCESSOR}`, exact: true }).click();
      await expect(team.getByRole('status')).toContainText('You are no longer an owner');
      await shot(page, 'owner-05-transferred');
    });

    await test.step('Current owner 6: reload both accounts and read the new owner', async () => {
      await page.reload();
      const organization = page.getByRole('article').filter({ has: page.locator(`a[href="#/events/${demo.eventId}"]`) });
      await expect(organization.getByRole('button', { name: 'Team and roles', exact: true })).toHaveCount(0);
      await successor.page.reload();
      const successorOrg = successor.page.getByRole('article').filter({ has: successor.page.locator(`a[href="#/events/${demo.eventId}"]`) });
      await successorOrg.getByRole('button', { name: 'Team and roles', exact: true }).click();
      await expect(successorOrg.getByRole('region', { name: /^Team and roles for / })).toContainText('Owner');
      await shot(successor.page, 'owner-06-successor');
    });

    await test.step('Successor: Owner membership and the handoff are in Recent changes', async () => {
      const successorOrg = successor.page.getByRole('article').filter({ has: successor.page.locator(`a[href="#/events/${demo.eventId}"]`) });
      const team = successorOrg.getByRole('region', { name: /^Team and roles for / });
      await expect(team).toContainText(`${E2E_ORGANIZER} handed ownership to ${SUCCESSOR}`);
      const members = await (await successor.page.request.get(`/api/organizations/${demo.organizationId}/members`)).json() as {
        members: { email: string; role: string }[];
        history: { action: string; email: string; by: string }[];
      };
      expect(members.members.filter((member) => member.role === 'owner').map((member) => member.email)).toEqual([SUCCESSOR]);
      expect(members.history.filter((row) => row.action === 'ownership_transferred')).toEqual([
        expect.objectContaining({ email: SUCCESSOR, by: E2E_ORGANIZER }),
      ]);
    });

    await test.step('Successor: the published event and version are unchanged', async () => {
      const after = await (await successor.page.request.get(eventUrl)).json() as { publishedVersion: number | null; config: { event: { name: string } } };
      expect(after.publishedVersion).toBe(published.publishedVersion);
      expect(after.config.event.name).toBe(published.config.event.name);
      await successor.page.goto(`/#/events/${demo.eventId}`);
      await expect(successor.page.getByRole('heading', { level: 1 })).toBeVisible();
      await shot(successor.page, 'successor-event');
    });

    await test.step('Successor: issue one bib to a ready rider and leave the unreviewed rider blocked', async () => {
      await successor.page.goto(`/#/events/${demo.eventId}/check-in`);
      const search = successor.page.getByRole('searchbox', { name: 'Find a rider' });
      await search.fill(blocked!.checkInCode!);
      await search.press('Enter');
      const detail = successor.page.getByRole('region', { name: 'Rider check-in' });
      await expect(detail.getByRole('status')).toContainText('Not ready');
      await expect(detail.getByRole('button', { name: /Check in and issue/ })).toHaveCount(0);
      await search.fill(ready!.checkInCode!);
      await search.press('Enter');
      await expect(detail.getByRole('status')).toContainText('Ready to race');
      await detail.getByRole('button', { name: /Check in and issue/ }).click();
      await expect(detail.locator('.ci-bib__number')).toHaveText('100');
      await shot(successor.page, 'successor-bib');
    });

    await test.step('Successor: save a start-list snapshot and download the sample CSV', async () => {
      const lists = await (await successor.page.request.get(`${eventUrl}/start-lists`)).json() as { races: { raceId: string; raceName: string; rows: { entryId: string }[] }[] };
      const race = lists.races.find((candidate) => candidate.rows.some((row) => row.entryId === ready!.entries[0].id));
      expect(race).toBeTruthy();
      await successor.page.goto(`/#/events/${demo.eventId}/startlists`);
      await expect(successor.page.getByRole('heading', { name: 'Start lists and timer export', exact: true })).toBeVisible();
      await successor.page.getByRole('radio', { name: race!.raceName, exact: true }).check();
      const response = successor.page.waitForResponse((hit) => hit.url().endsWith(`/start-lists/${race!.raceId}/snapshots`) && hit.request().method() === 'POST');
      await successor.page.getByRole('button', { name: 'Save snapshot', exact: true }).click();
      const snapshotResponse = await response;
      expect(snapshotResponse.status()).toBe(201);
      const snapshot = await snapshotResponse.json() as { version: number };
      const csvResponse = successor.page.waitForResponse((hit) => hit.url().includes(`/start-lists/${race!.raceId}/csv?snapshot=${snapshot.version}`));
      await successor.page.getByRole('link', { name: `Download v${snapshot.version}`, exact: true }).click();
      const csv = await csvResponse;
      expect(csv.status()).toBe(200);
      expect(await csv.text()).toContain(ready!.entries[0].id);
      await shot(successor.page, 'successor-csv');
    });

    await test.step('Successor: the owner can download the ledger', async () => {
      expect((await successor.page.request.get(`${eventUrl}/exports/ledger.csv`)).status()).toBe(200);
    });

    await test.step('Outgoing account keeps Registration manager and loses team and ledger access', async () => {
      expect((await page.request.get(`/api/organizations/${demo.organizationId}/members`)).status()).toBe(403);
      expect((await page.request.get(`${eventUrl}/orders`)).status()).toBe(200);
      expect((await page.request.get(`${eventUrl}/exports/ledger.csv`)).status()).toBe(403);
      await shot(page, 'outgoing-retained');
    });

    testInfo.annotations.push({
      type: 'not-rehearsed',
      description: 'Named-person acceptance, unaided successor operation, Clerk delivery, bank and settlement duties, and timer import of the CSV.',
    });
  } finally {
    await successor.close();
  }
});
