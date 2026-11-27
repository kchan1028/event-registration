// Rehearsal: support coverage and freeze. Test plan section 5 and docs/operations.md. Fictional data only.
import { expect, test } from '../fixtures';
import { seedRegistrationCase } from '../support/registration-case';
import { rolePage } from './roles';

test.use({ trace: 'on', screenshot: 'on' });

const PRIMARY = 'support.primary.rehearsal@example.test';
const DEPUTY = 'support.deputy.rehearsal@example.test';
const LEAD = 'freeze.lead.rehearsal@example.test';

test('@rehearsal support coverage and freeze windows use fictional roles', async ({ page, browser, baseURL }, testInfo) => {
  test.setTimeout(180_000);
  const shot = (who: typeof page, name: string) => who.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
  const eventId = await seedRegistrationCase(page.request, 'criterium');
  const eventUrl = `/api/events/${eventId}`;
  const event = await (await page.request.get(eventUrl)).json() as {
    config: {
      event: { timeZone: string };
      categories: { registration: { opensAt: string | null } }[];
      races: { dayId: string }[];
      days: { id: string; date: string }[];
      startGroups: { startTime: string }[];
    };
  };
  const { config } = event;
  const opensAt = config.categories.map((category) => category.registration.opensAt).filter((value): value is string => Boolean(value)).sort()[0];
  const firstStart = [...config.startGroups].sort((a, b) => a.startTime.localeCompare(b.startTime))[0]?.startTime;
  const firstDay = config.days.find((day) => day.id === config.races[0]?.dayId)?.date ?? config.days.map((day) => day.date).sort()[0];

  await test.step('Record the approved freeze starts from the fictional event clock', async () => {
    expect(config.event.timeZone).toBeTruthy();
    expect(opensAt).toBeTruthy();
    expect(firstDay).toBeTruthy();
    expect(firstStart).toBeTruthy();
    const wall = (local: string, hours: number) => {
      const [date, time] = local.split('T');
      const [year, month, day] = date.split('-').map(Number);
      const [hour, minute] = time.split(':').map(Number);
      const shifted = new Date(Date.UTC(year, month - 1, day, hour - hours, minute));
      const pad = (value: number) => String(value).padStart(2, '0');
      return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
    };
    testInfo.annotations.push({
      type: 'freeze-window',
      description: `Time zone ${config.event.timeZone}. Registration opens ${opensAt}. First start ${firstDay}T${firstStart}. Pre-opening freeze starts ${wall(opensAt, 48)} (48 hours before opening). Race-week freeze starts ${wall(`${firstDay}T${firstStart}`, 72)} (72 hours before the first start). Window end times are not assigned.`,
    });
    const health = await page.request.get('/api/health');
    expect(health.status()).toBe(200);
    await shot(page, '01-health');
  });

  testInfo.annotations.push({
    type: 'not-rehearsed',
    description: 'Alert paging, deputy paging, live routing, and a delivered alert have no in-app product. Primary, deputy and technical-lead contact are fictional labels only. Nobody was paged.',
  });
  testInfo.annotations.push({
    type: 'not-rehearsed',
    description: 'The local app has no freeze gate that holds a configuration change. Waiting for approval of a nonessential change, and scoring against unassigned window end times, were not rehearsed.',
  });

  const organizations = await (await page.request.get('/api/organizations')).json() as { id: string; events: { id: string }[] }[];
  const organizationId = organizations.find((org) => org.events.some((item) => item.id === eventId))!.id;
  for (const [email, role] of [[PRIMARY, 'finance'], [DEPUTY, 'registration_manager'], [LEAD, 'registration_manager']] as const) {
    expect((await page.request.post(`/api/organizations/${organizationId}/members`, { data: { email, role } })).ok()).toBe(true);
  }

  await test.step('Pending reservation: finance can look it up and cannot release it', async () => {
    await page.goto(`/#/register/${eventId}`);
    await expect(page.getByRole('heading', { name: 'About you' })).toBeVisible();
    await page.getByLabel('Use a demo rider (fake data)').selectOption('rider-alex');
    await page.getByRole('checkbox', { name: /DVC-M45/ }).click();
    await page.getByRole('button', { name: 'Continue to racer details' }).click();
    await page.getByRole('button', { name: 'Continue to the waiver' }).click();
    await page.route('**/api/rider/events/*/orders', async (route) => {
      await route.fetch();
      await route.abort();
    }, { times: 1 });
    await page.getByLabel('I have read the whole waiver').check();
    await page.getByLabel(/Type your full name to sign/).fill('Alex Demo');
    await page.getByLabel('I agree to this waiver', { exact: true }).check();
    await page.getByRole('button', { name: 'Sign and review the order' }).click();
    await expect(page.locator('.error-summary')).toContainText('Cannot reach');
    const reference = await page.getByRole('textbox', { name: 'Reservation reference' }).inputValue();
    expect(reference).toMatch(/^[0-9a-f-]{36}$/);

    const primary = await rolePage(browser, baseURL, PRIMARY);
    try {
      await primary.page.goto(`/#/events/${eventId}/registrations`);
      await primary.page.getByText('Check a pending reservation', { exact: true }).click();
      const lookup = primary.page.locator('details').filter({ hasText: 'Check a pending reservation' });
      await lookup.getByRole('textbox', { name: 'Reservation reference' }).fill(reference);
      await lookup.getByRole('button', { name: 'Check reservation' }).click();
      await expect(lookup.getByRole('status')).toContainText('Places held, unpaid');
      await expect(lookup.getByRole('button', { name: 'Release unpaid hold' })).toHaveCount(0);
      await shot(primary.page, '02-primary-lookup');
    } finally {
      await primary.close();
    }
    testInfo.annotations.push({ type: 'reservation-reference', description: reference });
  });

  await test.step('Pending reservation: the registration manager releases the hold the rider asked for', async () => {
    const reference = testInfo.annotations.find((item) => item.type === 'reservation-reference')?.description ?? '';
    const deputy = await rolePage(browser, baseURL, DEPUTY);
    try {
      await deputy.page.goto(`/#/events/${eventId}/registrations`);
      await deputy.page.getByText('Check a pending reservation', { exact: true }).click();
      const lookup = deputy.page.locator('details').filter({ hasText: 'Check a pending reservation' });
      await lookup.getByRole('textbox', { name: 'Reservation reference' }).fill(reference);
      await lookup.getByRole('button', { name: 'Check reservation' }).click();
      await expect(lookup.getByRole('status')).toContainText('Places held, unpaid');
      await lookup.getByRole('button', { name: 'Release unpaid hold' }).click();
      const form = lookup.getByRole('form', { name: 'Release unpaid hold' });
      await form.getByRole('checkbox', { name: 'The rider asked me to release this hold' }).check();
      await form.getByRole('textbox', { name: 'Reason for release' }).fill('Fictional rider asked to release the hold');
      await form.getByRole('button', { name: 'Confirm hold release' }).click();
      await expect(lookup.getByRole('status')).toContainText('Released by organizer');
      await shot(deputy.page, '03-released');
    } finally {
      await deputy.close();
    }
  });

  await test.step('Race-week correction: an authorized rider-level change keeps a reason and an audit line', async () => {
    await page.unroute('**/api/rider/events/*/orders');
    const retry = page.getByRole('button', { name: 'Retry reservation' });
    if (await retry.isVisible()) await retry.click();
    await page.getByRole('button', { name: 'Change my entries' }).click();
    const race = page.getByRole('checkbox', { name: /DVC-M45/ });
    if (!(await race.isChecked())) await race.check();
    await page.getByRole('button', { name: 'Continue to racer details' }).click();
    await page.getByRole('button', { name: 'Continue to the waiver' }).click();
    await page.getByLabel('I have read the whole waiver').check();
    await page.getByLabel(/Type your full name to sign/).fill('Alex Demo');
    await page.getByLabel(/agree to this waiver/).check();
    await page.getByRole('button', { name: 'Sign and review the order' }).click();
    await page.getByRole('button', { name: /Complete simulated payment/ }).click();
    await expect(page.getByRole('heading', { name: 'You’re entered' })).toBeVisible();
    const lead = await rolePage(browser, baseURL, LEAD);
    try {
      await lead.page.goto(`/#/events/${eventId}/registrations`);
      const order = lead.page.locator('.order', { hasText: 'Alex Demo' }).filter({ hasNotText: 'Released by organizer' });
      await expect(order).toHaveCount(1);
      await order.getByRole('button', { name: 'Correct details for Alex Demo' }).click();
      await order.getByLabel('Last name').fill('Demos');
      await order.getByLabel('Reason for the correction (required)').fill('Fictional race-week spelling correction');
      await order.getByRole('button', { name: 'Save correction' }).click();
      await expect(order.locator('.order__name')).toContainText('Alex Demos');
      await expect(order.getByRole('list', { name: 'Corrections to Alex Demos' })).toContainText('Fictional race-week spelling correction');
      await shot(lead.page, '04-correction');
    } finally {
      await lead.close();
    }
  });

  await test.step('Desk shift: the incoming account sees the recorded registration and does not share a session', async () => {
    const incoming = await rolePage(browser, baseURL, DEPUTY);
    const outgoing = await rolePage(browser, baseURL, LEAD);
    try {
      await outgoing.page.goto('/');
      await incoming.page.goto(`/#/events/${eventId}/registrations`);
      await expect(incoming.page.locator('.order', { hasText: 'Alex Demos' })).toBeVisible();
      expect((await incoming.page.request.get('/api/session')).status()).not.toBe(401);
      await shot(incoming.page, '05-shift');
    } finally {
      await incoming.close();
      await outgoing.close();
    }
  });
});
