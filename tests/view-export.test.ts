import { describe, expect, it } from 'vitest';
import { openDb } from '../src/server/db';
import { parseCsv } from '../src/shared/csv';
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

    // A search narrows the same way; nothing matching gives a header-only file.
    const none = await app.inject({ url: `${url}?q=${encodeURIComponent('nobody-matches-this-fictional-search')}` });
    expect(parseCsv(none.body)).toEqual([header]);
    expect((await app.inject({ url: `${url}?entryStatus=bogus` })).statusCode).toBe(400);
    // Other exports neither read nor validate the view parameters.
    expect((await app.inject({ url: `/api/events/${eventId}/exports/ledger.csv?entryStatus=bogus` })).statusCode).toBe(200);

    // Each download is audited as an entries export.
    const db = openDb(databaseUrl);
    try {
      expect((await db.all<{ export_kind: string }>(`SELECT export_kind FROM protected_export_audit WHERE event_id = $1`, [eventId])).map((r) => r.export_kind))
        .toEqual(['entries', 'entries', 'entries', 'ledger']);
    } finally {
      await db.close();
    }

    // A role without entries export cannot use the view either.
    const volunteer = 'view.volunteer@example.test';
    expect((await app.inject({ method: 'POST', url: `/api/organizations/${organizationId}/members`, payload: { email: volunteer, role: 'check_in_volunteer' } })).statusCode).toBeLessThan(300);
    expect((await app.inject({ url: `${url}?dayId=${sunday.id}`, headers: as(volunteer) })).statusCode).toBe(403);
  });
});
