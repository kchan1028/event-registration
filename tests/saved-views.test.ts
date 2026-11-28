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
    const first = saved.json<{ savedId: string; views: { id: string }[] }>();
    expect(first.views).toEqual([expect.objectContaining({ id: first.savedId, name: 'Withdrawn', filter: { entryStatus: 'withdrawn' } })]);
    // The same name (any case) replaces the filters instead of adding a second view.
    const again = (await app.inject({ method: 'POST', url, payload: { name: 'withdrawn', filter: { entryStatus: 'cancelled', missingWaiver: true } } })).json<{ savedId: string; views: { id: string; filter: unknown }[] }>();
    // Replacing keeps the same view, so the returned id is unchanged.
    expect(again.savedId).toBe(first.savedId);
    const replaced = again.views;
    expect(replaced).toHaveLength(1);
    expect(replaced[0].filter).toEqual({ entryStatus: 'cancelled', missingWaiver: true });

    // Search text is not a filter a view can hold.
    expect((await app.inject({ method: 'POST', url, payload: { name: 'Search', filter: { q: 'rider@example.test' } } })).statusCode).toBe(400);
    // A view keeps a row order, but a sort alone is not a view, and an unknown sort is refused.
    const sorted = (await app.inject({ method: 'POST', url, payload: { name: 'By name', filter: { entryStatus: 'active', sort: 'name' } } })).json<{ views: { name: string; filter: unknown }[] }>();
    expect(sorted.views.find((v) => v.name === 'By name')?.filter).toEqual({ entryStatus: 'active', sort: 'name' });
    expect((await app.inject({ method: 'POST', url, payload: { name: 'Only sort', filter: { sort: 'name' } } })).statusCode).toBe(400);
    // A view keeps its download columns; an unknown column is refused.
    const narrow = (await app.inject({ method: 'POST', url, payload: { name: 'By name', filter: { entryStatus: 'active', sort: 'name', columns: ['last_name', 'category'] } } })).json<{ views: { name: string; filter: unknown }[] }>();
    expect(narrow.views.find((v) => v.name === 'By name')?.filter).toEqual({ entryStatus: 'active', sort: 'name', columns: ['last_name', 'category'] });
    expect((await app.inject({ method: 'POST', url, payload: { name: 'Bad column', filter: { entryStatus: 'active', columns: ['emergency_contact'] } } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url, payload: { name: 'Bad sort', filter: { entryStatus: 'active', sort: 'random' } } })).statusCode).toBe(400);
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

    expect((await app.inject({ method: 'DELETE', url: `${url}/${replaced[0].id}` })).json<{ name: string }[]>().map((v) => v.name)).toEqual(['By name']);
  });
});
