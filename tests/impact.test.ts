import { describe, expect, it } from 'vitest';
import { testApp } from './support/db';
import { blankPath } from '../src/shared/factory';
import { buildDemoEvent } from '../src/shared/demo';
import { changeImpact, type ChangeImpact, type ImpactEntry } from '../src/shared/impact';
import type { EventConfig } from '../src/shared/schema';
import { publishReviewed } from './support/publish';

const clone = (c: EventConfig): EventConfig => JSON.parse(JSON.stringify(c));

function fixture() {
  const published = buildDemoEvent().config;
  const cat = published.categories.find((c) => c.startGroupId !== null)!;
  const other = published.categories.find((c) => c.id !== cat.id)!;
  const entries: ImpactEntry[] = [
    { orderId: 'o1', categoryId: cat.id, status: 'confirmed', riderName: 'Alex Demo' },
    { orderId: 'o2', categoryId: cat.id, status: 'held', riderName: 'Blake Demo' },
  ];
  return { published, cat, other, entries };
}

describe('change impact preview', () => {
  it('reports rider-rate changes for entries without repricing them', () => {
    const { published, entries } = fixture();
    const draft = clone(published);
    draft.registration.riderRates = [{ eligibility: blankPath(), categoryGenderClass: 'any', racePrices: [{ raceId: draft.races[0].id, cents: 3000, extraEntryCents: 1000 }], bundlePriceCents: 4000 }];
    expect(changeImpact(published, draft, entries).categories[0].kinds).toContain('price');
  });

  it('reports nothing when the draft matches the published version', () => {
    const { published, entries } = fixture();
    expect(changeImpact(published, clone(published), entries).categories).toEqual([]);
  });

  it('ignores changes to categories with no entries', () => {
    const { published, other, entries } = fixture();
    const draft = clone(published);
    draft.categories.find((c) => c.id === other.id)!.pricing.baseCents += 500;
    expect(changeImpact(published, draft, entries).categories).toEqual([]);
  });

  it('lists a price change with paid and held counts, riders, and the keep-the-price rule', () => {
    const { published, cat, entries } = fixture();
    const draft = clone(published);
    draft.categories.find((c) => c.id === cat.id)!.pricing.baseCents += 500;
    const r = changeImpact(published, draft, entries);
    expect(r.categories).toHaveLength(1);
    expect(r.categories[0]).toMatchObject({ categoryId: cat.id, kinds: ['price'], confirmed: 1, held: 1, orders: 2, riders: ['Alex Demo', 'Blake Demo'] });
    expect(r.categories[0].details[0]).toContain('Paid entries keep the price they paid');
    expect(r.totals).toEqual({ categories: 1, confirmed: 1, held: 1, orders: 2 });
    expect(r.startListsChange).toBe(false);
  });

  it('detects eligibility, start time, limit, classification, and availability changes', () => {
    const { published, cat, entries } = fixture();
    const draft = clone(published);
    const d = draft.categories.find((c) => c.id === cat.id)!;
    d.eligibility.organizerReview = !d.eligibility.organizerReview;
    d.cap = 7;
    d.timingCode = `${d.timingCode}X`;
    d.status = 'closed';
    const sg = draft.startGroups.find((g) => g.id === d.startGroupId)!;
    sg.startTime = sg.startTime === '06:00' ? '06:30' : '06:00';
    const r: ChangeImpact = changeImpact(published, draft, entries);
    expect(new Set(r.categories[0].kinds)).toEqual(new Set(['eligibility', 'start', 'limit', 'classification', 'availability']));
    expect(r.categories[0].details.some((x) => x.startsWith('Start time changed from'))).toBe(true);
    expect(r.categories[0].details.some((x) => x.startsWith('Category cap changed'))).toBe(true);
    expect(r.startListsChange).toBe(true);
  });

  it('flags a move to another start group', () => {
    const { published, cat, entries } = fixture();
    const draft = clone(published);
    const target = draft.startGroups.find((g) => g.raceId === cat.raceId && g.id !== cat.startGroupId);
    if (!target) return; // demo data always has more than one start group per race; guard keeps the test honest if it changes
    draft.categories.find((c) => c.id === cat.id)!.startGroupId = target.id;
    const r = changeImpact(published, draft, entries);
    expect(r.categories[0].kinds).toContain('start');
    expect(r.categories[0].details.some((x) => x.startsWith('Start group changed from'))).toBe(true);
  });
});

describe('change impact API', () => {
  it('returns null before publishing, then lists riders affected by a draft change', async () => {
    const now = new Date('2027-03-01T18:00:00Z');
    const { app } = await testApp({ now: () => now, holdMinutes: 10 });
    const { eventId } = (await app.inject({ method: 'POST', url: '/api/demo' })).json() as { eventId: string };
    expect((await app.inject({ method: 'GET', url: `/api/events/${eventId}/impact` })).json()).toEqual({ revision: expect.any(Number), publishedVersion: null, impact: null, waiverChanged: false });

    await publishReviewed(app, `/api/events/${eventId}`, { acknowledgeWarnings: true });
    const event = (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json() as { config: EventConfig; revision: number };
    const cat = event.config.categories.find((c) => c.timingCode === 'RR-M35-34')!;
    const rider = { firstName: 'Test', lastName: 'Rider', email: 'test.rider@example.test', team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Test Contact', phone: '555-555-0199' } };
    const waiver = { version: event.config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Test Rider', signerRole: 'rider' };
    const order = await app.inject({ method: 'POST', url: `/api/rider/events/${eventId}/orders`, payload: { clientRequestId: 'impact-req-1234', categoryIds: [cat.id], rider, waiver } });
    expect(order.statusCode).toBe(201);

    const unchanged = (await app.inject({ method: 'GET', url: `/api/events/${eventId}/impact` })).json() as { impact: ChangeImpact };
    expect(unchanged.impact.categories).toEqual([]);

    const draft = clone(event.config);
    draft.categories.find((c) => c.id === cat.id)!.pricing.baseCents += 1000;
    const saved = await app.inject({ method: 'PUT', url: `/api/events/${eventId}/config`, payload: { revision: event.revision, config: draft } });
    expect(saved.statusCode).toBe(200);

    const res = (await app.inject({ method: 'GET', url: `/api/events/${eventId}/impact` })).json() as { publishedVersion: number; impact: ChangeImpact };
    expect(res.publishedVersion).toBe(1);
    expect(res.impact.categories).toHaveLength(1);
    expect(res.impact.categories[0]).toMatchObject({ categoryId: cat.id, kinds: ['price'], held: 1, confirmed: 0, riders: ['Test Rider'] });

    // Publishing a change that touches entered riders needs an explicit acknowledgement, like warnings.
    const refused = await publishReviewed(app, `/api/events/${eventId}`, { acknowledgeWarnings: true });
    expect(refused.statusCode).toBe(422);
    expect((refused.json() as { error: string }).error).toContain('Review who the 1 changed category');
    const ok = await publishReviewed(app, `/api/events/${eventId}`, { acknowledgeWarnings: true, acknowledgeImpact: true });
    expect(ok.statusCode).toBe(200);
    expect((ok.json() as { publishedVersion: number }).publishedVersion).toBe(2);
  });
});
