import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { cancellationSetup as setup } from './support/cancellation';
import { as } from './support/auth';
import { takeOffTeam } from './support/membership';
import { publishReviewed } from './support/publish';

describe('cancellation execution financial preflight', () => {
  it('uses the accepted partial-package allocation without moving entries, payments or evidence', async () => {
    const s = await setup(); const paid = (await s.pay()).json(); const plan = await s.plan();
    const before = await s.sql('SELECT (SELECT count(*) FROM refunds) AS refunds,(SELECT count(*) FROM entry_changes) AS changes,(SELECT count(*) FROM cancellation_confirmations) AS plans');
    const responses = await Promise.all([s.read(plan.id), s.read(plan.id)]);
    for (const response of responses) {
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json()).toMatchObject({ confirmationId: plan.id, eventId: s.eventId, status: 'financially_eligible_for_simulation', executionAvailable: false, blockers: [], simulatedCashCents: plan.preview.financial.acceptedEntryAllocationCents });
      expect(response.json().entries).toHaveLength(1);
      expect(response.json().entries[0].nominalCashCents).toBe(paid.quote.lines.find((l: { categoryId: string }) => l.categoryId === s.cat('RR-M35-34').id).totalCents);
      expect(response.body).not.toMatch(/paymentRef|provider_ref|Fictional Contact|readiness@example/);
    }
    expect((await s.app.inject({ method: 'GET', url: `/api/orders/${paid.id}` })).json()).toEqual(paid);
    expect((await s.sql('SELECT (SELECT count(*) FROM refunds) AS refunds,(SELECT count(*) FROM entry_changes) AS changes,(SELECT count(*) FROM cancellation_confirmations) AS plans')).rows).toEqual(before.rows);
  });
  it.each(['credit', 'rider_choice', null] as const)('blocks unsupported accepted policy %s', async (policy) => {
    const s = await setup(policy); await s.pay(); const p = await s.plan(); const r = (await s.read(p.id)).json();
    expect(r.status).toBe('blocked'); expect(r.simulatedCashCents).toBeNull(); expect(r.blockers).toContainEqual(expect.objectContaining({ code: 'unsupported_policy' })); expect(r.entries[0].nominalCashCents).toBeNull();
  });
  it('blocks an unsettled hold and later treats the original plan as stale after payment', async () => {
    const s = await setup(); const p = await s.plan(); expect((await s.read(p.id)).json().blockers).toContainEqual({ code: 'unsettled_order', orderId: s.order.id });
    await s.pay(); const r = (await s.read(p.id)).json(); expect(r.blockers).toContainEqual({ code: 'plan_changed' }); expect(r.simulatedCashCents).toBeNull();
  });
  it.each(['missing_payment', 'mismatch', 'unknown_amount', 'needs_attention', 'over_total', 'over_total_and_mismatch', 'provider', 'session', 'provider_event', 'refund', 'succeeded_refund'] as const)('fails closed for %s, including changes not in the historical fingerprint', async (change) => {
    const s = await setup(); await s.pay(); const p = await s.plan();
    if (change === 'missing_payment') await s.sql('DELETE FROM payment_attempts WHERE order_id=$1', [s.order.id]);
    if (change === 'mismatch') await s.sql("UPDATE payment_attempts SET outcome='mismatch' WHERE order_id=$1", [s.order.id]);
    if (change === 'unknown_amount') await s.sql('UPDATE payment_attempts SET amount_cents=1 WHERE order_id=$1', [s.order.id]);
    if (change === 'needs_attention') await s.sql("INSERT INTO payment_attempts(id,order_id,outcome,result_status,created_at,provider,provider_ref,amount_cents) SELECT 'attention-fixture',order_id,'success','needs_attention',created_at,provider,provider_ref,amount_cents FROM payment_attempts WHERE order_id=$1 LIMIT 1", [s.order.id]);
    if (change === 'over_total_and_mismatch') { await s.sql('UPDATE orders SET total_cents=1 WHERE id=$1', [s.order.id]); await s.sql('UPDATE payment_attempts SET amount_cents=2 WHERE order_id=$1', [s.order.id]); }
    if (change === 'over_total') await s.sql('UPDATE orders SET total_cents=1 WHERE id=$1', [s.order.id]);
    if (change === 'provider') await s.sql("UPDATE payment_attempts SET provider='stripe_test',provider_ref='pi_fictional' WHERE order_id=$1", [s.order.id]);
    if (change === 'session') await s.sql("INSERT INTO payment_sessions VALUES('cs_fictional',$1,'stripe_test','https://example.test',1,'expired','2027-02-01','2027-02-01')", [s.order.id]);
    if (change === 'provider_event') await s.sql("INSERT INTO provider_events(id,provider,type,order_id,outcome,result,received_at) VALUES('evt_fictional','stripe_test','fictional',$1,'success','duplicate_charge','2027-03-01')", [s.order.id]);
    if (change === 'refund' || change === 'succeeded_refund') await s.sql("INSERT INTO refunds(id,order_id,provider,amount_cents,reason,status,created_at,updated_at) VALUES('ref_fictional',$1,'simulated',1,'Fictional failed refund','failed','2027-03-01','2027-03-01')", [s.order.id]);
    if (change === 'succeeded_refund') await s.sql("UPDATE refunds SET status='succeeded' WHERE order_id=$1", [s.order.id]);
    const response = await s.read(p.id); expect(response.statusCode, response.body).toBe(200); const r = response.json(); expect(r.status).toBe('blocked'); expect(r.simulatedCashCents).toBeNull();
    const code = ['provider', 'session', 'provider_event'].includes(change) ? 'provider_payment' : ['refund', 'succeeded_refund'].includes(change) ? 'refund_history' : 'payment_reconciliation';
    expect(r.blockers).toContainEqual({ code, orderId: s.order.id });
    if (code === 'payment_reconciliation') expect(r.blockers.filter((b: { code: string }) => b.code === code)).toHaveLength(1);
    if (change === 'provider' || change === 'provider_event') expect(r.blockers).not.toContainEqual({ code: 'plan_changed' });
    if (change === 'refund') { const fresh = await s.plan(); expect((await s.read(fresh.id)).json().blockers).toContainEqual({ code: 'refund_history', orderId: s.order.id }); }
  });
  it('takes multiple order refund-request locks in sorted order before evaluating eligibility', async () => {
    const s = await setup(); await s.pay();
    const second = await s.app.inject({ method: 'POST', url: `/api/rider/events/${s.eventId}/orders`, payload: {
      clientRequestId: 'second-preflight-order', categoryIds: [s.cat('RR-M35-34').id], rider: { ...s.order.rider, firstName: 'Second' },
      waiver: { version: s.config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Second Fictional', signerRole: 'rider' },
    } });
    expect(second.statusCode, second.body).toBe(201);
    expect((await s.app.inject({ method: 'POST', url: `/api/orders/${second.json().id}/payment`, payload: { attemptId: 'second-preflight-payment', outcome: 'success' } })).statusCode).toBe(200);
    const p = await s.plan(); const ids = [s.order.id, second.json().id].sort();
    const db = new pg.Client({ connectionString: s.databaseUrl }); await db.connect();
    await db.query('BEGIN'); await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`refunds:${ids[1]}`]);
    let finished = false;
    const pending = s.read(p.id).then((r) => { finished = true; return r; });
    try {
      await expect.poll(async () => (await db.query(`SELECT EXISTS(SELECT 1 FROM pg_locks h JOIN pg_locks w ON h.database=w.database AND h.classid=w.classid AND h.objid=w.objid AND h.objsubid=w.objsubid WHERE h.pid=pg_backend_pid() AND h.locktype='advisory' AND h.granted AND w.locktype='advisory' AND NOT w.granted AND w.pid<>h.pid) AS waiting`)).rows[0].waiting).toBe(true);
      expect(finished).toBe(false);
      expect((await db.query('SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired', [`refunds:${ids[0]}`])).rows[0].acquired).toBe(false);
    } finally { await db.query('ROLLBACK'); await db.end(); }
    expect((await pending).json().status).toBe('financially_eligible_for_simulation');
  });
  it('blocks a current race placement that differs from the accepted version', async () => {
    const s = await setup(); await s.pay();
    const draft = (await s.app.inject({ method: 'GET', url: `/api/events/${s.eventId}` })).json();
    const race = draft.config.races.find((r: { id: string }) => r.id === s.cat('RR-M35-34').raceId);
    race.dayId = draft.config.days.find((d: { id: string }) => d.id !== race.dayId).id;
    expect((await s.app.inject({ method: 'PUT', url: `/api/events/${s.eventId}/config`, payload: { revision: draft.revision, config: draft.config } })).statusCode).toBe(200);
    const published = await publishReviewed(s.app, `/api/events/${s.eventId}`, { acknowledgeWarnings: true, acknowledgeImpact: true });
    expect(published.statusCode, published.body).toBe(200);
    const p = await s.plan(); const r = (await s.read(p.id)).json();
    expect(r.blockers).toContainEqual({ code: 'allocation_review', orderId: s.order.id, entryId: s.order.entries[0].id }); expect(r.simulatedCashCents).toBeNull();
  });
  it('propagates infrastructure failures instead of producing eligibility', async () => {
    const s = await setup(); await s.pay(); const p = await s.plan();
    await s.sql('ALTER TABLE payment_sessions RENAME TO unavailable_sessions');
    try { const response = await s.read(p.id); expect(response.statusCode).toBe(500); expect(response.body).not.toContain('financially_eligible_for_simulation'); }
    finally { await s.sql('ALTER TABLE unavailable_sessions RENAME TO payment_sessions'); }
    expect((await s.read(p.id)).json().status).toBe('financially_eligible_for_simulation');
  });
  it('returns an unreviewable block without rewriting a historical plan', async () => {
    const s = await setup(); await s.pay(); const p = await s.plan();
    await s.sql("UPDATE order_entries SET category_id='missing-fictional-category' WHERE id=$1", [s.order.entries[0].id]);
    const r = (await s.read(p.id)).json(); expect(r.blockers).toEqual([{ code: 'impact_unreviewable' }]); expect(r.entries).toEqual([]); expect(r.executionAvailable).toBe(false);
    expect((await s.app.inject({ method: 'GET', url: `/api/events/${s.eventId}/cancellation-confirmations/${p.id}` })).json()).toEqual(p);
  });
  it('requires current event finance authority and hides another event or missing plan', async () => {
    const s = await setup(); await s.pay(); const p = await s.plan();
    for (const [role, expected] of [['finance', 200], ['registration_manager', 403], ['timer_export', 403]] as const) {
      const email = `${role}@readiness.test`;
      expect((await s.app.inject({ method: 'POST', url: `/api/organizations/${s.organizationId}/members`, payload: { email, role } })).statusCode).toBe(200);
      expect((await s.read(p.id, as(email))).statusCode).toBe(expected);
    }
    expect((await s.read(p.id, as('outsider@readiness.test'))).statusCode).toBe(404);
    expect((await s.read('missing-fictional-plan')).statusCode).toBe(404);
    const other = await s.app.inject({ method: 'POST', url: `/api/organizations/${s.organizationId}/events`, payload: { name: 'Other Fictional Race', template: 'weekend', startDate: '2027-04-01', timeZone: 'America/Los_Angeles' } });
    expect(other.statusCode, other.body).toBe(201);
    expect((await s.app.inject({ method: 'GET', url: `/api/events/${other.json().id}/cancellation-confirmations/${p.id}/financial-preflight` })).statusCode).toBe(404);
    expect((await takeOffTeam((method, url, payload) => s.app.inject({ method, url, payload }), s.organizationId, 'finance@readiness.test', 'finance')).statusCode).toBe(200);
    expect((await s.read(p.id, as('finance@readiness.test'))).statusCode).toBe(404);
  });
});
