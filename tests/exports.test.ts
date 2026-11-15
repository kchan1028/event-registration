import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/server/app';
import { parseCsv } from '../src/shared/csv';
import type { EventConfig } from '../src/shared/schema';

/* Organizer exports: entries and a simulated ledger, from the database. */

const RIDER = { firstName: 'Pat', lastName: 'Demo', email: 'pat.demo@example.test', phone: '555-555-0142', team: '=HYPERLINK("x")', racingAge: 40, licenseCategory: '3', licenseType: 'annual', licenseNumber: 'DEMO-900', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Robin Contact', phone: '555-555-0199' } };

async function setup() {
  const { app } = buildApp({ dbPath: ':memory:', now: () => new Date('2027-03-01T18:00:00Z'), holdMinutes: 10 });
  const { eventId } = (await app.inject({ method: 'POST', url: '/api/demo' })).json() as { eventId: string };
  await app.inject({ method: 'POST', url: `/api/events/${eventId}/publish`, payload: { acknowledgeWarnings: true } });
  const ev = (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json() as { config: EventConfig };
  const code = (c: string) => ev.config.categories.find((x) => x.timingCode === c)!.id;
  const waiver = { version: ev.config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Pat Demo', signerRole: 'rider' };
  let n = 0;
  const buy = async (codes: string[], pay = true) => {
    const created = await app.inject({ method: 'POST', url: `/api/public/events/${eventId}/orders`, payload: { clientRequestId: `export-${++n}-xxxxxx`, categoryIds: codes.map(code), rider: RIDER, waiver } });
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
    expect(kinds).toEqual(expect.arrayContaining(['entry', 'discount', 'fee', 'order_total', 'transfer_difference', 'withdrawal']));
    const orderNumbers = new Set(data.map((r) => r[col('order_number')]));
    expect(orderNumbers.size).toBe(1);
    const lines = data.filter((r) => ['entry', 'discount', 'fee'].includes(r[col('kind')]));
    const total = data.find((r) => r[col('kind')] === 'order_total')!;
    const sum = lines.reduce((t, r) => t + Math.round(Number(r[col('amount')]) * 100), 0);
    expect(sum).toBe(Math.round(Number(total[col('amount')]) * 100));
    const transfer = data.find((r) => r[col('kind')] === 'transfer_difference')!;
    expect(transfer[col('note')]).toContain('not settled');
    expect(data.find((r) => r[col('kind')] === 'withdrawal')![col('note')]).toContain('settled outside the app');
  });
});
