import { pairKey, suggestMatches, type MatchSuggestion } from '../shared/riderIdentity';
import type { Db } from './db';
import type { Orders, OrderView } from './orders';
import { HttpError } from './repo';

/**
 * Organizer-confirmed rider identity across orders (policy in shared/riderIdentity.ts).
 * Linked orders share a rider key: the earliest order in the group. Check-in and start
 * lists use the key, so a linked rider has one card, one bib, and one rider ID.
 */
export function createIdentity(db: Db, orders: Orders, clock: () => Date) {
  const nowIso = () => clock().toISOString();

  /** order ID -> rider key for every linked order in the event. Unlinked orders are their own key. */
  function keyMap(eventId: string): Map<string, string> {
    const rows = db.prepare<[string], { order_id: string; rider_key: string }>(`SELECT order_id, rider_key FROM rider_links WHERE event_id = ?`).all(eventId);
    return new Map(rows.map((r) => [r.order_id, r.rider_key]));
  }

  function keyOf(eventId: string): (orderId: string) => string {
    const m = keyMap(eventId);
    return (id) => m.get(id) ?? id;
  }

  /** Every order ID that belongs to the same rider as this key (including the key itself). */
  function groupOf(eventId: string, key: string): string[] {
    const members = db.prepare<[string, string], { order_id: string }>(`SELECT order_id FROM rider_links WHERE event_id = ? AND rider_key = ?`).all(eventId, key).map((r) => r.order_id);
    return [...new Set([key, ...members])];
  }

  function holdsRaceDayState(eventId: string, ids: string[]): boolean {
    const bib = db.prepare<[string, string], { n: number }>(`SELECT COUNT(*) AS n FROM bib_assignments WHERE event_id = ? AND order_id = ? AND released_at IS NULL`);
    const chk = db.prepare<[string, string], { n: number }>(`SELECT COUNT(*) AS n FROM check_ins WHERE event_id = ? AND order_id = ?`);
    return ids.some((id) => (bib.get(eventId, id)?.n ?? 0) > 0 || (chk.get(eventId, id)?.n ?? 0) > 0);
  }

  function liveOrders(eventId: string): OrderView[] {
    return orders.listOrders(eventId).filter((o) => o.status !== 'cancelled' && o.status !== 'expired');
  }

  function label(o: OrderView) {
    return { orderId: o.id, name: `${o.rider.firstName} ${o.rider.lastName}`, orderNumber: o.orderNumber, team: o.rider.team, status: o.status };
  }

  function overview(eventId: string) {
    const live = liveOrders(eventId);
    const byId = new Map(live.map((o) => [o.id, o]));
    const dismissed = new Set(
      db
        .prepare<[string], { order_a: string; order_b: string }>(`SELECT order_a, order_b FROM rider_link_dismissals WHERE event_id = ?`)
        .all(eventId)
        .map((r) => pairKey(r.order_a, r.order_b)),
    );
    const suggestions: (MatchSuggestion & { orders: ReturnType<typeof label>[] })[] = suggestMatches(
      live.map((o) => ({ id: o.id, createdAt: o.createdAt, firstName: o.rider.firstName, lastName: o.rider.lastName, email: o.rider.email ?? '', licenseNumber: o.rider.licenseNumber ?? '' })),
      keyOf(eventId),
      dismissed,
    ).map((s) => ({ ...s, orders: [label(byId.get(s.a)!), label(byId.get(s.b)!)] }));
    const groups = new Map<string, string[]>();
    for (const [orderId, key] of keyMap(eventId)) groups.set(key, [...new Set([...(groups.get(key) ?? [key]), orderId])]);
    return {
      suggestions,
      groups: [...groups].map(([key, ids]) => ({ key, orders: ids.map((id) => byId.get(id)).filter((o): o is OrderView => !!o).map(label) })),
    };
  }

  return {
    keyOf,
    groupOf,
    overview,

    /** Link two orders as one rider. Refused if both already hold a bib or a check-in. */
    link(eventId: string, a: string, b: string) {
      return db
        .transaction(() => {
          const oa = orders.getOrder(a);
          const ob = orders.getOrder(b);
          if (oa.eventId !== eventId || ob.eventId !== eventId) throw new HttpError(404, 'Both orders must belong to this event.');
          const k = keyOf(eventId);
          const ka = k(a);
          const kb = k(b);
          if (ka === kb) return overview(eventId);
          const ga = groupOf(eventId, ka);
          const gb = groupOf(eventId, kb);
          if (holdsRaceDayState(eventId, ga) && holdsRaceDayState(eventId, gb)) {
            throw new HttpError(409, 'Both orders already have a bib or a check-in. Undo one check-in or change one bib first, then link them.');
          }
          // The earliest order becomes the rider key. A bib or check-in held only by the other group moves to the key.
          const created = (id: string) => orders.getOrder(id).createdAt;
          const [key, other] = created(ka) <= created(kb) ? [ka, kb] : [kb, ka];
          const t = nowIso();
          if (holdsRaceDayState(eventId, groupOf(eventId, other))) {
            db.prepare(`UPDATE bib_assignments SET order_id = ? WHERE event_id = ? AND order_id = ?`).run(key, eventId, other);
            db.prepare(`UPDATE check_ins SET order_id = ? WHERE event_id = ? AND order_id = ?`).run(key, eventId, other);
          }
          const upsert = db.prepare(
            `INSERT INTO rider_links (order_id, event_id, rider_key, linked_at) VALUES (?, ?, ?, ?) ON CONFLICT(order_id) DO UPDATE SET rider_key = excluded.rider_key, linked_at = excluded.linked_at`,
          );
          for (const id of [...ga, ...gb]) if (id !== key) upsert.run(id, eventId, key, t);
          db.prepare(`DELETE FROM rider_links WHERE order_id = ?`).run(key);
          return overview(eventId);
        })
        .immediate();
    },

    /** Split a linked rider back into separate orders. Any bib or check-in stays with the earliest order. */
    unlink(eventId: string, orderId: string) {
      const key = keyOf(eventId)(orderId);
      db.prepare(`DELETE FROM rider_links WHERE event_id = ? AND rider_key = ?`).run(eventId, key);
      return overview(eventId);
    },

    /** The organizer says a suggested pair are different riders; don't suggest it again. */
    dismiss(eventId: string, a: string, b: string) {
      const [x, y] = a < b ? [a, b] : [b, a];
      db.prepare(`INSERT OR IGNORE INTO rider_link_dismissals (event_id, order_a, order_b, dismissed_at) VALUES (?, ?, ?, ?)`).run(eventId, x, y, nowIso());
      return overview(eventId);
    },
  };
}

export type Identity = ReturnType<typeof createIdentity>;
