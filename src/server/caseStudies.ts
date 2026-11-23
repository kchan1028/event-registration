import { buildCaseStudyScenarios, CASE_STUDY_ORG_ID, CASE_STUDY_ORG_NAME, CASE_STUDY_REFERENCE_NOW, type CaseStudyKey } from '../shared/caseStudies';
import type { Db } from './db';
import type { Orders } from './orders';
import { eventLock, type Repo } from './repo';

const scenarioByKey = () => new Map(buildCaseStudyScenarios().map((scenario) => [scenario.key, scenario]));

export function createCaseStudyFixtures(db: Db, repo: Repo, orders: Orders) {
  async function organization() {
    const existing = await db.get<{ id: string }>(`SELECT id FROM organizations WHERE id = $1`, [CASE_STUDY_ORG_ID]);
    return existing ?? repo.createOrganization(CASE_STUDY_ORG_NAME, CASE_STUDY_ORG_ID);
  }

  async function seedOrders(eventId: string) {
    const event = await repo.getEvent(eventId);
    if (event.config.event.name !== 'Demo Redwood Omnium Weekend') return;
    const category = event.config.categories.find((row) => row.name.includes('Masters 35+'))!;
    const waiver = { version: event.config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Morgan Example', signerRole: 'rider' as const };
    const rider = {
      firstName: 'Morgan', lastName: 'Example', email: 'morgan@example.test', phone: '202-555-0142', team: 'Fictional Wheel Club', racingAge: 40,
      licenseCategory: '3' as const, licenseType: 'annual' as const, licenseNumber: 'DEMO-CASE-001', competitionClass: 'men' as const,
      collegiateDivision: null, guardian: null, emergencyContact: { name: 'Riley Example', phone: '202-555-0176' },
    };
    // No account: seeded fictional orders belong to nobody.
    const create = (suffix: string) => orders.createOrder(eventId, { clientRequestId: `case-study-${suffix}`, categoryIds: [category.id], rider, waiver, extras: {} }, null);

    const successful = await create('successful');
    await orders.pay(successful.id, 'case-attempt-success', 'success');
    await orders.pay(successful.id, 'case-attempt-success', 'success');
    for (const entry of successful.entries) await orders.reviewLicense(entry.id, 'Seeded fictional license review for check-in rehearsal');

    const retried = await create('declined-retried');
    await orders.pay(retried.id, 'case-attempt-declined', 'failure');
    await orders.pay(retried.id, 'case-attempt-retry', 'success');

    await create('expired');
    await db.run(`UPDATE orders SET hold_expires_at = '2000-01-01T00:00:00.000Z' WHERE event_id = $1 AND client_request_id = 'case-study-expired'`, [eventId]);
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
      for (const id of [...eventIds].sort()) await db.lock(eventLock(id));
      // First sign-in holds this lock before it writes a membership for an invitation it has read.
      // Taking it after the event locks lets that sign-in finish before this organization is deleted.
      await db.lock(`org-members:${CASE_STUDY_ORG_ID}`);
      const ids = eventIds.map((_, index) => `$${index + 1}`).join(', ');
      const orderIds = `SELECT id FROM orders WHERE event_id IN (${ids})`;
      // Children before parents: none of these foreign keys cascade.
      await db.run(`DELETE FROM emergency_contact_views WHERE event_id IN (${ids})`, eventIds);
      await db.run(`DELETE FROM protected_export_audit WHERE event_id IN (${ids})`, eventIds);
      await db.run(`DELETE FROM cancellation_request_refusals WHERE event_id IN (${ids})`, eventIds);
      await db.run(`DELETE FROM cancellation_executions WHERE event_id IN (${ids})`, eventIds);
      await db.run(`DELETE FROM cancellation_confirmations WHERE event_id IN (${ids})`, eventIds);
      await db.run(`DELETE FROM refunds WHERE order_id IN (${orderIds})`, eventIds);
      await db.run(`DELETE FROM provider_events WHERE order_id IN (${orderIds})`, eventIds);
      await db.run(`DELETE FROM payment_sessions WHERE order_id IN (${orderIds})`, eventIds);
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
