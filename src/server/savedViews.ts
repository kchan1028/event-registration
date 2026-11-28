import { z } from 'zod';
import { newId } from '../shared/factory';
import { isFilterActive, type RegistrationFilter } from '../shared/registrationFilters';
import type { Db } from './db';
import { HttpError } from './repo';

/**
 * Named Registrations views (product.md "Participant management"). Each view is private to one organizer account and
 * one event, and stores only the entry filters: never search text, which can hold a rider's email or check-in code.
 * Loading a view grants nothing; the caller's current access to the event is checked on every request.
 */

export const savedViewFilterSchema = z.object({
  dayId: z.string().min(1).max(64).optional(),
  categoryId: z.string().min(1).max(64).optional(),
  entryStatus: z.enum(['active', 'withdrawn', 'cancelled']).optional(),
  missingWaiver: z.literal(true).optional(),
}).strict().refine(isFilterActive, 'Choose at least one filter to save a view.');

export interface SavedView {
  id: string;
  name: string;
  filter: RegistrationFilter;
  createdAt: string;
}

const MAX_VIEWS_PER_EVENT = 20;

type Row = { id: string; name: string; filter_json: RegistrationFilter; created_at: string };
const toView = (r: Row): SavedView => ({ id: r.id, name: r.name, filter: r.filter_json, createdAt: new Date(r.created_at).toISOString() });

export function createSavedViews(db: Db, clock: () => Date) {
  async function list(eventId: string, accountId: string): Promise<SavedView[]> {
    const rows = await db.all<Row>(
      `SELECT id, name, filter_json, created_at FROM saved_registration_views WHERE event_id = $1 AND account_id = $2 ORDER BY lower(name), id`,
      [eventId, accountId],
    );
    return rows.map(toView);
  }

  return {
    list,

    /**
     * Saves the view under a name; saving the same name again replaces that view's filters. Returns the saved view's id
     * with the updated list, so the screen can select it without matching names.
     */
    async save(eventId: string, accountId: string, name: string, filter: RegistrationFilter): Promise<{ savedId: string; views: SavedView[] }> {
      const savedId = await db.transaction(async () => {
        await db.lock(`saved-views:${eventId}:${accountId}`);
        const existing = await db.get<{ id: string }>(
          `SELECT id FROM saved_registration_views WHERE event_id = $1 AND account_id = $2 AND lower(name) = lower($3)`, [eventId, accountId, name],
        );
        if (existing) {
          await db.run(`UPDATE saved_registration_views SET filter_json = $2, name = $3 WHERE id = $1`, [existing.id, JSON.stringify(filter), name]);
          return existing.id;
        }
        const count = (await db.get<{ n: number }>(`SELECT count(*)::int AS n FROM saved_registration_views WHERE event_id = $1 AND account_id = $2`, [eventId, accountId]))!.n;
        if (count >= MAX_VIEWS_PER_EVENT) throw new HttpError(409, `You can save up to ${MAX_VIEWS_PER_EVENT} views for an event. Delete one first.`);
        const id = newId('view');
        await db.run(
          `INSERT INTO saved_registration_views (id, event_id, account_id, name, filter_json, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, eventId, accountId, name, JSON.stringify(filter), clock().toISOString()],
        );
        return id;
      });
      return { savedId, views: await list(eventId, accountId) };
    },

    async remove(eventId: string, accountId: string, viewId: string): Promise<SavedView[]> {
      // Same lock as save, so a delete cannot land between save finding a view and updating it.
      await db.transaction(async () => {
        await db.lock(`saved-views:${eventId}:${accountId}`);
        const removed = await db.run(`DELETE FROM saved_registration_views WHERE id = $1 AND event_id = $2 AND account_id = $3`, [viewId, eventId, accountId]);
        if (removed === 0) throw new HttpError(404, 'Saved view not found.');
      });
      return list(eventId, accountId);
    },
  };
}
