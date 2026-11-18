import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { testApp, testDatabaseUrl } from './support/db';
import { as } from './support/auth';
import { localEmail } from '../src/server/email';
import type { EventConfig } from '../src/shared/schema';
import { CANCELLATION_PLAN_NOT_RECORDED, type CancellationConfirmationInput, CancellationConfirmationPreview, CancellationSelection } from '../src/shared/cancellations';

async function setup() {
  let instant = new Date('2027-03-01T18:00:00Z');
  const databaseUrl = await testDatabaseUrl(); const now = () => instant;
  const { app } = await testApp({ databaseUrl, now, holdMinutes: 30, email: localEmail() });
  const { eventId, organizationId } = (await app.inject({ method: 'POST', url: '/api/demo' })).json();
  const publish = () => app.inject({ method: 'POST', url: `/api/events/${eventId}/publish`, payload: { acknowledgeWarnings: true, acknowledgeImpact: true } });
  expect((await publish()).statusCode).toBe(200);
  const config = (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json().config as EventConfig;
  const cat = (code: string) => config.categories.find((c) => c.timingCode === code)!;
  let nonce = 0;
  const buy = async (pay = true) => {
    const created = await app.inject({ method: 'POST', url: `/api/rider/events/${eventId}/orders`, payload: {
      clientRequestId: `confirmation-fixture-${++nonce}`, categoryIds: [cat('RR-M35-34').id],
      rider: { firstName: 'Plan', lastName: 'Fictional', email: 'plan@confirmation.test', team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Fictional Contact', phone: '555-555-0199' } },
      waiver: { version: config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Plan Fictional', signerRole: 'rider' },
    } });
    expect(created.statusCode, created.body).toBe(201); const order = created.json();
    if (!pay) return order;
    const paid = await app.inject({ method: 'POST', url: `/api/orders/${order.id}/payment`, payload: { attemptId: `confirmation-pay-${nonce}`, outcome: 'success' } });
    expect(paid.statusCode).toBe(200); return paid.json();
  };
  const preview = async (selection: CancellationSelection = { scope: 'event' }) => {
    const result = await app.inject({ method: 'POST', url: `/api/events/${eventId}/cancellation-confirmation-preview`, payload: selection });
    expect(result.statusCode, result.body).toBe(200); return result.json() as CancellationConfirmationPreview;
  };
  const input = (p: CancellationConfirmationPreview): CancellationConfirmationInput => ({ clientRequestId: 'confirmation-request-one', selection: p.preview.selection, previewFingerprint: p.fingerprint, reason: 'Fictional weather cancellation plan', acknowledgePlanOnly: true });
  const confirm = (body: object, headers = {}) => app.inject({ method: 'POST', url: `/api/events/${eventId}/cancellation-confirmations`, payload: body, headers });
  const get = (id: string, headers = {}) => app.inject({ method: 'GET', url: `/api/events/${eventId}/cancellation-confirmations/${id}`, headers });
  const sql = async <T>(fn: (client: pg.Client) => Promise<T>) => { const client = new pg.Client({ connectionString: databaseUrl }); await client.connect(); try { return await fn(client); } finally { await client.end(); } };
  const count = () => sql(async (db) => (await db.query('SELECT count(*)::int AS n FROM cancellation_confirmations')).rows[0].n);
  return { app, databaseUrl, now, advance: (ms: number) => { instant = new Date(instant.getTime() + ms); }, eventId, organizationId, config, cat, publish, buy, preview, input, confirm, get, sql, count };
}

describe('reviewed cancellation plan confirmation', () => {
  it('records an acknowledged plan and recovers exact replay without cancelling or returning value', async () => {
    const s = await setup(); const order = await s.buy();
    const p = await s.preview(); s.advance(60_000);
    expect((await s.preview()).fingerprint).toBe(p.fingerprint);
    const response = await s.confirm({ ...s.input(p), reason: '  Fictional weather cancellation plan  ' });
    expect(response.statusCode, response.body).toBe(200); const record = response.json();
    expect(record).toMatchObject({ eventId: s.eventId, status: 'plan_confirmed', reason: 'Fictional weather cancellation plan', acknowledgedPlanOnly: true, executionAvailable: false, previewFingerprint: p.fingerprint });
    expect(record.confirmedBy).toBe((await s.app.inject({ method: 'GET', url: '/api/me' })).json().account.id); expect(record.preview.generatedAt).not.toBe(p.preview.generatedAt);
    expect((await s.get(record.id)).json()).toEqual(record);
    s.advance(60_000);
    expect((await s.confirm(s.input(p))).json()).toEqual(record);
    expect(await s.count()).toBe(1);
    expect((await s.app.inject({ method: 'GET', url: `/api/orders/${order.id}` })).json()).toEqual(order);
    expect((await s.app.inject({ method: 'GET', url: `/api/orders/${order.id}/refunds` })).json().refunds).toEqual([]);
  });

  it('serializes concurrent identical requests across two application instances', async () => {
    const s = await setup(); const second = (await testApp({ databaseUrl: s.databaseUrl, now: s.now, email: localEmail() })).app;
    const p = await s.preview(); const body = s.input(p);
    const results = await Promise.all([s.confirm(body), second.inject({ method: 'POST', url: `/api/events/${s.eventId}/cancellation-confirmations`, payload: body })]);
    expect(results.map((r) => r.statusCode)).toEqual([200, 200]);
    expect(results[0].json()).toEqual(results[1].json()); expect(await s.count()).toBe(1);
  });

  it('refuses changed reason, scope or fingerprint for an existing request identity', async () => {
    const s = await setup(); const p = await s.preview(); const body = s.input(p);
    expect((await s.confirm(body)).statusCode).toBe(200);
    for (const change of [{ reason: 'Different approved reason' }, { selection: { scope: 'race', raceId: s.cat('RR-M35-34').raceId } }, { previewFingerprint: '0'.repeat(64) }]) { const response = await s.confirm({ ...body, ...change }); expect(response.statusCode).toBe(409); expect(response.json().details?.code).not.toBe(CANCELLATION_PLAN_NOT_RECORDED); }
    expect(await s.count()).toBe(1);
  });

  it.each(['publication', 'capacity', 'transfer', 'hold expiry'] as const)('requires a new preview after %s changes', async (change) => {
    const s = await setup(); const order = await s.buy(change !== 'hold expiry');
    const p = await s.preview({ scope: 'race', raceId: s.cat('RR-M35-34').raceId });
    if (change === 'publication') expect((await s.publish()).statusCode).toBe(200);
    if (change === 'capacity') expect((await s.app.inject({ method: 'POST', url: `/api/events/${s.eventId}/test-entries`, payload: { categoryId: s.cat('RR-M35-34').id, count: 1 } })).statusCode).toBe(200);
    if (change === 'transfer') expect((await s.app.inject({ method: 'POST', url: `/api/order-entries/${order.entries[0].id}/transfer`, payload: { toCategoryId: s.cat('CR-M35-34').id, reason: 'Fictional approved transfer' } })).statusCode).toBe(200);
    if (change === 'hold expiry') s.advance(31 * 60_000);
    const result = await s.confirm(s.input(p)); expect(result.statusCode, result.body).toBe(409); expect(await s.count()).toBe(0);
    expect((await s.confirm({ ...s.input(await s.preview(p.preview.selection)), clientRequestId: `fresh-confirmation-${change}` })).statusCode).toBe(200);
  });

  it('guards refund changes even when nominal policy and preview totals do not change', async () => {
    const s = await setup(); const order = await s.buy();
    const refund = (key: string) => s.app.inject({ method: 'POST', url: `/api/orders/${order.id}/refunds`, payload: { clientRequestId: key, amountCents: 100, reason: 'Fictional earlier partial refund' } });
    expect((await refund('confirmation-refund-first')).statusCode).toBe(200);
    const p = await s.preview(); expect((await refund('confirmation-refund-second')).statusCode).toBe(200);
    const fresh = await s.preview(); expect(fresh.preview).toEqual(p.preview); expect(fresh.fingerprint).not.toBe(p.fingerprint);
    expect((await s.confirm(s.input(p))).statusCode).toBe(409); expect(await s.count()).toBe(0);
  });

  it('guards hosted-session expiry before the order hold expires', async () => {
    const s = await setup(); const held = await s.buy(false);
    await s.sql(async (db) => { await db.query(`INSERT INTO payment_sessions(id,order_id,provider,url,amount_cents,status,expires_at,created_at) VALUES('session_confirmation_fixture',$1,'stripe_test','https://checkout.example.test/fictional',$2,'open','2027-03-01T18:05:00Z','2027-03-01T18:00:00Z')`, [held.id, held.totalCents]); });
    const p = await s.preview(); s.advance(6 * 60_000);
    const fresh = await s.preview(); expect(fresh.preview.entries).toEqual(p.preview.entries); expect(fresh.fingerprint).not.toBe(p.fingerprint);
    expect((await s.confirm(s.input(p))).statusCode).toBe(409); expect(await s.count()).toBe(0);
  });

  it.each(['day', 'race'] as const)('preserves exact %s selection across stored JSON and replay', async (scope) => {
    const s = await setup();
    const selection: CancellationSelection = scope === 'day' ? { scope, dayId: s.config.days[0].id } : { scope, raceId: s.cat('RR-M35-34').raceId };
    const body = s.input(await s.preview(selection)); const first = await s.confirm(body);
    expect(first.statusCode, first.body).toBe(200);
    expect((await s.confirm(body)).json()).toEqual(first.json());
    expect((await s.get(first.json().id)).json().selection).toEqual(selection);
  });

  it('proves a removed published scope did not record the new request', async () => {
    const s = await setup();
    const update = async (include: boolean) => {
      const record = (await s.app.inject({ method: 'GET', url: `/api/events/${s.eventId}` })).json();
      const day = new Date(`${record.config.days[0].date}T00:00Z`); day.setUTCDate(day.getUTCDate() + 7);
      record.config.days = record.config.days.filter((d: { id: string }) => d.id !== 'temporary_confirmation_day');
      if (include) record.config.days.push({ id: 'temporary_confirmation_day', label: 'Temporary confirmation day', date: day.toISOString().slice(0, 10) });
      expect((await s.app.inject({ method: 'PUT', url: `/api/events/${s.eventId}/config`, payload: { revision: record.revision, config: record.config } })).statusCode).toBe(200);
      expect((await s.publish()).statusCode).toBe(200);
    };
    await update(true); const p = await s.preview({ scope: 'day', dayId: 'temporary_confirmation_day' }); await update(false);
    const response = await s.confirm(s.input(p)); expect(response.statusCode).toBe(422);
    expect(response.json().details).toEqual({ code: CANCELLATION_PLAN_NOT_RECORDED }); expect(await s.count()).toBe(0);
  });

  it('classifies an unreviewable fresh plan without losing prior exact-replay evidence', async () => {
    const s = await setup(); const order = await s.buy(); const p = await s.preview(); const body = s.input(p);
    const place = (categoryId: string) => s.sql(async (db) => { await db.query('UPDATE order_entries SET category_id=$1 WHERE id=$2', [categoryId, order.entries[0].id]); });
    await place('unknown_confirmation_category');
    const refused = await s.confirm(body); expect(refused.statusCode).toBe(409); expect(refused.json().details).toEqual({ code: CANCELLATION_PLAN_NOT_RECORDED }); expect(await s.count()).toBe(0);
    await place(s.cat('RR-M35-34').id); expect((await s.confirm(body)).json()).toEqual(refused.json());
    const recovered = { ...body, clientRequestId: 'recovered-unreviewable-plan' };
    const original = (await s.confirm(recovered)).json(); await place('unknown_confirmation_category');
    expect((await s.confirm(recovered)).json()).toEqual(original);
    const separate = await s.confirm({ ...body, clientRequestId: 'separate-unreviewable-request' });
    expect(separate.statusCode).toBe(409); expect(separate.json().details).toEqual({ code: CANCELLATION_PLAN_NOT_RECORDED }); expect(await s.count()).toBe(1);
  });

  it('rejects changed details for a refused plan identity without replacing its evidence', async () => {
    const s = await setup(); const body = s.input(await s.preview());
    await s.publish();
    const refused = await s.confirm(body); expect(refused.statusCode).toBe(409);
    expect(refused.json().details?.code).toBe(CANCELLATION_PLAN_NOT_RECORDED);
    const stored = () => s.sql(async (db) => (await db.query('SELECT * FROM cancellation_request_refusals')).rows);
    const before = await stored(); expect(before).toHaveLength(1);
    for (const change of [{ reason: 'Different fictional reason' }, { previewFingerprint: '0'.repeat(64) }, { selection: { scope: 'race', raceId: s.cat('RR-M35-34').raceId } }]) {
      const changed = await s.confirm({ ...body, ...change });
      expect(changed.statusCode).toBe(409); expect(changed.json().details?.code).not.toBe(CANCELLATION_PLAN_NOT_RECORDED);
      expect(await stored()).toEqual(before);
    }
    expect((await s.confirm(body)).json()).toEqual(refused.json()); expect(await s.count()).toBe(0);
  });

  it('keeps exact replay historical after the impact changes and preserves the original actor', async () => {
    const s = await setup(); const held = await s.buy(false); const p = await s.preview(); const body = s.input(p);
    const original = (await s.confirm(body)).json();
    const email = 'finance@confirmation.test';
    expect((await s.app.inject({ method: 'POST', url: `/api/organizations/${s.organizationId}/members`, payload: { email, role: 'finance' } })).statusCode).toBe(200);
    await s.app.inject({ method: 'GET', url: '/api/me', headers: as(email) });
    s.advance(31 * 60_000);
    expect((await s.confirm(body, as(email))).json()).toEqual(original);
    expect((await s.get(original.id, as(email))).json()).toEqual(original);
    expect((await s.preview()).preview.entries.map((e) => e.id)).not.toContain(held.entries[0].id);
    expect(await s.count()).toBe(1);
  });

  it('checks current event authority before preview, write, read and replay', async () => {
    const s = await setup(); const p = await s.preview(); const body = s.input(p); const record = (await s.confirm(body)).json();
    const email = 'manager@confirmation.test';
    await s.app.inject({ method: 'POST', url: `/api/organizations/${s.organizationId}/members`, payload: { email, role: 'registration_manager' } });
    await s.app.inject({ method: 'GET', url: '/api/me', headers: as(email) });
    for (const [headers, status] of [[as(email), 403], [as('outsider@confirmation.test'), 404], [{ authorization: 'Bearer invalid' }, 401]] as const) {
      expect((await s.confirm(body, headers)).statusCode).toBe(status);
      expect((await s.get(record.id, headers)).statusCode).toBe(status);
      expect((await s.app.inject({ method: 'POST', url: `/api/events/${s.eventId}/cancellation-confirmation-preview`, headers, payload: { scope: 'event' } })).statusCode).toBe(status);
    }
    expect((await s.get('missing')).statusCode).toBe(404); expect(await s.count()).toBe(1);
  });

  it('ends finance access to an existing confirmation immediately after role removal', async () => {
    const s = await setup(); const email = 'revoked-finance@confirmation.test';
    await s.app.inject({ method: 'POST', url: `/api/organizations/${s.organizationId}/members`, payload: { email, role: 'finance' } });
    await s.app.inject({ method: 'GET', url: '/api/me', headers: as(email) });
    const body = s.input(await s.preview()); const response = await s.confirm(body, as(email));
    expect(response.statusCode).toBe(200); const record = response.json();
    expect((await s.app.inject({ method: 'POST', url: `/api/organizations/${s.organizationId}/members/remove`, payload: { email, role: 'finance' } })).statusCode).toBe(200);
    expect((await s.get(record.id, as(email))).statusCode).toBe(404);
    expect((await s.confirm(body, as(email))).statusCode).toBe(404);
    expect((await s.get(record.id)).json()).toEqual(record); expect(await s.count()).toBe(1);
  });

  it('does not reveal one event confirmation through a different owned event', async () => {
    const s = await setup(); const record = (await s.confirm(s.input(await s.preview()))).json();
    const other = as('other-owner@confirmation.test');
    const org = (await s.app.inject({ method: 'POST', url: '/api/organizations', headers: other, payload: { name: 'Other Fictional Club' } })).json();
    const created = await s.app.inject({ method: 'POST', url: `/api/organizations/${org.id}/events`, headers: other, payload: { name: 'Other Fictional Event', template: 'weekend', startDate: '2027-04-01', timeZone: 'America/Los_Angeles' } });
    expect(created.statusCode, created.body).toBe(201);
    expect((await s.app.inject({ method: 'GET', url: `/api/events/${created.json().id}/cancellation-confirmations/${record.id}`, headers: other })).statusCode).toBe(404);
    expect((await s.get(record.id, other)).statusCode).toBe(404);
  });

  it('requires explicit plan-only acknowledgement, a bounded reason and strict fields', async () => {
    const s = await setup(); const body = s.input(await s.preview());
    for (const change of [{ acknowledgePlanOnly: false }, { acknowledgePlanOnly: undefined }, { reason: '  ' }, { reason: 'x'.repeat(301) }, { previewFingerprint: 'invalid' }, { confirmedBy: 'forged_actor' }, { execute: true }]) expect((await s.confirm({ ...body, ...change })).statusCode).toBe(400);
    expect(await s.count()).toBe(0);
    expect((await s.confirm({ ...body, reason: '🚲'.repeat(300) })).statusCode).toBe(200);
  });

  it('validates request identity by Unicode character count before insertion', async () => {
    const s = await setup(); const body = s.input(await s.preview());
    expect((await s.confirm({ ...body, clientRequestId: '🚲'.repeat(4) })).statusCode).toBe(400);
    expect((await s.confirm({ ...body, clientRequestId: '🚲'.repeat(129) })).statusCode).toBe(400);
    expect((await s.confirm({ ...body, clientRequestId: '🚲'.repeat(8) })).statusCode).toBe(200);
    expect(await s.count()).toBe(1);
  });

  it('resets generated case studies after plan review while preserving unrelated plan evidence', async () => {
    const s = await setup(); const ordinary = (await s.confirm(s.input(await s.preview()))).json();
    const loaded = await s.app.inject({ method: 'POST', url: '/api/demo/case-studies/criterium' });
    expect(loaded.statusCode, loaded.body).toBe(201); const caseEventId = loaded.json().eventId;
    const response = await s.app.inject({ method: 'POST', url: `/api/events/${caseEventId}/cancellation-confirmation-preview`, payload: { scope: 'event' } });
    expect(response.statusCode, response.body).toBe(200); const p = response.json();
    const saved = await s.app.inject({ method: 'POST', url: `/api/events/${caseEventId}/cancellation-confirmations`, payload: { ...s.input(p), clientRequestId: 'case-study-confirmation-reset' } });
    expect(saved.statusCode, saved.body).toBe(200);
    const { resetPromise } = await s.sql(async (db) => {
      await db.query('BEGIN'); await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`event:${caseEventId}`]);
      let finished = false;
      const resetPromise = s.app.inject({ method: 'DELETE', url: '/api/demo/case-studies' }).then((r) => { finished = true; return r; });
      try {
        await expect.poll(async () => (await db.query(`SELECT EXISTS(SELECT 1 FROM pg_locks h JOIN pg_locks w ON h.database=w.database AND h.classid=w.classid AND h.objid=w.objid AND h.objsubid=w.objsubid WHERE h.pid=pg_backend_pid() AND h.locktype='advisory' AND h.granted AND w.locktype='advisory' AND NOT w.granted AND w.pid<>h.pid) AS waiting`)).rows[0].waiting, { timeout: 5000 }).toBe(true);
        expect(finished).toBe(false); return { resetPromise };
      } finally { await db.query('ROLLBACK'); }
    });
    const reset = await resetPromise;
    expect(reset.statusCode, reset.body).toBe(200); expect(reset.json().removedEvents).toBe(1);
    expect(await s.count()).toBe(1); expect((await s.get(ordinary.id)).json()).toEqual(ordinary);
  });

  it('rolls back a rejected evidence insert without changing entry, payment or refund state', async () => {
    const s = await setup(); const order = await s.buy(); const p = await s.preview();
    await s.sql(async (db) => { await db.query(`CREATE FUNCTION reject_confirmation_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fictional confirmation insert failure'; END $$; CREATE TRIGGER reject_confirmation_fixture BEFORE INSERT ON cancellation_confirmations FOR EACH ROW EXECUTE FUNCTION reject_confirmation_fixture()`); });
    expect((await s.confirm(s.input(p))).statusCode).toBe(500); expect(await s.count()).toBe(0);
    expect((await s.app.inject({ method: 'GET', url: `/api/orders/${order.id}` })).json()).toEqual(order);
    expect((await s.app.inject({ method: 'GET', url: `/api/orders/${order.id}/refunds` })).json().refunds).toEqual([]);
  });

  it('constrains persisted acknowledgement, scope, reason, actor and snapshot association', async () => {
    const s = await setup(); const record = (await s.confirm(s.input(await s.preview()))).json();
    await s.sql(async (db) => {
      for (const update of ["acknowledged_plan_only=false", "reason=' '", "selection_json='{}'::jsonb", "selection_json='{\"scope\":null}'::jsonb", "confirmed_by='missing_account'", "preview_json=jsonb_set(preview_json,'{eventId}','null'::jsonb)"]) await expect(db.query(`UPDATE cancellation_confirmations SET ${update} WHERE id=$1`, [record.id])).rejects.toThrow();
    });
    expect((await s.get(record.id)).json()).toEqual(record);
  });
});
