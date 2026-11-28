import { describe, expect, it } from 'vitest';
import { as } from './support/auth';
import { testApp } from './support/db';
import { publishReviewed } from './support/publish';

/* Named Registrations views: private to one account and event, entry filters only, access checked on every request. */

describe('saved registration views', () => {
  it("saves, replaces by name, lists only the caller's own views, and refuses search text and other accounts", async () => {
    const { app } = await testApp();
    const { eventId, organizationId } = (await app.inject({ method: 'POST', url: '/api/demo' })).json<{ eventId: string; organizationId: string }>();
    await publishReviewed(app, `/api/events/${eventId}`, { acknowledgeWarnings: true });
    const url = `/api/events/${eventId}/saved-views`;

    expect((await app.inject({ url })).json()).toEqual([]);
    const saved = await app.inject({ method: 'POST', url, payload: { name: 'Withdrawn', filter: { entryStatus: 'withdrawn' } } });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json()).toEqual([expect.objectContaining({ name: 'Withdrawn', filter: { entryStatus: 'withdrawn' } })]);
    // The same name (any case) replaces the filters instead of adding a second view.
    const replaced = (await app.inject({ method: 'POST', url, payload: { name: 'withdrawn', filter: { entryStatus: 'cancelled', missingWaiver: true } } })).json<{ id: string; filter: unknown }[]>();
    expect(replaced).toHaveLength(1);
    expect(replaced[0].filter).toEqual({ entryStatus: 'cancelled', missingWaiver: true });

    // Search text is not a filter a view can hold.
    expect((await app.inject({ method: 'POST', url, payload: { name: 'Search', filter: { q: 'rider@example.test' } } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url, payload: { name: '', filter: {} } })).statusCode).toBe(400);
    // A view with no filters would show every registration and could not be told apart from no view.
    expect((await app.inject({ method: 'POST', url, payload: { name: 'Everything', filter: {} } })).statusCode).toBe(400);

    // Another manager sees only their own views and cannot delete this one.
    const manager = 'views.manager@example.test';
    expect((await app.inject({ method: 'POST', url: `/api/organizations/${organizationId}/members`, payload: { email: manager, role: 'registration_manager' } })).statusCode).toBeLessThan(300);
    expect((await app.inject({ url, headers: as(manager) })).json()).toEqual([]);
    expect((await app.inject({ method: 'DELETE', url: `${url}/${replaced[0].id}`, headers: as(manager) })).statusCode).toBe(404);
    // Someone with no access to the event gets nothing.
    expect((await app.inject({ url, headers: as('outsider@example.test') })).statusCode).toBe(404);

    expect((await app.inject({ method: 'DELETE', url: `${url}/${replaced[0].id}` })).json()).toEqual([]);
  });
});
