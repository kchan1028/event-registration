import { describe, expect, it } from 'vitest';
import { openDb } from '../src/server/db';
import { parseCsv } from '../src/shared/csv';
import { sortRegistrations } from '../src/shared/registrationFilters';
import type { EventConfig } from '../src/shared/schema';
import { as } from './support/auth';
import { testApp, testDatabaseUrl } from './support/db';
import { publishReviewed } from './support/publish';

/* The entries export of the Registrations view: same search and entry filters as the screen, same columns and audit. */

describe('entries export of a filtered view', () => {
  it('returns only matching entries, says which filters made it, and is audited like the full export', async () => {
    const databaseUrl = await testDatabaseUrl();
    const { app } = await testApp({ databaseUrl });
    const { eventId, organizationId } = (await app.inject({ method: 'POST', url: '/api/demo' })).json<{ eventId: string; organizationId: string }>();
    await publishReviewed(app, `/api/events/${eventId}`, { acknowledgeWarnings: true });
    expect((await app.inject({ method: 'POST', url: `/api/events/${eventId}/check-in-demo-riders` })).statusCode).toBeLessThan(300);
    const { config } = (await app.inject({ url: `/api/events/${eventId}` })).json<{ config: EventConfig }>();
    const sunday = config.days.find((d) => d.label === 'Sunday')!;
    const url = `/api/events/${eventId}/exports/entries.csv`;

    const full = await app.inject({ url });
    expect(full.statusCode).toBe(200);
    expect(full.headers['x-cyclereg-export-filters']).toBeUndefined();
    const [header, ...allRows] = parseCsv(full.body);

    const viewed = await app.inject({ url: `${url}?dayId=${sunday.id}` });
    expect(viewed.statusCode, viewed.body).toBe(200);
    const [viewHeader, ...rows] = parseCsv(viewed.body);
    // Same columns; fewer rows, because only Sunday's entries are kept.
    expect(viewHeader).toEqual(header);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(allRows.length);
    expect(viewed.headers['x-cyclereg-export-filters']).toBe(`dayId=${sunday.id}`);
    expect(viewed.headers['x-cyclereg-export-generated-at']).toEqual(expect.any(String));
    expect(viewed.headers['content-disposition']).toContain('-filtered');

    // The chosen row order applies to the file and is named with the filters.
    const byName = await app.inject({ url: `${url}?dayId=${sunday.id}&sort=name` });
    expect(byName.headers['x-cyclereg-export-filters']).toBe(`dayId=${sunday.id}&sort=name`);
    const names = parseCsv(byName.body).slice(1).map((r) => [r[header.indexOf('last_name')], r[header.indexOf('first_name')]].join(' ').toLowerCase());
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })));
    expect(names).toHaveLength(rows.length);
    expect((await app.inject({ url: `${url}?sort=bogus` })).statusCode).toBe(400);
    // An explicit newest sort is a view too: newest order, named in the response.
    const newest = await app.inject({ url: `${url}?sort=newest` });
    expect(newest.headers['x-cyclereg-export-filters']).toBe('sort=newest');
    const newestNumbers = parseCsv(newest.body).slice(1).map((r) => r[header.indexOf('order_number')]).filter((n, i, all) => n !== all[i - 1]);
    const listed = (await app.inject({ url: `/api/events/${eventId}/orders` })).json<Parameters<typeof sortRegistrations>[0][number][]>();
    expect(newestNumbers).toEqual(sortRegistrations(listed.filter((o) => newestNumbers.includes(o.orderNumber)), 'newest').map((o) => o.orderNumber));
    // Chosen columns: only those plus the order and rider ids; an unknown column is refused.
    const narrow = await app.inject({ url: `${url}?dayId=${sunday.id}&columns=category,last_name` });
    expect(parseCsv(narrow.body)[0]).toEqual(['order_number', 'rider_id', 'last_name', 'category']);
    expect(narrow.headers['x-cyclereg-export-filters']).toBe(`dayId=${sunday.id}&columns=category%2Clast_name`);
    expect((await app.inject({ url: `${url}?columns=emergency_contact` })).statusCode).toBe(400);
    // A sort alone orders the whole file.
    const byNumber = parseCsv((await app.inject({ url: `${url}?sort=order` })).body).slice(1).map((r) => r[header.indexOf('order_number')]);
    expect(byNumber).toEqual([...byNumber].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })));
    expect(byNumber).toHaveLength(allRows.length);

    // Search text is not accepted in the address, so a search term changes nothing and is not echoed back.
    const searched = await app.inject({ url: `${url}?q=${encodeURIComponent('rider@example.test')}` });
    expect(parseCsv(searched.body)).toEqual(parseCsv(full.body));
    expect(searched.headers['x-cyclereg-export-filters']).toBeUndefined();
    expect((await app.inject({ url: `${url}?entryStatus=bogus` })).statusCode).toBe(400);
    // Other exports neither read nor validate the view parameters.
    expect((await app.inject({ url: `/api/events/${eventId}/exports/ledger.csv?entryStatus=bogus` })).statusCode).toBe(200);

    // Each download is audited as an entries export.
    const db = openDb(databaseUrl);
    try {
      expect((await db.all<{ export_kind: string }>(`SELECT export_kind FROM protected_export_audit WHERE event_id = $1 ORDER BY export_kind`, [eventId])).map((r) => r.export_kind))
        .toEqual(['entries', 'entries', 'entries', 'entries', 'entries', 'entries', 'entries', 'ledger']);
    } finally {
      await db.close();
    }

    // A role without entries export cannot use the view either.
    const volunteer = 'view.volunteer@example.test';
    expect((await app.inject({ method: 'POST', url: `/api/organizations/${organizationId}/members`, payload: { email: volunteer, role: 'check_in_volunteer' } })).statusCode).toBeLessThan(300);
    expect((await app.inject({ url: `${url}?dayId=${sunday.id}`, headers: as(volunteer) })).statusCode).toBe(403);
  });
});
