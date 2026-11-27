// Rehearsal: a junior walk-up registered by a guardian. Runbook: docs/runbooks/walkup-registration.md (At the desk 1-5)
// and docs/runbooks/race-day-check-in.md (Blocked riders and escalation). Fictional data only.
import { devices } from '@playwright/test';
import { expect, test } from '../fixtures';
import type { CheckInList } from '../../src/shared/checkin';
import { seedRegistrationCase } from '../support/registration-case';
import { rolePage } from './roles';

test.use({ trace: 'on', screenshot: 'on' });

const VOLUNTEER = 'junior.volunteer.rehearsal@example.test';
const GUARDIAN = 'junior.guardian.rehearsal@example.test';

test('@rehearsal a guardian registers a junior walk-up on their own phone before the desk issues a bib', async ({ page, browser, baseURL }, testInfo) => {
  test.setTimeout(180_000);
  const shot = (who: typeof page, name: string) => who.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
  const eventId = await seedRegistrationCase(page.request, 'criterium');
  const eventUrl = `/api/events/${eventId}`;
  expect((await page.request.put(`${eventUrl}/bib-settings`, { data: { scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 199 }] } })).ok()).toBe(true);
  const organizations = await (await page.request.get('/api/organizations')).json() as { id: string; events: { id: string }[] }[];
  const organizationId = organizations.find((org) => org.events.some((item) => item.id === eventId))!.id;
  expect((await page.request.post(`/api/organizations/${organizationId}/members`, { data: { email: VOLUNTEER, role: 'check_in_volunteer' } })).ok()).toBe(true);

  const volunteer = await rolePage(browser, baseURL, VOLUNTEER);
  const desk = volunteer.page.getByRole('region', { name: 'Rider check-in' });
  const search = volunteer.page.getByRole('searchbox', { name: 'Find a rider' });
  const phoneContext = await browser.newContext({ ...devices['iPhone 13'], extraHTTPHeaders: { Authorization: `Bearer test:${GUARDIAN}` } });
  await phoneContext.addInitScript((account) => sessionStorage.setItem('cyclereg.test-session', account), GUARDIAN);
  const guardian = await phoneContext.newPage();
  try {
    await test.step('At the desk 1-2: the volunteer opens Register a walk-up and the guardian opens the address on their own phone', async () => {
      await volunteer.page.goto(`/#/events/${eventId}/check-in`);
      await volunteer.page.getByRole('button', { name: 'Register a walk-up' }).click();
      const address = await volunteer.page.getByLabel('Public registration address').inputValue();
      await guardian.goto(address);
      await shot(volunteer.page, '01-walk-up-panel');
    });

    await test.step('At the desk 3: the guardian enters the junior, their own details, and signs the waiver as guardian', async () => {
      await guardian.getByLabel('Use a demo rider (fake data)').selectOption('rider-casey');
      await guardian.getByRole('checkbox', { name: /DVC-J1014/ }).click();
      await guardian.getByRole('button', { name: 'Continue to racer details' }).click();
      await guardian.getByLabel('Last name (required)', { exact: true }).fill('Walkup');
      await guardian.getByLabel('Guardian name', { exact: true }).fill('Jordan Demo');
      await guardian.getByLabel('Guardian email', { exact: true }).fill(GUARDIAN);
      await guardian.getByRole('button', { name: 'Continue to the waiver' }).click();
      await expect(guardian.getByRole('heading', { name: 'Waiver' })).toBeVisible();
      await guardian.getByLabel('I have read the whole waiver').check();
      await guardian.getByLabel(/Type your full name to sign/).fill('Jordan Demo');
      await guardian.getByLabel('As parent or guardian, I agree to this waiver for the rider', { exact: true }).check();
      await guardian.getByRole('button', { name: 'Sign and review the order' }).click();
      await expect(guardian.getByRole('button', { name: /Complete simulated payment/ })).toBeVisible();
      await shot(guardian, '02-guardian-signed');
    });

    await test.step('At the desk 4: before payment, the desk finds the junior and holds the bib', async () => {
      await search.fill('Casey Walkup');
      await search.press('Enter');
      await expect(desk).toContainText('Payment not complete');
      await expect(desk).not.toContainText('Guardian has not accepted the waiver');
      await expect(desk.getByRole('button', { name: /Check in and issue/ })).toHaveCount(0);
      await shot(volunteer.page, '03-desk-unpaid');
    });

    await test.step('At the desk 3: the guardian completes simulated payment under their own account', async () => {
      await guardian.getByRole('button', { name: /Complete simulated payment/ }).click();
      await expect(guardian.locator('.done__entry')).toContainText('Guardian signature recorded');
      const mine = await (await guardian.request.get('/api/rider/registrations')).json() as { eventId: string; placedByYou: boolean; rider: { firstName: string; lastName: string } }[];
      const orders = mine.filter((order) => order.eventId === eventId);
      expect(orders).toHaveLength(1);
      expect(orders[0]).toMatchObject({ placedByYou: true, rider: { firstName: 'Casey', lastName: 'Walkup' } });
      const staffOrders = await volunteer.page.request.get('/api/rider/registrations');
      expect(staffOrders.ok()).toBe(true);
      expect((await staffOrders.json() as { eventId: string }[]).filter((order) => order.eventId === eventId)).toHaveLength(0);
      await shot(guardian, '04-guardian-paid');
    });

    await test.step('At the desk 5: the desk reads Ready to race, marks the walk-up and issues one bib', async () => {
      await search.press('Enter');
      await expect(desk).toContainText('Ready to race');
      await desk.getByRole('button', { name: /^Mark as walk-up/ }).click();
      await expect(desk.getByText('· Walk-up', { exact: true })).toBeVisible();
      await desk.getByRole('button', { name: /Check in and issue/ }).click();
      await expect(desk).toContainText('Checked in. Hand over the bib below.');
      await expect(desk.locator('.ci-bib__number')).toHaveText('100');
      const list = await (await page.request.get(`${eventUrl}/check-in`, { params: { q: 'Casey Walkup' } })).json() as CheckInList;
      expect(list.riders).toHaveLength(1);
      expect(list.riders[0]).toMatchObject({ bib: 100, payment: 'confirmed', checkedInAt: expect.any(String) });
      expect(list.riders[0].bibHistory).toHaveLength(1);
      await shot(volunteer.page, '05-bib-issued');
    });
  } finally {
    await phoneContext.close();
    await volunteer.close();
  }

  testInfo.annotations.push({
    type: 'not-rehearsed',
    description: 'A junior whose guardian has not signed, and the accepted signing procedure for a missing guardian signature, were not rehearsed: the walk-up checkout requires the guardian to sign before payment. Physical QR scanning was not rehearsed.',
  });
});
