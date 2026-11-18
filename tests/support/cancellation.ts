import pg from 'pg';
import { expect } from 'vitest';
import { testApp, testDatabaseUrl } from './db';
import type { EventConfig } from '../../src/shared/schema';
import type { CancellationSelection } from '../../src/shared/cancellations';

export async function cancellationSetup(policy: 'full_refund' | 'credit' | 'rider_choice' | null = 'full_refund') {
  const databaseUrl = await testDatabaseUrl();
  const { app } = await testApp({ databaseUrl, now: () => new Date('2027-03-01T18:00:00Z') });
  const { eventId, organizationId } = (await app.inject({ method: 'POST', url: '/api/demo' })).json();
  const event = (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json();
  const config: EventConfig = event.config;
  config.registration.refundRules = policy === null ? null : { tiers: [], returnAs: 'cash', organizerCancellation: policy };
  expect((await app.inject({ method: 'PUT', url: `/api/events/${eventId}/config`, payload: { revision: event.revision, config } })).statusCode).toBe(200);
  expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/publish`, payload: { acknowledgeWarnings: true, acknowledgeImpact: true } })).statusCode).toBe(200);
  const cat = (code: string) => config.categories.find((c) => c.timingCode === code)!;
  const created = await app.inject({ method: 'POST', url: `/api/rider/events/${eventId}/orders`, payload: {
    clientRequestId: 'execution-readiness-order', categoryIds: [cat('RR-M35-34').id, cat('CR-M35-34').id],
    rider: { firstName: 'Readiness', lastName: 'Fictional', email: 'readiness@example.test', team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Fictional Contact', phone: '555-555-0199' } },
    waiver: { version: config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Readiness Fictional', signerRole: 'rider' },
  } });
  expect(created.statusCode, created.body).toBe(201); const order = created.json();
  const pay = () => app.inject({ method: 'POST', url: `/api/orders/${order.id}/payment`, payload: { attemptId: 'execution-readiness-pay', outcome: 'success' } });
  const sql = async (query: string, values: unknown[] = []) => { const c = new pg.Client({ connectionString: databaseUrl }); await c.connect(); try { return await c.query(query, values); } finally { await c.end(); } };
  let planNonce = 0;
  const plan = async (selection: CancellationSelection = { scope: 'race', raceId: cat('RR-M35-34').raceId }) => {
    const preview = await app.inject({ method: 'POST', url: `/api/events/${eventId}/cancellation-confirmation-preview`, payload: selection });
    expect(preview.statusCode, preview.body).toBe(200);
    const saved = await app.inject({ method: 'POST', url: `/api/events/${eventId}/cancellation-confirmations`, payload: { clientRequestId: `execution-readiness-plan-${++planNonce}`, selection: preview.json().preview.selection, previewFingerprint: preview.json().fingerprint, reason: 'Fictional weather review', acknowledgePlanOnly: true } });
    expect(saved.statusCode, saved.body).toBe(200); return saved.json();
  };
  const read = (id: string, headers = {}) => app.inject({ method: 'GET', url: `/api/events/${eventId}/cancellation-confirmations/${id}/financial-preflight`, headers });
  return { app, databaseUrl, eventId, organizationId, order, cat, config, pay, sql, plan, read };
}
