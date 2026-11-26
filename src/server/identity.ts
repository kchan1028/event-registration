import { pairKey, suggestMatches, type MatchSuggestion } from '../shared/riderIdentity';
import type { Db } from './db';
import { isLiveOrder, type Orders, type OrderView } from './orders';
import { eventLock, HttpError } from './repo';

/**
 * Organizer-confirmed rider identity across orders (policy in shared/riderIdentity.ts).
 * Linked orders share a rider key: the earliest order in the group. Check-in and start
 * lists use the key, so a linked rider has one card, one bib, and one rider ID.
 */
export function createIdentity(db: Db, orders: Orders, clock: () => Date) {
  const nowIso = () => clock().toISOString();

  /** order ID -> rider key for every linked order in the event. Unlinked orders are their own key. */
  async function keyMap(eventId: string): Promise<Map<string, string>> {
    const rows = await db.all<{ order_id: string; rider_key: string }>(`SELECT order_id, rider_key FROM rider_links WHERE event_id = $1 ORDER BY linked_at, order_id`, [eventId]);
    return new Map(rows.map((r) => [r.order_id, r.rider_key]));
  }

  async function keyOf(eventId: string): Promise<(orderId: string) => string> {
    const m = await keyMap(eventId);
    return (id) => m.get(id) ?? id;
  }

  /** Every order ID that belongs to the same rider as this key (including the key itself). */
  async function groupOf(eventId: string, key: string): Promise<string[]> {
    const members = (await db.all<{ order_id: string }>(`SELECT order_id FROM rider_links WHERE event_id = $1 AND rider_key = $2 ORDER BY linked_at, order_id`, [eventId, key])).map(
      (r) => r.order_id,
    );
    return [...new Set([key, ...members])];
  }

  async function holdsRaceDayState(eventId: string, ids: string[]): Promise<boolean> {
    for (const id of ids) {
      const bib = await db.get<{ n: number }>(`SELECT COUNT(*)::int AS n FROM bib_assignments WHERE event_id = $1 AND order_id = $2 AND released_at IS NULL`, [eventId, id]);
      const chk = await db.get<{ n: number }>(`SELECT COUNT(*)::int AS n FROM check_ins WHERE event_id = $1 AND order_id = $2`, [eventId, id]);
      if ((bib?.n ?? 0) > 0 || (chk?.n ?? 0) > 0) return true;
    }
    return false;
  }

  async function liveOrders(eventId: string): Promise<OrderView[]> {
    return (await orders.listOrders(eventId)).filter(isLiveOrder);
  }

  function label(o: OrderView) {
    return { orderId: o.id, name: `${o.rider.firstName} ${o.rider.lastName}`, orderNumber: o.orderNumber, team: o.rider.team, status: o.status };
  }

  async function overview(eventId: string) {
    const live = await liveOrders(eventId);
    const byId = new Map(live.map((o) => [o.id, o]));
    const dismissed = new Set(
      (await db.all<{ order_a: string; order_b: string }>(`SELECT order_a, order_b FROM rider_link_dismissals WHERE event_id = $1`, [eventId])).map((r) => pairKey(r.order_a, r.order_b)),
    );
    const suggestions: (MatchSuggestion & { orders: ReturnType<typeof label>[] })[] = suggestMatches(
      live.map((o) => ({ id: o.id, createdAt: o.createdAt, firstName: o.rider.firstName, lastName: o.rider.lastName, email: o.rider.email ?? '', licenseNumber: o.rider.licenseNumber ?? '' })),
      await keyOf(eventId),
      dismissed,
    ).map((s) => ({ ...s, orders: [label(byId.get(s.a)!), label(byId.get(s.b)!)] }));
    const groups = new Map<string, string[]>();
    for (const [orderId, key] of await keyMap(eventId)) groups.set(key, [...new Set([...(groups.get(key) ?? [key]), orderId])]);
    return {
      suggestions,
      groups: [...groups].map(([key, ids]) => ({ key, orders: ids.map((id) => byId.get(id)).filter((o): o is OrderView => !!o).map(label) })),
    };
  }

  return {
    /**
     * Reuse existing junior profiles and explicit same-rider links within an event.
     * A checkout can be placed on someone else's behalf, so the purchaser alone
     * does not establish adult rider identity.
     */
    async participantGroups(eventId: string) {
      return db.all<{ orderIds: string[] }>(
        `WITH participant_orders AS (
           SELECT o.id, o.seq, CASE
             WHEN o.junior_profile_id IS NOT NULL THEN 'junior:' || o.junior_profile_id
             ELSE 'order:' || COALESCE(l.rider_key, o.id) END AS participant_key
           FROM orders o
           LEFT JOIN rider_links l ON l.order_id = o.id AND l.event_id = o.event_id
           WHERE o.event_id = $1 AND o.status = 'confirmed'
         )
         SELECT array_agg(id ORDER BY seq, id) AS "orderIds"
         FROM participant_orders
         GROUP BY participant_key
         ORDER BY min(seq), min(id)`,
        [eventId],
      );
    },

    keyOf,
    groupOf,
    overview,

    /** Link two orders as one rider. Refused if both already hold a bib or a check-in. */
    async link(eventId: string, a: string, b: string) {
      return db.transaction(async () => {
        await db.lock(eventLock(eventId));
        const oa = await orders.getOrder(a);
        const ob = await orders.getOrder(b);
        if (oa.eventId !== eventId || ob.eventId !== eventId) throw new HttpError(404, 'Both orders must belong to this event.');
        const k = await keyOf(eventId);
        const ka = k(a);
        const kb = k(b);
        if (ka === kb) return overview(eventId);
        const ga = await groupOf(eventId, ka);
        const gb = await groupOf(eventId, kb);
        if ((await holdsRaceDayState(eventId, ga)) && (await holdsRaceDayState(eventId, gb))) {
          throw new HttpError(409, 'Both orders already have a bib or a check-in. Undo one check-in or change one bib first, then link them.');
        }
        // The earliest order becomes the rider key. A bib or check-in held only by the other group moves to the key.
        const created = async (id: string) => (await orders.getOrder(id)).createdAt;
        const [key, other] = (await created(ka)) <= (await created(kb)) ? [ka, kb] : [kb, ka];
        const t = nowIso();
        if (await holdsRaceDayState(eventId, await groupOf(eventId, other))) {
          await db.run(`UPDATE bib_assignments SET order_id = $1 WHERE event_id = $2 AND order_id = $3`, [key, eventId, other]);
          await db.run(`UPDATE check_ins SET order_id = $1 WHERE event_id = $2 AND order_id = $3`, [key, eventId, other]);
        }
        for (const id of [...ga, ...gb]) {
          if (id === key) continue;
          await db.run(
            `INSERT INTO rider_links (order_id, event_id, rider_key, linked_at) VALUES ($1, $2, $3, $4) ON CONFLICT (order_id) DO UPDATE SET rider_key = excluded.rider_key, linked_at = excluded.linked_at`,
            [id, eventId, key, t],
          );
        }
        await db.run(`DELETE FROM rider_links WHERE order_id = $1`, [key]);
        return overview(eventId);
      });
    },

    /** Split a linked rider back into separate orders. Any bib or check-in stays with the earliest order. */
    async unlink(eventId: string, orderId: string) {
      return db.transaction(async () => {
        await db.lock(eventLock(eventId));
        const key = (await keyOf(eventId))(orderId);
        await db.run(`DELETE FROM rider_links WHERE event_id = $1 AND rider_key = $2`, [eventId, key]);
        return overview(eventId);
      });
    },

    /** The organizer says a suggested pair are different riders; don't suggest it again. */
    async dismiss(eventId: string, a: string, b: string) {
      const [x, y] = a < b ? [a, b] : [b, a];
      await db.run(`INSERT INTO rider_link_dismissals (event_id, order_a, order_b, dismissed_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`, [eventId, x, y, nowIso()]);
      return overview(eventId);
    },
  };
}

export type Identity = ReturnType<typeof createIdentity>;
