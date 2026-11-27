// Rehearsal: walk-up exceptions. Runbook: docs/runbooks/walkup-registration.md (At the desk 3-5,
// Unavailable or interrupted registration). Fictional data only.
import { devices } from '@playwright/test';
import { expect, test } from '../fixtures';
import type { CheckInList } from '../../src/shared/checkin';
import type { EventConfig } from '../../src/shared/schema';
import { publishReviewed } from '../support/publish';
import { seedRegistrationCase } from '../support/registration-case';
import { rolePage } from './roles';

test.use({ trace: 'on', screenshot: 'on' });

const VOLUNTEER = 'exceptions.volunteer.rehearsal@example.test';
const RIDER = 'exceptions.rider.rehearsal@example.test';
const LATE_RIDER = 'exceptions.late.rehearsal@example.test';

test('@rehearsal walk-up declined payment, a closed category and a full field leave one entry and no extra bibs', async ({ page, browser, baseURL }, testInfo) => {
  test.setTimeout(180_000);
  const shot = (who: typeof page, name: string) => who.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
  const eventId = await seedRegistrationCase(page.request, 'criterium');
  const eventUrl = `/api/events/${eventId}`;
  expect((await page.request.put(`${eventUrl}/bib-settings`, { data: { scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 199 }] } })).ok()).toBe(true);
  const organizations = await (await page.request.get('/api/organizations')).json() as { id: string; events: { id: string }[] }[];
  const organizationId = organizations.find((org) => org.events.some((item) => item.id === eventId))!.id;
  expect((await page.request.post(`/api/organizations/${organizationId}/members`, { data: { email: VOLUNTEER, role: 'check_in_volunteer' } })).ok()).toBe(true);
  const readStartLists = async () => (await page.request.get(`${eventUrl}/start-lists`)).json();
  const findAlex = async () => (await (await page.request.get(`${eventUrl}/check-in`, { params: { q: 'Alex Demo' } })).json() as CheckInList).riders;

  const volunteer = await rolePage(browser, baseURL, VOLUNTEER);
  const desk = volunteer.page.getByRole('region', { name: 'Rider check-in' });
  const search = volunteer.page.getByRole('searchbox', { name: 'Find a rider' });
  const deskLookup = async (query: string) => {
    await search.fill(query);
    await search.press('Enter');
  };
  const phone = async (email: string) => {
    const context = await browser.newContext({ ...devices['iPhone 13'], extraHTTPHeaders: { Authorization: `Bearer test:${email}` } });
    await context.addInitScript((account) => sessionStorage.setItem('cyclereg.test-session', account), email);
    return { context, page: await context.newPage() };
  };

  let address = '';
  let declinedOrderId = '';
  const rider = await phone(RIDER);
  try {
    await test.step('At the desk 1-2: the volunteer opens Register a walk-up and the rider opens the address on their own phone', async () => {
      await volunteer.page.goto(`/#/events/${eventId}/check-in`);
      await volunteer.page.getByRole('button', { name: 'Register a walk-up' }).click();
      address = await volunteer.page.getByLabel('Public registration address').inputValue();
      expect(address).toContain(eventId);
      await rider.page.goto(address);
      await shot(volunteer.page, '01-walk-up-panel');
    });

    await test.step('At the desk 3: the payment is declined, so the order is not paid', async () => {
      await rider.page.getByLabel('Use a demo rider (fake data)').selectOption('rider-alex');
      await rider.page.getByRole('checkbox', { name: /DVC-M45/ }).click();
      await rider.page.getByRole('button', { name: 'Continue to racer details' }).click();
      await rider.page.getByRole('button', { name: 'Continue to the waiver' }).click();
      await rider.page.getByLabel('I have read the whole waiver').check();
      await rider.page.getByLabel(/Type your full name to sign/).fill('Alex Demo');
      await rider.page.getByLabel('I agree to this waiver', { exact: true }).check();
      await rider.page.getByRole('button', { name: 'Sign and review the order' }).click();
      await rider.page.getByRole('button', { name: 'Simulate a declined payment' }).click();
      await expect(rider.page.getByRole('alert')).toContainText('declined');
      await shot(rider.page, '02-declined');
    });

    await test.step('At the desk 4: the desk finds the rider, and a failed payment is not clearance', async () => {
      await deskLookup('Alex Demo');
      await expect(desk).toContainText('Payment not complete');
      await expect(desk.getByRole('button', { name: /Check in and issue/ })).toHaveCount(0);
      const unpaid = await findAlex();
      expect(unpaid).toHaveLength(1);
      expect(unpaid[0].payment).not.toBe('confirmed');
      declinedOrderId = unpaid[0].orderId;
      await shot(volunteer.page, '03-desk-unpaid');
    });

    await test.step('At the desk 4: the rider recovers the same order instead of starting another one', async () => {
      await rider.page.getByRole('button', { name: /Complete simulated payment/ }).click();
      await expect(rider.page.getByRole('heading', { name: 'You’re entered' })).toBeVisible();
      const mine = await (await rider.page.request.get('/api/rider/registrations')).json() as { eventId: string }[];
      expect(mine.filter((order) => order.eventId === eventId)).toHaveLength(1);
      const riders = await findAlex();
      expect(riders).toHaveLength(1);
      expect(riders[0]).toMatchObject({ orderId: declinedOrderId, payment: 'confirmed' });
      await shot(rider.page, '04-paid');
    });
  } finally {
    await rider.context.close();
  }

  await test.step('At the desk 5: marking the walk-up twice leaves one entry, then the volunteer issues one bib', async () => {
    await deskLookup('Alex Demo');
    await desk.getByRole('button', { name: /^Mark as walk-up/ }).click();
    await expect(desk.getByText('· Walk-up', { exact: true })).toBeVisible();
    const [card] = await findAlex();
    const repeat = await volunteer.page.request.post(`${eventUrl}/check-in/${card.orderId}/walk-up`, {
      data: { dayId: (await (await page.request.get(`${eventUrl}/check-in`)).json() as CheckInList).dayId, entryId: card.entries[0].id },
    });
    expect(repeat.status()).toBe(200);
    expect(await repeat.json()).toMatchObject({ bib: null, checkedInAt: null, entries: [expect.objectContaining({ id: card.entries[0].id, walkUp: true })] });
    await desk.getByRole('button', { name: /Check in and issue/ }).click();
    await expect(desk.locator('.ci-bib__number')).toHaveText('100');
    const rows = (await readStartLists() as { races: { rows: { firstName: string; lastName: string }[] }[] }).races
      .flatMap((race) => race.rows).filter((row) => row.firstName === 'Alex' && row.lastName === 'Demo');
    expect(rows).toHaveLength(1);
    await shot(volunteer.page, '05-bib-issued');
  });

  // Facilitator setup, not a desk step: the organizer closes the 45+ field mid-morning. The 35+ field is already full with a waitlist.
  const { config, revision } = await (await page.request.get(eventUrl)).json() as { config: EventConfig; revision: number };
  const full = config.categories.find((category) => category.timingCode === 'DVC-M35')!;
  const closed = config.categories.find((category) => category.timingCode === 'DVC-M45')!;
  config.registration.demoIgnoreWindows = false;
  full.registration.opensAt = null;
  full.registration.closesAt = null;
  full.waitlistEnabled = true;
  closed.registration.opensAt = null;
  closed.registration.closesAt = '2000-01-01T09:00';
  expect((await page.request.put(`${eventUrl}/config`, { data: { config, revision } })).ok()).toBe(true);
  expect((await publishReviewed(page.request, eventUrl, { acknowledgeWarnings: true, acknowledgeImpact: true })).ok()).toBe(true);
  const before = await readStartLists();

  const late = await phone(LATE_RIDER);
  try {
    await test.step('Unavailable registration: a category past its closing time cannot be selected', async () => {
      await late.page.goto(address);
      // 46 is eligible for both the 45+ and 35+ fields, so only the closing time and the full field block them.
      await late.page.getByLabel('Racing age').fill('46');
      await late.page.getByLabel('License category').selectOption('4');
      await late.page.getByLabel('Competition class').selectOption({ label: 'Men' });
      const closedOption = late.page.getByRole('checkbox', { name: /DVC-M45/ });
      await expect(closedOption).toHaveAttribute('aria-disabled', 'true');
      await expect(closedOption).toHaveAccessibleDescription('Registration closed');
      await closedOption.press('Space');
      await expect(closedOption).toHaveAttribute('aria-checked', 'false');
      await shot(late.page, '06-closed');
    });

    await test.step('Unavailable registration: a full field offers the waitlist, which creates no entry', async () => {
      const option = late.page.getByRole('checkbox', { name: /DVC-M35/ });
      await expect(option).toHaveAttribute('aria-disabled', 'true');
      await late.page.getByRole('button', { name: 'Join the waitlist', exact: true }).click();
      const form = late.page.getByRole('form', { name: `Join the waitlist for ${full.name}` });
      await form.getByLabel('First name').fill('Late');
      await form.getByLabel('Last name').fill('Fictional');
      await form.getByLabel('Email', { exact: true }).fill(LATE_RIDER);
      await form.getByRole('button', { name: 'Join the waitlist' }).click();
      await expect(late.page.getByRole('status').filter({ hasText: 'You are number 1 on the waitlist' })).toBeVisible();
      await late.page.getByRole('button', { name: 'Continue to racer details' }).click();
      await expect(late.page.locator('.error-summary')).toContainText('Choose at least one race');
      expect(await (await late.page.request.get('/api/rider/registrations')).json()).toEqual([]);
      await shot(late.page, '07-waitlisted');
    });
  } finally {
    await late.context.close();
  }

  await test.step('Unavailable registration: the desk finds no entry to check in, and no bib or start list changed', async () => {
    await deskLookup('Late Fictional');
    await expect(desk.getByRole('button', { name: /Check in and issue/ })).toHaveCount(0);
    const found = await (await volunteer.page.request.get(`${eventUrl}/check-in`, { params: { q: 'Late Fictional' } })).json() as CheckInList;
    expect(found.riders).toEqual([]);
    const waitlist = await (await page.request.get(`${eventUrl}/waitlist`)).json() as { entries: { categoryId: string; email: string; status: string }[] };
    expect(waitlist.entries).toEqual([expect.objectContaining({ categoryId: full.id, email: LATE_RIDER, status: 'waiting' })]);
    expect(await readStartLists()).toEqual(before);
    await shot(volunteer.page, '08-desk-no-entry');
  });

  testInfo.annotations.push({
    type: 'not-rehearsed',
    description: 'Referral to the registration lead for a closed or full field is a conversation. A loopback address is not a phone on another network, and physical QR scanning was not rehearsed.',
  });
  await volunteer.close();
});
