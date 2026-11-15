import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/server/app';
import type { EventConfig } from '../src/shared/schema';

/* Resolution workflow for paid entries affected by a published change. */

const RIDER = { firstName: 'Pat', lastName: 'Demo', email: 'pat.demo@example.test', team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Demo Contact', phone: '555-555-0199' } };
type Item = { id: string; status: string; details: string[]; riderName: string; entryId: string; riderNotified: boolean; note: string | null };

async function setup() {
  let tick = 0;
  const start = new Date('2027-03-01T18:00:00Z').getTime();
  const { app } = buildApp({ dbPath: ':memory:', now: () => new Date(start + tick++ * 1000), holdMinutes: 10 });
  const { eventId } = (await app.inject({ method: 'POST', url: '/api/demo' })).json() as { eventId: string };
  await app.inject({ method: 'POST', url: `/api/events/${eventId}/publish`, payload: { acknowledgeWarnings: true } });
  const get = async () => (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json() as { config: EventConfig; revision: number };
  const ev = await get();
  const code = (c: string) => ev.config.categories.find((x) => x.timingCode === c)!.id;
  const waiver = { version: ev.config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Pat Demo', signerRole: 'rider' };
  const created = await app.inject({ method: 'POST', url: `/api/public/events/${eventId}/orders`, payload: { clientRequestId: 'resolve-1-xxxxxx', categoryIds: [code('RR-M35-34')], rider: RIDER, waiver } });
  expect(created.statusCode).toBe(201);
  const order = created.json() as { id: string; entries: { id: string }[] };
  expect((await app.inject({ method: 'POST', url: `/api/orders/${order.id}/payment`, payload: { attemptId: 'attempt-resolve-1', outcome: 'success' } })).statusCode).toBe(200);
  const changePrice = async (cents: number) => {
    const cur = await get();
    const config = structuredClone(cur.config);
    config.categories.find((c) => c.id === code('RR-M35-34'))!.pricing.baseCents = cents;
    expect((await app.inject({ method: 'PUT', url: `/api/events/${eventId}/config`, payload: { revision: cur.revision, config } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/publish`, payload: { acknowledgeWarnings: true, acknowledgeImpact: true } })).statusCode).toBe(200);
  };
  const list = async () => (await app.inject({ method: 'GET', url: `/api/events/${eventId}/resolutions` })).json() as Item[];
  const resolve = (id: string, body: Record<string, unknown>) => app.inject({ method: 'POST', url: `/api/events/${eventId}/resolutions/${id}`, payload: body });
  return { app, eventId, code, order, changePrice, list, resolve };
}

describe('change resolution workflow', () => {
  it('opens one item per affected paid entry when the change is published, and refreshes it on a later change', async () => {
    const s = await setup();
    expect(await s.list()).toEqual([]);
    await s.changePrice(6000);
    let items = await s.list();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ status: 'open', riderName: 'Pat Demo', entryId: s.order.entries[0].id, riderNotified: false });
    expect(items[0].details.join(' ')).toContain('Price changed');
    await s.changePrice(6500);
    items = await s.list();
    expect(items).toHaveLength(1); // still one open item for the entry
  });

  it('needs the rider told and a note, and an outcome that matches the entry', async () => {
    const s = await setup();
    await s.changePrice(6000);
    const [item] = await s.list();
    expect((await s.resolve(item.id, { outcome: 'kept', riderNotified: false, note: 'Rider is fine' })).statusCode).toBe(422);
    expect((await s.resolve(item.id, { outcome: 'kept', riderNotified: true, note: '' })).statusCode).toBe(400);
    expect((await s.resolve(item.id, { outcome: 'withdrawn', riderNotified: true, note: 'Rider withdrew' })).statusCode).toBe(409);
    expect((await s.resolve(item.id, { outcome: 'transferred', riderNotified: true, note: 'Moved' })).statusCode).toBe(409);

    const ok = await s.resolve(item.id, { outcome: 'kept', riderNotified: true, note: 'Rider keeps the entry at the price paid' });
    expect(ok.statusCode).toBe(200);
    expect((ok.json() as Item[])[0]).toMatchObject({ status: 'kept', riderNotified: true, note: 'Rider keeps the entry at the price paid' });
    expect((await s.resolve(item.id, { outcome: 'kept', riderNotified: true, note: 'again' })).statusCode).toBe(409);
  });

  it('records a transfer only after it happened on the entry', async () => {
    const s = await setup();
    await s.changePrice(6000);
    const [item] = await s.list();
    expect((await s.app.inject({ method: 'POST', url: `/api/order-entries/${item.entryId}/transfer`, payload: { toCategoryId: s.code('RR-D23'), reason: 'Prefers the domestic field' } })).statusCode).toBe(200);
    expect((await s.resolve(item.id, { outcome: 'transferred', riderNotified: true, note: 'Moved to the domestic field' })).statusCode).toBe(200);
  });
});
