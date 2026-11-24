import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { buildCaseStudyScenarios, CASE_STUDY_ORG_ID, CASE_STUDY_REFERENCE_NOW } from '../src/shared/caseStudies';
import { canAdmit } from '../src/shared/capacity';
import { checkSelection, findConflicts, profileOf } from '../src/shared/checkout';
import { categoryPrice, quote } from '../src/shared/pricing';
import type { EventConfig } from '../src/shared/schema';
import { openDb } from '../src/server/db';
import { as } from './support/auth';
import { testApp, testDatabaseUrl } from './support/db';

/** Waits until this many requests are blocked on a lock in the test's database. */
async function untilWaiting(client: pg.Client, count: number) {
  await expect
    .poll(async () => (await client.query(`SELECT DISTINCT pid FROM pg_locks WHERE NOT granted AND pid IN (SELECT pid FROM pg_locks WHERE database = (SELECT oid FROM pg_database WHERE datname = current_database()))`)).rowCount, { timeout: 5000 })
    .toBe(count);
}

describe('generated race case studies', () => {
  it('is deterministic, distinct, schema-backed, and explicitly separates draft-only empty data', () => {
    const first = buildCaseStudyScenarios();
    const second = buildCaseStudyScenarios();
    expect(second).toEqual(first);
    expect(first.map((row) => row.key)).toEqual(['criterium', 'road-shared-field', 'omnium', 'empty-event', 'large-event']);
    expect(new Set(first.map((row) => row.eventId)).size).toBe(first.length);
    expect(first.find((row) => row.key === 'empty-event')).toMatchObject({ publish: false, entryPlan: [] });
    expect(first.find((row) => row.key === 'large-event')?.config.categories).toHaveLength(120);
    expect(first.find((row) => row.key === 'large-event')?.entryPlan.reduce((sum, row) => sum + row.count, 0)).toBe(1000);
    expect(CASE_STUDY_REFERENCE_NOW).toBe('2027-03-15T18:00:00.000Z');
  });

  it('covers full, nearly-full, and closed criterium fields plus additional-race pricing', () => {
    const scenario = buildCaseStudyScenarios().find((row) => row.key === 'criterium')!;
    const entries = scenario.entryPlan.flatMap((plan) => plan.riderRefs.map((riderRef, index) => ({ id: `entry-${plan.categoryId}-${index}`, categoryId: plan.categoryId, riderRef })));
    const full = scenario.config.categories.find((row) => row.name === 'Masters 35+ Cat 3/4')!;
    const near = scenario.config.categories.find((row) => row.name === 'Women Cat 3/4/5')!;
    const closed = scenario.config.categories.find((row) => row.timingCode === 'DVC-CLOSED')!;
    expect(canAdmit(scenario.config, entries, full.id, 'test-rider-new').ok).toBe(false);
    expect(canAdmit(scenario.config, entries, near.id, 'test-rider-new').ok).toBe(true);
    expect(canAdmit(scenario.config, entries, closed.id, 'test-rider-new').ok).toBe(false);
    const men = scenario.config.categories.find((row) => row.name === 'Men Cat 4/5')!;
    const open = scenario.config.categories.find((row) => row.name === 'Open Cat 4/5 Evening')!;
    const priced = quote(scenario.config, [men.id, open.id], '2027-03-15');
    expect(priced.discountCents).toBe(1000);
    expect(priced.lines.filter((line) => line.discountCents > 0)).toHaveLength(1);
  });

  it('covers early, standard, late, and day-of price boundaries with a fixed date', () => {
    const scenario = buildCaseStudyScenarios().find((row) => row.key === 'road-shared-field')!;
    const category = scenario.config.categories.find((row) => row.pricing.priceChanges.length > 0)!;
    const day = scenario.config.days.find((row) => row.id === scenario.config.races.find((race) => race.id === category.raceId)!.dayId)!;
    const change = category.pricing.priceChanges[0];
    expect(categoryPrice(category, '2027-03-15', day.date).cents).toBe(category.pricing.baseCents);
    expect(categoryPrice(category, change.effectiveFrom, day.date).cents).toBe(change.cents);
    expect(categoryPrice(category, day.date, day.date)).toEqual({ cents: change.cents + category.pricing.dayOfSurchargeCents, dayOf: true });
  });

  it('covers eligibility review, junior guardian rules, and schedule constraints', () => {
    const scenario = buildCaseStudyScenarios().find((row) => row.key === 'criterium')!;
    const junior = scenario.config.categories.find((row) => row.name === 'Juniors 10-14')!;
    const juniorProfile = profileOf({ racingAge: 13, licenseCategory: null, licenseType: 'annual', competitionClass: 'men', collegiateDivision: null });
    expect(checkSelection(scenario.config, [junior.id], juniorProfile).needsGuardian).toBe(true);
    const unknown = profileOf({ racingAge: 40, licenseCategory: null, licenseType: 'annual', competitionClass: 'men', collegiateDivision: null });
    const masters = scenario.config.categories.find((row) => row.name === 'Masters 35+ Cat 3/4')!;
    expect(checkSelection(scenario.config, [masters.id], unknown).eligibility[masters.id].status).toBe('needs_review');
    const sameStart = scenario.config.categories.filter((row) => row.startGroupId === masters.startGroupId).slice(0, 2);
    if (sameStart.length === 2) expect(findConflicts(scenario.config, sameStart.map((row) => row.id))[0]?.level).toBe('block');
  });

  it('loads one scenario or all scenarios idempotently and resets only generated data', async () => {
    const { app } = await testApp({ now: () => new Date(CASE_STUDY_REFERENCE_NOW) });
    const userOrg = (await app.inject({ method: 'POST', url: '/api/organizations', payload: { name: 'Local organizer data' } })).json() as { id: string };
    expect((await app.inject({ method: 'POST', url: '/api/demo/case-studies/criterium' })).statusCode).toBe(201);
    expect((await app.inject({ method: 'POST', url: '/api/demo/case-studies/criterium' })).statusCode).toBe(200);
    const all = await app.inject({ method: 'POST', url: '/api/demo/case-studies' });
    expect(all.statusCode).toBe(201);
    const orgsBefore = (await app.inject({ method: 'GET', url: '/api/organizations' })).json() as Array<{ id: string; events: unknown[] }>;
    expect(orgsBefore.find((row) => row.id === CASE_STUDY_ORG_ID)?.events).toHaveLength(5);
    const reset = (await app.inject({ method: 'DELETE', url: '/api/demo/case-studies' })).json() as { removedEvents: number };
    expect(reset.removedEvents).toBe(5);
    const orgsAfter = (await app.inject({ method: 'GET', url: '/api/organizations' })).json() as Array<{ id: string }>;
    expect(orgsAfter.some((row) => row.id === CASE_STUDY_ORG_ID)).toBe(false);
    expect(orgsAfter.some((row) => row.id === userOrg.id)).toBe(true);
    await app.close();
  }, 20_000);

  it('seeds successful, duplicate, declined/retried, expired, and license-review payment states', async () => {
    const { app } = await testApp({ now: () => new Date(CASE_STUDY_REFERENCE_NOW) });
    await app.inject({ method: 'POST', url: '/api/demo/case-studies/omnium' });
    const orders = (await app.inject({ method: 'GET', url: '/api/events/evt_demo_case_omnium/orders' })).json() as Array<{
      status: string;
      entries: Array<{ readiness: Array<{ key: string; state: string }> }>;
    }>;
    expect(orders.map((order) => order.status).sort()).toEqual(['confirmed', 'confirmed', 'confirmed', 'confirmed', 'confirmed', 'confirmed', 'confirmed', 'confirmed', 'expired', 'held', 'held']);
    const confirmed = orders.filter((order) => order.status === 'confirmed');
    expect(confirmed.some((order) => order.entries[0].readiness.some((item) => item.key === 'license' && item.state === 'done'))).toBe(true);
    expect(confirmed.some((order) => order.entries[0].readiness.some((item) => item.key === 'license' && item.state === 'needs_review'))).toBe(true);
    await app.close();
  });

  it('seeds a distinguishable same-name pair and an active unpaid hold on the omnium', async () => {
    const databaseUrl = await testDatabaseUrl();
    const { app } = await testApp({ databaseUrl, now: () => new Date(CASE_STUDY_REFERENCE_NOW) });
    expect((await app.inject({ method: 'POST', url: '/api/demo/case-studies/omnium' })).statusCode).toBe(201);
    const seed = new pg.Client({ connectionString: databaseUrl });
    await seed.connect();
    try {
      const { rows } = await seed.query<{
        client_request_id: string; status: string; hold_open: boolean; first_name: string; team: string; racing_age: number;
        license_reviewed: boolean; successes: number; sessions: number; checkout_started: boolean; category_id: string;
      }>(`
        SELECT o.client_request_id, o.status,
               o.hold_expires_at > '2027-03-15T18:00:00.000Z' AS hold_open,
               o.rider_json->>'firstName' AS first_name,
               o.rider_json->>'team' AS team,
               (o.rider_json->>'racingAge')::int AS racing_age,
               oe.license_reviewed,
               (SELECT count(*)::int FROM payment_attempts pa WHERE pa.order_id = o.id AND pa.outcome = 'success') AS successes,
               (SELECT count(*)::int FROM payment_sessions ps WHERE ps.order_id = o.id) AS sessions,
               o.stripe_checkout_started_at IS NOT NULL AS checkout_started,
               oe.category_id
        FROM orders o
        JOIN order_entries oe ON oe.order_id = o.id
        WHERE o.client_request_id IN ('case-study-successful', 'case-study-taylor-ready', 'case-study-taylor-blocked', 'case-study-active-hold')
        ORDER BY o.client_request_id
      `);
      const byId = Object.fromEntries(rows.map((row) => [row.client_request_id, row]));
      expect(rows).toHaveLength(4);
      expect(new Set(rows.map((row) => row.category_id)).size).toBe(1);
      expect(byId['case-study-taylor-ready']).toMatchObject({ status: 'confirmed', first_name: 'Taylor', team: 'Blue Demo Team', racing_age: 41, license_reviewed: true, successes: 1, sessions: 0, checkout_started: false });
      expect(byId['case-study-taylor-blocked']).toMatchObject({ status: 'confirmed', first_name: 'Taylor', team: 'Gold Demo Team', racing_age: 52, license_reviewed: false, successes: 1, sessions: 0, checkout_started: false });
      expect(byId['case-study-active-hold']).toMatchObject({ status: 'held', hold_open: true, first_name: 'Quinn', team: 'Fictional Hold Club', license_reviewed: false, successes: 0, sessions: 0, checkout_started: false });
    } finally {
      await seed.end();
      await app.close();
    }
  });

  it('seeds a Sunday entry, a checkout-started hold, a weekend package, a withdrawal, a refund, and a junior', async () => {
    const databaseUrl = await testDatabaseUrl();
    const { app } = await testApp({ databaseUrl, now: () => new Date(CASE_STUDY_REFERENCE_NOW) });
    expect((await app.inject({ method: 'POST', url: '/api/demo/case-studies/omnium' })).statusCode).toBe(201);
    expect((await app.inject({ method: 'POST', url: '/api/demo/case-studies/criterium' })).statusCode).toBe(201);
    const seed = new pg.Client({ connectionString: databaseUrl });
    await seed.connect();
    try {
      const { rows } = await seed.query<{
        client_request_id: string; event_id: string; order_status: string; entry_status: string; hold_open: boolean;
        first_name: string; racing_age: number; guardian_name: string | null; signer_role: string; license_reviewed: boolean;
        successes: number; sessions: number; refunds: number; refund_cents: number; refund_by: string | null; checkout_started: boolean; bundle_id: string | null; timing_code: string;
      }>(`
        SELECT o.client_request_id, o.event_id, o.status AS order_status, oe.status AS entry_status,
               o.hold_expires_at > $1 AS hold_open,
               o.rider_json->>'firstName' AS first_name,
               (o.rider_json->>'racingAge')::int AS racing_age,
               o.rider_json->'guardian'->>'name' AS guardian_name,
               o.waiver_json->>'signerRole' AS signer_role,
               oe.license_reviewed,
               (SELECT count(*)::int FROM payment_attempts pa WHERE pa.order_id = o.id AND pa.outcome = 'success') AS successes,
               (SELECT count(*)::int FROM payment_sessions ps WHERE ps.order_id = o.id) AS sessions,
               (SELECT count(*)::int FROM refunds r WHERE r.order_id = o.id AND r.status = 'succeeded') AS refunds,
               (SELECT COALESCE(sum(r.amount_cents), 0)::int FROM refunds r WHERE r.order_id = o.id) AS refund_cents,
               (SELECT a.email FROM refunds r JOIN accounts a ON a.id = r.requested_by WHERE r.order_id = o.id LIMIT 1) AS refund_by,
               o.stripe_checkout_started_at IS NOT NULL AS checkout_started,
               o.quote_json->'bundle'->>'id' AS bundle_id,
               cat->>'timingCode' AS timing_code
        FROM orders o
        JOIN order_entries oe ON oe.order_id = o.id
        JOIN event_versions ev ON ev.event_id = o.event_id AND ev.version = o.published_version
        JOIN LATERAL jsonb_array_elements(ev.config_json->'categories') cat ON cat->>'id' = oe.category_id
        WHERE o.client_request_id IN ('case-study-sunday', 'case-study-checkout-started', 'case-study-weekend', 'case-study-withdrawn', 'case-study-refunded', 'case-study-junior')
        ORDER BY o.client_request_id, cat->>'timingCode'
      `, [CASE_STUDY_REFERENCE_NOW]);
      const byId = (id: string) => rows.filter((row) => row.client_request_id === id);
      expect(byId('case-study-sunday')).toMatchObject([{ order_status: 'confirmed', entry_status: 'confirmed', first_name: 'Robin', timing_code: 'DRW-CR-M35', license_reviewed: true, successes: 1, sessions: 0, checkout_started: false, bundle_id: null, refunds: 0 }]);
      expect(byId('case-study-checkout-started')).toMatchObject([{ order_status: 'held', entry_status: 'held', hold_open: true, first_name: 'Cameron', timing_code: 'DRW-RR-M35', successes: 0, sessions: 0, checkout_started: true, refunds: 0 }]);
      const weekend = byId('case-study-weekend');
      expect(weekend.map((row) => row.timing_code)).toEqual(['DRW-CR-M35', 'DRW-RR-M35']);
      expect(weekend.every((row) => row.order_status === 'confirmed' && row.entry_status === 'confirmed' && row.first_name === 'Parker' && row.license_reviewed && row.successes === 1 && row.bundle_id && row.refunds === 0)).toBe(true);
      expect(new Set(weekend.map((row) => row.bundle_id)).size).toBe(1);
      expect(byId('case-study-withdrawn')).toMatchObject([{ order_status: 'confirmed', entry_status: 'withdrawn', first_name: 'Drew', timing_code: 'DRW-RR-M35', successes: 1, refunds: 0, checkout_started: false }]);
      expect(byId('case-study-refunded')).toMatchObject([{ order_status: 'confirmed', entry_status: 'confirmed', first_name: 'Reese', timing_code: 'DRW-RR-M35', successes: 1, sessions: 0, checkout_started: false, license_reviewed: false, refunds: 1, refund_cents: 1000, refund_by: 'finance-seed@example.test' }]);
      const finance = await seed.query<{ provider_user_id: string; organization_id: string; role: string }>(`
        SELECT a.provider_user_id, m.organization_id, m.role
        FROM accounts a
        JOIN organization_members m ON m.account_id = a.id
        WHERE a.id = 'acct_demo_case_refund'
      `);
      expect(finance.rows).toEqual([{ provider_user_id: 'seed:case-study-refund', organization_id: CASE_STUDY_ORG_ID, role: 'finance' }]);
      const history = await seed.query<{ action: string; role: string; actor_id: string | null }>(`
        SELECT action, role, actor_id FROM membership_changes
        WHERE organization_id = $1 AND email = 'finance-seed@example.test'
      `, [CASE_STUDY_ORG_ID]);
      expect(history.rows).toEqual([{ action: 'granted', role: 'finance', actor_id: null }]);
      expect(byId('case-study-junior')).toMatchObject([{ event_id: 'evt_demo_case_criterium', order_status: 'confirmed', entry_status: 'confirmed', first_name: 'River', racing_age: 12, guardian_name: 'Jordan Example', signer_role: 'guardian', timing_code: 'DVC-J1014', license_reviewed: true, successes: 1, refunds: 0 }]);
      const harborCheckIn = await seed.query<{ bib: number; scope: string; bib_active: boolean; checked_at_reference: boolean; settings: { scope: string; ranges: { scope: string; first: number; last: number }[] }; locks: number; omnium_bibs: number; omnium_check_ins: number }>(`
        SELECT b.bib, b.scope, b.released_at IS NULL AS bib_active,
               c.checked_in_at = $1::timestamptz AS checked_at_reference,
               s.settings_json AS settings,
               (SELECT count(*)::int FROM start_list_locks WHERE event_id = 'evt_demo_case_criterium') AS locks,
               (SELECT count(*)::int FROM bib_assignments WHERE event_id = 'evt_demo_case_omnium') AS omnium_bibs,
               (SELECT count(*)::int FROM check_ins WHERE event_id = 'evt_demo_case_omnium') AS omnium_check_ins
        FROM orders o
        JOIN bib_assignments b ON b.order_id = o.id
        JOIN check_ins c ON c.order_id = o.id AND c.event_id = o.event_id
        JOIN bib_settings s ON s.event_id = o.event_id
        WHERE o.client_request_id = 'case-study-junior'
      `, [CASE_STUDY_REFERENCE_NOW]);
      expect(harborCheckIn.rows).toEqual([{
        bib: 500, scope: 'weekend', bib_active: true, checked_at_reference: true,
        settings: { scope: 'weekend', ranges: [{ scope: 'weekend', first: 500, last: 519 }] },
        locks: 0, omnium_bibs: 0, omnium_check_ins: 0,
      }]);
    } finally {
      await seed.end();
      await app.close();
    }
  });

  it('resets a generated event with orders, refunds and export history without deleting unrelated audit rows', async () => {
    const databaseUrl = await testDatabaseUrl();
    const { app } = await testApp({ databaseUrl, now: () => new Date(CASE_STUDY_REFERENCE_NOW) });
    const eventId = 'evt_demo_case_omnium';
    expect((await app.inject({ method: 'POST', url: '/api/demo/case-studies/omnium' })).statusCode).toBe(201);
    const { config } = (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json() as { config: EventConfig };
    const category = config.categories.find((row) => row.name.includes('Masters 35+'))!;
    const ok = async (res: { statusCode: number; body: string }, status = 200) => expect(res.statusCode, res.body).toBe(status);

    await ok(await app.inject({ method: 'POST', url: `/api/events/${eventId}/coupons`, payload: { kind: 'percent', code: 'RESET10', percent: 10, categoryIds: [], validFrom: null, validUntil: null, maxRedemptions: null, maxPerRider: null } }), 201);
    const rider = {
      firstName: 'Avery', lastName: 'Example', email: 'avery@example.test', phone: '', team: 'Fictional Wheel Club', racingAge: 40, licenseCategory: '3', licenseType: 'annual',
      licenseNumber: 'DEMO-CASE-002', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Riley Example', phone: '202-555-0176' },
    };
    const waiver = { version: config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Avery Example', signerRole: 'rider' };
    const placed = await app.inject({ method: 'POST', url: `/api/rider/events/${eventId}/orders`, payload: { clientRequestId: 'case-reset-0001', categoryIds: [category.id], rider, waiver, couponCode: 'RESET10' } });
    await ok(placed, 201);
    const order = placed.json() as { id: string; couponCode: string | null };
    expect(order.couponCode).toBe('RESET10');
    await ok(await app.inject({ method: 'POST', url: `/api/orders/${order.id}/payment`, payload: { attemptId: 'case-reset-attempt-1', outcome: 'success' } }));
    await ok(await app.inject({ method: 'POST', url: `/api/orders/${order.id}/rider-corrections`, payload: { changes: { team: 'Corrected Wheel Club' }, reason: 'Team name typed wrong' } }));
    await ok(await app.inject({ method: 'POST', url: `/api/events/${eventId}/emergency-contact`, payload: { orderId: order.id } }));
    await ok(await app.inject({ method: 'POST', url: `/api/orders/${order.id}/refunds`, payload: { clientRequestId: 'refund-local-case-studies-test-ts', amountCents: 100, reason: 'Goodwill refund' } }));

    const unrelated = (await app.inject({ method: 'POST', url: '/api/demo' })).json().eventId;
    for (const id of [eventId, unrelated]) {
      await ok(await app.inject({ method: 'GET', url: `/api/events/${id}/exports/entries.csv` }));
    }
    const reset = await app.inject({ method: 'DELETE', url: '/api/demo/case-studies' });
    await ok(reset);
    expect((reset.json() as { removedEvents: number }).removedEvents).toBe(1);
    const db = openDb(databaseUrl);
    try {
      expect(await db.all('SELECT event_id FROM protected_export_audit')).toEqual([{ event_id: unrelated }]);
      expect(await db.all('SELECT event_id FROM emergency_contact_views')).toEqual([]);
      expect(await db.all(`SELECT id FROM accounts WHERE id = 'acct_demo_case_refund'`)).toEqual([{ id: 'acct_demo_case_refund' }]);
      expect(await db.all(`SELECT role FROM organization_members WHERE account_id = 'acct_demo_case_refund'`)).toEqual([]);
      expect(await db.all(`SELECT action FROM membership_changes WHERE email = 'finance-seed@example.test'`)).toEqual([]);
    } finally {
      await db.close();
    }
    // Nothing is left behind: the same scenario loads again from scratch.
    await ok(await app.inject({ method: 'POST', url: '/api/demo/case-studies/omnium' }), 201);
    expect(((await app.inject({ method: 'GET', url: `/api/events/${eventId}/coupons` })).json() as unknown[]).length).toBe(0);
    const reloaded = openDb(databaseUrl);
    try {
      expect(await reloaded.all(`SELECT organization_id, role FROM organization_members WHERE account_id = 'acct_demo_case_refund'`)).toEqual([{ organization_id: CASE_STUDY_ORG_ID, role: 'finance' }]);
      expect(await reloaded.all(`SELECT action, role, actor_id FROM membership_changes WHERE email = 'finance-seed@example.test'`)).toEqual([{ action: 'granted', role: 'finance', actor_id: null }]);
    } finally {
      await reloaded.close();
    }
    await app.close();
  });

  it('finishes a first sign-in when the case-study reset overlaps the invitation it already read', async () => {
    const databaseUrl = await testDatabaseUrl();
    const { app } = await testApp({ databaseUrl, now: () => new Date(CASE_STUDY_REFERENCE_NOW) });
    const invitee = 'casey@example.test';
    expect((await app.inject({ method: 'POST', url: '/api/demo/case-studies/empty-event' })).statusCode).toBe(201);
    expect((await app.inject({ method: 'POST', url: `/api/organizations/${CASE_STUDY_ORG_ID}/members`, payload: { email: invitee, role: 'finance' } })).statusCode).toBe(200);
    const hold = new pg.Client({ connectionString: databaseUrl });
    await hold.connect();
    let signIn = Promise.resolve({ statusCode: 0 });
    let reset = Promise.resolve({ statusCode: 0 });
    try {
      // Blocks the account insert, which is the next statement after the invitation read. Reset does not touch accounts.
      // Releasing only after reset is waiting avoids a deadlock: sign-in holds the membership lock and waits on this one.
      await hold.query('BEGIN');
      await hold.query('LOCK TABLE accounts IN EXCLUSIVE MODE');
      signIn = app.inject({ method: 'GET', url: '/api/me', headers: as(invitee) });
      await untilWaiting(hold, 1);
      reset = app.inject({ method: 'DELETE', url: '/api/demo/case-studies' });
      await untilWaiting(hold, 2);
      await hold.query('COMMIT');
      expect((await signIn).statusCode).toBe(200);
      expect((await reset).statusCode).toBe(200);
    } finally {
      await hold.end();
      await Promise.allSettled([signIn, reset]);
      await app.close();
    }
  }, 15_000);

  it('lets a paid notification take the event lock while reset is still deleting that session', async () => {
    const databaseUrl = await testDatabaseUrl();
    const { app } = await testApp({ databaseUrl, now: () => new Date(CASE_STUDY_REFERENCE_NOW) });
    const eventId = 'evt_demo_case_omnium';
    expect((await app.inject({ method: 'POST', url: '/api/demo/case-studies/omnium' })).statusCode).toBe(201);
    const seed = new pg.Client({ connectionString: databaseUrl });
    await seed.connect();
    try {
      const order = await seed.query<{ id: string }>(`SELECT id FROM orders WHERE client_request_id = 'case-study-successful'`);
      expect(order.rowCount).toBe(1);
      await seed.query(
        `INSERT INTO payment_sessions (id, order_id, provider, url, amount_cents, status, expires_at, created_at)
         VALUES ('cs_case_reset_deadlock', $1, 'stripe_test', 'https://checkout.example.test/fictional', 4000, 'open', '2027-03-15T19:00:00Z', '2027-03-15T18:00:00Z')`,
        [order.rows[0].id],
      );
    } finally {
      await seed.end();
    }
    const hold = new pg.Client({ connectionString: databaseUrl });
    await hold.connect();
    let reset = Promise.resolve({ statusCode: 0, body: '' });
    try {
      await hold.query('BEGIN');
      // The notification has updated the session row and still holds that row lock.
      await hold.query(`UPDATE payment_sessions SET status = 'completed' WHERE id = 'cs_case_reset_deadlock'`);
      reset = app.inject({ method: 'DELETE', url: '/api/demo/case-studies' });
      await untilWaiting(hold, 1);
      await hold.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`event:${eventId}`]);
      await hold.query('COMMIT');
      const done = await reset;
      expect(done.statusCode, done.body).toBe(200);
      const left = new pg.Client({ connectionString: databaseUrl });
      await left.connect();
      try {
        expect((await left.query(`SELECT id FROM payment_sessions WHERE id = 'cs_case_reset_deadlock'`)).rowCount).toBe(0);
        expect((await left.query(`SELECT id FROM events WHERE id = $1`, [eventId])).rowCount).toBe(0);
      } finally {
        await left.end();
      }
    } finally {
      await hold.end();
      await Promise.allSettled([reset]);
      await app.close();
    }
  }, 15_000);

  it('grants case-study ownership when a reset overlaps the load', async () => {
    const databaseUrl = await testDatabaseUrl();
    const { app } = await testApp({ databaseUrl, now: () => new Date(CASE_STUDY_REFERENCE_NOW) });
    // The organizer account must exist before the table lock, or sign-in waits on the insert before the load takes the demo lock.
    expect((await app.inject({ method: 'GET', url: '/api/me' })).statusCode).toBe(200);
    const hold = new pg.Client({ connectionString: databaseUrl });
    await hold.connect();
    let load = Promise.resolve({ statusCode: 0, json: () => ({ removedEvents: 0 }) });
    let reset = Promise.resolve({ statusCode: 0, json: () => ({ removedEvents: 0 }) });
    try {
      // Blocks the membership insert's account foreign key, after the load has locked the demo. Reset does not touch accounts.
      // Releasing only after reset is waiting avoids a deadlock: the load holds the demo lock and waits on this one.
      await hold.query('BEGIN');
      await hold.query('LOCK TABLE accounts IN EXCLUSIVE MODE');
      load = app.inject({ method: 'POST', url: '/api/demo/case-studies/empty-event' });
      await untilWaiting(hold, 1);
      reset = app.inject({ method: 'DELETE', url: '/api/demo/case-studies' });
      await untilWaiting(hold, 2);
      await hold.query('COMMIT');
      expect((await load).statusCode).toBe(201);
      const removed = await reset;
      expect(removed.statusCode).toBe(200);
      expect((removed.json() as { removedEvents: number }).removedEvents).toBe(1);
    } finally {
      await hold.end();
      await Promise.allSettled([load, reset]);
      await app.close();
    }
  }, 15_000);

  it('refuses a case-study reset from someone who is not a member when it overlaps the load', async () => {
    const databaseUrl = await testDatabaseUrl();
    const { app } = await testApp({ databaseUrl, now: () => new Date(CASE_STUDY_REFERENCE_NOW) });
    const stranger = 'parker@example.test';
    expect((await app.inject({ method: 'GET', url: '/api/me' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/me', headers: as(stranger) })).statusCode).toBe(200);
    const hold = new pg.Client({ connectionString: databaseUrl });
    await hold.connect();
    let load = Promise.resolve({ statusCode: 0 });
    let reset = Promise.resolve({ statusCode: 0 });
    try {
      await hold.query('BEGIN');
      await hold.query('LOCK TABLE accounts IN EXCLUSIVE MODE');
      load = app.inject({ method: 'POST', url: '/api/demo/case-studies/empty-event' });
      await untilWaiting(hold, 1);
      reset = app.inject({ method: 'DELETE', url: '/api/demo/case-studies', headers: as(stranger) });
      await untilWaiting(hold, 2);
      await hold.query('COMMIT');
      expect((await load).statusCode).toBe(201);
      expect((await reset).statusCode).toBe(404);
      expect((await app.inject({ method: 'GET', url: '/api/events/evt_demo_case_empty' })).statusCode).toBe(200);
    } finally {
      await hold.end();
      await Promise.allSettled([load, reset]);
      await app.close();
    }
  }, 15_000);
});
