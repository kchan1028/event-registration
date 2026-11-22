import { describe, expect, it } from 'vitest';
import { describeRefundRules, refundPolicyLines, refundPolicyEntitlement, REFUND_TEMPLATES } from '../src/shared/refundPolicy';
import type { EventConfig } from '../src/shared/schema';
import { validateConfig } from '../src/shared/validation';
import { testApp } from './support/db';
import { publishReviewed } from './support/publish';

// Refund and credit rules set by the organizer from templates (product.md "Event and race cancellation").

describe('nominal refund policy amounts', () => {
  it.each([['2027-03-25', 100, 1001], ['2027-03-26', 50, 501], ['2027-04-17', 50, 501], ['2027-04-18', 0, 0]])('uses inclusive tier deadlines on %s', (date, percent, amountCents) => {
    expect(refundPolicyEntitlement(REFUND_TEMPLATES.tiered.rules, '2027-04-24', date, 1001, 'withdrawal')).toEqual({ returnAs: 'cash', percent, amountCents });
  });
  it('keeps cancellation separate from withdrawal deadlines and never combines cash with credit', () => {
    for (const [organizerCancellation, returnAs] of [['full_refund', 'cash'], ['credit', 'credit'], ['rider_choice', 'rider_choice']] as const) {
      expect(refundPolicyEntitlement({ ...REFUND_TEMPLATES.tiered.rules, organizerCancellation }, '2027-04-24', '2027-05-01', 1001, 'organizer_cancellation')).toEqual({ returnAs, percent: 100, amountCents: 1001 });
    }
    expect(refundPolicyEntitlement(null, '2027-04-24', '2027-03-01', 1001, 'withdrawal')).toBeNull();
    expect(refundPolicyEntitlement(REFUND_TEMPLATES.credit_only.rules, '2027-04-24', '2027-04-24', 1001, 'withdrawal')).toEqual({ returnAs: 'credit', percent: 100, amountCents: 1001 });
  });
});

describe('refund rule templates', () => {
  it('describe the tiered template with dates counted back from the first race day', () => {
    expect(describeRefundRules(REFUND_TEMPLATES.tiered.rules, '2027-04-24')).toEqual([
      'Withdraw on or before Thursday, March 25, 2027 (30 days before the first race day): 100% of the entry amount back as a refund.',
      'Withdraw after Thursday, March 25, 2027 (30 days before the first race day) and on or before Saturday, April 17, 2027 (7 days before the first race day): 50% of the entry amount back as a refund.',
      'After Saturday, April 17, 2027 (7 days before the first race day): nothing back.',
      'Fees are not returned.',
      'If the organizer cancels your race: a full refund of the entry amount.',
    ]);
  });

  it('describe credit only, and order steps by deadline whatever order they were entered in', () => {
    expect(describeRefundRules(REFUND_TEMPLATES.credit_only.rules, '2027-04-24')[0]).toBe(
      'Withdraw on or before the first race day (Saturday, April 24, 2027): 100% of the entry amount as credit toward a later event by the same organizer.',
    );
    const shuffled = { ...REFUND_TEMPLATES.tiered.rules, tiers: [...REFUND_TEMPLATES.tiered.rules.tiers].reverse(), organizerCancellation: 'rider_choice' as const };
    const lines = describeRefundRules(shuffled, '2027-04-24');
    expect(lines[0]).toContain('30 days');
    expect(lines.at(-1)).toBe('If the organizer cancels your race: your choice of a full refund or credit for the full entry amount.');
  });

  it('put the organizer notes after the rules, using the earliest race day', () => {
    const config = { registration: { refundRules: REFUND_TEMPLATES.full_until_deadline.rules, refundPolicy: ' Transfers are free. ' }, days: [{ date: '2027-04-25' }, { date: '2027-04-24' }] };
    const lines = refundPolicyLines(config);
    expect(lines[0]).toContain('Saturday, April 10, 2027 (14 days before');
    expect(lines.at(-1)).toBe('Transfers are free.');
    expect(refundPolicyLines({ ...config, registration: { refundRules: null, refundPolicy: '' } })).toEqual([]);
  });
});

describe('refund rules in an event', () => {
  it('block publishing when two steps share a deadline, and warn only when there is no policy at all', async () => {
    const { app } = await testApp();
    const { eventId } = (await app.inject({ method: 'POST', url: '/api/demo' })).json() as { eventId: string };
    const { config } = (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json() as { config: EventConfig };
    const keys = (c: EventConfig) => validateConfig(c).filter((i) => i.key.startsWith('event.refund')).map((i) => `${i.level}:${i.key}`);
    expect(keys(config)).toEqual([]);
    const dup = { ...config, registration: { ...config.registration, refundRules: { ...REFUND_TEMPLATES.tiered.rules, tiers: [{ daysBefore: 7, percent: 100 }, { daysBefore: 7, percent: 50 }] } } };
    expect(keys(dup)).toEqual(['error:event.refund-steps']);
    expect(keys({ ...config, registration: { ...config.registration, refundRules: null, refundPolicy: '' } })).toEqual(['warning:event.refund']);
  });

  it('keep the rules a rider bought under after the organizer changes and republishes them', async () => {
    const { app } = await testApp({ now: () => new Date('2027-03-01T18:00:00Z') });
    const { eventId } = (await app.inject({ method: 'POST', url: '/api/demo' })).json() as { eventId: string };
    await publishReviewed(app, `/api/events/${eventId}`, { acknowledgeWarnings: true });
    const event = (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json() as { config: EventConfig; revision: number };
    const cat = event.config.categories.find((c) => c.timingCode === 'RR-M35-34')!.id;
    const rider = { firstName: 'Pat', lastName: 'Demo', email: 'pat.demo@example.test', team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Robin Contact', phone: '555-555-0199' } };
    const waiver = { version: event.config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Pat Demo', signerRole: 'rider' };
    const order = (await app.inject({ method: 'POST', url: `/api/rider/events/${eventId}/orders`, payload: { clientRequestId: 'refund-rules-0001', categoryIds: [cat], rider, waiver } })).json() as { id: string; refundPolicy: string[] };
    expect(order.refundPolicy[0]).toContain('100% of the entry amount back as a refund');

    const changed = { ...event.config, registration: { ...event.config.registration, refundRules: REFUND_TEMPLATES.credit_only.rules } };
    expect((await app.inject({ method: 'PUT', url: `/api/events/${eventId}/config`, payload: { revision: event.revision, config: changed } })).statusCode).toBe(200);
    expect((await publishReviewed(app, `/api/events/${eventId}`, { acknowledgeWarnings: true })).statusCode).toBe(200);

    const after = (await app.inject({ method: 'GET', url: `/api/orders/${order.id}` })).json() as { refundPolicy: string[] };
    expect(after.refundPolicy).toEqual(order.refundPolicy);
  });
});
