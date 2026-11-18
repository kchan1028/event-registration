import { cancellationClosesCategory, cancellationPlacementChanges, type CancellationSelection, type PublicCancellationStatus } from '../shared/cancellations';
import { eventConfigSchema, type EventConfig } from '../shared/schema';
import type { Db } from './db';
import { HttpError } from './repo';

const records = (db: Db, eventId: string) => db.all<{ selection_json: CancellationSelection; race_ids: string[]; category_ids: string[] }>('SELECT selection_json,race_ids,category_ids FROM cancellation_executions WHERE event_id=$1 ORDER BY executed_at,id', [eventId]);

/** Public projection of committed closure, using the same placement rule as admission. */
export async function publicCancellationStatus(db: Db, eventId: string, config: EventConfig): Promise<PublicCancellationStatus> {
  const closed = await records(db, eventId);
  return {
    scopes: closed.map((r) => r.selection_json),
    categoryIds: config.categories.filter((c) => closed.some((r) => cancellationClosesCategory(r.selection_json, r.race_ids, r.category_ids, config, c.id))).map((c) => c.id),
  };
}

/** Called under the event lock. Frozen identities and current placement both keep a cancelled scope closed. */
export async function cancellationClosed(db: Db, eventId: string, config: EventConfig, categoryIds: string[]): Promise<boolean> {
  return (await records(db, eventId)).some((r) => categoryIds.some((id) => cancellationClosesCategory(r.selection_json, r.race_ids, r.category_ids, config, id)));
}

/** Saving or publishing cannot strand active entries inside a closed scope or move cancelled identities out. */
export async function requireCancellationPlacementUnchanged(db: Db, eventId: string, proposed: EventConfig) {
  const closed = await records(db, eventId);
  if (!closed.length) return;
  const row = await db.get<{ config_json: unknown }>('SELECT v.config_json FROM events e JOIN event_versions v ON v.event_id=e.id AND v.version=e.published_version WHERE e.id=$1', [eventId]);
  if (!row) throw new HttpError(409, 'Reconcile the published cancellation scope before changing placement.');
  const before = eventConfigSchema.parse(row.config_json);
  if (closed.some((r) => cancellationPlacementChanges(r.selection_json, r.race_ids, r.category_ids, before, proposed))) throw new HttpError(409, 'A category or race cannot move into or out of a cancelled scope. Keep its published placement.');
}

export async function requireCancellationOpen(db: Db, eventId: string, config: EventConfig, categoryIds: string[]) {
  if (await cancellationClosed(db, eventId, config, categoryIds)) throw new HttpError(409, 'This event, race or day was cancelled by the organizer. No new entry or offer is allowed.');
}
