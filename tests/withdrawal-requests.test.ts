import { describe, expect, it } from 'vitest';
import { as } from './support/auth';
import { testApp } from './support/db';
import { publishReviewed } from './support/publish';
import type { EventConfig } from '../src/shared/schema';

/* A rider asks to withdraw one paid entry; an organizer approves or declines. Nothing here refunds. */

const RIDER = { firstName: 'Pat', lastName: 'Demo', email: 'pat.withdraw@example.test', team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual', licenseNumber: 'DEMO-901', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Demo Contact', phone: '555-555-0199' } };
const RIDER_EMAIL = 'pat.withdraw@example.test';

async function setup() {
  let now = new Date('2027-03-01T18:00:00Z');
  const { app } = await testApp({ now: () => now, holdMinutes: 10 });
  const { eventId, organizationId } = (await app.inject({ method: 'POST', url: '/api/demo' })).json<{ eventId: string; organizationId: string }>();
  await publishReviewed(app, `/api/events/${eventId}`, { acknowledgeWarnings: true });
  const ev = (await app.inject({ url: `/api/events/${eventId}` })).json() as { config: EventConfig };
  const category = ev.config.categories.find((c) => c.timingCode === 'RR-M35-34')!;
  const rider = as(RIDER_EMAIL);
  const created = await app.inject({ method: 'POST', url: `/api/rider/events/${eventId}/orders`, headers: rider, payload: {
    clientRequestId: 'withdraw-order-xxxx', categoryIds: [category.id], rider: RIDER,
    waiver: { version: ev.config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Pat Demo', signerRole: 'rider' },
  } });
  expect(created.statusCode, created.body).toBe(201);
  const orderId = created.json<{ id: string }>().id;
  const paid = await app.inject({ method: 'POST', url: `/api/orders/${orderId}/payment`, headers: rider, payload: { attemptId: `withdraw-pay-${orderId}`, outcome: 'success' } });
  expect(paid.statusCode, paid.body).toBe(200);
  const entryId = paid.json<{ entries: { id: string }[] }>().entries[0].id;
  // The rider sends back what the preview showed them.
  const shown = async () => {
    const { preview } = (await app.inject({ url: `/api/rider/order-entries/${entryId}/withdrawal`, headers: rider })).json<{ preview: { categoryId: string; entitlement: { returnAs: string; amountCents: number } | null } }>();
    return { expectedCategoryId: preview.categoryId, expectedReturnAs: preview.entitlement?.returnAs ?? null, expectedAmountCents: preview.entitlement?.amountCents ?? null };
  };
  let expected: { expectedCategoryId: string; expectedReturnAs: string | null; expectedAmountCents: number | null } | null = null;
  const ask = async (reason: string, clientRequestId = 'withdraw-request-0001', who: Record<string, string> = rider) => {
    expected ??= await shown();
    return app.inject({ method: 'POST', url: `/api/rider/order-entries/${entryId}/withdrawal-requests`, headers: who, payload: { clientRequestId, reason, ...expected } });
  };
  const setNow = (iso: string) => { now = new Date(iso); expected = null; };
  const entryStatus = async () => (await app.inject({ url: `/api/orders/${orderId}` })).json<{ entries: { id: string; status: string }[] }>().entries.find((e) => e.id === entryId)!.status;
  return { app, eventId, organizationId, orderId, entryId, rider, ask, entryStatus, category, shown, setNow, ev };
}

describe('rider withdrawal requests', () => {
  it('shows the rider the policy effect, records one open request, and keeps others out', async () => {
    const { app, organizationId, entryId, rider, ask, entryStatus } = await setup();
    const view = await app.inject({ url: `/api/rider/order-entries/${entryId}/withdrawal`, headers: rider });
    expect(view.statusCode, view.body).toBe(200);
    const { preview, openRequest } = view.json<{ preview: { amountPaidCents: number; entitlement: { amountCents: number; percent: number } | null }; openRequest: unknown }>();
    expect(preview.amountPaidCents).toBeGreaterThan(0);
    expect(openRequest).toBeNull();
    if (preview.entitlement) expect(preview.entitlement.amountCents).toBe(Math.round(preview.amountPaidCents * preview.entitlement.percent / 100));

    const first = await ask('Injured my knee');
    expect(first.statusCode, first.body).toBe(201);
    expect(first.json()).toMatchObject({ status: 'open', reason: 'Injured my knee', entryId, policy: { amountPaidCents: preview.amountPaidCents } });
    // An exact retry returns the same request; the same id with a different reason is refused.
    expect((await ask('Injured my knee')).json().id).toBe(first.json().id);
    expect((await ask('Something else')).statusCode).toBe(409);
    // Only one open request per entry.
    expect((await ask('Injured my knee', 'withdraw-request-0002')).statusCode).toBe(409);
    expect(await entryStatus()).toBe('confirmed');

    // Another rider cannot see or request; an organizer member is not this rider.
    expect((await app.inject({ url: `/api/rider/order-entries/${entryId}/withdrawal`, headers: as('stranger@example.test') })).statusCode).toBe(404);
    expect((await ask('Not mine', 'withdraw-request-0003', as('stranger@example.test'))).statusCode).toBe(404);
    expect((await ask('Not mine', 'withdraw-request-0004', {})).statusCode).toBe(403);
    // A check-in volunteer cannot read or decide requests.
    const volunteer = 'withdraw.volunteer@example.test';
    expect((await app.inject({ method: 'POST', url: `/api/organizations/${organizationId}/members`, payload: { email: volunteer, role: 'check_in_volunteer' } })).statusCode).toBe(200);
    const listUrl = `/api/events/${first.json().eventId}/withdrawal-requests`;
    expect((await app.inject({ url: listUrl, headers: as(volunteer) })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: `${listUrl}/${first.json().id}/approve`, headers: as(volunteer) })).statusCode).toBe(403);
    const reread = await app.inject({ url: `/api/rider/order-entries/${entryId}/withdrawal`, headers: rider });
    expect(reread.json().openRequest).toMatchObject({ id: first.json().id, status: 'open' });
  });

  it('refuses a request whose policy amount changed after the rider looked, and an unpaid entry has no preview', async () => {
    const { app, entryId, rider, shown, setNow, eventId, ev, category } = await setup();
    const before = await shown();
    expect(before).toEqual({ expectedCategoryId: expect.any(String), expectedReturnAs: 'cash', expectedAmountCents: expect.any(Number) });
    expect(before.expectedAmountCents).toBeGreaterThan(0);
    // The full-refund step ends 7 days before the first race day; the rider then submits what they saw earlier.
    setNow('2027-04-20T18:00:00Z');
    const stale = await app.inject({ method: 'POST', url: `/api/rider/order-entries/${entryId}/withdrawal-requests`, headers: rider, payload: { clientRequestId: 'withdraw-request-stale', reason: 'Saw a refund earlier', ...before } });
    expect(stale.statusCode, stale.body).toBe(409);
    expect(stale.json().error).toContain('has changed since you looked');
    const after = await shown();
    expect(after).toEqual({ expectedCategoryId: before.expectedCategoryId, expectedReturnAs: 'cash', expectedAmountCents: 0 });
    const fresh = await app.inject({ method: 'POST', url: `/api/rider/order-entries/${entryId}/withdrawal-requests`, headers: rider, payload: { clientRequestId: 'withdraw-request-fresh', reason: 'Withdrawing anyway', ...after } });
    expect(fresh.statusCode, fresh.body).toBe(201);
    expect(fresh.json().policy.entitlement).toMatchObject({ percent: 0, amountCents: 0 });

    // An unpaid reservation has no withdrawal preview.
    const unpaidRider = as('unpaid.withdraw@example.test');
    const held = await app.inject({ method: 'POST', url: `/api/rider/events/${eventId}/orders`, headers: unpaidRider, payload: {
      clientRequestId: 'withdraw-unpaid-xxxx', categoryIds: [category.id], rider: { ...RIDER, email: 'unpaid.withdraw@example.test', licenseNumber: 'DEMO-902' },
      waiver: { version: ev.config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Pat Demo', signerRole: 'rider' },
    } });
    expect(held.statusCode, held.body).toBe(201);
    const heldEntry = held.json<{ entries: { id: string }[] }>().entries[0].id;
    expect((await app.inject({ url: `/api/rider/order-entries/${heldEntry}/withdrawal`, headers: unpaidRider })).statusCode).toBe(409);
  });

  it('approving withdraws the entry with a change record and no refund; a decided request cannot be decided again', async () => {
    const { app, eventId, orderId, ask, entryStatus } = await setup();
    const request = (await ask('Moving away')).json<{ id: string }>();
    const approved = await app.inject({ method: 'POST', url: `/api/events/${eventId}/withdrawal-requests/${request.id}/approve` });
    expect(approved.statusCode, approved.body).toBe(200);
    expect(approved.json()).toMatchObject({ status: 'approved', decidedAt: expect.any(String) });
    expect(await entryStatus()).toBe('withdrawn');
    const order = (await app.inject({ url: `/api/orders/${orderId}` })).json<{ entries: { changes: { kind: string; reason: string }[] }[] }>();
    expect(order.entries[0].changes).toEqual([expect.objectContaining({ kind: 'withdraw', reason: 'Rider request: Moving away' })]);
    expect((await app.inject({ url: `/api/orders/${orderId}/refunds` })).json<{ refunds: unknown[] }>().refunds).toEqual([]);
    expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/withdrawal-requests/${request.id}/approve` })).statusCode).toBe(409);
    expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/withdrawal-requests/${request.id}/decline`, payload: { reason: 'Too late' } })).statusCode).toBe(409);
    expect((await ask('Again', 'withdraw-request-0009')).statusCode).toBe(409);
  });

  it('declining keeps the entry and lets the rider ask again later', async () => {
    const { app, eventId, ask, entryStatus } = await setup();
    const request = (await ask('Schedule clash')).json<{ id: string }>();
    expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/withdrawal-requests/${request.id}/decline`, payload: { reason: 'x' } })).statusCode).toBe(400);
    const declined = await app.inject({ method: 'POST', url: `/api/events/${eventId}/withdrawal-requests/${request.id}/decline`, payload: { reason: 'Withdrawals closed after the start list was sent' } });
    expect(declined.statusCode, declined.body).toBe(200);
    expect(declined.json()).toMatchObject({ status: 'declined', decisionReason: 'Withdrawals closed after the start list was sent' });
    expect(await entryStatus()).toBe('confirmed');
    expect((await ask('Schedule clash again', 'withdraw-request-0005')).statusCode).toBe(201);
    const list = (await app.inject({ url: `/api/events/${eventId}/withdrawal-requests` })).json<{ status: string }[]>();
    expect(list.map((r) => r.status)).toEqual(['open', 'declined']);
  });

  it('approving after the organizer transferred the entry is refused, so the new category is not withdrawn', async () => {
    const { app, eventId, entryId, ask, entryStatus, ev } = await setup();
    const request = (await ask('Leaving the 35+ race')).json<{ id: string }>();
    const target = ev.config.categories.find((c) => c.timingCode === 'CR-M35-34')!;
    const moved = await app.inject({ method: 'POST', url: `/api/order-entries/${entryId}/transfer`, payload: { toCategoryId: target.id, reason: 'Organizer moved the rider' } });
    expect(moved.statusCode, moved.body).toBe(200);
    const approve = await app.inject({ method: 'POST', url: `/api/events/${eventId}/withdrawal-requests/${request.id}/approve` });
    expect(approve.statusCode).toBe(409);
    expect(approve.json().error).toContain('moved to another category');
    expect(await entryStatus()).toBe('confirmed');
  });

  it('refuses a request sent from a preview of the category the entry has since left', async () => {
    const { app, entryId, rider, shown, ev } = await setup();
    const before = await shown();
    const target = ev.config.categories.find((c) => c.timingCode === 'CR-M35-34')!;
    expect((await app.inject({ method: 'POST', url: `/api/order-entries/${entryId}/transfer`, payload: { toCategoryId: target.id, reason: 'Organizer moved the rider' } })).statusCode).toBe(200);
    const stale = await app.inject({ method: 'POST', url: `/api/rider/order-entries/${entryId}/withdrawal-requests`, headers: rider, payload: { clientRequestId: 'withdraw-request-moved', reason: 'Leaving', ...before } });
    expect(stale.statusCode, stale.body).toBe(409);
    expect(stale.json().error).toContain('moved to another category since you looked');
    const after = await shown();
    expect(after.expectedCategoryId).toBe(target.id);
    expect((await app.inject({ method: 'POST', url: `/api/rider/order-entries/${entryId}/withdrawal-requests`, headers: rider, payload: { clientRequestId: 'withdraw-request-moved-2', reason: 'Leaving', ...after } })).statusCode).toBe(201);
  });

  it('approving after the organizer already withdrew the entry is refused and leaves the request open', async () => {
    const { app, eventId, entryId, ask } = await setup();
    const request = (await ask('Feeling unwell')).json<{ id: string }>();
    expect((await app.inject({ method: 'POST', url: `/api/order-entries/${entryId}/withdraw`, payload: { reason: 'Organizer withdrew first' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/withdrawal-requests/${request.id}/approve` })).statusCode).toBe(409);
    const list = (await app.inject({ url: `/api/events/${eventId}/withdrawal-requests` })).json<{ id: string; status: string }[]>();
    expect(list).toEqual([expect.objectContaining({ id: request.id, status: 'open' })]);
    expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/withdrawal-requests/${request.id}/decline`, payload: { reason: 'Already withdrawn by the organizer' } })).statusCode).toBe(200);
  });
});
