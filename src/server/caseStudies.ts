import { buildCaseStudyScenarios, CASE_STUDY_ORG_ID, CASE_STUDY_ORG_NAME, CASE_STUDY_REFERENCE_NOW, type CaseStudyKey } from '../shared/caseStudies';
import { newId } from '../shared/factory';
import type { Db } from './db';
import type { Orders } from './orders';
import type { Refunds } from './refunds';
import { eventLock, type Repo } from './repo';

const scenarioByKey = () => new Map(buildCaseStudyScenarios().map((scenario) => [scenario.key, scenario]));

/** Harbor-only. The omnium seed stays without a bib or a check-in. */
type SeedCheckIn = {
  saveSettings(eventId: string, input: { scope: 'weekend'; ranges: { scope: 'weekend'; first: number; last: number }[] }): Promise<unknown>;
  previewBibs(eventId: string, batch: { dayId: string; orderIds: string[]; sort: 'name' }): Promise<{ fingerprint: string }>;
  applyBibs(eventId: string, batch: { dayId: string; orderIds: string[]; sort: 'name' }, fingerprint: string): Promise<unknown>;
  checkIn(eventId: string, orderId: string, dayId: string, requestedBib: number | null): Promise<unknown>;
};

export function createCaseStudyFixtures(db: Db, repo: Repo, orders: Orders, refunds: Refunds, checkIn: SeedCheckIn) {
  async function organization() {
    const existing = await db.get<{ id: string }>(`SELECT id FROM organizations WHERE id = $1`, [CASE_STUDY_ORG_ID]);
    return existing ?? repo.createOrganization(CASE_STUDY_ORG_NAME, CASE_STUDY_ORG_ID);
  }

  async function seedOrders(eventId: string) {
    const event = await repo.getEvent(eventId);
    const title = event.config.event.name;
    const omnium = title === 'Demo Redwood Omnium Weekend';
    const criterium = title === 'Demo Harbor Criterium: pricing and eligibility lab';
    if (!omnium && !criterium) return;
    const byCode = (code: string) => event.config.categories.find((row) => row.timingCode === code);
    const place = (suffix: string, categoryIds: string[], person: {
      firstName: string; email: string; phone: string; team: string; racingAge: number; licenseNumber: string; contactName: string; contactPhone: string;
      licenseCategory?: '3' | '5'; guardian?: { name: string; email: string; phone: string };
    }, bundleIntent: string | null = null) => {
      const guardian = person.guardian ? { name: person.guardian.name, relationship: 'Parent', email: person.guardian.email, phone: person.guardian.phone } : null;
      return orders.createOrder(eventId, {
        clientRequestId: `case-study-${suffix}`,
        categoryIds,
        bundleIntent,
        // No account: seeded fictional orders belong to nobody.
        rider: {
          firstName: person.firstName, lastName: 'Example', email: person.email, phone: person.phone, team: person.team, racingAge: person.racingAge,
          licenseCategory: person.licenseCategory ?? '3', licenseType: 'annual' as const, licenseNumber: person.licenseNumber, competitionClass: 'men' as const,
          collegiateDivision: null, guardian, emergencyContact: { name: person.contactName, phone: person.contactPhone },
        },
        waiver: {
          version: event.config.registration.waiverVersion, read: true, agreed: true,
          signatureName: guardian ? guardian.name : `${person.firstName} Example`, signerRole: guardian ? 'guardian' as const : 'rider' as const,
        },
        extras: {},
      }, null);
    };
    const payAndReview = async (order: Awaited<ReturnType<typeof place>>, attemptId: string, note: string) => {
      await orders.pay(order.id, attemptId, 'success');
      for (const entry of order.entries) await orders.reviewLicense(entry.id, note);
    };

    if (criterium) {
      const junior = byCode('DVC-J1014')!;
      const river = await place('junior', [junior.id], {
        firstName: 'River', email: 'river@example.test', phone: '202-555-0150', team: 'Fictional Junior Club', racingAge: 12, licenseNumber: 'DEMO-CASE-017', licenseCategory: '5',
        contactName: 'Jordan Example', contactPhone: '202-555-0185', guardian: { name: 'Jordan Example', email: 'jordan-guardian@example.test', phone: '202-555-0184' },
      });
      await payAndReview(river, 'case-attempt-junior', 'Seeded fictional license review for the junior rider');
      // Bib 100 and the start-list locks belong to the weekend browser spec on the omnium. This range stays on Harbor.
      const dayId = event.config.races.find((race) => race.id === junior.raceId)!.dayId;
      const batch = { dayId, orderIds: [river.id], sort: 'name' as const };
      await checkIn.saveSettings(eventId, { scope: 'weekend', ranges: [{ scope: 'weekend', first: 500, last: 519 }] });
      const preview = await checkIn.previewBibs(eventId, batch);
      await checkIn.applyBibs(eventId, batch, preview.fingerprint);
      await checkIn.checkIn(eventId, river.id, dayId, null);
      return;
    }

    // DRW-RR-M35 is the Saturday road race. DRW-CR-M35 is the Sunday criterium.
    const saturday = byCode('DRW-RR-M35')!;
    const sunday = byCode('DRW-CR-M35')!;
    const saturdayOnly = (suffix: string, person: Parameters<typeof place>[2]) => place(suffix, [saturday.id], person);

    const morgan = { firstName: 'Morgan', email: 'morgan@example.test', phone: '202-555-0142', team: 'Fictional Wheel Club', racingAge: 40, licenseNumber: 'DEMO-CASE-001', contactName: 'Riley Example', contactPhone: '202-555-0176' };
    const successful = await saturdayOnly('successful', morgan);
    await orders.pay(successful.id, 'case-attempt-success', 'success');
    await orders.pay(successful.id, 'case-attempt-success', 'success');
    for (const entry of successful.entries) await orders.reviewLicense(entry.id, 'Seeded fictional license review for check-in rehearsal');

    const retried = await saturdayOnly('declined-retried', morgan);
    await orders.pay(retried.id, 'case-attempt-declined', 'failure');
    await orders.pay(retried.id, 'case-attempt-retry', 'success');

    await saturdayOnly('expired', morgan);
    await db.run(`UPDATE orders SET hold_expires_at = '2000-01-01T00:00:00.000Z' WHERE event_id = $1 AND client_request_id = 'case-study-expired'`, [eventId]);

    const ready = await saturdayOnly('taylor-ready', { firstName: 'Taylor', email: 'taylor-ready@example.test', phone: '202-555-0143', team: 'Blue Demo Team', racingAge: 41, licenseNumber: 'DEMO-CASE-010', contactName: 'Casey Example', contactPhone: '202-555-0177' });
    await payAndReview(ready, 'case-attempt-taylor-ready', 'Seeded fictional license review for the distinguishable ready rider');

    const blocked = await saturdayOnly('taylor-blocked', { firstName: 'Taylor', email: 'taylor-blocked@example.test', phone: '202-555-0144', team: 'Gold Demo Team', racingAge: 52, licenseNumber: 'DEMO-CASE-011', contactName: 'Jordan Example', contactPhone: '202-555-0178' });
    await orders.pay(blocked.id, 'case-attempt-taylor-blocked', 'success');

    await saturdayOnly('active-hold', { firstName: 'Quinn', email: 'quinn@example.test', phone: '202-555-0145', team: 'Fictional Hold Club', racingAge: 44, licenseNumber: 'DEMO-CASE-012', contactName: 'Avery Example', contactPhone: '202-555-0179' });
    await db.run(`UPDATE orders SET hold_expires_at = '2027-05-14T18:00:00.000Z' WHERE event_id = $1 AND client_request_id = 'case-study-active-hold'`, [eventId]);

    const robin = await place('sunday', [sunday.id], { firstName: 'Robin', email: 'robin@example.test', phone: '202-555-0147', team: 'Fictional Sunday Club', racingAge: 43, licenseNumber: 'DEMO-CASE-014', contactName: 'Riley Example', contactPhone: '202-555-0181' });
    await payAndReview(robin, 'case-attempt-sunday', 'Seeded fictional license review for the Sunday-only rider');

    await saturdayOnly('checkout-started', { firstName: 'Cameron', email: 'cameron@example.test', phone: '202-555-0146', team: 'Fictional Checkout Club', racingAge: 46, licenseNumber: 'DEMO-CASE-013', contactName: 'Sam Example', contactPhone: '202-555-0180' });
    await db.run(
      `UPDATE orders SET hold_expires_at = '2027-05-14T18:00:00.000Z', stripe_checkout_started_at = $2 WHERE event_id = $1 AND client_request_id = 'case-study-checkout-started'`,
      [eventId, CASE_STUDY_REFERENCE_NOW],
    );

    const bundle = event.config.registration.bundles[0]!;
    const parker = await place('weekend', [saturday.id, sunday.id], { firstName: 'Parker', email: 'parker@example.test', phone: '202-555-0148', team: 'Fictional Weekend Club', racingAge: 47, licenseNumber: 'DEMO-CASE-015', contactName: 'Riley Example', contactPhone: '202-555-0182' }, bundle.id);
    await payAndReview(parker, 'case-attempt-weekend', 'Seeded fictional license review for the weekend package');

    const drew = await saturdayOnly('withdrawn', { firstName: 'Drew', email: 'drew@example.test', phone: '202-555-0149', team: 'Fictional Withdrawal Club', racingAge: 48, licenseNumber: 'DEMO-CASE-016', contactName: 'Riley Example', contactPhone: '202-555-0183' });
    await orders.pay(drew.id, 'case-attempt-withdrawn', 'success');
    await orders.withdrawEntry(drew.entries[0].id, 'Seeded fictional withdrawal for a freed-place rehearsal.');

    // The refund records who asked. This account has the finance role and is not a sign-in identity.
    // Publish already holds the event lock. Take the membership lock before the account write, the same order as reset and the owner grant.
    await db.lock(`org-members:${CASE_STUDY_ORG_ID}`);
    const accountId = 'acct_demo_case_refund';
    const accountEmail = 'finance-seed@example.test';
    if (!(await db.get(`SELECT id FROM accounts WHERE id = $1`, [accountId]))) {
      await db.run(
        `INSERT INTO accounts (id, provider_user_id, email, created_at) VALUES ($1, 'seed:case-study-refund', $2, $3)`,
        [accountId, accountEmail, CASE_STUDY_REFERENCE_NOW],
      );
    }
    const added = await db.run(
      `INSERT INTO organization_members (organization_id, account_id, role, granted_by, created_at) VALUES ($1, $2, 'finance', NULL, $3) ON CONFLICT DO NOTHING`,
      [CASE_STUDY_ORG_ID, accountId, CASE_STUDY_REFERENCE_NOW],
    );
    // Seed grants record no actor. A repeat of a membership that is already there adds no second history row.
    if (added) {
      await db.run(
        `INSERT INTO membership_changes (id, organization_id, action, email, role, actor_id, created_at) VALUES ($1, $2, 'granted', $3, 'finance', NULL, $4)`,
        [newId('mch'), CASE_STUDY_ORG_ID, accountEmail, CASE_STUDY_REFERENCE_NOW],
      );
    }
    const reese = await saturdayOnly('refunded', { firstName: 'Reese', email: 'reese@example.test', phone: '202-555-0151', team: 'Fictional Refund Club', racingAge: 49, licenseNumber: 'DEMO-CASE-018', contactName: 'Riley Example', contactPhone: '202-555-0186' });
    await orders.pay(reese.id, 'case-attempt-refunded', 'success');
    await refunds.request(reese.id, {
      clientRequestId: 'case-study-refund',
      entryId: reese.entries[0].id,
      amountCents: 1000,
      reason: 'Seeded fictional partial refund.',
    }, accountId);
  }

  async function loadUnlocked(key: CaseStudyKey) {
    const scenario = scenarioByKey().get(key);
    if (!scenario) throw new Error(`Unknown case study: ${key}`);
    const existing = await db.get<{ published_version: number | null }>(`SELECT published_version FROM events WHERE id = $1`, [scenario.eventId]);
    if (existing) return { created: false, key, eventId: scenario.eventId, published: existing.published_version !== null };
    const org = await organization();
    const record = await repo.createEvent(org.id, scenario.config, scenario.eventId);
    for (const plan of scenario.entryPlan) await repo.addTestEntries(record.id, plan.categoryId, plan.count, plan.riderRefs);
    if (scenario.publish) await repo.publish(record.id, true);
    await seedOrders(record.id);
    return { created: true, key, eventId: record.id, published: scenario.publish };
  }

  async function load(key: CaseStudyKey, afterEvents?: () => Promise<void>) {
    return db.transaction(async () => {
      await db.lock('demo:case-studies');
      const result = await loadUnlocked(key);
      // The demo lock is still held, and any event lock this load took already ran. The route grants ownership here.
      if (afterEvents) await afterEvents();
      return result;
    });
  }

  async function loadAll(afterEvents?: () => Promise<void>) {
    return db.transaction(async () => {
      await db.lock('demo:case-studies');
      const results = [];
      for (const scenario of buildCaseStudyScenarios()) results.push(await loadUnlocked(scenario.key));
      if (afterEvents) await afterEvents();
      return { organizationId: CASE_STUDY_ORG_ID, referenceClock: CASE_STUDY_REFERENCE_NOW, results };
    });
  }

  async function reset() {
    return db.transaction(async () => {
      await db.lock('demo:case-studies');
      const eventIds = (await db.all<{ id: string }>(`SELECT id FROM events WHERE organization_id = $1`, [CASE_STUDY_ORG_ID])).map((row) => row.id);
      if (eventIds.length === 0) return { removedEvents: 0 };
      const ids = eventIds.map((_, index) => `$${index + 1}`).join(', ');
      const orderIds = `SELECT id FROM orders WHERE event_id IN (${ids})`;
      // A paid notification updates the session row, then waits for the event lock.
      // Delete those rows first so this reset is not holding the event lock while it waits on the row.
      await db.run(`DELETE FROM payment_sessions WHERE order_id IN (${orderIds})`, eventIds);
      for (const id of [...eventIds].sort()) await db.lock(eventLock(id));
      // First sign-in holds this lock before it writes a membership for an invitation it has read.
      // Taking it after the event locks lets that sign-in finish before this organization is deleted.
      await db.lock(`org-members:${CASE_STUDY_ORG_ID}`);
      // Children before parents: none of these foreign keys cascade.
      await db.run(`DELETE FROM emergency_contact_views WHERE event_id IN (${ids})`, eventIds);
      await db.run(`DELETE FROM protected_export_audit WHERE event_id IN (${ids})`, eventIds);
      await db.run(`DELETE FROM cancellation_request_refusals WHERE event_id IN (${ids})`, eventIds);
      await db.run(`DELETE FROM cancellation_executions WHERE event_id IN (${ids})`, eventIds);
      await db.run(`DELETE FROM cancellation_confirmations WHERE event_id IN (${ids})`, eventIds);
      await db.run(`DELETE FROM refunds WHERE order_id IN (${orderIds})`, eventIds);
      await db.run(`DELETE FROM provider_events WHERE order_id IN (${orderIds})`, eventIds);
      await db.run(`DELETE FROM rider_corrections WHERE event_id IN (${ids})`, eventIds);
      await db.run(`DELETE FROM entry_resolutions WHERE event_id IN (${ids})`, eventIds);
      await db.run(`DELETE FROM rider_link_dismissals WHERE event_id IN (${ids})`, eventIds);
      await db.run(`DELETE FROM rider_links WHERE event_id IN (${ids})`, eventIds);
      await db.run(`DELETE FROM start_list_locks WHERE event_id IN (${ids})`, eventIds);
      await db.run(`DELETE FROM check_in_undos WHERE event_id IN (${ids})`, eventIds);
      await db.run(`DELETE FROM entry_changes WHERE event_id IN (${ids})`, eventIds);
      await db.run(`DELETE FROM waitlist_entries WHERE event_id IN (${ids})`, eventIds);
      await db.run(`DELETE FROM check_ins WHERE event_id IN (${ids})`, eventIds);
      await db.run(`DELETE FROM bib_assignments WHERE event_id IN (${ids})`, eventIds);
      await db.run(`DELETE FROM bib_settings WHERE event_id IN (${ids})`, eventIds);
      await db.run(`DELETE FROM start_list_snapshots WHERE event_id IN (${ids})`, eventIds);
      await db.run(`DELETE FROM payment_attempts WHERE order_id IN (${orderIds})`, eventIds);
      await db.run(`DELETE FROM order_entries WHERE event_id IN (${ids})`, eventIds);
      await db.run(`DELETE FROM orders WHERE event_id IN (${ids})`, eventIds);
      await db.run(`DELETE FROM coupons WHERE event_id IN (${ids})`, eventIds); // after orders: orders.coupon_id references coupons
      await db.run(`DELETE FROM test_entries WHERE event_id IN (${ids})`, eventIds);
      await db.run(`DELETE FROM bib_reassignments WHERE event_id IN (${ids})`, eventIds);
      await db.run(`DELETE FROM event_versions WHERE event_id IN (${ids})`, eventIds);
      await db.run(`DELETE FROM events WHERE id IN (${ids})`, eventIds);
      await db.run(`DELETE FROM organizations WHERE id = $1`, [CASE_STUDY_ORG_ID]);
      return { removedEvents: eventIds.length };
    });
  }

  return { load, loadAll, reset };
}
