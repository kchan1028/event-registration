import { describe, expect, it } from 'vitest';
import { testApp } from './support/db';
import { parseCsv } from '../src/shared/csv';
import { entriesCsv, ledgerCsv, type ExportOrder } from '../src/shared/exports';
import { eventSummary } from '../src/shared/reports';
import type { EventConfig } from '../src/shared/schema';
import { publishReviewed } from './support/publish';

/* Organizer exports: entries and a ledger (simulated or Stripe test-mode payments, refunds), from the database. */

const RIDER = { firstName: 'Pat', lastName: 'Demo', email: 'pat.demo@example.test', phone: '555-555-0142', team: '=HYPERLINK("x")', racingAge: 40, licenseCategory: '3', licenseType: 'annual', licenseNumber: 'DEMO-900', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Robin Contact', phone: '555-555-0199' } };

async function setup() {
  const { app } = await testApp({ now: () => new Date('2027-03-01T18:00:00Z'), holdMinutes: 10 });
  const { eventId } = (await app.inject({ method: 'POST', url: '/api/demo' })).json() as { eventId: string };
  await publishReviewed(app, `/api/events/${eventId}`, { acknowledgeWarnings: true });
  const ev = (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json() as { config: EventConfig };
  const code = (c: string) => ev.config.categories.find((x) => x.timingCode === c)!.id;
  const waiver = { version: ev.config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Pat Demo', signerRole: 'rider' };
  let n = 0;
  const buy = async (codes: string[], pay = true) => {
    const created = await app.inject({ method: 'POST', url: `/api/rider/events/${eventId}/orders`, payload: { clientRequestId: `export-${++n}-xxxxxx`, categoryIds: codes.map(code), rider: RIDER, waiver } });
    expect(created.statusCode).toBe(201);
    const order = created.json() as { id: string; entries: { id: string; categoryId: string }[] };
    if (pay) expect((await app.inject({ method: 'POST', url: `/api/orders/${order.id}/payment`, payload: { attemptId: `attempt-${n}-xxxx`, outcome: 'success' } })).statusCode).toBe(200);
    return order;
  };
  const download = async (kind: 'entries.csv' | 'ledger.csv') => {
    const res = await app.inject({ method: 'GET', url: `/api/events/${eventId}/exports/${kind}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('-DEMO.csv');
    return { body: res.body, rows: parseCsv(res.body) };
  };
  return { app, code, buy, download };
}

describe('organizer exports', () => {
  it('exports one row per entry with no contact, emergency, or license-number details, and neutralizes formulas', async () => {
    const s = await setup();
    await s.buy(['RR-M35-34', 'CR-M35-34']);
    await s.buy(['RR-D23'], false); // unpaid hold still listed, with its status
    const { body, rows } = await s.download('entries.csv');
    const [header, ...data] = rows;
    expect(header).toContain('rider_id');
    expect(data).toHaveLength(3);
    const col = (name: string) => header.indexOf(name);
    expect(data.map((r) => r[col('order_status')]).sort()).toEqual(['confirmed', 'confirmed', 'held']);
    expect(data.every((r) => r[col('team')].startsWith("'="))).toBe(true);
    expect(body).not.toMatch(/@example\.test|555-555|Robin Contact|DEMO-900/);
  });

  it('ledger rows add up to each order total and include logged transfers and withdrawals', async () => {
    const s = await setup();
    const order = await s.buy(['RR-M35-34', 'CR-M35-34']);
    const sat = order.entries.find((e) => e.categoryId === s.code('RR-M35-34'))!;
    const sun = order.entries.find((e) => e.categoryId === s.code('CR-M35-34'))!;
    expect((await s.app.inject({ method: 'POST', url: `/api/order-entries/${sat.id}/transfer`, payload: { toCategoryId: s.code('RR-D23'), reason: 'Prefers the domestic field' } })).statusCode).toBe(200);
    expect((await s.app.inject({ method: 'POST', url: `/api/order-entries/${sun.id}/withdraw`, payload: { reason: 'Injured' } })).statusCode).toBe(200);
    await s.buy(['RR-D23'], false); // no money arrived: not in the ledger

    const { rows } = await s.download('ledger.csv');
    const [header, ...data] = rows;
    const col = (name: string) => header.indexOf(name);
    const kinds = data.map((r) => r[col('kind')]);
    // This demo event charges no fees, so there are no fee rows; any fees would be summed below like other lines.
    expect(kinds).toEqual(expect.arrayContaining(['entry', 'discount', 'order_total', 'transfer_difference', 'withdrawal']));
    const orderNumbers = new Set(data.map((r) => r[col('order_number')]));
    expect(orderNumbers.size).toBe(1);
    const lines = data.filter((r) => ['entry', 'discount', 'fee'].includes(r[col('kind')]));
    const total = data.find((r) => r[col('kind')] === 'order_total')!;
    const sum = lines.reduce((t, r) => t + Math.round(Number(r[col('amount')]) * 100), 0);
    expect(sum).toBe(Math.round(Number(total[col('amount')]) * 100));
    const transfer = data.find((r) => r[col('kind')] === 'transfer_difference')!;
    expect(transfer[col('note')]).toContain('not settled');
    expect(data.find((r) => r[col('kind')] === 'withdrawal')![col('note')]).toContain('separate refund row');
  });
});

/* The CSV builders on their own: no database, one fictional order shaped like the server's order view. */

function order(over: Partial<ExportOrder> = {}): ExportOrder {
  const line = (categoryId: string, code: string, name: string, priceCents: number, discountCents = 0) => ({ categoryId, raceId: 'race_1', dayId: 'day_1', code, name, priceCents, dayOfSurcharge: false, discountCents, discountReason: discountCents ? 'Additional race' : null, totalCents: priceCents - discountCents });
  const lines = [line('cat_a', 'RR-A', 'Road race A', 5000), line('cat_b', 'CR-B', 'Criterium B', 4000, 500)];
  return {
    id: 'ord_1',
    orderNumber: 'DEMO-AAAA1111',
    status: 'confirmed',
    createdAt: '2027-03-01T18:00:00.000Z',
    confirmedAt: '2027-03-01T18:01:00.000Z',
    rider: { firstName: 'Pat', lastName: 'Demo', team: 'Sample Velo', racingAge: 40, licenseCategory: '3' },
    waiver: { signatureName: 'Pat Demo' },
    quote: { onDate: '2027-03-01', lines, bundle: null, coupon: null, subtotalCents: 9000, discountCents: 500, entriesTotalCents: 8500, fees: [], totalCents: 8500 },
    totalCents: 8500,
    couponCode: null,
    entries: lines.map((l, i) => ({ id: `ent_${i + 1}`, categoryId: l.categoryId, code: l.code, categoryName: l.name, raceName: 'Race', status: 'confirmed', amountPaidCents: l.totalCents, discountCents: l.discountCents, discountReason: l.discountReason, licenseReviewed: false, changes: [] })),
    answers: [],
    paidWith: 'simulated',
    refunds: [],
    ...over,
  };
}

const table = (csv: string) => {
  const [header, ...data] = parseCsv(csv);
  return data.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
};

describe('entries and ledger CSV builders', () => {
  it('shows what was refunded on each entry, counting only refunds that hold money', () => {
    const refunds: ExportOrder['refunds'] = [
      { entryId: 'ent_1', amountCents: 2000, status: 'succeeded', at: '2027-03-02T10:00:00.000Z' },
      { entryId: 'ent_1', amountCents: 500, status: 'pending', at: '2027-03-02T11:00:00.000Z' },
      { entryId: 'ent_1', amountCents: 900, status: 'failed', at: '2027-03-02T12:00:00.000Z' },
      { entryId: null, amountCents: 100, status: 'succeeded', at: '2027-03-02T13:00:00.000Z' },
    ];
    const rows = table(entriesCsv([order({ refunds })], (id) => id));
    expect(Object.keys(rows[0]).slice(12, 14)).toEqual(['amount_paid', 'refunded']);
    const a = rows.find((r) => r.category_code === 'RR-A')!;
    const b = rows.find((r) => r.category_code === 'CR-B')!;
    expect([a.amount_paid, a.refunded]).toEqual(['50', '25']);
    expect([b.amount_paid, b.refunded]).toEqual(['35', '0']);

    const ledger = table(ledgerCsv([order({ refunds })])).filter((r) => r.kind === 'refund');
    expect(ledger.map((r) => r.amount)).toEqual(['-20', '-5', '', '-1']);
    expect(ledger[2].note).toBe('Refund failed; no money returned');
  });

  it('reports nothing paid for an order that is not confirmed, and keeps it out of the ledger', () => {
    const held = order({ status: 'held', confirmedAt: null, paidWith: null });
    const rows = table(entriesCsv([held], (id) => id));
    expect(rows.map((r) => r.amount_paid)).toEqual(['0', '0']);
    expect(rows.map((r) => r.order_status)).toEqual(['held', 'held']);
    expect(table(ledgerCsv([held]))).toEqual([]);
    // Money arrived but no place was confirmed: in the ledger, but not paid for an entry.
    const late = order({ status: 'needs_attention' });
    expect(table(entriesCsv([late], (id) => id)).map((r) => r.amount_paid)).toEqual(['0', '0']);
    expect(table(ledgerCsv([late])).find((r) => r.kind === 'order_total')!.note).toContain('no place was confirmed');
  });

  it('labels every row of a Stripe test-mode order, including a transfer difference and a refund', () => {
    const o = order({ paidWith: 'stripe_test', refunds: [{ entryId: 'ent_2', amountCents: 1000, status: 'succeeded', at: '2027-03-03T10:00:00.000Z' }] });
    o.entries[0].changes = [{ kind: 'transfer', fromCategoryName: 'Road race A', toCategoryName: 'Road race C', amountPaidCents: 5000, newPriceCents: 6000, differenceCents: 1000, reason: 'Upgraded', at: '2027-03-02T09:00:00.000Z' }];
    o.entries[1].changes = [{ kind: 'transfer', fromCategoryName: 'Criterium B', toCategoryName: 'Criterium D', amountPaidCents: 3500, newPriceCents: 3000, differenceCents: -500, reason: 'Moved down', at: '2027-03-02T09:30:00.000Z' }];
    const rows = table(ledgerCsv([o]));
    expect(rows.map((r) => r.kind)).toEqual(['entry', 'entry', 'discount', 'order_total', 'transfer_difference', 'transfer_difference', 'refund']);
    expect(rows.map((r) => r.amount)).toEqual(['50', '40', '-5', '85', '10', '-5', '-10']);
    const stripe = 'Stripe test mode: no real money moved';
    expect(rows.every((r) => r.note.includes(stripe))).toBe(true);
    expect(rows.some((r) => /simulated/i.test(r.note))).toBe(false);
    expect(rows[4].note).toBe(`Rider owes this amount; not settled in the app. ${stripe}`);
    expect(rows[5].note).toContain('Refund due to the rider');
    expect(rows[6]).toMatchObject({ category_code: 'CR-B', description: 'Refund (succeeded)' });

    const simulated = table(ledgerCsv([order()]));
    expect(simulated.every((r) => r.note === 'Simulated payment: no money moved')).toBe(true);
  });
});

describe('event summary', () => {
  it('adds up to the ledger rows by kind and counts riders once', () => {
    const confirmed = order({
      quote: { ...order().quote, fees: [{ key: 'processing', label: 'Processing fee', cents: 300 }], totalCents: 8800 },
      totalCents: 8800,
      refunds: [
        { entryId: 'ent_1', amountCents: 2000, status: 'succeeded', at: '2027-03-02T10:00:00.000Z' },
        { entryId: 'ent_1', amountCents: 900, status: 'failed', at: '2027-03-02T11:00:00.000Z' },
        { entryId: null, amountCents: 8800, status: 'succeeded', at: '2027-03-02T12:00:00.000Z', duplicateCharge: true },
      ],
    });
    const sameRider = order({ id: 'ord_2', orderNumber: 'DEMO-BBBB2222' });
    const withdrawn = order({ id: 'ord_3', orderNumber: 'DEMO-CCCC3333', entries: order().entries.map((e) => ({ ...e, status: 'withdrawn' })) });
    const late = order({ id: 'ord_4', orderNumber: 'DEMO-DDDD4444', status: 'needs_attention' });
    const held = order({ id: 'ord_5', orderNumber: 'DEMO-EEEE5555', status: 'held', confirmedAt: null, paidWith: null, entries: order().entries.map((e) => ({ ...e, status: 'held' })) });
    const all = [confirmed, sameRider, withdrawn, late, held];
    // ord_2 is linked to ord_1 as the same rider.
    const s = eventSummary(all, (id) => (id === 'ord_2' ? 'ord_1' : id), ['waiting', 'waiting', 'offered', 'expired', 'accepted'], true);

    expect(s.riders).toBe(1);
    expect(s.orders).toEqual({ confirmed: 3, held: 1, paymentFailed: 0, needsAttention: 1 });
    expect(s.entries).toEqual({ confirmed: 4, held: 2, withdrawn: 2, cancelled: 0 });
    // Every paid entry still racing awaits a license review in this fixture; withdrawn and unpaid ones never do.
    expect(s.licenseReviews).toBe(4);
    expect(s.waitlist).toEqual({ waiting: 2, offered: 1, expired: 1, accepted: 1, removed: 0 });
    expect(s.byCategory.map((c) => [c.code, c.entries])).toEqual([
      ['CR-B', 2],
      ['RR-A', 2],
    ]);

    const cents = (kind: string) => table(ledgerCsv(all)).filter((r) => r.kind === kind && r.amount !== '').reduce((t, r) => t + Math.round(Number(r.amount) * 100), 0);
    const m = s.money!;
    expect(m.entryPriceCents).toBe(cents('entry'));
    expect(-m.discountCents).toBe(cents('discount'));
    expect(m.feeCents).toBe(cents('fee'));
    expect(m.receivedCents).toBe(cents('order_total'));
    expect(-(m.refundedCents + m.duplicateChargeRefundedCents)).toBe(cents('refund'));
    expect(m).toMatchObject({ refundedCents: 2000, duplicateChargeRefundedCents: 8800, netCents: m.receivedCents - 2000, needsAttention: { orders: 1, cents: 8500 } });

    expect(eventSummary(all, (id) => id, [], false).money).toBeNull();
  });
});
