// @covers src/web/registrations/WithdrawalRequests.tsx
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';
import { publishReviewed } from './support/publish';

test('an organizer approves one rider withdrawal request and declines another with a reason', async ({ page }) => {
  const { eventId } = await (await page.request.post('/api/demo')).json();
  const eventUrl = `/api/events/${eventId}`;
  expect((await publishReviewed(page.request, eventUrl, { acknowledgeWarnings: true })).status()).toBe(200);
  const { config } = await (await page.request.get(eventUrl)).json();
  const category = config.categories.find((row: { timingCode: string }) => row.timingCode === 'RR-M35-34');
  // Two fictional riders each buy one entry and ask to withdraw it.
  const askFor = async (first: string, reason: string) => {
    const email = `${first.toLowerCase()}-${eventId}@example.test`;
    const headers = { Authorization: `Bearer test:${email}` };
    const created = await page.request.post(`/api/rider/events/${eventId}/orders`, { headers, data: {
      clientRequestId: `queue-${first}-${eventId}`.slice(0, 64), categoryIds: [category.id],
      rider: { firstName: first, lastName: 'Fictional', email, team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Pat Fictional', phone: '555-555-0199' } },
      waiver: { version: config.registration.waiverVersion, read: true, agreed: true, signatureName: `${first} Fictional`, signerRole: 'rider' },
    } });
    expect(created.status(), await created.text()).toBe(201);
    const order = await created.json();
    const paid = await page.request.post(`/api/orders/${order.id}/payment`, { headers, data: { attemptId: `queue-paid-${order.id}`, outcome: 'success' } });
    const entryId = (await paid.json()).entries[0].id as string;
    const { preview } = await (await page.request.get(`/api/rider/order-entries/${entryId}/withdrawal`, { headers })).json();
    const asked = await page.request.post(`/api/rider/order-entries/${entryId}/withdrawal-requests`, { headers, data: {
      clientRequestId: `queue-ask-${entryId}`, reason, expectedCategoryId: preview.categoryId,
      expectedReturnAs: preview.entitlement?.returnAs ?? null, expectedAmountCents: preview.entitlement?.amountCents ?? null,
    } });
    expect(asked.status(), await asked.text()).toBe(201);
    return { orderId: order.id as string, entryId };
  };
  const robin = await askFor('Robin', 'Injured, cannot race');
  const casey = await askFor('Casey', 'Changed my plans');

  await page.goto(`/#/events/${eventId}/registrations`);
  const section = page.getByRole('region', { name: /Withdrawal requests/ });
  await expect(section.getByRole('heading', { name: 'Withdrawal requests (2)' })).toBeVisible();
  await expect(section).toContainText('Reason: Injured, cannot race');
  // The policy line follows the amount the policy gave on the day the rider asked (it is zero after the refund deadline).
  const [asked] = (await (await page.request.get(`${eventUrl}/withdrawal-requests`)).json()).filter((r: { orderId: string }) => r.orderId === robin.orderId);
  const amount = asked.policy.entitlement?.amountCents ?? 0;
  await expect(section).toContainText(amount === 0
    ? 'The policy returned nothing'
    : `the policy returned $${(amount / 100).toFixed(2).replace(/\.00$/, '')} (${asked.policy.entitlement.percent}%) as a refund`);
  expect((await new AxeBuilder({ page }).include('[aria-labelledby="withdrawal-requests-title"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);

  // Approve needs a second, explicit step that says no refund is sent.
  await section.getByRole('button', { name: `Approve withdrawal for Robin Fictional, ${category.name}` }).click();
  const confirm = section.getByRole('group', { name: `Confirm withdrawal for Robin Fictional, ${category.name}` });
  await expect(confirm).toContainText('No refund is sent.');
  // While the approval is in flight, Cancel cannot make it look undone.
  const held: { release?: () => void } = {};
  await page.route('**/api/events/*/withdrawal-requests/*/approve', async (route) => {
    await new Promise<void>((resolve) => { held.release = resolve; });
    await route.continue();
  }, { times: 1 });
  await confirm.getByRole('button', { name: 'Withdraw entry' }).click();
  await expect(confirm.getByRole('button', { name: 'Withdrawing…' })).toBeDisabled();
  await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  await expect.poll(() => held.release !== undefined).toBe(true);
  held.release?.();
  await expect(section.getByRole('heading', { name: 'Withdrawal requests (1)' })).toBeVisible();

  await section.getByRole('button', { name: `Decline withdrawal for Casey Fictional, ${category.name}` }).click();
  const decline = section.getByRole('group', { name: `Decline withdrawal for Casey Fictional, ${category.name}` });
  await decline.getByRole('button', { name: 'Decline request' }).click();
  await expect(decline.getByRole('alert')).toHaveText('Write why the entry stays.');
  await decline.getByRole('textbox', { name: 'Why the entry stays' }).fill('Withdrawals closed after the start list was sent');
  await decline.getByRole('button', { name: 'Decline request' }).click();
  await expect(section.getByText('No requests are waiting.')).toBeVisible();
  await section.getByText('Decided (2)').click();
  await expect(section).toContainText('Robin Fictional');
  await expect(section).toContainText('Declined: Withdrawals closed after the start list was sent');
  await page.setViewportSize({ width: 390, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await section.screenshot({ path: 'test-results/withdrawal-requests-queue-390.png' });

  // The approved entry is withdrawn with no refund; the declined one still races.
  const entryStatus = async (orderId: string) => (await (await page.request.get(`/api/orders/${orderId}`)).json()).entries[0].status;
  expect(await entryStatus(robin.orderId)).toBe('withdrawn');
  expect(await entryStatus(casey.orderId)).toBe('confirmed');
  expect((await (await page.request.get(`/api/orders/${robin.orderId}/refunds`)).json()).refunds).toEqual([]);
});
