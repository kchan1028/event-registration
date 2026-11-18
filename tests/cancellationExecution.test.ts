import { describe, expect, it, vi } from 'vitest';
import { cancellationSetup as setup } from './support/cancellation';
import { testApp } from './support/db';
import { as } from './support/auth';
import type { PaymentProvider } from '../src/server/payments';

const input = (confirmationId: string, clientRequestId = 'atomic-cancellation-request') => ({ confirmationId, clientRequestId, acknowledgeSimulatedCancellation: true });
async function prepared(policy: Parameters<typeof setup>[0] = 'full_refund') {
  const s = await setup(policy);
  expect((await s.app.inject({ method: 'DELETE', url: `/api/events/${s.eventId}/test-entries` })).statusCode).toBe(200);
  await s.pay(); const plan = await s.plan();
  const execute = (body: object = input(plan.id), headers = {}) => s.app.inject({ method: 'POST', url: `/api/events/${s.eventId}/cancellation-executions`, payload: body, headers });
  return { ...s, makePlan: s.plan, plan, execute };
}

describe('atomic simulated cancellation', () => {
  it('cancels only the selected paid package component, refunds its frozen allocation, and recovers exact replay', async () => {
    const s = await prepared(); const before = (await s.app.inject({ method: 'GET', url: `/api/orders/${s.order.id}` })).json();
    const response = await s.execute(); expect(response.statusCode, response.body).toBe(200); const saved = response.json();
    expect(saved).toMatchObject({ eventId: s.eventId, confirmationId: s.plan.id, status: 'simulated_cancellation_executed', cancelledEntryIds: [s.order.entries[0].id], removedWaitlistIds: [] });
    expect(saved.refunds).toEqual([{ entryId: s.order.entries[0].id, refundId: expect.any(String), amountCents: s.plan.preview.financial.acceptedEntryAllocationCents }]);
    const after = (await s.app.inject({ method: 'GET', url: `/api/orders/${s.order.id}` })).json();
    expect(after.status).toBe('confirmed'); expect(after.entries[0]).toMatchObject({ status: 'cancelled', cancelledAt: saved.executedAt, withdrawnAt: null });
    expect(after.entries[1]).toEqual(before.entries[1]); expect(after.quote).toEqual(before.quote); expect(after.waiver).toEqual(before.waiver);
    const summary = (await s.app.inject({ method: 'GET', url: `/api/events/${s.eventId}/summary` })).json();
    expect(summary.entries).toMatchObject({ confirmed: 1, cancelled: 1, withdrawn: 0 });
    expect((await s.app.inject({ method: 'GET', url: `/api/events/${s.eventId}/exports/entries.csv` })).body).toContain('cancelled');
    expect(after.refunds[0]).toMatchObject({ status: 'succeeded', amountCents: saved.refunds[0].amountCents });
    expect((await s.execute()).json()).toEqual(saved);
    expect((await s.app.inject({ method: 'GET', url: `/api/events/${s.eventId}/cancellation-executions/${saved.id}` })).json()).toEqual(saved);
    expect((await s.sql('SELECT count(*)::int AS n FROM refunds')).rows[0].n).toBe(1);
    expect((await s.sql('SELECT count(*)::int AS n FROM cancellation_executions')).rows[0].n).toBe(1);
  });
  it('serializes concurrent replay across separate applications without double refunds', async () => {
    const s = await prepared(); const second = (await testApp({ databaseUrl: s.databaseUrl, now: () => new Date('2027-03-01T18:00:00Z') })).app;
    const responses = await Promise.all([s.execute(), second.inject({ method: 'POST', url: `/api/events/${s.eventId}/cancellation-executions`, payload: input(s.plan.id) })]);
    expect(responses.map((r) => r.statusCode)).toEqual([200, 200]); expect(responses[0].json()).toEqual(responses[1].json());
    expect((await s.sql('SELECT count(*)::int AS n FROM refunds')).rows[0].n).toBe(1);
  });
  it('rolls back refunds, entry changes and closure if recording execution fails', async () => {
    const s = await prepared();
    await s.sql("CREATE FUNCTION fail_execution() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fictional recording failure'; END $$; CREATE TRIGGER fail_execution BEFORE INSERT ON cancellation_executions FOR EACH ROW EXECUTE FUNCTION fail_execution()");
    expect((await s.execute()).statusCode).toBe(500);
    expect((await s.sql('SELECT count(*)::int AS n FROM refunds')).rows[0].n).toBe(0);
    expect((await s.app.inject({ method: 'GET', url: `/api/orders/${s.order.id}` })).json().entries[0].status).toBe('confirmed');
    await s.sql('DROP TRIGGER fail_execution ON cancellation_executions');
    expect((await s.execute()).statusCode).toBe(200);
  });
  it.each(['credit', 'rider_choice', null] as const)('refuses unsupported financial policy %s without writes', async (policy) => {
    const s = await prepared(policy); expect((await s.execute()).statusCode).toBe(409);
    expect((await s.sql('SELECT count(*)::int AS n FROM cancellation_executions')).rows[0].n).toBe(0);
    expect((await s.sql('SELECT count(*)::int AS n FROM refunds')).rows[0].n).toBe(0);
  });
  it('requires the current reviewed plan and refuses test capacity reservations', async () => {
    const s = await prepared();
    expect((await s.app.inject({ method: 'POST', url: `/api/events/${s.eventId}/test-entries`, payload: { categoryId: s.cat('RR-M35-34').id, count: 1 } })).statusCode).toBe(200);
    expect((await s.execute()).statusCode).toBe(409);
    const fresh = await s.makePlan(); const response = await s.execute(input(fresh.id)); expect(response.statusCode).toBe(409); expect(response.body).toContain('test entries');
  });
  it('requires a separate acknowledgement and rejects reused request identity or plan', async () => {
    const s = await prepared();
    for (const body of [{ confirmationId: s.plan.id, clientRequestId: 'atomic-invalid' }, { ...input(s.plan.id), acknowledgeSimulatedCancellation: false }, { ...input(s.plan.id), executedBy: 'forged' }]) expect((await s.execute(body)).statusCode).toBe(400);
    expect((await s.execute()).statusCode).toBe(200);
    expect((await s.execute(input(s.plan.id, 'another-execution-request'))).statusCode).toBe(409);
    expect((await s.execute(input('different-plan'))).statusCode).toBe(409);
    const fresh = await s.makePlan(); expect((await s.execute(input(fresh.id, 'overlapping-execution-request'))).statusCode).toBe(409);
  });
  it('enforces current finance authority on execute, read and replay', async () => {
    const s = await prepared(); const email = 'finance@atomic.test';
    expect((await s.execute(input(s.plan.id), as('outsider@atomic.test'))).statusCode).toBe(404);
    await s.app.inject({ method: 'POST', url: `/api/organizations/${s.organizationId}/members`, payload: { email, role: 'finance' } });
    const response = await s.execute(input(s.plan.id), as(email)); expect(response.statusCode).toBe(200); const saved = response.json();
    expect(saved.executedBy).toBe((await s.app.inject({ method: 'GET', url: '/api/me', headers: as(email) })).json().account.id);
    await s.app.inject({ method: 'POST', url: `/api/organizations/${s.organizationId}/members/remove`, payload: { email, role: 'finance' } });
    expect((await s.execute(input(s.plan.id), as(email))).statusCode).toBe(404);
    expect((await s.app.inject({ method: 'GET', url: `/api/events/${s.eventId}/cancellation-executions/${saved.id}`, headers: as(email) })).statusCode).toBe(404);
    expect((await s.execute()).json()).toEqual(saved);
  });
  it('refuses execution in a provider-configured application without calling the provider', async () => {
    const s = await prepared(); const refund = vi.fn(); const createCheckout = vi.fn();
    const payments = { mode: 'stripe_test', refund, createCheckout, parseWebhook: vi.fn() } satisfies PaymentProvider;
    const second = (await testApp({ databaseUrl: s.databaseUrl, now: () => new Date('2027-03-01T18:00:00Z'), payments, appUrl: 'http://localhost:3105' })).app;
    expect((await second.inject({ method: 'POST', url: `/api/events/${s.eventId}/cancellation-executions`, payload: input(s.plan.id) })).statusCode).toBe(409);
    expect(refund).not.toHaveBeenCalled(); expect(createCheckout).not.toHaveBeenCalled();
  });
  it('prevents new holds, transfers, test entries and waitlist joins after republishing', async () => {
    const s = await prepared(); expect((await s.execute()).statusCode).toBe(200);
    expect((await s.app.inject({ method: 'POST', url: `/api/events/${s.eventId}/publish`, payload: { acknowledgeWarnings: true, acknowledgeImpact: true } })).statusCode).toBe(200);
    const order = await s.app.inject({ method: 'POST', url: `/api/rider/events/${s.eventId}/orders`, payload: { clientRequestId: 'after-cancellation-hold', categoryIds: [s.cat('RR-M35-34').id], rider: s.order.rider, waiver: { version: s.config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Readiness Fictional', signerRole: 'rider' } } });
    expect(order.statusCode, order.body).toBe(409);
    expect((await s.app.inject({ method: 'POST', url: `/api/order-entries/${s.order.entries[1].id}/transfer`, payload: { toCategoryId: s.cat('RR-M35-34').id, reason: 'Fictional transfer' } })).statusCode).toBe(409);
    expect((await s.app.inject({ method: 'POST', url: `/api/events/${s.eventId}/test-entries`, payload: { categoryId: s.cat('RR-M35-34').id, count: 1 } })).statusCode).toBe(409);
    const wait = await s.app.inject({ method: 'POST', url: `/api/rider/events/${s.eventId}/waitlist`, payload: { ...s.order.rider, categoryId: s.cat('RR-M35-34').id } }); expect(wait.statusCode, wait.body).toBe(409);
  });
  it('blocks live holds and routes a late payment to review after the hold expires and the race is cancelled', async () => {
    const s = await prepared();
    const held = await s.app.inject({ method: 'POST', url: `/api/rider/events/${s.eventId}/orders`, payload: { clientRequestId: 'late-cancellation-order', categoryIds: [s.cat('RR-M35-34').id], rider: { ...s.order.rider, firstName: 'Late' }, waiver: { version: s.config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Late Fictional', signerRole: 'rider' } } });
    expect(held.statusCode, held.body).toBe(201); expect((await s.execute()).statusCode).toBe(409);
    const later = (await testApp({ databaseUrl: s.databaseUrl, now: () => new Date('2027-03-01T19:00:00Z') })).app;
    const done = await later.inject({ method: 'POST', url: `/api/events/${s.eventId}/cancellation-executions`, payload: input(s.plan.id) });
    expect(done.statusCode, done.body).toBe(200);
    const paid = await later.inject({ method: 'POST', url: `/api/orders/${held.json().id}/payment`, payload: { attemptId: 'late-after-cancellation', outcome: 'success' } });
    expect(paid.statusCode).toBe(200); expect(paid.json().status).toBe('needs_attention'); expect(paid.json().entries.every((e: { status: string }) => e.status === 'released')).toBe(true);
  });
  it('removes active waitlists and offers while keeping historical start lists and reporting removed rows', async () => {
    const s = await prepared(); const categoryId = s.cat('RR-M35-34').id; const raceId = s.cat('RR-M35-34').raceId;
    for (const status of ['waiting', 'offered']) await s.sql(`INSERT INTO waitlist_entries(id,event_id,category_id,rider_json,status,offer_token,offer_expires_at,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,'2027-03-02','2027-03-01','2027-03-01')`, [`wait-${status}`, s.eventId, categoryId, JSON.stringify(s.order.rider), status, status === 'offered' ? 'fictional-offer-token' : null]);
    const snapshot = await s.app.inject({ method: 'POST', url: `/api/events/${s.eventId}/start-lists/${raceId}/snapshots` }); expect(snapshot.statusCode).toBe(201);
    const historical = await s.app.inject({ method: 'GET', url: `/api/events/${s.eventId}/start-lists/${raceId}/csv?snapshot=1` });
    const plan = await s.makePlan(); const response = await s.execute(input(plan.id)); expect(response.statusCode, response.body).toBe(200);
    expect(response.json().removedWaitlistIds.sort()).toEqual(['wait-offered', 'wait-waiting']);
    expect((await s.sql('SELECT DISTINCT status FROM waitlist_entries')).rows).toEqual([{ status: 'removed' }]);
    expect((await s.app.inject({ method: 'POST', url: `/api/events/${s.eventId}/waitlist/wait-waiting/offer` })).statusCode).toBe(409);
    expect((await s.app.inject({ method: 'GET', url: `/api/events/${s.eventId}/start-lists/${raceId}/csv?snapshot=1` })).body).toBe(historical.body);
    const overview = (await s.app.inject({ method: 'GET', url: `/api/events/${s.eventId}/start-lists` })).json(); const race = overview.races.find((r: { raceId: string }) => r.raceId === raceId);
    expect(race.rows).toEqual([]); expect(race.changesSinceLastSnapshot.removed).toHaveLength(1);
  });
  it.each(['event', 'day', 'race'] as const)('keeps %s cancellation closed to newly published categories and moved races', async (scope) => {
    const s = await prepared(); const selectedRace = s.config.races.find((r) => r.id === s.cat('RR-M35-34').raceId)!;
    const selection = scope === 'event' ? { scope } : scope === 'day' ? { scope, dayId: selectedRace.dayId } : { scope, raceId: selectedRace.id };
    const plan = await s.makePlan(selection); const executed = await s.execute(input(plan.id)); expect(executed.statusCode, executed.body).toBe(200);
    const draft = (await s.app.inject({ method: 'GET', url: `/api/events/${s.eventId}` })).json();
    const source = scope === 'race' ? s.cat('RR-M35-34') : s.cat('CR-M35-34');
    if (scope === 'day') draft.config.races.find((r: { id: string }) => r.id === source.raceId).dayId = selectedRace.dayId;
    draft.config.categories.push({ ...source, id: 'cat_after_cancellation', timingCode: 'AFTER-CANCEL', classifications: source.classifications.map((c) => ({ ...c, code: 'AFTER-CANCEL' })) });
    expect((await s.app.inject({ method: 'PUT', url: `/api/events/${s.eventId}/config`, payload: { revision: draft.revision, config: draft.config } })).statusCode).toBe(200);
    const published = await s.app.inject({ method: 'POST', url: `/api/events/${s.eventId}/publish`, payload: { acknowledgeWarnings: true, acknowledgeImpact: true } }); expect(published.statusCode, published.body).toBe(200);
    const held = await s.app.inject({ method: 'POST', url: `/api/rider/events/${s.eventId}/orders`, payload: { clientRequestId: 'new-category-after-cancel', categoryIds: ['cat_after_cancellation'], rider: s.order.rider, waiver: { version: s.config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Readiness Fictional', signerRole: 'rider' } } });
    expect(held.statusCode, held.body).toBe(409); expect(held.body).toContain('cancelled');
  });

  it('resets generated fixture executions without deleting unrelated execution evidence', async () => {
    const s = await prepared(); const ordinary = (await s.execute()).json();
    const generated = await s.app.inject({ method: 'POST', url: '/api/demo/case-studies/criterium' }); expect(generated.statusCode).toBe(201); const id = generated.json().eventId;
    const draft = (await s.app.inject({ method: 'GET', url: `/api/events/${id}` })).json();
    draft.config.days.push({ ...draft.config.days[0], id: 'day_execution_reset', date: '2027-05-01' });
    expect((await s.app.inject({ method: 'PUT', url: `/api/events/${id}/config`, payload: { revision: draft.revision, config: draft.config } })).statusCode).toBe(200);
    const published = await s.app.inject({ method: 'POST', url: `/api/events/${id}/publish`, payload: { acknowledgeWarnings: true, acknowledgeImpact: true } }); expect(published.statusCode, published.body).toBe(200);
    const preview = (await s.app.inject({ method: 'POST', url: `/api/events/${id}/cancellation-confirmation-preview`, payload: { scope: 'day', dayId: 'day_execution_reset' } })).json();
    const plan = await s.app.inject({ method: 'POST', url: `/api/events/${id}/cancellation-confirmations`, payload: { clientRequestId: 'fixture-execution-plan', selection: preview.preview.selection, previewFingerprint: preview.fingerprint, reason: 'Fictional empty-day closure', acknowledgePlanOnly: true } }); expect(plan.statusCode, plan.body).toBe(200);
    const executed = await s.app.inject({ method: 'POST', url: `/api/events/${id}/cancellation-executions`, payload: input(plan.json().id) }); expect(executed.statusCode, executed.body).toBe(200);
    expect((await s.app.inject({ method: 'DELETE', url: '/api/demo/case-studies' })).statusCode).toBe(200);
    expect((await s.sql('SELECT count(*)::int AS n FROM cancellation_executions')).rows[0].n).toBe(1);
    expect((await s.app.inject({ method: 'GET', url: `/api/events/${s.eventId}/cancellation-executions/${ordinary.id}` })).json()).toEqual(ordinary);
  });

  it('serializes a new hold racing cancellation across two applications', async () => {
    const s = await prepared(); const second = (await testApp({ databaseUrl: s.databaseUrl, now: () => new Date('2027-03-01T18:00:00Z') })).app;
    const [cancelled, held] = await Promise.all([s.execute(), second.inject({ method: 'POST', url: `/api/rider/events/${s.eventId}/orders`, payload: { clientRequestId: 'racing-cancellation-hold', categoryIds: [s.cat('RR-M35-34').id], rider: { ...s.order.rider, firstName: 'Concurrent' }, waiver: { version: s.config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Concurrent Fictional', signerRole: 'rider' } } })]);
    expect([[200, 409], [409, 201]]).toContainEqual([cancelled.statusCode, held.statusCode]);
    expect((await s.sql('SELECT count(*)::int AS n FROM refunds')).rows[0].n).toBe(cancelled.statusCode === 200 ? 1 : 0);
  });

});
