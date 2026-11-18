import { describe, expect, it } from 'vitest';
import pg from 'pg';
import { REFUND_TEMPLATES } from '../src/shared/refundPolicy';
import type { EventConfig } from '../src/shared/schema';
import type { OrderView } from '../src/web/api';
import { localEmail } from '../src/server/email';
import { as } from './support/auth';
import { testApp, testDatabaseUrl } from './support/db';

const RIDER = 'rider@allocation.test';
async function setup() {
  const databaseUrl = await testDatabaseUrl();
  const { app } = await testApp({ databaseUrl, now: () => new Date('2027-03-01T18:00:00Z'), email: localEmail() });
  const { eventId, organizationId } = (await app.inject({ method: 'POST', url: '/api/demo' })).json();
  const edit = async (change: (config: EventConfig) => void) => {
    const record = (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json();
    change(record.config);
    expect((await app.inject({ method: 'PUT', url: `/api/events/${eventId}/config`, payload: { revision: record.revision, config: record.config } })).statusCode).toBe(200);
    const published = await app.inject({ method: 'POST', url: `/api/events/${eventId}/publish`, payload: { acknowledgeWarnings: true, acknowledgeImpact: true } });
    expect(published.statusCode, published.body).toBe(200);
    return record.config as EventConfig;
  };
  const config = await edit((c) => { c.registration.platformFeeCents = 123; });
  const cat = (code: string) => config.categories.find((c) => c.timingCode === code)!;
  let n = 0;
  const order = async (codes: string[], pay = true) => {
    const response = await app.inject({ method: 'POST', url: `/api/rider/events/${eventId}/orders`, headers: as(RIDER), payload: {
      clientRequestId: `allocation-order-${++n}`, categoryIds: codes.map((c) => cat(c).id),
      rider: { firstName: 'Allocation', lastName: 'Fictional', email: RIDER, team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Fictional Contact', phone: '555-555-0199' } },
      waiver: { version: config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Allocation Fictional', signerRole: 'rider' },
    } });
    expect(response.statusCode, response.body).toBe(201);
    const created = response.json() as OrderView;
    if (!pay) return created;
    const paid = await app.inject({ method: 'POST', url: `/api/orders/${created.id}/payment`, headers: as(RIDER), payload: { attemptId: `allocation-paid-${created.id}`, outcome: 'success' } });
    expect(paid.statusCode).toBe(200);
    return paid.json() as OrderView;
  };
  const preview = (payload: object, headers = {}) => app.inject({ method: 'POST', url: `/api/events/${eventId}/cancellation-allocation-preview`, payload, headers });
  const get = async (id: string) => (await app.inject({ method: 'GET', url: `/api/orders/${id}` })).json() as OrderView;
  return { app, eventId, organizationId, config, cat, order, preview, get, edit, databaseUrl };
}

describe('paid cancellation allocation preview', () => {
  it('does not treat an unpublished draft placement change as current', async () => {
    const s = await setup(); const order = await s.order(['RR-M35-34']);
    const record = (await s.app.inject({ method: 'GET', url: `/api/events/${s.eventId}` })).json();
    record.config.categories.find((c: { id: string }) => c.id === s.cat('RR-M35-34').id).raceId = s.cat('CR-M35-34').raceId;
    expect((await s.app.inject({ method: 'PUT', url: `/api/events/${s.eventId}/config`, payload: { revision: record.revision, config: record.config } })).statusCode).toBe(200);
    const response = await s.preview({ scope: 'race', raceId: s.cat('RR-M35-34').raceId });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ currentPublishedVersion: order.publishedVersion, entries: [expect.objectContaining({ entryId: order.entries[0].id })] });
    expect(await s.get(order.id)).toEqual(order);
  });

  it('refuses unknown current placement or accepted allocation instead of inventing a value', async () => {
    const s = await setup(); const order = await s.order(['RR-M35-34']);
    const db = new pg.Client({ connectionString: s.databaseUrl }); await db.connect();
    try {
      await db.query(`UPDATE order_entries SET category_id='cat_unknown_placement' WHERE id=$1`, [order.entries[0].id]);
      expect((await s.preview({ scope: 'event' })).statusCode).toBe(409);
      // Without a current placement, no race scope can safely establish exclusion.
      expect((await s.preview({ scope: 'race', raceId: s.cat('CR-M35-34').raceId })).statusCode).toBe(409);
      await db.query(`UPDATE order_entries SET category_id=$1 WHERE id=$2`, [order.entries[0].categoryId, order.entries[0].id]);
      await db.query(`UPDATE orders SET quote_json=jsonb_set(quote_json,'{lines}','[]'::jsonb) WHERE id=$1`, [order.id]);
      expect((await s.preview({ scope: 'event' })).statusCode).toBe(409);
      expect((await db.query(`SELECT count(*)::int AS n FROM refunds WHERE order_id=$1`, [order.id])).rows[0].n).toBe(0);
    } finally { await db.end(); }
  });
  it('selects a package component without repricing it, returning fees or changing the unaffected entry', async () => {
    const s = await setup(); const order = await s.order(['RR-M35-34', 'CR-M35-34']);
    const rr = order.entries.find((e) => e.categoryId === s.cat('RR-M35-34').id)!;
    const cr = order.entries.find((e) => e.categoryId === s.cat('CR-M35-34').id)!;
    const accepted = order.quote.lines.find((l) => l.categoryId === rr.categoryId)!;
    const beforeLedger = (await s.app.inject({ method: 'GET', url: `/api/orders/${order.id}/refunds` })).json();
    const response = await s.preview({ scope: 'race', raceId: s.cat('RR-M35-34').raceId });
    expect(response.statusCode, response.body).toBe(200);
    const plan = response.json();
    expect(plan).toMatchObject({ readOnly: true, requiresFinancialReconciliation: true, scope: 'confirmed_entries_on_confirmed_orders', acceptedEntryAllocationCents: accepted.totalCents });
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0]).toMatchObject({ entryId: rr.id, acceptedEntryCents: accepted.totalCents, policy: { returnAs: 'cash', amountCents: accepted.totalCents } });
    expect(plan.orders).toEqual([{ orderId: order.id, excludedWholeOrderFeesCents: 123, unaffectedConfirmedEntryIds: [cr.id] }]);
    expect((await s.preview({ scope: 'event' })).json().acceptedEntryAllocationCents).toBe(order.quote.entriesTotalCents);
    expect(await s.get(order.id)).toEqual(order);
    expect((await s.app.inject({ method: 'GET', url: `/api/orders/${order.id}/refunds` })).json()).toEqual(beforeLedger);
  });

  it('uses the transferred current race/day and original paid allocation/policy after republishing', async () => {
    const s = await setup(); const order = await s.order(['RR-M35-34']);
    await s.edit((c) => { c.registration.refundRules = REFUND_TEMPLATES.credit_only.rules; });
    const target = s.cat('CR-M35-34'); const targetDay = s.config.races.find((r) => r.id === target.raceId)!.dayId;
    const moved = await s.app.inject({ method: 'POST', url: `/api/order-entries/${order.entries[0].id}/transfer`, payload: { toCategoryId: target.id, reason: 'Fictional day transfer' } });
    expect(moved.statusCode, moved.body).toBe(200);
    const before = await s.get(order.id);
    for (const scope of [{ scope: 'race', raceId: target.raceId }, { scope: 'day', dayId: targetDay }]) {
      const result = await s.preview(scope); expect(result.statusCode).toBe(200);
      expect(result.json().entries).toEqual([expect.objectContaining({ entryId: order.entries[0].id, currentCategoryId: target.id, currentRaceId: target.raceId, currentDayId: targetDay, acceptedVersion: order.publishedVersion, acceptedPriceCategoryId: order.entries[0].categoryId, acceptedEntryCents: order.quote.entriesTotalCents, policy: { returnAs: 'cash', percent: 100, amountCents: order.quote.entriesTotalCents } })]);
    }
    expect((await s.preview({ scope: 'race', raceId: s.cat('RR-M35-34').raceId })).json().entries).toEqual([]);
    expect(await s.get(order.id)).toEqual(before);
  });

  it('excludes unpaid holds and withdrawn entries, while flagging refund history without proposing a payout', async () => {
    const s = await setup(); const paid = await s.order(['RR-M35-34', 'CR-M35-34']);
    await s.order(['RR-M35-34'], false);
    const rr = paid.entries.find((e) => e.categoryId === s.cat('RR-M35-34').id)!;
    expect((await s.app.inject({ method: 'POST', url: `/api/order-entries/${rr.id}/withdraw`, payload: { reason: 'Fictional previous withdrawal' } })).statusCode).toBe(200);
    expect((await s.app.inject({ method: 'POST', url: `/api/orders/${paid.id}/refunds`, payload: { clientRequestId: 'allocation-prior-refund', amountCents: 100, reason: 'Fictional earlier return' } })).statusCode).toBe(200);
    const before = await s.get(paid.id);
    const plan = (await s.preview({ scope: 'event' })).json();
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0].reviewReasons).toContain('Refund history exists; reconcile the ledger before returning value.');
    expect(plan.requiresFinancialReconciliation).toBe(true);
    expect(plan).not.toHaveProperty('suggestedCashCents');
    expect(await s.get(paid.id)).toEqual(before);
    const db = new pg.Client({ connectionString: s.databaseUrl }); await db.connect();
    try { await db.query(`UPDATE refunds SET status='failed' WHERE order_id=$1`, [paid.id]); }
    finally { await db.end(); }
    const failedOnly = (await s.preview({ scope: 'event' })).json();
    expect(failedOnly.entries[0].reviewReasons).not.toContain('Refund history exists; reconcile the ledger before returning value.');
    expect(failedOnly.requiresFinancialReconciliation).toBe(true);
  });

  it.each(['race', 'day'] as const)('flags a published %s placement change without changing accepted allocation', async (kind) => {
    const s = await setup(); const order = await s.order(['RR-M35-34']);
    const targetDay = s.config.races.find((r) => r.id === s.cat('CR-M35-34').raceId)!.dayId;
    await s.edit((c) => {
      const category = c.categories.find((x) => x.id === s.cat('RR-M35-34').id)!;
      if (kind === 'race') {
        category.raceId = s.cat('CR-M35-34').raceId;
        category.startGroupId = s.cat('CR-M35-34').startGroupId;
      } else c.races.find((r) => r.id === category.raceId)!.dayId = targetDay;
    });
    const result = (await s.preview({ scope: 'day', dayId: targetDay })).json();
    expect(result.entries[0]).toMatchObject({ acceptedEntryCents: order.quote.entriesTotalCents, currentDayId: targetDay });
    expect(result.entries[0].reviewReasons).toContain('Published placement differs from the accepted version; review event changes before cancellation.');
  });

  it('flags a transfer target added after purchase while retaining the original allocation', async () => {
    const s = await setup(); const order = await s.order(['RR-M35-34']);
    const targetId = 'cat_new_allocation_target';
    await s.edit((c) => { c.categories.push({ ...structuredClone(s.cat('CR-M35-34')), id: targetId, timingCode: 'CR-NEW-ALLOCATION', classifications: [{ code: 'CR-NEW-ALLOCATION', label: 'Fictional added classification' }] }); });
    const transfer = await s.app.inject({ method: 'POST', url: `/api/order-entries/${order.entries[0].id}/transfer`, payload: { toCategoryId: targetId, reason: 'Fictional new category transfer' } });
    expect(transfer.statusCode, transfer.body).toBe(200);
    const result = (await s.preview({ scope: 'race', raceId: s.cat('CR-M35-34').raceId })).json();
    expect(result.entries[0]).toMatchObject({ currentCategoryId: targetId, acceptedPriceCategoryId: order.entries[0].categoryId, acceptedEntryCents: order.quote.entriesTotalCents });
    expect(result.entries[0].reviewReasons).toContain('Published placement differs from the accepted version; review event changes before cancellation.');
  });

  it.each(['credit', 'rider_choice', null] as const)('keeps accepted cancellation mode %s explicit', async (mode) => {
    const s = await setup();
    await s.edit((c) => { c.registration.refundRules = mode === null ? null : { ...REFUND_TEMPLATES.tiered.rules, organizerCancellation: mode }; });
    await s.order(['RR-M35-34']);
    const response = await s.preview({ scope: 'event' }); expect(response.statusCode).toBe(200);
    expect(response.json().entries[0].policy?.returnAs ?? null).toBe(mode);
    expect(response.json().entries[0].reviewReasons.length).toBeGreaterThan(0);
  });

  it('requires owner/finance authority and valid unambiguous current scopes', async () => {
    const s = await setup(); await s.order(['RR-M35-34']);
    for (const [email, role, status] of [['finance@allocation.test', 'finance', 200], ['manager@allocation.test', 'registration_manager', 403]] as const) {
      await s.app.inject({ method: 'POST', url: `/api/organizations/${s.organizationId}/members`, payload: { email, role } });
      await s.app.inject({ method: 'GET', url: '/api/me', headers: as(email) });
      expect((await s.preview({ scope: 'event' }, as(email))).statusCode).toBe(status);
    }
    expect((await s.preview({ scope: 'event' }, as(RIDER))).statusCode).toBe(404);
    const outsider = as('other-owner@allocation.test');
    expect((await s.app.inject({ method: 'POST', url: '/api/organizations', headers: outsider, payload: { name: 'Other Fictional Organization' } })).statusCode).toBe(201);
    expect((await s.preview({ scope: 'event' }, outsider)).statusCode).toBe(404);
    expect((await s.preview({ scope: 'event' }, { authorization: 'Bearer invalid' })).statusCode).toBe(401);
    expect((await s.preview({ scope: 'day' })).statusCode).toBe(400);
    expect((await s.preview({ scope: 'race', raceId: s.cat('RR-M35-34').raceId, dayId: 'extra' })).statusCode).toBe(400);
    expect((await s.preview({ scope: 'day', dayId: 'day_not_in_this_event' })).statusCode).toBe(422);
    expect((await s.preview({ scope: 'race', raceId: 'race_not_in_this_event' })).statusCode).toBe(422);
  });
});


describe('operational cancellation impact preview', () => {
  it('includes holds and paid components without mutation or repricing', async () => {
    const s = await setup(); const paid = await s.order(['RR-M35-34', 'CR-M35-34']);
    const held = await s.order(['RR-M35-34'], false);
    const rr = s.cat('RR-M35-34'); const cr = s.cat('CR-M35-34');
    const response = await s.app.inject({ method: 'POST', url: `/api/events/${s.eventId}/cancellation-impact-preview`, payload: { scope: 'race', raceId: rr.raceId } });
    expect(response.statusCode, response.body).toBe(200);
    const plan = response.json();
    expect(plan.entries.map((e: { id: string }) => e.id).sort()).toEqual([paid.entries.find((e) => e.categoryId === rr.id)!.id, held.entries[0].id].sort());
    expect(plan.unaffectedLiveEntryIds).toEqual([paid.entries.find((e) => e.categoryId === cr.id)!.id]);
    expect(plan.financial.acceptedEntryAllocationCents).toBe(paid.quote.lines.find((l) => l.categoryId === rr.id)!.totalCents);
    expect(plan.capacity.length).toBeGreaterThan(0);
    expect(plan.readOnly).toBe(true);
    expect(plan.generatedAt).toBe(plan.financial.generatedAt);
    const dayId = s.config.races.find((r) => r.id === rr.raceId)!.dayId;
    for (const scope of [{ scope: 'day', dayId }, { scope: 'event' }]) {
      const scoped = await s.app.inject({ method: 'POST', url: `/api/events/${s.eventId}/cancellation-impact-preview`, payload: scope });
      expect(scoped.statusCode).toBe(200);
      expect(scoped.json().entries).toHaveLength(scope.scope === 'event' ? 3 : 2);
    }

    expect(plan.communicationAudience.orderIds.sort()).toEqual([paid.id, held.id].sort());
    expect(JSON.stringify(plan)).not.toContain(RIDER);
    expect(await s.get(paid.id)).toEqual(paid);
    expect(await s.get(held.id)).toEqual(held);
    const db = new pg.Client({ connectionString: s.databaseUrl }); await db.connect();
    try { await db.query('UPDATE orders SET hold_expires_at=$1 WHERE id=$2', ['2027-03-01T18:00:00Z', held.id]); }
    finally { await db.end(); }
    const expired = await s.app.inject({ method: 'POST', url: `/api/events/${s.eventId}/cancellation-impact-preview`, payload: { scope: 'race', raceId: rr.raceId } });
    expect(expired.json().entries.map((e: { id: string }) => e.id)).not.toContain(held.entries[0].id);

  });

  it('does not release a shared pool place when the same rider retains an unaffected component', async () => {
    const s = await setup();
    await s.edit((c) => { c.startGroups.find((g) => g.id === s.cat('RR-M35-34').startGroupId)!.fieldLimit = 100; c.capacityPools.push({ id: 'pool_impact', name: 'Fictional shared weekend pool', limit: 100, memberCategoryIds: [s.cat('RR-M35-34').id, s.cat('CR-M35-34').id], memberStartGroupIds: [] }); });
    const db = new pg.Client({ connectionString: s.databaseUrl }); await db.connect();
    try { await db.query('DELETE FROM test_entries WHERE event_id=$1', [s.eventId]); } finally { await db.end(); }
    await s.order(['RR-M35-34', 'CR-M35-34']);
    const response = await s.app.inject({ method: 'POST', url: `/api/events/${s.eventId}/cancellation-impact-preview`, payload: { scope: 'race', raceId: s.cat('RR-M35-34').raceId } });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().capacity.find((l: { id: string }) => l.id === 'pool_impact')).toMatchObject({ used: 1, hypotheticalUsedAfter: 1, hypotheticalReleasedPlaces: 0 });
    expect(response.json().capacity.find((l: { id: string }) => l.id === s.cat('RR-M35-34').startGroupId)).toMatchObject({ kind: 'start_group', used: 1, hypotheticalUsedAfter: 0, hypotheticalReleasedPlaces: 1 });

  });

  it('identifies active waitlists and saved exports without exposing contacts or changing them', async () => {
    const s = await setup(); const rr = s.cat('RR-M35-34'); const cr = s.cat('CR-M35-34');
    const held = await s.order(['RR-M35-34'], false);
    const db = new pg.Client({ connectionString: s.databaseUrl }); await db.connect();
    try {
      await db.query('DELETE FROM test_entries WHERE event_id=$1', [s.eventId]);
      for (const [id, category, status, expiry] of [
        ['waiting', rr.id, 'waiting', null], ['offered', rr.id, 'offered', '2027-03-02T18:00:00Z'],
        ['expired', rr.id, 'offered', '2027-03-01T18:00:00Z'], ['accepted', rr.id, 'accepted', null], ['other', cr.id, 'waiting', null],
      ]) await db.query(`INSERT INTO waitlist_entries(id,event_id,category_id,rider_json,status,offer_expires_at,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$7)`, [id, s.eventId, category, { email: 'private@impact.test' }, status, expiry, '2027-03-01T17:00:00Z']);
      await db.query(`INSERT INTO start_list_snapshots(id,event_id,race_id,version,published_version,rows_json,created_at) VALUES('snapshot_impact',$1,$2,1,1,'[]',$3)`, [s.eventId, rr.raceId, '2027-03-01T17:00:00Z']);
      await db.query("UPDATE waitlist_entries SET order_id=$1 WHERE id='offered'", [held.id]);
      const before = (await db.query('SELECT * FROM waitlist_entries ORDER BY id')).rows;
      const response = await s.app.inject({ method: 'POST', url: `/api/events/${s.eventId}/cancellation-impact-preview`, payload: { scope: 'race', raceId: rr.raceId } });
      expect(response.statusCode, response.body).toBe(200);
      const plan = response.json();
      expect(plan.waitlist.map((w: { id: string }) => w.id).sort()).toEqual(['offered', 'waiting']);
      expect(plan.startListSnapshots).toEqual([{ id: 'snapshot_impact', raceId: rr.raceId, version: 1 }]);
      expect(plan.communicationAudience).toEqual({ orderIds: [held.id], waitlistEntryIds: ['waiting'], deliveryPlanned: false });
      await db.query(`INSERT INTO start_list_snapshots(id,event_id,race_id,version,published_version,rows_json,created_at) VALUES('snapshot_removed',$1,'removed_race',1,1,'[]',$2)`, [s.eventId, '2027-03-01T17:00:00Z']);
      const eventPreview = await s.app.inject({ method: 'POST', url: `/api/events/${s.eventId}/cancellation-impact-preview`, payload: { scope: 'event' } });
      expect(eventPreview.json().startListSnapshots.map((x: { id: string }) => x.id).sort()).toEqual(['snapshot_impact', 'snapshot_removed']);

      expect(JSON.stringify(plan)).not.toContain('private@impact.test');
      expect((await db.query('SELECT * FROM waitlist_entries ORDER BY id')).rows).toEqual(before);
      expect(plan.capacity.some((l: { hypotheticalReleasedPlaces: number }) => l.hypotheticalReleasedPlaces === 1)).toBe(true);
      await db.query("UPDATE waitlist_entries SET category_id='unknown' WHERE id='waiting'");
      const invalid = await s.app.inject({ method: 'POST', url: `/api/events/${s.eventId}/cancellation-impact-preview`, payload: { scope: 'race', raceId: cr.raceId } });
      expect(invalid.statusCode).toBe(409);

    } finally { await db.end(); }
  });

  it('uses event permissions and strict published selection for operational details', async () => {
    const s = await setup();
    const request = (payload: object, headers = {}) => s.app.inject({ method: 'POST', url: `/api/events/${s.eventId}/cancellation-impact-preview`, payload, headers });
    expect((await request({ scope: 'event' }, as(RIDER))).statusCode).toBe(404);
    for (const [email, role, status] of [['impact-finance@allocation.test', 'finance', 200], ['impact-manager@allocation.test', 'registration_manager', 403]] as const) {
      await s.app.inject({ method: 'POST', url: `/api/organizations/${s.organizationId}/members`, payload: { email, role } });
      await s.app.inject({ method: 'GET', url: '/api/me', headers: as(email) });
      expect((await request({ scope: 'event' }, as(email))).statusCode).toBe(status);
    }
    const outsider = as('impact-other-owner@allocation.test');
    expect((await s.app.inject({ method: 'POST', url: '/api/organizations', headers: outsider, payload: { name: 'Fictional Impact Outsider' } })).statusCode).toBe(201);
    expect((await request({ scope: 'event' }, outsider)).statusCode).toBe(404);

    expect((await request({ scope: 'event' }, { authorization: 'Bearer invalid' })).statusCode).toBe(401);
    expect((await request({ scope: 'race', raceId: 'missing' })).statusCode).toBe(422);
    expect((await request({ scope: 'event', raceId: 'mixed' })).statusCode).toBe(400);
  });
});
