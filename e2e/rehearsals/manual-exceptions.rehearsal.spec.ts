// Rehearsal: manual license and waiver exceptions. Runbook: docs/runbooks/race-day-check-in.md
// (Manual license and waiver exceptions 1-4). Fictional data only.
import pg from 'pg';
import { expect, test } from '../fixtures';
import type { CheckInList } from '../../src/shared/checkin';
import { publishReviewed } from '../support/publish';
import { REHEARSAL_DATABASE_URL } from './database';
import { rolePage } from './roles';

test.use({ trace: 'on', screenshot: 'on' });

const LEAD = 'exceptions.lead.rehearsal@example.test';
const VOLUNTEER = 'exceptions.desk.rehearsal@example.test';

test('@rehearsal manual license and waiver exceptions keep the bib at the desk until the app shows ready', async ({ page, browser, baseURL }, testInfo) => {
  test.setTimeout(180_000);
  const shot = (who: typeof page, name: string) => who.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
  const demo = await (await page.request.post('/api/demo')).json() as { organizationId: string; eventId: string };
  const eventUrl = `/api/events/${demo.eventId}`;
  expect((await publishReviewed(page.request, eventUrl, { acknowledgeWarnings: true })).ok()).toBe(true);
  expect((await page.request.post(`${eventUrl}/check-in-demo-riders`)).ok()).toBe(true);
  expect((await page.request.put(`${eventUrl}/bib-settings`, { data: { scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 199 }] } })).ok()).toBe(true);
  for (const [email, role] of [[LEAD, 'registration_manager'], [VOLUNTEER, 'check_in_volunteer']] as const) {
    expect((await page.request.post(`/api/organizations/${demo.organizationId}/members`, { data: { email, role } })).ok()).toBe(true);
  }
  const readList = async () => (await (await page.request.get(`${eventUrl}/check-in`)).json()) as CheckInList;
  const desk = await readList();
  const byName = (name: string) => {
    const rider = desk.riders.find((row) => row.name === name);
    if (!rider?.checkInCode) throw new Error(`Missing fictional rider ${name}`);
    return rider;
  };
  const alex = byName('Alex Demo');
  const casey = byName('Casey Demo');
  const dana = byName('Dana Demo');
  const gray = byName('Gray Demo');

  // Facilitator setup, not a desk step: checkout always requires acceptance, so a missing waiver and a
  // missing guardian signature are made by altering only those two waiver records in this disposable database.
  const db = new pg.Client({ connectionString: REHEARSAL_DATABASE_URL });
  await db.connect();
  try {
    const patch = async (orderId: string, waiver: Record<string, string>) => {
      const result = await db.query('UPDATE orders SET waiver_json = waiver_json || $2::jsonb WHERE id = $1', [orderId, JSON.stringify(waiver)]);
      expect(result.rowCount).toBe(1);
    };
    await patch(alex.orderId, { signatureName: '' });
    await patch(casey.orderId, { signatureName: 'Casey Demo', signerRole: 'rider' });
  } finally {
    await db.end();
  }
  testInfo.annotations.push({ type: 'facilitator-setup', description: 'Alex Demo waiver signature cleared; Casey Demo waiver re-signed by the junior instead of a guardian. Both in the disposable rehearsal database only.' });

  const lead = await rolePage(browser, baseURL, LEAD);
  const volunteer = await rolePage(browser, baseURL, VOLUNTEER);
  const detail = volunteer.page.getByRole('region', { name: 'Rider check-in' });
  const search = volunteer.page.getByRole('searchbox', { name: 'Find a rider' });
  const lookup = async (code: string, name: string) => {
    await search.fill(code);
    await search.press('Enter');
    await expect(detail.getByRole('heading', { name, exact: true })).toBeVisible();
  };
  // Next rider appears only after a check-in; otherwise the volunteer searches again directly.
  const nextRider = async () => {
    const next = detail.getByRole('button', { name: 'Next rider', exact: true });
    if (await next.isVisible()) await next.click();
  };
  const refusedByServer = async (orderId: string) => {
    const response = await volunteer.page.request.post(`${eventUrl}/check-in/${orderId}`, { data: { dayId: desk.dayId, bib: null } });
    expect(response.status()).toBe(409);
    expect((await readList()).riders.find((row) => row.orderId === orderId)).toMatchObject({ bib: null, checkedInAt: null });
  };
  const held = async (rider: typeof alex, reason: string, shotName: string) => {
    await nextRider();
    await lookup(rider.checkInCode!, rider.name);
    await expect(detail.getByRole('status')).toContainText('Not ready');
    await expect(detail.getByText(reason, { exact: true }).first()).toBeVisible();
    await expect(detail.getByRole('button', { name: /Check in and issue/ })).toHaveCount(0);
    await shot(volunteer.page, shotName);
  };
  try {
    await volunteer.page.goto(`/#/events/${demo.eventId}/check-in`);
    await lookup(alex.checkInCode!, alex.name);

    await test.step('1 Volunteer: a missing waiver is named, the bib is held, and the rider is referred', async () => {
      await expect(detail.getByRole('status')).toContainText('Not ready');
      await expect(detail.getByText('Waiver not accepted', { exact: true }).first()).toBeVisible();
      await expect(detail.getByRole('button', { name: /Check in and issue/ })).toHaveCount(0);
      await shot(volunteer.page, '01-missing-waiver');
    });

    await test.step('1 Volunteer: a missing guardian signature on a junior is named, and the bib is held', async () => {
      await held(casey, 'Guardian has not accepted the waiver', '02-missing-guardian');
    });

    await test.step('2 Lead: a valid fictional license passes review without a typed note', async () => {
      await held(dana, 'License needs review', '03-license-needs-review');
      await lead.page.goto(`/#/events/${demo.eventId}/registrations`);
      await lead.page.getByRole('button', { name: /License review/ }).click();
      const order = lead.page.locator('.order', { hasText: 'Dana Demo' });
      const reviews = order.getByRole('button', { name: 'Review license' });
      await expect(reviews.first()).toBeVisible();
      const count = await reviews.count();
      for (let i = 0; i < count; i += 1) {
        await order.getByRole('button', { name: 'Review license' }).first().click();
        await expect(order.getByRole('group', { name: /^Review the license for/ }).getByRole('textbox')).toHaveCount(0);
        await order.getByRole('button', { name: 'Mark reviewed' }).click();
      }
      await shot(lead.page, '04-license-reviewed');
    });

    testInfo.annotations.push({
      type: 'not-rehearsed',
      description: '2 Lead: checking evidence against an approved license source, and sending a disputed case to the designated official, are conversations with no screen. The fictional lead left Gray Demo unreviewed as stale or mismatched evidence.',
    });

    await test.step('2 Lead: stale or mismatched evidence leaves the rider blocked, and the server refuses a bib', async () => {
      await held(gray, 'License needs review', '05-stale-evidence');
      await refusedByServer(gray.orderId);
    });

    testInfo.annotations.push({
      type: 'not-rehearsed',
      description: '3 Lead: no paper form was used. CycleReg cannot record a paper waiver, so the signing procedure is not on screen; the app blockers stay in place.',
    });

    await test.step('3 Lead: a waiver or guardian signature handled outside CycleReg leaves the blocker, and the server refuses a bib', async () => {
      await refusedByServer(alex.orderId);
      await refusedByServer(casey.orderId);
    });

    await test.step('4 Return to check-in: only the rider the app shows as ready gets a bib', async () => {
      await held(alex, 'Waiver not accepted', '06-alex-still-held');
      await held(casey, 'Guardian has not accepted the waiver', '07-casey-still-held');
      await nextRider();
      await lookup(dana.checkInCode!, dana.name);
      await expect(detail.getByRole('status')).toContainText('Ready to race');
      await detail.getByRole('button', { name: 'Check in and issue next bib', exact: true }).click();
      await expect(detail.locator('.ci-bib__number')).toHaveText('100');
      const list = await readList();
      for (const rider of [alex, casey, gray]) {
        expect(list.riders.find((row) => row.orderId === rider.orderId)).toMatchObject({ bib: null, checkedInAt: null });
      }
      expect(list.riders.find((row) => row.orderId === dana.orderId)).toMatchObject({ bib: 100, checkedInAt: expect.any(String) });
      await shot(volunteer.page, '08-dana-issued');
    });
  } finally {
    await lead.close();
    await volunteer.close();
  }
});
