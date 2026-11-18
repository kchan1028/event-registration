import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { testApp, testDatabaseUrl } from './support/db';
import { as } from './support/auth';
import { parseCsv } from '../src/shared/csv';

async function setup() {
  const databaseUrl = await testDatabaseUrl();
  const { app } = await testApp({ databaseUrl, now: () => new Date('2027-03-01T18:00:00Z') });
  const { eventId, organizationId } = (await app.inject({ method: 'POST', url: '/api/demo' })).json();
  expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/publish`, payload: { acknowledgeWarnings: true } })).statusCode).toBe(200);
  const { config } = (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json();
  const categoryId = config.categories.find((c: { timingCode: string }) => c.timingCode === 'RR-M35-34').id;
  let nonce = 0;
  const order = async (pay = true) => {
    const r = await app.inject({ method: 'POST', url: `/api/rider/events/${eventId}/orders`, payload: {
      clientRequestId: `reconciliation-order-${++nonce}`, categoryIds: [categoryId],
      rider: { firstName: 'Evidence', lastName: 'Fictional', email: 'evidence@example.test', phone: '555-555-0133', team: '', licenseNumber: 'FICTIONAL-LICENSE-ONLY', racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Private Fictional Contact', phone: '555-555-0199' } },
      waiver: { version: config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Evidence Fictional', signerRole: 'rider' },
    } });
    expect(r.statusCode, r.body).toBe(201); const o = r.json();
    if (pay) expect((await app.inject({ method: 'POST', url: `/api/orders/${o.id}/payment`, payload: { attemptId: `reconciliation-pay-${nonce}`, outcome: 'success' } })).statusCode).toBe(200);
    return o;
  };
  const sql = async (query: string, values: unknown[] = []) => { const c = new pg.Client({ connectionString: databaseUrl }); await c.connect(); try { return await c.query(query, values); } finally { await c.end(); } };
  const download = (headers = {}) => app.inject({ method: 'GET', url: `/api/events/${eventId}/exports/reconciliation.csv`, headers });
  return { app, eventId, organizationId, order, sql, download };
}
const table = (csv: string) => { const [header, ...rows] = parseCsv(csv); return rows.map((row) => Object.fromEntries(header!.map((h, i) => [h, row[i] ?? '']))); };

describe('local finance reconciliation CSV', () => {
  it('exports empty events with explicit evidence columns and no inferred settlement', async () => {
    const s = await setup(); const r = await s.download(); expect(r.statusCode).toBe(200);
    expect(parseCsv(r.body)).toEqual([['generated_at', 'basis', 'order_id', 'order_number', 'order_status', 'order_total_cents', 'record_kind', 'record_id', 'provider', 'provider_reference', 'payment_reference', 'session_reference', 'entry_id', 'amount_cents', 'outcome', 'result_status', 'recorded_at', 'updated_at']]);
    expect(r.headers['x-cyclereg-export-generated-at']).toBe('2027-03-01T18:00:00.000Z');
    expect(r.headers['content-type']).toContain('text/csv'); expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['content-disposition']).toContain('-reconciliation-LOCAL-RECORDS-DEMO.csv');
    expect(r.headers['x-cyclereg-cancellation']).toBe('none'); expect(r.headers['x-cyclereg-export-context']).toBe('current');
  });
  it('keeps source kinds distinct, preserves unknown amounts and does not write or expose private data', async () => {
    const s = await setup(); const o = await s.order();
    expect((await s.app.inject({ method: 'POST', url: `/api/orders/${o.id}/refunds`, payload: { clientRequestId: 'reconciliation-refund', amountCents: 123, entryId: o.entries[0].id, reason: 'Private fictional refund reason' } })).statusCode).toBe(200);
    await s.sql(`INSERT INTO payment_sessions(id,order_id,provider,url,amount_cents,status,expires_at,created_at) VALUES('cs_fixture_reconciliation',$1,'stripe_test','https://checkout.example.test/private-token-not-exported',4321,'expired','2027-03-01T19:00Z','2027-03-01T18:01Z')`, [o.id]);
    await s.sql(`INSERT INTO provider_events(id,provider,type,session_id,order_id,outcome,result,received_at,payment_ref,amount_cents) VALUES('evt_fixture_reconciliation','stripe_test','checkout.session.completed','cs_fixture_reconciliation',$1,'success','duplicate_charge','2027-03-01T18:02Z','pi_fixture_reconciliation',4321)`, [o.id]);
    const evidence = () => s.sql(`SELECT * FROM (SELECT 'order' AS kind,to_jsonb(o) AS value FROM orders o UNION ALL SELECT 'attempt',to_jsonb(a) FROM payment_attempts a UNION ALL SELECT 'session',to_jsonb(s) FROM payment_sessions s UNION ALL SELECT 'event',to_jsonb(e) FROM provider_events e UNION ALL SELECT 'refund',to_jsonb(r) FROM refunds r) records ORDER BY kind,value->>'id'`);
    const before = (await evidence()).rows; const response = await s.download(); expect(response.statusCode, response.body).toBe(200);
    const rows = table(response.body); expect(rows).toHaveLength(4);
    expect(rows.find((r) => r.record_kind === 'payment_attempt')).toMatchObject({ amount_cents: '', order_total_cents: String(o.totalCents), provider: 'simulated', result_status: 'confirmed', order_number: o.orderNumber });
    expect(rows.find((r) => r.record_kind === 'payment_session')).toMatchObject({ amount_cents: '4321', provider_reference: 'cs_fixture_reconciliation', session_reference: 'cs_fixture_reconciliation', result_status: 'expired', payment_reference: '', updated_at: '' });
    expect(rows.find((r) => r.record_kind === 'provider_event')).toMatchObject({ provider_reference: 'evt_fixture_reconciliation', payment_reference: 'pi_fixture_reconciliation', session_reference: 'cs_fixture_reconciliation', result_status: 'duplicate_charge', amount_cents: '4321' });
    expect(rows.find((r) => r.record_kind === 'refund')).toMatchObject({ entry_id: o.entries[0].id, amount_cents: '123', result_status: 'succeeded', provider: 'simulated', provider_reference: '' });
    for (const row of rows) expect(row).toMatchObject({ basis: 'local_record_not_provider_settlement', generated_at: '2027-03-01T18:00:00.000Z', order_id: o.id, order_status: 'confirmed' });
    for (const privateText of ['Evidence', 'Fictional', 'evidence@example.test', '555-555', 'FICTIONAL-LICENSE-ONLY', 'Private fictional', 'private-token']) expect(response.body).not.toContain(privateText);
    expect((await s.download()).body).toBe(response.body); expect((await evidence()).rows).toEqual(before);
  });
  it('retains evidence on cancelled and expired orders while excluding unlinked notifications and other events', async () => {
    const s = await setup(); const cancelled = await s.order(false); expect((await s.app.inject({ method: 'POST', url: `/api/orders/${cancelled.id}/cancel` })).statusCode).toBe(200);
    const expired = await s.order(false); await s.sql(`UPDATE orders SET status='expired' WHERE id=$1`, [expired.id]);
    for (const [id, payment, amount] of [[cancelled.id, '=FICTIONAL()', 0], [expired.id, 'pi_fixture_expired', 987]] as const) await s.sql(`INSERT INTO provider_events(id,provider,type,order_id,outcome,result,received_at,payment_ref,amount_cents) VALUES($1,'stripe_test','checkout.session.completed',$2,'success','needs_attention','2027-03-01T18:03Z',$3,$4)`, [`evt_${id}`, id, payment, amount]);
    await s.sql(`INSERT INTO provider_events(id,provider,type,outcome,result,received_at) VALUES('evt_unlinked_fixture','stripe_test','checkout.session.completed','success','unknown_session','2027-03-01T18:03Z')`);
    const other = (await s.app.inject({ method: 'POST', url: '/api/demo' })).json();
    const r = await s.download(); expect(r.statusCode, r.body).toBe(200); const rows = table(r.body); expect(rows).toHaveLength(2);
    expect(rows.find((x) => x.order_id === cancelled.id)).toMatchObject({ order_status: 'cancelled', amount_cents: '0', payment_reference: "'=FICTIONAL()" });
    expect(rows.find((x) => x.order_id === expired.id)).toMatchObject({ order_status: 'expired', amount_cents: '987' });
    expect(r.body).not.toContain('evt_unlinked_fixture');
    expect(table((await s.app.inject({ method: 'GET', url: `/api/events/${other.eventId}/exports/reconciliation.csv` })).body)).toEqual([]);
  });
  it('retains payment/refund evidence and labels the report after simulated event cancellation', async () => {
    const s = await setup(); const o = await s.order();
    expect((await s.app.inject({ method: 'DELETE', url: `/api/events/${s.eventId}/test-entries` })).statusCode).toBe(200);
    const selection = { scope: 'event' };
    const preview = (await s.app.inject({ method: 'POST', url: `/api/events/${s.eventId}/cancellation-confirmation-preview`, payload: selection })).json();
    const plan = await s.app.inject({ method: 'POST', url: `/api/events/${s.eventId}/cancellation-confirmations`, payload: { clientRequestId: 'reconciliation-cancel-plan', selection, previewFingerprint: preview.fingerprint, reason: 'Fictional cancellation review', acknowledgePlanOnly: true } });
    expect(plan.statusCode).toBe(200);
    const executed = await s.app.inject({ method: 'POST', url: `/api/events/${s.eventId}/cancellation-executions`, payload: { clientRequestId: 'reconciliation-cancel-execute', confirmationId: plan.json().id, acknowledgeSimulatedCancellation: true } });
    expect(executed.statusCode, executed.body).toBe(200);
    const r = await s.download(); expect(r.statusCode).toBe(200); expect(r.headers['x-cyclereg-cancellation']).toBe('cancelled');
    expect(r.headers['content-disposition']).toContain('-LOCAL-RECORDS-DEMO-CANCELLED.csv');
    const rows = table(r.body); expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.record_kind).sort()).toEqual(['payment_attempt', 'refund']);
    expect(rows.every((r) => r.order_status === 'confirmed' && r.order_total_cents === String(o.totalCents))).toBe(true);
  });
  it('requires the existing ledger permission and never labels denied responses', async () => {
    const s = await setup(); await s.order();
    for (const role of ['finance', 'registration_manager', 'timer_export', 'check_in_volunteer'] as const) {
      const email = `reconciliation-${role}@example.test`;
      await s.app.inject({ method: 'GET', url: '/api/me', headers: as(email) });
      expect((await s.app.inject({ method: 'POST', url: `/api/organizations/${s.organizationId}/members`, payload: { email, role } })).statusCode).toBe(200);
      const r = await s.download(as(email)); expect(r.statusCode).toBe(role === 'finance' ? 200 : 403);
      if (role !== 'finance') { for (const header of ['content-disposition', 'x-cyclereg-cancellation', 'x-cyclereg-export-context', 'x-cyclereg-export-generated-at']) expect(r.headers[header]).toBeUndefined(); }
      else {
        expect((await s.app.inject({ method: 'POST', url: `/api/organizations/${s.organizationId}/members/remove`, payload: { email, role } })).statusCode).toBe(200);
        expect((await s.download(as(email))).statusCode).toBe(404);
      }
    }
    for (const [headers, status] of [[as('reconciliation-outsider@example.test'), 404], [{ authorization: 'Bearer invalid' }, 401]] as const) { const r = await s.download(headers); expect(r.statusCode).toBe(status); expect(r.headers['x-cyclereg-cancellation']).toBeUndefined(); }
  });
});
