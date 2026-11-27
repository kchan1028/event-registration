// Rehearsal: bib ranges, repeated check-in and bulk allocation at the race-day desk.
// Runbook: docs/runbooks/race-day-check-in.md (Before the desk opens 2, At the desk 5, Corrections and uncertain outcomes,
// Blocked riders and escalation). Fictional data only.
import { expect, test } from '../fixtures';
import type { CheckInList } from '../../src/shared/checkin';
import { publishReviewed } from '../support/publish';
import { rolePage } from './roles';

test.use({ trace: 'on', screenshot: 'on' });

const LEAD = 'bibs.lead.rehearsal@example.test';
const VOLUNTEER = 'bibs.volunteer.rehearsal@example.test';

test('@rehearsal bib ranges, a repeated check-in and bulk allocation keep one bib per rider', async ({ page, browser, baseURL }, testInfo) => {
  test.setTimeout(180_000);
  const shot = (who: typeof page, name: string) => who.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
  const demo = await (await page.request.post('/api/demo')).json() as { organizationId: string; eventId: string };
  const eventUrl = `/api/events/${demo.eventId}`;
  expect((await publishReviewed(page.request, eventUrl, { acknowledgeWarnings: true })).ok()).toBe(true);
  expect((await page.request.post(`${eventUrl}/check-in-demo-riders`)).ok()).toBe(true);
  // One bib covers the weekend, with no range yet: the desk opens before the lead has entered the inventory.
  expect((await page.request.put(`${eventUrl}/bib-settings`, { data: { scope: 'weekend', ranges: [] } })).ok()).toBe(true);
  for (const [email, role] of [[LEAD, 'registration_manager'], [VOLUNTEER, 'check_in_volunteer']] as const) {
    expect((await page.request.post(`/api/organizations/${demo.organizationId}/members`, { data: { email, role } })).ok()).toBe(true);
  }
  const readList = async (): Promise<CheckInList> => (await (await page.request.get(`${eventUrl}/check-in`)).json()) as CheckInList;
  const initial = await readList();
  const [first, second, third] = initial.riders.filter((rider) => rider.result.ready && rider.bib === null && rider.checkInCode);
  const blocked = initial.riders.find((rider) => rider.payment === 'confirmed' && !rider.result.ready && rider.bib === null && rider.checkInCode);
  if (!first || !second || !third || !blocked) throw new Error('The demo needs three ready riders and one blocked paid rider without bibs');
  const recorded = async (orderId: string) => (await readList()).riders.find((rider) => rider.orderId === orderId)!;

  const lead = await rolePage(browser, baseURL, LEAD);
  const volunteer = await rolePage(browser, baseURL, VOLUNTEER);
  const detail = volunteer.page.getByRole('region', { name: 'Rider check-in' });
  const search = volunteer.page.getByRole('searchbox', { name: 'Find a rider' });
  const issue = detail.getByRole('button', { name: 'Check in and issue next bib', exact: true });
  const lookup = async (code: string, name: string) => {
    await search.fill(code);
    await search.press('Enter');
    await expect(detail.getByRole('heading', { name, exact: true })).toBeVisible();
  };
  const saveRange = async (firstBib: number, lastBib: number) => {
    await lead.page.goto(`/#/events/${demo.eventId}/check-in`);
    const toggle = lead.page.getByRole('button', { name: 'Bib ranges', exact: true });
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    const whole = lead.page.getByRole('form', { name: 'Bib ranges' }).locator('.ci-bibs__range', { hasText: 'Whole event' });
    await whole.getByLabel('First').fill(String(firstBib));
    await whole.getByLabel('Last').fill(String(lastBib));
    const saved = lead.page.waitForResponse((r) => r.url().endsWith(`${eventUrl}/bib-settings`) && r.request().method() === 'PUT');
    await lead.page.getByRole('button', { name: 'Save bib ranges' }).click();
    expect((await saved).ok()).toBe(true);
  };
  try {
    await test.step('Blocked: no bib range covers the rider, so the volunteer stops that assignment', async () => {
      await volunteer.page.goto(`/#/events/${demo.eventId}/check-in`);
      await lookup(first.checkInCode!, first.name);
      await expect(detail.getByRole('status')).toContainText('Ready to race');
      await issue.click();
      await expect(detail.getByRole('alert')).toContainText('No bib range covers every applicable entry.');
      expect(await recorded(first.orderId)).toMatchObject({ bib: null, checkedInAt: null, bibHistory: [] });
      await shot(volunteer.page, '01-no-range');
    });

    await test.step('Before the desk opens 2: the lead configures a one-number range, and the volunteer retries', async () => {
      await saveRange(100, 100);
      await lookup(first.checkInCode!, first.name);
      await issue.click();
      await expect(detail.locator('.ci-bib__number')).toHaveText('100');
      await shot(volunteer.page, '02-first-bib');
    });

    await test.step('Blocked: the range is exhausted, so the volunteer stops and the lead extends it', async () => {
      await detail.getByRole('button', { name: 'Next rider', exact: true }).click();
      await lookup(second.checkInCode!, second.name);
      await issue.click();
      await expect(detail.getByRole('alert')).toContainText('Every bib from 100 to 100 is in use.');
      expect(await recorded(second.orderId)).toMatchObject({ bib: null, checkedInAt: null, bibHistory: [] });
      await shot(volunteer.page, '03-exhausted');
      await saveRange(100, 199);
      await lookup(second.checkInCode!, second.name);
      await issue.click();
      await expect(detail.locator('.ci-bib__number')).toHaveText('101');
      expect(await recorded(first.orderId)).toMatchObject({ bib: 100 });
      await shot(volunteer.page, '04-retried');
    });

    await test.step('Uncertain outcome: the desk cannot confirm a check-in, and lookup shows the saved bib with no second issue', async () => {
      await detail.getByRole('button', { name: 'Next rider', exact: true }).click();
      await lookup(third.checkInCode!, third.name);
      const url = `**/api/events/${demo.eventId}/check-in/${third.orderId}`;
      await volunteer.page.route(url, async (route) => {
        await route.fetch();
        await route.abort('connectionfailed');
      }, { times: 1 });
      await issue.click();
      await expect(detail.getByRole('alert')).toHaveText('Check-in could not be confirmed.');
      await expect(detail.getByRole('button', { name: /Check in and issue/ })).toHaveCount(0);
      await volunteer.page.unroute(url);
      await lookup(third.checkInCode!, third.name);
      await expect(detail.locator('.ci-bib__number')).toHaveText('102');
      await expect(detail.getByRole('button', { name: /Check in and issue/ })).toHaveCount(0);
      await shot(volunteer.page, '05-confirmed-by-lookup');
    });

    await test.step('At the desk 5: returning to each checked-in rider shows the same bib and offers no second issue', async () => {
      for (const [rider, bib] of [[first, '100'], [second, '101'], [third, '102']] as const) {
        await detail.getByRole('button', { name: 'Next rider', exact: true }).click();
        await lookup(rider.checkInCode!, rider.name);
        await expect(detail.locator('.ci-bib__number')).toHaveText(bib);
        await expect(detail.getByRole('button', { name: /Check in and issue/ })).toHaveCount(0);
      }
      const list = await readList();
      for (const rider of [first, second, third]) {
        expect(list.riders.find((row) => row.orderId === rider.orderId)?.bibHistory).toHaveLength(1);
      }
      const bibs = list.riders.map((row) => row.bib).filter((bib): bib is number => bib !== null);
      expect(new Set(bibs).size).toBe(bibs.length);
    });

    await test.step('Bulk allocation: the volunteer cannot open it, and the lead reserves a number without clearing readiness', async () => {
      await expect(volunteer.page.getByRole('button', { name: 'Assign bibs', exact: true })).toHaveCount(0);
      expect((await volunteer.page.request.post(`${eventUrl}/bibs/preview`, { data: {} })).status()).toBe(403);
      await lead.page.goto(`/#/events/${demo.eventId}/check-in`);
      await lead.page.getByRole('button', { name: 'Assign bibs', exact: true }).click();
      const panel = lead.page.getByRole('region', { name: 'Bulk bib assignment', exact: true });
      await panel.getByRole('checkbox', { name: blocked.name }).check();
      await panel.getByRole('button', { name: 'Preview bib assignments', exact: true }).click();
      await expect(panel.getByRole('region', { name: 'Proposed bib assignments' }).getByRole('cell', { name: '103', exact: true })).toBeVisible();
      await panel.getByRole('button', { name: 'Apply 1 bib assignment', exact: true }).click();
      await expect(panel.getByText('1 bib assigned. Readiness and check-in are unchanged.')).toBeVisible();
      await shot(lead.page, '06-bulk-applied');
      expect(await recorded(blocked.orderId)).toMatchObject({ bib: 103, checkedInAt: null, result: { ready: false } });
      await detail.getByRole('button', { name: 'Next rider', exact: true }).click();
      await lookup(blocked.checkInCode!, blocked.name);
      await expect(detail.getByRole('status')).toContainText('Not ready');
      await expect(detail.getByRole('button', { name: /Check in and issue/ })).toHaveCount(0);
      await shot(volunteer.page, '07-reserved-still-blocked');
    });

    testInfo.annotations.push({
      type: 'not-rehearsed',
      description: 'Physical bib inventory and recovering a handed-out bib cannot be automated. The screen ranges stand in for the mock inventory.',
    });
  } finally {
    await lead.close();
    await volunteer.close();
  }
});
