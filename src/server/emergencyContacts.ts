import type { RiderDetails } from '../shared/checkout';
import { newId } from '../shared/factory';
import type { Db } from './db';
import { HttpError } from './repo';

const NOT_IN_EVENT = 'No registration with that id in this event.';
const MISSING = 'This registration has no emergency contact on file.';

/**
 * A deliberate lookup of one registration's emergency contact.
 * The audit row stores who looked, which event and order, and when.
 * It does not store the contact name or phone.
 */
export function createEmergencyContacts(db: Db, clock: () => Date) {
  return {
    async view(eventId: string, actorId: string, target: { orderId: string } | { entryId: string }) {
      const row = 'orderId' in target
        ? await db.get<{ id: string; rider_json: RiderDetails }>(
          `SELECT id, rider_json FROM orders WHERE id = $1 AND event_id = $2`,
          [target.orderId, eventId],
        )
        : await db.get<{ id: string; rider_json: RiderDetails }>(
          `SELECT o.id, o.rider_json
             FROM order_entries e
             JOIN orders o ON o.id = e.order_id
            WHERE e.id = $1 AND o.event_id = $2`,
          [target.entryId, eventId],
        );
      if (!row) throw new HttpError(404, NOT_IN_EVENT);
      const name = row.rider_json.emergencyContact?.name?.trim() ?? '';
      const phone = row.rider_json.emergencyContact?.phone?.trim() ?? '';
      if (!name || !phone) throw new HttpError(404, MISSING);
      await db.run(
        `INSERT INTO emergency_contact_views (id, actor_account_id, event_id, order_id, viewed_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [newId('ecv'), actorId, eventId, row.id, clock().toISOString()],
      );
      return { name, phone };
    },
  };
}

export type EmergencyContacts = ReturnType<typeof createEmergencyContacts>;
