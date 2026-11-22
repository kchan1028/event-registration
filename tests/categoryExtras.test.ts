import { describe, expect, it } from 'vitest';
import { testApp } from './support/db';
import { categoryBibRange, checkExtras, orderExtrasSchema, pruneExtras } from '../src/shared/categoryExtras';
import { buildDemoEvent } from '../src/shared/demo';
import type { EventConfig } from '../src/shared/schema';
import { validateConfig } from '../src/shared/validation';

/* Per-category rider questions, waiver addenda, and bib ranges. */

function configured(): { config: EventConfig; catId: string } {
  const config = buildDemoEvent().config;
  const cat = config.categories.find((c) => c.timingCode === 'RR-M35-34')!;
  cat.questions = [
    { id: 'q-club', label: 'Club', required: true, options: [] },
    { id: 'q-size', label: 'Shirt size', required: false, options: ['S', 'M', 'L'] },
  ];
  cat.addendum = { title: 'Masters rules', text: 'Riders agree to the masters gear rules.' };
  cat.bibRange = { first: 500, last: 599 };
  return { config, catId: cat.id };
}

describe('category extras rules', () => {
  it('requires required answers, a listed choice, and every addendum', () => {
    const { config, catId } = configured();
    const fields = checkExtras(config, [catId], { answers: { [catId]: { 'q-size': 'XL' } }, addenda: [] }).map((p) => p.field);
    expect(fields).toEqual([`q-${catId}-q-club`, `q-${catId}-q-size`, `addendum-${catId}`]);
    expect(checkExtras(config, [catId], { answers: { [catId]: { 'q-club': 'Demo Wheelers', 'q-size': 'M' } }, addenda: [catId], acceptedTerms: [{ categoryId: catId, ...config.categories.find((c) => c.id === catId)!.addendum! }] })).toEqual([]);
  });

  it('matches acceptance for any category ID the config allows', () => {
    const { config, catId } = configured();
    const cat = config.categories.find((c) => c.id === catId)!;
    cat.id = '__proto__';
    cat.questions = [];
    const sent = orderExtrasSchema.parse(JSON.parse(JSON.stringify({ addenda: [cat.id], acceptedTerms: [{ categoryId: cat.id, ...cat.addendum }] })));
    expect(checkExtras(config, [cat.id], sent)).toEqual([]);
  });

  it('drops answers for categories not chosen and questions that no longer exist', () => {
    const { config, catId } = configured();
    const out = pruneExtras(config, [catId], { answers: { [catId]: { 'q-club': ' Demo ', 'q-gone': 'x' }, other: { a: 'b' } }, addenda: [catId, 'other'] });
    expect(out).toEqual({ answers: { [catId]: { 'q-club': 'Demo' } }, addenda: [catId] });
  });

  it('uses the intersection of applicable category bib ranges', () => {
    expect(categoryBibRange([{ bibRange: null }, { bibRange: { first: 150, last: 299 } }, { bibRange: { first: 100, last: 199 } }])).toEqual({ first: 150, last: 199 });
    expect(categoryBibRange([{ bibRange: { first: 100, last: 199 } }, { bibRange: { first: 200, last: 299 } }])).toEqual({ first: 200, last: 199 });
    expect(categoryBibRange([{ bibRange: null }])).toBeNull();
  });

  it('validates bib ranges: backwards is an error, overlapping is a warning', () => {
    const { config, catId } = configured();
    const other = config.categories.find((c) => c.id !== catId && c.status !== 'archived')!;
    other.bibRange = { first: 550, last: 650 };
    expect(validateConfig(config).some((i) => i.key.endsWith('.bib-overlap') && i.level === 'warning')).toBe(true);
    config.categories.find((c) => c.id === catId)!.bibRange = { first: 600, last: 500 };
    expect(validateConfig(config).some((i) => i.key === `cat.${catId}.bib-range` && i.level === 'error')).toBe(true);
  });
});

const RIDER = { firstName: 'Pat', lastName: 'Demo', email: 'pat.demo@example.test', team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual', competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Demo Contact', phone: '555-555-0199' } };

describe('category extras API', () => {
  it('enforces questions and addenda at checkout, stores answers, exports them, and issues bibs from the category range', async () => {
    const { app } = await testApp({ now: () => new Date('2027-03-01T18:00:00Z'), holdMinutes: 10 });
    const { eventId } = (await app.inject({ method: 'POST', url: '/api/demo' })).json() as { eventId: string };
    const ev = (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json() as { config: EventConfig; revision: number };
    const config = structuredClone(ev.config);
    const cat = config.categories.find((c) => c.timingCode === 'RR-M35-34')!;
    cat.questions = [{ id: 'q-club', label: 'Club', required: true, options: [] }];
    cat.addendum = { title: 'Masters rules', text: 'Riders agree to the masters gear rules.' };
    cat.bibRange = { first: 500, last: 599 };
    expect((await app.inject({ method: 'PUT', url: `/api/events/${eventId}/config`, payload: { revision: ev.revision, config } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/publish`, payload: { acknowledgeWarnings: true } })).statusCode).toBe(200);
    const waiver = { version: config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Pat Demo', signerRole: 'rider' };
    const order = (extras: Record<string, unknown>, n: number) =>
      app.inject({ method: 'POST', url: `/api/rider/events/${eventId}/orders`, payload: { clientRequestId: `extras-${n}-xxxxxx`, categoryIds: [cat.id], rider: RIDER, waiver, extras } });

    const missing = await order({ answers: {}, addenda: [] }, 1);
    expect(missing.statusCode).toBe(422);
    expect((missing.json() as { error: string }).error).toContain('Club');
    const noAddendum = await order({ answers: { [cat.id]: { 'q-club': 'Demo Wheelers' } }, addenda: [] }, 2);
    expect(noAddendum.statusCode).toBe(422);
    expect((noAddendum.json() as { error: string }).error).toContain('Masters rules');

    const ok = await order({ answers: { [cat.id]: { 'q-club': 'Demo Wheelers' } }, addenda: [cat.id], acceptedTerms: [{ categoryId: cat.id, ...cat.addendum }] }, 3);
    expect(ok.statusCode).toBe(201);
    const created = ok.json() as { id: string; answers: { label: string; answer: string }[]; addenda: { title: string }[]; entries: { id: string }[] };
    expect(created.answers).toEqual([expect.objectContaining({ label: 'Club', answer: 'Demo Wheelers' })]);
    expect(created.addenda).toEqual([expect.objectContaining({ title: 'Masters rules' })]);

    expect((await app.inject({ method: 'POST', url: `/api/orders/${created.id}/payment`, payload: { attemptId: 'attempt-extras-1', outcome: 'success' } })).statusCode).toBe(200);
    for (const e of created.entries) await app.inject({ method: 'POST', url: `/api/order-entries/${e.id}/license-review`, payload: { note: 'License card seen' } });

    const entries = (await app.inject({ method: 'GET', url: `/api/events/${eventId}/exports/entries.csv` })).body;
    expect(entries).toContain('Club: Demo Wheelers');

    // No event or day bib range is set, yet check-in issues a bib from the category's range.
    const list = (await app.inject({ method: 'GET', url: `/api/events/${eventId}/check-in?q=Pat` })).json() as { dayId: string };
    expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/check-in/${created.id}/walk-up`, payload: { dayId: list.dayId, entryId: created.entries[0].id } })).statusCode).toBe(200);
    const checked = await app.inject({ method: 'POST', url: `/api/events/${eventId}/check-in/${created.id}`, payload: { dayId: list.dayId, bib: null } });
    expect(checked.statusCode).toBe(200);
    expect((checked.json() as { bib: number }).bib).toBe(500);
  });

  it.each(['text', 'title'] as const)('binds acceptance to the %s the rider saw, and still replays a committed order', async (part) => {
    const { app } = await testApp({ now: () => new Date('2027-03-01T18:00:00Z'), holdMinutes: 10 });
    const { eventId } = (await app.inject({ method: 'POST', url: '/api/demo' })).json() as { eventId: string };
    const publish = async (change: (cat: EventConfig['categories'][number]) => void) => {
      const { config, revision } = (await app.inject({ method: 'GET', url: `/api/events/${eventId}` })).json() as { config: EventConfig; revision: number };
      const cat = config.categories.find((c) => c.timingCode === 'RR-M35-34')!;
      change(cat);
      expect((await app.inject({ method: 'PUT', url: `/api/events/${eventId}/config`, payload: { revision, config } })).statusCode).toBe(200);
      expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/publish`, payload: { acknowledgeWarnings: true, acknowledgeImpact: true, waiverChangeReason: 'Fictional waiver update' } })).statusCode).toBe(200);
      return { config, cat };
    };
    const { config, cat } = await publish((c) => { c.addendum = { title: 'Masters rules', text: 'Original fictional rules.' }; });
    const waiver = { version: config.registration.waiverVersion, read: true, agreed: true, signatureName: 'Pat Demo', signerRole: 'rider' };
    const order = (clientRequestId: string, extras: Record<string, unknown>, rider = RIDER, signature = waiver) =>
      app.inject({ method: 'POST', url: `/api/rider/events/${eventId}/orders`, payload: { clientRequestId, categoryIds: [cat.id], rider, waiver: signature, extras } });
    const saw = { addenda: [cat.id], acceptedTerms: [{ categoryId: cat.id, ...cat.addendum }] };
    const committed = await order('consent-committed', saw);
    expect(committed.statusCode).toBe(201);

    const { cat: changed } = await publish((c) => { c.addendum![part] += ' Changed.'; });
    const other = { ...RIDER, firstName: 'Sam', email: 'sam.demo@example.test' };
    const signed = { ...waiver, signatureName: 'Sam Demo' };
    const lost = await order('consent-lost-request', saw, other, signed);
    expect(lost.statusCode).toBe(422);
    expect((lost.json() as { error: string }).error).toContain('Read them and accept again');
    // An ID alone says nothing about which text was read.
    expect((await order('consent-id-only', { addenda: [cat.id] }, other, signed)).statusCode).toBe(422);
    const listed = await app.inject({ method: 'GET', url: `/api/events/${eventId}/orders` });
    expect(listed.statusCode).toBe(200);
    expect(listed.body).toContain(RIDER.email);
    expect(listed.body).not.toContain('sam.demo@example.test');

    const replay = await order('consent-committed', saw);
    expect((replay.json() as { id: string }).id).toBe((committed.json() as { id: string }).id);
    expect((await order('consent-renewed', { addenda: [cat.id], acceptedTerms: [{ categoryId: cat.id, ...changed.addendum }] }, other, signed)).statusCode).toBe(201);
  });
});
