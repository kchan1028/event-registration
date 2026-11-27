// Rehearsal: race-day desk. Runbooks: docs/runbooks/race-day-check-in.md, docs/runbooks/walkup-registration.md. Fictional data only.
import { E2E_ORGANIZER, expect, test } from '../fixtures';
import type { CheckInList } from '../../src/shared/checkin';
import { publishReviewed } from '../support/publish';
import { rolePage } from './roles';

test.use({ trace: 'on', screenshot: 'on' });

const LEAD = 'lead.rehearsal@example.test';
const VOLUNTEER = 'volunteer.rehearsal@example.test';
const INCOMING = 'incoming.rehearsal@example.test';
const TIMER = 'timer.rehearsal@example.test';

test('@rehearsal race-day desk, roster, exceptions, outage, shift and timer handoff', async ({ page, browser, baseURL }, testInfo) => {
  test.setTimeout(180_000);
  const shot = (who: typeof page, name: string) => who.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
  const demo = await (await page.request.post('/api/demo')).json() as { organizationId: string; eventId: string };
  const eventUrl = `/api/events/${demo.eventId}`;
  expect((await publishReviewed(page.request, eventUrl, { acknowledgeWarnings: true })).ok()).toBe(true);
  expect((await page.request.post(`${eventUrl}/check-in-demo-riders`)).ok()).toBe(true);
  expect((await page.request.put(`${eventUrl}/bib-settings`, {
    data: { scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 199 }] },
  })).ok()).toBe(true);
  for (const [email, role] of [[LEAD, 'registration_manager'], [VOLUNTEER, 'check_in_volunteer'], [INCOMING, 'check_in_volunteer'], [TIMER, 'timer_export']] as const) {
    expect((await page.request.post(`/api/organizations/${demo.organizationId}/members`, { data: { email, role } })).ok()).toBe(true);
  }
  const desk: CheckInList = await (await page.request.get(`${eventUrl}/check-in`)).json();
  const byName = (name: string) => {
    const rider = desk.riders.find((r) => r.name === name);
    if (!rider?.checkInCode) throw new Error(`Missing fictional rider ${name}`);
    return rider;
  };
  const alex = byName('Alex Demo');
  const blake = byName('Blake Demo');
  const dana = byName('Dana Demo');

  const lead = await rolePage(browser, baseURL, LEAD);
  const volunteer = await rolePage(browser, baseURL, VOLUNTEER);
  const incoming = await rolePage(browser, baseURL, INCOMING);
  const timer = await rolePage(browser, baseURL, TIMER);
  try {
    await test.step('Before the desk 1: each staff member uses their own account and opens Check-in', async () => {
      await volunteer.page.goto(`/#/events/${demo.eventId}/check-in`);
      await expect(volunteer.page.getByRole('heading', { name: 'Check-in' })).toBeVisible();
      await expect(volunteer.page.getByRole('searchbox', { name: 'Find a rider' })).toBeVisible();
      expect((await volunteer.page.request.get(`/api/organizations/${demo.organizationId}/members`)).status()).toBe(403);
      await lead.page.goto(`/#/events/${demo.eventId}/check-in`);
      await expect(lead.page.getByRole('heading', { name: 'Check-in' })).toBeVisible();
      await shot(volunteer.page, '01-volunteer-check-in');
    });

    await test.step('Before the desk 2: confirm the event, race day and bib range', async () => {
      await expect(volunteer.page.getByRole('radiogroup', { name: 'Race day' })).toBeVisible();
      await lead.page.getByRole('button', { name: 'Bib ranges' }).click();
      const ranges = lead.page.getByRole('form', { name: 'Bib ranges' });
      const whole = ranges.locator('.ci-bibs__range', { hasText: 'Whole event' });
      await expect(whole.getByLabel('First')).toHaveValue('100');
      await expect(whole.getByLabel('Last')).toHaveValue('199');
      const before = await (await volunteer.page.request.get(`${eventUrl}/check-in?day=${desk.dayId}`)).json() as CheckInList;
      expect(before.riders.find((r) => r.orderId === alex.orderId)).toMatchObject({ bib: null, checkedInAt: null });
      await shot(volunteer.page, '02-day-and-range');
    });

    testInfo.annotations.push({
      type: 'not-rehearsed',
      description: 'Before the desk 3: physical bib inventory cannot be automated. The screen range 100–199 is the mock inventory only.',
    });

    await test.step('Before the desk 4: open Fallback roster and print every loaded day', async () => {
      await volunteer.page.getByRole('link', { name: 'Fallback roster' }).click();
      await expect(volunteer.page.getByRole('button', { name: 'Print roster' })).toBeEnabled();
      const days = volunteer.page.getByRole('region', { name: /^Roster for / });
      await expect(days.first()).toBeVisible();
      const count = await days.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i += 1) {
        await expect(days.nth(i)).toContainText('Fallback roster printed');
        await expect(days.nth(i)).toContainText('Reference only');
      }
      await volunteer.page.emulateMedia({ media: 'print' });
      const pdf = await volunteer.page.pdf({ printBackground: true });
      expect(pdf.byteLength).toBeGreaterThan(1000);
      await volunteer.page.emulateMedia({ media: 'screen' });
      await shot(volunteer.page, '04-roster');
    });

    testInfo.annotations.push({
      type: 'not-rehearsed',
      description: 'Before the desk 5: the paper desk contact sheet has no screen. Fictional lead and volunteer accounts are signed in. Named-person acceptance is not claimed.',
    });

    const detail = volunteer.page.getByRole('region', { name: 'Rider check-in' });
    const search = volunteer.page.getByRole('searchbox', { name: 'Find a rider' });
    const lookup = async (code: string) => {
      await search.fill(code);
      await search.press('Enter');
    };

    await test.step('At the desk 1: the volunteer checks the event and selected race day', async () => {
      await volunteer.page.goto(`/#/events/${demo.eventId}/check-in`);
      await expect(volunteer.page.getByRole('radiogroup', { name: 'Race day' })).toBeVisible();
      await shot(volunteer.page, 'desk-01-day');
    });

    await test.step('At the desk 2: find the rider by confirmation code', async () => {
      await lookup(alex.checkInCode!);
      await expect(detail.getByRole('heading', { name: 'Alex Demo', exact: true })).toBeVisible();
      await shot(volunteer.page, 'desk-02-lookup');
    });

    await test.step('Emergency contact: show one registration contact, then hide it', async () => {
      await detail.getByRole('button', { name: 'Emergency contact for Alex Demo' }).click();
      const contact = detail.getByRole('status').filter({ hasText: 'Emergency contact' }).filter({ hasText: '555-555-0199' });
      await expect(contact).toBeVisible();
      await detail.getByRole('button', { name: 'Hide emergency contact for Alex Demo' }).click();
      await expect(detail.getByText('555-555-0199')).toHaveCount(0);
      await shot(volunteer.page, 'desk-contact-hidden');
    });

    await test.step('At the desk 3: read Ready to race before issuing a bib', async () => {
      await expect(detail.getByRole('status')).toContainText('Ready to race');
      await shot(volunteer.page, 'desk-03-ready');
    });

    await test.step('At the desk 4: check in the ready advance rider and read the recorded bib', async () => {
      await detail.getByRole('button', { name: 'Check in and issue next bib', exact: true }).click();
      await expect(detail.locator('.ci-bib__number')).toHaveText('100');
      await expect(detail.getByRole('status')).toContainText('Checked in.');
      await shot(volunteer.page, 'desk-04-issued');
    });

    await test.step('At the desk 5: Next rider, then the same rider still shows bib 100 and no second issue', async () => {
      await detail.getByRole('button', { name: 'Next rider', exact: true }).click();
      await lookup(alex.checkInCode!);
      await expect(detail.locator('.ci-bib__number')).toHaveText('100');
      await expect(detail.getByRole('button', { name: /Check in and issue/ })).toHaveCount(0);
      await shot(volunteer.page, 'desk-05-return');
    });

    await test.step('Exception 1: the volunteer holds the bib when the license needs review', async () => {
      await detail.getByRole('button', { name: 'Next rider', exact: true }).click();
      await lookup(dana.checkInCode!);
      await expect(detail.getByRole('heading', { name: 'Dana Demo', exact: true })).toBeVisible();
      await expect(detail.getByRole('status')).toContainText('Not ready');
      await expect(detail.getByText('License needs review', { exact: true }).first()).toBeVisible();
      await expect(detail.getByRole('button', { name: /Check in and issue/ })).toHaveCount(0);
      await shot(volunteer.page, 'exception-01-hold');
    });

    await test.step('Exception 2: the lead marks the fictional license reviewed without a typed note', async () => {
      await lead.page.goto(`/#/events/${demo.eventId}/registrations`);
      await lead.page.getByRole('button', { name: /License review/ }).click();
      const order = lead.page.locator('.order', { hasText: 'Dana Demo' });
      const reviews = order.getByRole('button', { name: 'Review license' });
      await expect(reviews.first()).toBeVisible();
      const reviewCount = await reviews.count();
      expect(reviewCount).toBeGreaterThan(0);
      for (let i = 0; i < reviewCount; i += 1) {
        await order.getByRole('button', { name: 'Review license' }).first().click();
        await expect(order.getByRole('group', { name: /^Review the license for/ }).getByRole('textbox')).toHaveCount(0);
        await order.getByRole('button', { name: 'Mark reviewed' }).click();
      }
      await lead.page.getByRole('button', { name: /^All/ }).click();
      await expect(lead.page.locator('.order', { hasText: 'Dana Demo' })).toContainText('License reviewed');
      await shot(lead.page, 'exception-02-reviewed');
    });

    testInfo.annotations.push({
      type: 'not-rehearsed',
      description: 'Exception 3: a paper waiver cannot be recorded in the app. No separate missing-waiver demo rider was on this fixture, so a paper form was not invented.',
    });

    await test.step('Exception 4: the volunteer looks the same rider up again and issues a bib only after the review', async () => {
      await lookup(dana.checkInCode!);
      await expect(detail.getByRole('status')).toContainText('Ready to race');
      await detail.getByRole('button', { name: 'Check in and issue next bib', exact: true }).click();
      await expect(detail.locator('.ci-bib__number')).toHaveText('101');
      await shot(volunteer.page, 'exception-04-cleared');
    });

    await test.step('Walk-up: mark a confirmed entry as a walk-up, then check in when ready', async () => {
      // Desk demo riders are created already marked as walk-ups, so the mark control is not offered for them.
      const event = await (await page.request.get(eventUrl)).json() as {
        config: {
          registration: { waiverVersion: string };
          categories: { id: string; timingCode: string }[];
        };
      };
      const category = event.config.categories.find((row) => row.timingCode === 'RR-M35-34');
      if (!category) throw new Error('The demo event has no RR-M35-34 category for a fictional walk-up');
      const created = await page.request.post(`/api/rider/events/${demo.eventId}/orders`, {
        data: {
          clientRequestId: 'race-day-walk-up-quinn',
          categoryIds: [category.id],
          selfRegistrationConfirmed: true,
          rider: {
            firstName: 'Quinn', lastName: 'Fictional', email: 'quinn.fictional.rehearsal@example.test', team: 'Demo Wheelers',
            racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men',
            collegiateDivision: null, guardian: null,
            emergencyContact: { name: 'Pat Fictional', phone: '555-555-0199' },
          },
          waiver: {
            version: event.config.registration.waiverVersion, read: true, agreed: true,
            signatureName: 'Quinn Fictional', signerRole: 'rider',
          },
        },
      });
      expect(created.status(), await created.text()).toBe(201);
      const order = await created.json() as { id: string; entries: { id: string }[] };
      expect((await page.request.post(`/api/orders/${order.id}/payment`, {
        data: { attemptId: `race-day-walk-up-${order.id}`, outcome: 'success' },
      })).ok()).toBe(true);
      for (const entry of order.entries) {
        const reviewed = await page.request.post(`/api/order-entries/${entry.id}/license-review`, { data: {} });
        expect(reviewed.ok(), await reviewed.text()).toBe(true);
      }
      const listed = await (await page.request.get(`${eventUrl}/check-in?day=${desk.dayId}&q=${encodeURIComponent('Quinn Fictional')}`)).json() as CheckInList;
      const quinn = listed.riders.find((rider) => rider.name === 'Quinn Fictional');
      if (!quinn?.checkInCode) throw new Error('Missing fictional walk-up candidate Quinn Fictional');
      if (!quinn.result.ready) throw new Error(`Quinn is not ready: ${quinn.result.blockers.map((blocker) => blocker.label).join(', ')}`);

      await detail.getByRole('button', { name: 'Next rider', exact: true }).click();
      await expect(detail.getByRole('heading', { name: 'Dana Demo' })).toHaveCount(0);
      await lookup(quinn.checkInCode);
      await expect(detail.getByRole('heading', { name: 'Quinn Fictional', exact: true })).toBeVisible();
      await expect(detail.getByRole('status')).toContainText('Ready to race');
      await detail.getByRole('button', { name: /Mark as walk-up:/ }).click();
      await expect(detail).toContainText('Walk-up');
      await detail.getByRole('button', { name: 'Check in and issue next bib', exact: true }).click();
      await expect(detail.locator('.ci-bib__number')).toHaveText('102');
      await shot(volunteer.page, 'walk-up');
    });

    let printedBib = '';
    await test.step('Outage 1: prepare an unreviewed rider, a changed bib and one saved check-in', async () => {
      const gray = byName('Gray Demo');
      await lead.page.goto(`/#/events/${demo.eventId}/check-in`);
      const leadSearch = lead.page.getByRole('searchbox', { name: 'Find a rider' });
      await leadSearch.fill(blake.checkInCode!);
      await leadSearch.press('Enter');
      const leadDetail = lead.page.getByRole('region', { name: 'Rider check-in' });
      await leadDetail.getByRole('button', { name: 'Check in and issue next bib', exact: true }).click();
      await expect(leadDetail.locator('.ci-bib__number')).toHaveText('103');
      printedBib = '103';
      const change = {
        mode: 'manual' as const,
        acknowledgeCheckedIn: true,
        dayId: desk.dayId,
        reason: 'Fictional desk inventory change',
        assignments: [{ orderId: blake.orderId, bib: 140 }],
      };
      const preview = await lead.page.request.post(`${eventUrl}/bibs/reassign/preview`, { data: change });
      expect(preview.ok(), await preview.text()).toBe(true);
      const body = await preview.json() as { fingerprint: string };
      const apply = await lead.page.request.post(`${eventUrl}/bibs/reassign/apply`, { data: { batch: change, fingerprint: body.fingerprint } });
      expect(apply.ok(), await apply.text()).toBe(true);
      expect(gray.result.ready).toBe(false);
      await shot(lead.page, 'outage-01-prepared');
    });

    await test.step('Outage 2: a simulated outage stops a fresh lookup', async () => {
      await volunteer.page.context().setOffline(true);
      await lookup('GRAY');
      await expect(volunteer.page.getByRole('alert').or(volunteer.page.getByText(/offline|Cannot reach|failed|network/i)).first()).toBeVisible();
      await shot(volunteer.page, 'outage-02-offline');
    });

    await test.step('Outage 3: after reconnect, the saved check-in is unchanged and the unreviewed license still blocks', async () => {
      await volunteer.page.context().setOffline(false);
      await volunteer.page.goto(`/#/events/${demo.eventId}/check-in`);
      await lookup(alex.checkInCode!);
      await expect(detail.locator('.ci-bib__number')).toHaveText('100');
      await expect(detail.getByRole('button', { name: /Check in and issue/ })).toHaveCount(0);
      const gray = byName('Gray Demo');
      await detail.getByRole('button', { name: 'Next rider', exact: true }).click();
      await lookup(gray.checkInCode!);
      await expect(detail.getByRole('status')).toContainText('Not ready');
      await expect(detail.getByRole('button', { name: /Check in and issue/ })).toHaveCount(0);
      await lookup(blake.checkInCode!);
      const current = detail.locator('.ci-bib__number');
      await expect(current).toBeVisible();
      await expect(current).toHaveText('140');
      expect(printedBib).toBe('103');
      await shot(volunteer.page, 'outage-03-reconnected');
    });

    await test.step('Outage 4: another ready rider can check in while the blocked rider stays held', async () => {
      // An unpaid registration has no check-in code. The desk finds that rider by name.
      await detail.getByRole('button', { name: 'Next rider', exact: true }).click();
      await lookup('Frankie Demo');
      await expect(detail.getByRole('heading', { name: 'Frankie Demo', exact: true })).toBeVisible();
      await expect(detail.getByRole('status')).toContainText('Not ready');
      await expect(detail.getByRole('button', { name: /Check in and issue/ })).toHaveCount(0);
      const harper = byName('Harper Demo');
      await lookup(harper.checkInCode!);
      await expect(detail.getByRole('heading', { name: 'Harper Demo', exact: true })).toBeVisible();
      await expect(detail.getByRole('status')).toContainText('Ready to race');
      await detail.getByRole('button', { name: 'Check in and issue next bib', exact: true }).click();
      await expect(detail.locator('.ci-bib__number')).toBeVisible();
      await lookup('Frankie Demo');
      await expect(detail.getByRole('heading', { name: 'Frankie Demo', exact: true })).toBeVisible();
      await expect(detail.getByRole('status')).toContainText('Not ready');
      await shot(volunteer.page, 'outage-04-hold');
    });

    await test.step('Shift handoff: the incoming volunteer sees the recorded bib and checks in nobody twice', async () => {
      await volunteer.page.goto('/');
      await incoming.page.goto(`/#/events/${demo.eventId}/check-in`);
      const incomingSearch = incoming.page.getByRole('searchbox', { name: 'Find a rider' });
      await incomingSearch.fill(alex.checkInCode!);
      await incomingSearch.press('Enter');
      const incomingDetail = incoming.page.getByRole('region', { name: 'Rider check-in' });
      await expect(incomingDetail.locator('.ci-bib__number')).toHaveText('100');
      await expect(incomingDetail.getByRole('button', { name: /Check in and issue/ })).toHaveCount(0);
      await shot(incoming.page, 'shift-incoming');
    });

    await test.step('Timer handoff: lock a start list and download the locked CSV', async () => {
      const lists = await (await timer.page.request.get(`${eventUrl}/start-lists`)).json() as { races: { raceId: string; raceName: string; rows: { entryId: string }[] }[] };
      const race = lists.races.find((r) => r.rows.some((row) => row.entryId === alex.entries[0].id));
      expect(race, 'Alex must be on a start list').toBeTruthy();
      await timer.page.goto(`/#/events/${demo.eventId}/startlists`);
      await expect(timer.page.getByRole('heading', { name: 'Start lists and timer export', exact: true })).toBeVisible();
      await timer.page.getByRole('radio', { name: race!.raceName, exact: true }).check();
      await timer.page.getByRole('button', { name: 'Lock start list', exact: true }).click();
      const locked = timer.page.waitForResponse((r) => r.url().includes(`/start-lists/${race!.raceId}/csv`) && r.request().method() === 'GET');
      await timer.page.getByRole('link', { name: 'Download the locked list' }).click();
      const csv = await locked;
      expect(csv.status()).toBe(200);
      const saved = await csv.text();
      expect(saved).toContain(alex.entries[0].id);
      expect((await timer.page.request.get(`${eventUrl}/check-in`)).status()).toBe(403);
      await shot(timer.page, 'timer-locked');
      void saved;
    });

    testInfo.annotations.push({
      type: 'not-rehearsed',
      description: 'Physical camera, phone, printer, paper issuance and real sign-in delivery. Camera emulation was not required for the typed-code path this run used.',
    });
    expect(E2E_ORGANIZER).toBe('organizer@example.test');
  } finally {
    await lead.close();
    await volunteer.close();
    await incoming.close();
    await timer.close();
  }
});
