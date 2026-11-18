import { describe, expect, it, vi } from 'vitest';
import { cancellationSetup as setup } from './support/cancellation';
import { testApp } from './support/db';
import { as } from './support/auth';
import { CANCELLATION_NOT_EXECUTED } from '../src/shared/cancellations';
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
    const failed = await s.execute(); expect(failed.statusCode).toBe(500); expect(failed.json().details?.code).not.toBe(CANCELLATION_NOT_EXECUTED);
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
    const fresh = await s.makePlan(); const response = await s.execute(input(fresh.id, 'fresh-test-entry-request')); expect(response.statusCode).toBe(409); expect(response.body).toContain('test entries');
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
    const checked = await second.inject({ method: 'GET', url: `/api/events/${s.eventId}/cancellation-confirmations/${s.plan.id}/execution-check` }); expect(checked.json()).toMatchObject({ eligible: false, execution: null, financial: null }); expect(checked.json().reason).toContain('simulated payments');
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
    expect(held.statusCode, held.body).toBe(201);
    const duplicate = (await testApp({ databaseUrl: s.databaseUrl, now: () => new Date('2027-03-01T18:00:00Z') })).app;
    const refusals = await Promise.all([s.execute(), duplicate.inject({ method: 'POST', url: `/api/events/${s.eventId}/cancellation-executions`, payload: input(s.plan.id) })]);
    expect(refusals.map((r) => r.statusCode)).toEqual([409, 409]); expect(refusals[0].json()).toEqual(refusals[1].json());
    const later = (await testApp({ databaseUrl: s.databaseUrl, now: () => new Date('2027-03-01T19:00:00Z') })).app;
    const delayed = await later.inject({ method: 'POST', url: `/api/events/${s.eventId}/cancellation-executions`, payload: input(s.plan.id) }); expect(delayed.json()).toEqual(refusals[0].json());
    expect((await s.sql("SELECT count(*)::int AS n FROM cancellation_request_refusals WHERE command_kind='execution'")).rows[0].n).toBe(1);
    const done = await later.inject({ method: 'POST', url: `/api/events/${s.eventId}/cancellation-executions`, payload: input(s.plan.id, 'fresh-after-expired-hold') });
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
  it.each(['event', 'day', 'race'] as const)('keeps %s cancellation closed to newly published categories and races', async (scope) => {
    const s = await prepared(); const selectedRace = s.config.races.find((r) => r.id === s.cat('RR-M35-34').raceId)!;
    const selection = scope === 'event' ? { scope } : scope === 'day' ? { scope, dayId: selectedRace.dayId } : { scope, raceId: selectedRace.id };
    const plan = await s.makePlan(selection); const executed = await s.execute(input(plan.id)); expect(executed.statusCode, executed.body).toBe(200);
    const draft = (await s.app.inject({ method: 'GET', url: `/api/events/${s.eventId}` })).json();
    const source = scope === 'event' ? s.cat('CR-M35-34') : s.cat('RR-M35-34');
    let newRaceId = source.raceId; let newStartId = source.startGroupId;
    if (scope === 'day') {
      newRaceId = 'race_new_cancelled_day'; newStartId = 'sg_new_cancelled_day';
      draft.config.races.push({ ...selectedRace, id: newRaceId });
      draft.config.startGroups.push({ ...draft.config.startGroups.find((g: { id: string }) => g.id === source.startGroupId), id: newStartId, raceId: newRaceId });
    }
    draft.config.categories.push({ ...source, id: 'cat_after_cancellation', raceId: newRaceId, startGroupId: newStartId, displayGroupId: null, timingCode: 'AFTER-CANCEL', classifications: source.classifications.map((c) => ({ ...c, code: 'AFTER-CANCEL' })) });
    expect((await s.app.inject({ method: 'PUT', url: `/api/events/${s.eventId}/config`, payload: { revision: draft.revision, config: draft.config } })).statusCode).toBe(200);
    const published = await s.app.inject({ method: 'POST', url: `/api/events/${s.eventId}/publish`, payload: { acknowledgeWarnings: true, acknowledgeImpact: true } }); expect(published.statusCode, published.body).toBe(200);
    const held = await s.app.inject({ method: 'POST', url: `/api/rider/events/${s.eventId}/orders`, payload: { clientRequestId: 'new-category-after-cancel', categoryIds: ['cat_after_cancellation'], rider: s.order.rider, waiver: { version: s.config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Readiness Fictional', signerRole: 'rider' } } });
    expect(held.statusCode, held.body).toBe(409); expect(held.body).toContain('cancelled');
  });

  it('resets generated fixture executions without deleting unrelated execution evidence', async () => {
    const s = await prepared(); const ordinary = (await s.execute()).json();
    expect((await s.execute(input(s.plan.id, 'ordinary-refusal-request'))).statusCode).toBe(409);
    const generated = await s.app.inject({ method: 'POST', url: '/api/demo/case-studies/criterium' }); expect(generated.statusCode).toBe(201); const id = generated.json().eventId;
    const draft = (await s.app.inject({ method: 'GET', url: `/api/events/${id}` })).json();
    draft.config.days.push({ ...draft.config.days[0], id: 'day_execution_reset', date: '2027-05-01' });
    expect((await s.app.inject({ method: 'PUT', url: `/api/events/${id}/config`, payload: { revision: draft.revision, config: draft.config } })).statusCode).toBe(200);
    const published = await s.app.inject({ method: 'POST', url: `/api/events/${id}/publish`, payload: { acknowledgeWarnings: true, acknowledgeImpact: true } }); expect(published.statusCode, published.body).toBe(200);
    const preview = (await s.app.inject({ method: 'POST', url: `/api/events/${id}/cancellation-confirmation-preview`, payload: { scope: 'day', dayId: 'day_execution_reset' } })).json();
    const plan = await s.app.inject({ method: 'POST', url: `/api/events/${id}/cancellation-confirmations`, payload: { clientRequestId: 'fixture-execution-plan', selection: preview.preview.selection, previewFingerprint: preview.fingerprint, reason: 'Fictional empty-day closure', acknowledgePlanOnly: true } }); expect(plan.statusCode, plan.body).toBe(200);
    const executed = await s.app.inject({ method: 'POST', url: `/api/events/${id}/cancellation-executions`, payload: input(plan.json().id) }); expect(executed.statusCode, executed.body).toBe(200);
    expect((await s.app.inject({ method: 'POST', url: `/api/events/${id}/cancellation-executions`, payload: input(plan.json().id, 'fixture-refusal-request') })).statusCode).toBe(409);
    expect((await s.app.inject({ method: 'DELETE', url: '/api/demo/case-studies' })).statusCode).toBe(200);
    expect((await s.sql('SELECT event_id FROM cancellation_request_refusals')).rows).toEqual([{ event_id: s.eventId }]);
    expect((await s.sql('SELECT count(*)::int AS n FROM cancellation_executions')).rows[0].n).toBe(1);
    expect((await s.app.inject({ method: 'GET', url: `/api/events/${s.eventId}/cancellation-executions/${ordinary.id}` })).json()).toEqual(ordinary);
  });

  it('serializes a new hold racing cancellation across two applications', async () => {
    const s = await prepared(); const second = (await testApp({ databaseUrl: s.databaseUrl, now: () => new Date('2027-03-01T18:00:00Z') })).app;
    const [cancelled, held] = await Promise.all([s.execute(), second.inject({ method: 'POST', url: `/api/rider/events/${s.eventId}/orders`, payload: { clientRequestId: 'racing-cancellation-hold', categoryIds: [s.cat('RR-M35-34').id], rider: { ...s.order.rider, firstName: 'Concurrent' }, waiver: { version: s.config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Concurrent Fictional', signerRole: 'rider' } } })]);
    expect([[200, 409], [409, 201]]).toContainEqual([cancelled.statusCode, held.statusCode]);
    expect((await s.sql('SELECT count(*)::int AS n FROM refunds')).rows[0].n).toBe(cancelled.statusCode === 200 ? 1 : 0);
  });

  it.each([false, true])('blocks cancelled-day check-in and manual bibs with reviewed licenses=%s', async (reviewed) => {
    const s = await prepared(); const dayId = s.config.races.find((r) => r.id === s.cat('RR-M35-34').raceId)!.dayId;
    if (reviewed) for (const e of s.order.entries) expect((await s.app.inject({ method: 'POST', url: `/api/order-entries/${e.id}/license-review`, payload: { note: 'Fictional reviewed license' } })).statusCode).toBe(200);
    expect((await s.app.inject({ method: 'PUT', url: `/api/events/${s.eventId}/bib-settings`, payload: { scope: 'day', ranges: [{ scope: dayId, first: 100, last: 199 }] } })).statusCode).toBe(200);
    expect((await s.execute(input((await s.makePlan()).id))).statusCode).toBe(200);
    const list = (await s.app.inject({ method: 'GET', url: `/api/events/${s.eventId}/check-in?day=${dayId}` })).json();
    const card = list.riders.find((r: { orderId: string }) => r.orderId === s.order.id);
    expect(card?.entries ?? []).toEqual([]); expect(card?.result.ready ?? false).toBe(false); expect(list.summary.riders).toBe(0);
    expect((await s.app.inject({ method: 'POST', url: `/api/events/${s.eventId}/check-in/${s.order.id}`, payload: { dayId, bib: null } })).statusCode).toBe(409);
    expect((await s.app.inject({ method: 'POST', url: `/api/events/${s.eventId}/bibs/preview`, payload: { dayId, orderIds: [s.order.id], sort: 'name' } })).statusCode).toBe(409);
    expect((await s.sql('SELECT count(*)::int AS n FROM bib_assignments')).rows[0].n).toBe(0);
  });
  it('assigns no automatic bib after every entry is cancelled', async () => {
    const s = await prepared();
    for (const e of s.order.entries) await s.app.inject({ method: 'POST', url: `/api/order-entries/${e.id}/license-review`, payload: { note: 'Fictional reviewed license' } });
    const draft = (await s.app.inject({ method: 'GET', url: `/api/events/${s.eventId}` })).json(); draft.config.registration.demoIgnoreWindows = false;
    for (const c of draft.config.categories) c.registration.closesAt = '2027-03-01T11:00';
    expect((await s.app.inject({ method: 'PUT', url: `/api/events/${s.eventId}/config`, payload: { revision: draft.revision, config: draft.config } })).statusCode).toBe(200);
    expect((await s.app.inject({ method: 'POST', url: `/api/events/${s.eventId}/publish`, payload: { acknowledgeWarnings: true, acknowledgeImpact: true } })).statusCode).toBe(200);
    expect((await s.app.inject({ method: 'PUT', url: `/api/events/${s.eventId}/bib-settings`, payload: { scope: 'weekend', ranges: [{ scope: 'weekend', first: 100, last: 199 }] } })).statusCode).toBe(200);
    expect((await s.app.inject({ method: 'POST', url: `/api/events/${s.eventId}/automatic-bibs`, payload: { sort: 'name' } })).statusCode).toBe(200);
    const plan = await s.makePlan({ scope: 'event' }); expect((await s.execute(input(plan.id))).statusCode).toBe(200);
    const later = await testApp({ databaseUrl: s.databaseUrl, now: () => new Date('2027-03-02T18:00:00Z') }); await later.automaticBibs.runDue();
    expect((await s.sql('SELECT count(*)::int AS n FROM bib_assignments')).rows[0].n).toBe(0);
    expect((await s.sql('SELECT completed_at FROM automatic_bib_jobs')).rows[0].completed_at).not.toBeNull();
  });
  it.each(['into', 'out', 'day'] as const)('refuses placement moves %s of a cancelled scope', async (direction) => {
    const s = await prepared(); expect((await s.execute()).statusCode).toBe(200);
    const draft = (await s.app.inject({ method: 'GET', url: `/api/events/${s.eventId}` })).json();
    const rr = draft.config.categories.find((c: { id: string }) => c.id === s.cat('RR-M35-34').id); const cr = draft.config.categories.find((c: { id: string }) => c.id === s.cat('CR-M35-34').id);
    if (direction === 'day') draft.config.races.find((r: { id: string }) => r.id === rr.raceId).dayId = s.config.races.find((r) => r.id === cr.raceId)!.dayId;
    else { const moved = direction === 'into' ? cr : rr; const target = direction === 'into' ? rr : cr; moved.raceId = target.raceId; moved.startGroupId = target.startGroupId; moved.displayGroupId = null; }
    const response = await s.app.inject({ method: 'PUT', url: `/api/events/${s.eventId}/config`, payload: { revision: draft.revision, config: draft.config } }); expect(response.statusCode, response.body).toBe(409); expect(response.body).toContain('cancelled scope');
  });
  it('refuses publishing an earlier draft move after its original race is cancelled', async () => {
    const s = await prepared(); const draft = (await s.app.inject({ method: 'GET', url: `/api/events/${s.eventId}` })).json();
    const rr = draft.config.categories.find((c: { id: string }) => c.id === s.cat('RR-M35-34').id); const cr = draft.config.categories.find((c: { id: string }) => c.id === s.cat('CR-M35-34').id);
    rr.raceId = cr.raceId; rr.startGroupId = cr.startGroupId; rr.displayGroupId = null;
    expect((await s.app.inject({ method: 'PUT', url: `/api/events/${s.eventId}/config`, payload: { revision: draft.revision, config: draft.config } })).statusCode).toBe(200);
    expect((await s.execute()).statusCode).toBe(200);
    const response = await s.app.inject({ method: 'POST', url: `/api/events/${s.eventId}/publish`, payload: { acknowledgeWarnings: true, acknowledgeImpact: true } }); expect(response.statusCode, response.body).toBe(409); expect(response.body).toContain('cancelled scope');
  });
  it('constrains cancellation timestamps and status together', async () => {
    const s = await prepared(); expect((await s.execute()).statusCode).toBe(200);
    await expect(s.sql('UPDATE order_entries SET cancelled_at=NULL WHERE id=$1', [s.order.entries[0].id])).rejects.toThrow(/entry_cancellation_time/);
    await expect(s.sql("UPDATE order_entries SET status='confirmed' WHERE id=$1", [s.order.entries[0].id])).rejects.toThrow(/entry_cancellation_time/);
  });

  it('retains existing check-in and bib history and permits only audited correction of an issued bib', async () => {
    const s = await prepared(); const dayId = s.config.races.find((r) => r.id === s.cat('RR-M35-34').raceId)!.dayId;
    for (const e of s.order.entries) await s.app.inject({ method: 'POST', url: `/api/order-entries/${e.id}/license-review`, payload: { note: 'Fictional reviewed license' } });
    await s.app.inject({ method: 'PUT', url: `/api/events/${s.eventId}/bib-settings`, payload: { scope: 'day', ranges: [{ scope: dayId, first: 100, last: 199 }] } });
    const before = await s.app.inject({ method: 'POST', url: `/api/events/${s.eventId}/check-in/${s.order.id}`, payload: { dayId, bib: null } }); expect(before.statusCode, before.body).toBe(200);
    const historical = (await s.sql('SELECT checked_in_at FROM check_ins WHERE order_id=$1', [s.order.id])).rows;
    expect((await s.execute(input((await s.makePlan()).id))).statusCode).toBe(200);
    expect((await s.sql('SELECT checked_in_at FROM check_ins WHERE order_id=$1', [s.order.id])).rows).toEqual(historical);
    const change = { dayId, bib: 101, reason: 'Fictional issued-bib correction', acknowledgeCheckedIn: true };
    const preview = await s.app.inject({ method: 'POST', url: `/api/events/${s.eventId}/check-in/${s.order.id}/bib/preview`, payload: change }); expect(preview.statusCode, preview.body).toBe(200);
    const corrected = await s.app.inject({ method: 'POST', url: `/api/events/${s.eventId}/check-in/${s.order.id}/bib`, payload: { ...change, fingerprint: preview.json().fingerprint } }); expect(corrected.statusCode, corrected.body).toBe(200);
    expect((await s.sql('SELECT checked_in_at FROM check_ins WHERE order_id=$1', [s.order.id])).rows).toEqual(historical);
    const card = (await s.app.inject({ method: 'GET', url: `/api/events/${s.eventId}/check-in?day=${dayId}&q=Readiness` })).json().riders.find((r: { orderId: string }) => r.orderId === s.order.id);
    expect(card.result.ready).toBe(false); expect(card.bib).toBe(101); expect(card.bibHistory).toHaveLength(2);
    expect((await s.app.inject({ method: 'GET', url: `/api/orders/${s.order.id}` })).json().entries[0].status).toBe('cancelled');
  });

  it('checks actual eligibility without writes and returns verified existing execution evidence', async () => {
    const s = await prepared(); const check = () => s.app.inject({ method: 'GET', url: `/api/events/${s.eventId}/cancellation-confirmations/${s.plan.id}/execution-check` });
    const first = await check(); expect(first.statusCode).toBe(200); expect(first.json()).toMatchObject({ eligible: true, reason: null, execution: null, financial: { status: 'financially_eligible_for_simulation' } });
    expect((await s.sql('SELECT count(*)::int AS n FROM refunds')).rows[0].n).toBe(0);
    const saved = (await s.execute()).json(); expect((await check()).json()).toMatchObject({ eligible: false, execution: saved });
    const fresh = await s.makePlan(); const overlap = await s.app.inject({ method: 'GET', url: `/api/events/${s.eventId}/cancellation-confirmations/${fresh.id}/execution-check` }); expect(overlap.json().eligible).toBe(false); expect(overlap.json().reason).toContain('overlaps');
  });
  it('reports selected test entries as an operational blocker even with eligible finances', async () => {
    const s = await prepared(); await s.app.inject({ method: 'POST', url: `/api/events/${s.eventId}/test-entries`, payload: { categoryId: s.cat('RR-M35-34').id, count: 1 } });
    const p = await s.makePlan(); const response = await s.app.inject({ method: 'GET', url: `/api/events/${s.eventId}/cancellation-confirmations/${p.id}/execution-check` });
    expect(response.json()).toMatchObject({ eligible: false, execution: null, financial: { status: 'financially_eligible_for_simulation' } }); expect(response.json().reason).toContain('test entries');
  });
  it('marks only known no-execution refusals after a negative identity lookup', async () => {
    const s = await prepared(); const missing = await s.execute(input('missing-plan', 'missing-plan-request')); expect(missing.statusCode).toBe(404); expect(missing.json().details.code).toBe(CANCELLATION_NOT_EXECUTED);
    const invalid = await s.execute({ ...input(s.plan.id), acknowledgeSimulatedCancellation: false }); expect(invalid.statusCode).toBe(400); expect(invalid.json().details?.code).not.toBe(CANCELLATION_NOT_EXECUTED);
    const unauthorized = await s.execute(input(s.plan.id), as('outsider@atomic.test')); expect(unauthorized.statusCode).toBe(404); expect(unauthorized.json().details?.code).not.toBe(CANCELLATION_NOT_EXECUTED);
    expect((await s.execute()).statusCode).toBe(200);
    const conflict = await s.execute(input('other-plan')); expect(conflict.statusCode).toBe(409); expect(conflict.json().details?.code).not.toBe(CANCELLATION_NOT_EXECUTED);
    const otherIdentity = await s.execute(input(s.plan.id, 'another-execution-identity')); expect(otherIdentity.statusCode).toBe(409); expect(otherIdentity.json().details.code).toBe(CANCELLATION_NOT_EXECUTED);
  });
  it('protects execution checks with current event finance authority', async () => {
    const s = await prepared(); const url = `/api/events/${s.eventId}/cancellation-confirmations/${s.plan.id}/execution-check`;
    for (const [role, expected] of [['finance', 200], ['registration_manager', 403]] as const) {
      const email = `${role}@execution-check.test`; await s.app.inject({ method: 'POST', url: `/api/organizations/${s.organizationId}/members`, payload: { email, role } });
      expect((await s.app.inject({ method: 'GET', url, headers: as(email) })).statusCode).toBe(expected);
    }
    await s.app.inject({ method: 'POST', url: `/api/organizations/${s.organizationId}/members/remove`, payload: { email: 'finance@execution-check.test', role: 'finance' } });
    expect((await s.app.inject({ method: 'GET', url, headers: as('finance@execution-check.test') })).statusCode).toBe(404);
    const other = await s.app.inject({ method: 'POST', url: `/api/organizations/${s.organizationId}/events`, payload: { name: 'Other Fictional Race', template: 'weekend', startDate: '2027-04-01', timeZone: 'America/Los_Angeles' } });
    expect((await s.app.inject({ method: 'GET', url: `/api/events/${other.json().id}/cancellation-confirmations/${s.plan.id}/execution-check` })).statusCode).toBe(404);
  });

  it('durably refuses a known write failure only after rolling back earlier simulated refunds', async () => {
    const s = await prepared(); const plan = await s.makePlan({ scope: 'event' }); const body = input(plan.id);
    await s.sql(`CREATE FUNCTION change_total_during_refund() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE orders SET total_cents=0 WHERE id=NEW.order_id; RETURN NEW; END $$; CREATE TRIGGER change_total_during_refund BEFORE INSERT ON refunds FOR EACH ROW EXECUTE FUNCTION change_total_during_refund()`);
    const rejected = await s.execute(body); expect(rejected.statusCode, rejected.body).toBe(409); expect(rejected.json().details.code).toBe(CANCELLATION_NOT_EXECUTED);
    expect((await s.sql('SELECT count(*)::int AS n FROM refunds')).rows[0].n).toBe(0); expect((await s.sql('SELECT total_cents FROM orders WHERE id=$1', [s.order.id])).rows[0].total_cents).toBe(s.order.totalCents);
    expect((await s.app.inject({ method: 'GET', url: `/api/orders/${s.order.id}` })).json().entries.every((e: { status: string }) => e.status === 'confirmed')).toBe(true);
    await s.sql('DROP TRIGGER change_total_during_refund ON refunds');
    expect((await s.execute(body)).json()).toEqual(rejected.json());
    const changed = await s.execute({ ...body, confirmationId: 'changed-plan' }); expect(changed.statusCode).toBe(409); expect(changed.json().details?.code).not.toBe(CANCELLATION_NOT_EXECUTED);
    const restored = await s.execute(input(plan.id, 'fresh-after-known-rollback')); expect(restored.statusCode, restored.body).toBe(200); expect(restored.json().refunds).toHaveLength(2);
  });

});
