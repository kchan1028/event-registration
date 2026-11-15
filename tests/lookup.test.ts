import { describe, expect, it } from 'vitest';
import { testApp } from './support/db';
import { applyCorrection, matchesRegistration, normalizeText } from '../src/shared/lookup';
import type { RiderDetails } from '../src/shared/checkout';
import type { EventConfig } from '../src/shared/schema';

/* Registration lookup and manual corrections (product.md 4, Organizer workspace). */

const reg = {
  orderNumber: 'DEMO-AB12CD34',
  checkInCode: 'K7M2P-Q9R4T',
  rider: { firstName: 'José', lastName: 'Van der Berg', email: 'Jose.VDB@example.test', team: 'Sample Velo', guardian: null },
};

describe('matching a registration', () => {
  it('finds by name words in any order, ignoring case and accents', () => {
    expect(matchesRegistration(reg, 'jose')).toBe(true);
    expect(matchesRegistration(reg, 'berg JOSÉ')).toBe(true);
    expect(matchesRegistration(reg, 'van  der')).toBe(true);
    expect(matchesRegistration(reg, 'maria')).toBe(false);
  });

  it('finds by email, team, order number with or without the prefix, and check-in code without the hyphen', () => {
    expect(matchesRegistration(reg, 'jose.vdb@')).toBe(true);
    expect(matchesRegistration(reg, 'sample velo')).toBe(true);
    expect(matchesRegistration(reg, 'demo-ab12cd34')).toBe(true);
    expect(matchesRegistration(reg, 'AB12CD34')).toBe(true);
    expect(matchesRegistration(reg, 'k7m2pq9r4t')).toBe(true);
    expect(matchesRegistration(reg, 'K7M2P-Q9R4T')).toBe(true);
  });

  it('needs at least four characters to match by code, so short noise does not match everything', () => {
    expect(matchesRegistration(reg, 'D3')).toBe(false);
    expect(matchesRegistration(reg, 'demo')).toBe(false); // every order number starts with DEMO-
    expect(matchesRegistration(reg, 'DEMO-')).toBe(false);
    expect(matchesRegistration(reg, '')).toBe(true);
    expect(matchesRegistration({ ...reg, checkInCode: null }, 'K7M2P')).toBe(false);
  });

  it('finds a junior by the guardian name and email', () => {
    const junior = { ...reg, rider: { ...reg.rider, email: '', guardian: { name: 'Jordan Parent', email: 'jordan.parent@example.test' } } };
    expect(matchesRegistration(junior, 'jordan')).toBe(true);
    expect(matchesRegistration(junior, 'jordan.parent@')).toBe(true);
  });

  it('normalizes text', () => {
    expect(normalizeText('  Ñandú   RIDER ')).toBe('nandu rider');
  });
});

describe('applying a correction', () => {
  const rider = {
    firstName: 'Pat', lastName: 'Demo', email: 'pat@example.test', phone: '', team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual', licenseNumber: 'DEMO-1',
    competitionClass: 'men', collegiateDivision: null, demoRiderId: null, emergencyContact: { name: 'Robin', phone: '555-555-0199' }, guardian: null,
  } as RiderDetails;

  it('lists only the fields that change, with before and after, and leaves the original untouched', () => {
    const r = applyCorrection(rider, { lastName: 'Demos', email: 'pat@example.test', emergencyContactPhone: '555-555-0100' });
    expect(r.changes).toEqual([
      { field: 'lastName', label: 'Last name', before: 'Demo', after: 'Demos' },
      { field: 'emergencyContactPhone', label: 'Emergency contact phone', before: '555-555-0199', after: '555-555-0100' },
    ]);
    expect(r.rider.lastName).toBe('Demos');
    expect(r.rider.emergencyContact.phone).toBe('555-555-0100');
    expect(rider.lastName).toBe('Demo');
    expect(rider.emergencyContact.phone).toBe('555-555-0199');
  });

  it('records nothing when nothing changed', () => {
    expect(applyCorrection(rider, { firstName: 'Pat' }).changes).toEqual([]);
  });
});

const RIDER = { firstName: 'Lee', lastName: 'Sample', email: 'lee.sample@example.test', team: 'Demo Wheelers', racingAge: 40, licenseCategory: '3', licenseType: 'annual', licenseNumber: 'DEMO-555', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Robin Contact', phone: '555-555-0199' } };

type Order = {
  id: string;
  orderNumber: string;
  checkInCode: string | null;
  totalCents: number;
  rider: typeof RIDER;
  waiver: { signatureName: string };
  quote: unknown;
  entries: { id: string; licenseReviewed: boolean; amountPaidCents: number }[];
  corrections: { changes: { field: string; before: string; after: string }[]; licenseReviewsCleared: number; reason: string; at: string }[];
};

async function setup() {
  const { app } = await testApp({ now: () => new Date('2027-03-01T18:00:00Z'), holdMinutes: 10 });
  const { eventId } = (await app.inject({ method: 'POST', url: '/api/demo' })).json() as { eventId: string };
  await app.inject({ method: 'POST', url: `/api/events/${eventId}/publish`, payload: { acknowledgeWarnings: true } });
  const ev = (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json() as { config: EventConfig };
  const code = (c: string) => ev.config.categories.find((x) => x.timingCode === c)!.id;
  let n = 0;
  const buy = async (rider: Record<string, unknown>, codes: string[]) => {
    const waiver = { version: ev.config.registration.waiverVersion, read: true, agreed: true, signatureName: `${rider.firstName} ${rider.lastName}`, signerRole: 'rider' };
    const o = (await app.inject({ method: 'POST', url: `/api/public/events/${eventId}/orders`, payload: { clientRequestId: `lookup-${++n}-xxxx`, categoryIds: codes.map(code), rider, waiver } })).json() as Order;
    return (await app.inject({ method: 'POST', url: `/api/orders/${o.id}/payment`, payload: { attemptId: `att-lookup-${n}-xx`, outcome: 'success' } })).json() as Order;
  };
  const search = async (q: string) => ((await app.inject({ method: 'GET', url: `/api/events/${eventId}/orders?q=${encodeURIComponent(q)}` })).json() as Order[]).map((o) => o.rider.lastName);
  const correct = (orderId: string, changes: Record<string, string>, reason: string) => app.inject({ method: 'POST', url: `/api/orders/${orderId}/rider-corrections`, payload: { changes, reason } });
  return { app, eventId, buy, search, correct };
}

describe('registration lookup and corrections API', () => {
  it('searches by name, email, order number, and check-in code', async () => {
    const s = await setup();
    const lee = await s.buy(RIDER, ['RR-M35-34', 'CR-M35-34']);
    await s.buy({ ...RIDER, firstName: 'Kim', lastName: 'Other', email: 'kim.other@example.test', team: '' }, ['RR-D23']);
    expect(await s.search('')).toHaveLength(2);
    expect(await s.search('lee sample')).toEqual(['Sample']);
    expect(await s.search('KIM.OTHER@')).toEqual(['Other']);
    expect(await s.search(lee.orderNumber.toLowerCase())).toEqual(['Sample']);
    expect(await s.search(lee.checkInCode!.replace('-', ''))).toEqual(['Sample']);
    expect(await s.search('nobody')).toEqual([]);
  });

  it('corrects rider details with a reason, keeps every correction, and never changes the price or the signature', async () => {
    const s = await setup();
    const o = await s.buy(RIDER, ['RR-M35-34', 'CR-M35-34']);
    const before = o.totalCents;

    const first = await s.correct(o.id, { lastName: 'Samples', email: 'lee.samples@example.test' }, 'Rider emailed: name misspelled');
    expect(first.statusCode).toBe(200);
    const second = (await s.correct(o.id, { lastName: 'Sample-Jones' }, 'Second fix after a call')).json() as Order;
    expect(second.rider.lastName).toBe('Sample-Jones');
    expect(second.rider.email).toBe('lee.samples@example.test');
    expect(second.totalCents).toBe(before);
    expect(second.quote).toEqual(o.quote);
    expect(second.entries.map((e) => e.amountPaidCents)).toEqual(o.entries.map((e) => e.amountPaidCents));
    expect(second.waiver.signatureName).toBe('Lee Sample');
    expect(second.corrections.map((c) => c.reason)).toEqual(['Rider emailed: name misspelled', 'Second fix after a call']);
    expect(second.corrections[0].changes).toEqual([
      { field: 'lastName', label: 'Last name', before: 'Sample', after: 'Samples' },
      { field: 'email', label: 'Email', before: 'lee.sample@example.test', after: 'lee.samples@example.test' },
    ]);
    expect(second.corrections[1].changes[0]).toMatchObject({ before: 'Samples', after: 'Sample-Jones' });
    // Search follows the corrected details.
    expect(await s.search('sample-jones')).toEqual(['Sample-Jones']);
  });

  it('requires a reason, refuses an empty or invalid correction, and refuses eligibility fields', async () => {
    const s = await setup();
    const o = await s.buy(RIDER, ['RR-M35-34']);
    expect((await s.correct(o.id, { lastName: 'X' }, '')).statusCode).toBe(400);
    const same = await s.correct(o.id, { lastName: 'Sample' }, 'No real change');
    expect(same.statusCode).toBe(422);
    expect(same.json().error).toMatch(/Nothing changed/);
    expect((await s.correct(o.id, { email: 'not-an-email' }, 'Typo fix')).statusCode).toBe(422);
    expect((await s.correct(o.id, { firstName: '' }, 'Typo fix')).statusCode).toBe(422);
    expect((await s.correct(o.id, { racingAge: '19' } as Record<string, string>, 'Age fix')).statusCode).toBe(400);
    expect((await s.correct('ord_missing', { lastName: 'Y' }, 'Typo fix')).statusCode).toBe(404);
    const after = (await s.app.inject({ method: 'GET', url: `/api/orders/${o.id}` })).json() as Order;
    expect(after.corrections).toEqual([]);
  });

  it('a new license number clears earlier license reviews, and the correction records it', async () => {
    const s = await setup();
    const o = await s.buy(RIDER, ['RR-M35-34']);
    await s.app.inject({ method: 'POST', url: `/api/order-entries/${o.entries[0].id}/license-review`, payload: { note: 'License card seen' } });
    const fixedTeam = (await s.correct(o.id, { team: 'New Team' }, 'Changed clubs')).json() as Order;
    expect(fixedTeam.entries[0].licenseReviewed).toBe(true);
    const fixedLicense = (await s.correct(o.id, { licenseNumber: 'DEMO-556' }, 'Number typed wrong')).json() as Order;
    expect(fixedLicense.entries[0].licenseReviewed).toBe(false);
    expect(fixedLicense.corrections[1]).toMatchObject({ licenseReviewsCleared: 1, reason: 'Number typed wrong' });
  });
});
