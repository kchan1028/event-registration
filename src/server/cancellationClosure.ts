import { cancellationClosesCategory, type CancellationSelection } from '../shared/cancellations';
import type { EventConfig } from '../shared/schema';
import type { Db } from './db';
import { HttpError } from './repo';

/** Called under the event lock. Frozen identities and current placement both keep a cancelled scope closed. */
export async function cancellationClosed(db: Db, eventId: string, config: EventConfig, categoryIds: string[]): Promise<boolean> {
  const records = await db.all<{ selection_json: CancellationSelection; race_ids: string[]; category_ids: string[] }>('SELECT selection_json,race_ids,category_ids FROM cancellation_executions WHERE event_id=$1', [eventId]);
  return records.some((r) => categoryIds.some((id) => cancellationClosesCategory(r.selection_json, r.race_ids, r.category_ids, config, id)));
}

export async function requireCancellationOpen(db: Db, eventId: string, config: EventConfig, categoryIds: string[]) {
  if (await cancellationClosed(db, eventId, config, categoryIds)) throw new HttpError(409, 'This event, race or day was cancelled by the organizer. No new entry or offer is allowed.');
}
