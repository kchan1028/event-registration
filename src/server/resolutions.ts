import { newId } from '../shared/factory';
import type { ChangeImpact } from '../shared/impact';
import type { Db } from './db';
import type { Orders } from './orders';
import { eventLock, HttpError } from './repo';

/**
 * Resolution workflow for paid entries affected by a published change (product.md "Changes after
 * registration opens": route affected entries to an explicit resolution workflow). Publishing a
 * change that touches paid entries opens one item per entry; the organizer records what happened
 * (kept, transferred, or withdrawn), confirms the rider was told, and adds a note.
 */

type ResolutionOutcome ='kept' | 'transferred' | 'withdrawn';

interface Row {
  id: string;
  event_id: string;
  order_id: string;
  entry_id: string;
  published_version: number;
  details_json: string[];
  status: 'open' | ResolutionOutcome;
  rider_notified: boolean;
  note: string | null;
  created_at: string;
  resolved_at: string | null;
}

export function createResolutions(db: Db, orders: Orders, clock: () => Date) {
  const nowIso = () => clock().toISOString();

  async function list(eventId: string) {
    const rows = await db.all<Row>(`SELECT * FROM entry_resolutions WHERE event_id = $1 ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, created_at, seq`, [eventId]);
    const byId = await orders.getOrders(rows.map((r) => r.order_id));
    const out = [];
    for (const r of rows) {
      const o = byId.get(r.order_id)!; // entry_resolutions.order_id references orders
      const entry = o.entries.find((e) => e.id === r.entry_id);
      out.push({
        id: r.id,
        status: r.status,
        publishedVersion: r.published_version,
        details: r.details_json,
        riderName: `${o.rider.firstName} ${o.rider.lastName}`,
        orderNumber: o.orderNumber,
        orderId: o.id,
        entryId: r.entry_id,
        categoryName: entry?.categoryName ?? 'Removed category',
        entryStatus: entry?.status ?? 'released',
        riderNotified: r.rider_notified,
        note: r.note,
        createdAt: r.created_at,
        resolvedAt: r.resolved_at,
      });
    }
    return out;
  }

  return {
    list,

    /** Open (or refresh) one item per paid entry in each category the published change touched. */
    async record(eventId: string, publishedVersion: number, impact: ChangeImpact) {
      if (impact.categories.length === 0) return 0;
      let n = 0;
      const t = nowIso();
      for (const cat of impact.categories) {
        const inCategory = await db.all<{ id: string; order_id: string }>(
          `SELECT id, order_id FROM order_entries WHERE event_id = $1 AND category_id = $2 AND status = 'confirmed' ORDER BY seq`,
          [eventId, cat.categoryId],
        );
        for (const e of inCategory) {
          const existing = await db.get<{ id: string; details_json: string[] }>(`SELECT id, details_json FROM entry_resolutions WHERE entry_id = $1 AND status = 'open'`, [e.id]);
          if (existing) {
            const prev = existing.details_json;
            await db.run(`UPDATE entry_resolutions SET published_version = $1, details_json = $2 WHERE id = $3`, [
              publishedVersion,
              JSON.stringify([...prev, ...cat.details.filter((d) => !prev.includes(d))]),
              existing.id,
            ]);
          } else {
            await db.run(
              `INSERT INTO entry_resolutions (id, event_id, order_id, entry_id, published_version, details_json, status, rider_notified, note, created_at, resolved_at) VALUES ($1, $2, $3, $4, $5, $6, 'open', false, NULL, $7, NULL)`,
              [newId('res'), eventId, e.order_id, e.id, publishedVersion, JSON.stringify(cat.details), t],
            );
          }
          n++;
        }
      }
      return n;
    },

    /**
     * Record the outcome. The rider must have been told, a note is required, and the outcome must
     * match the entry: "withdrawn" needs a withdrawn entry, "transferred" a transfer logged after the item opened.
     */
    async resolve(eventId: string, id: string, outcome: ResolutionOutcome, riderNotified: boolean, note: string) {
      return db.transaction(async () => {
        // The event lock: the entry cannot be transferred or withdrawn between the checks and the update.
        await db.lock(eventLock(eventId));
        const row = await db.get<Row>(`SELECT * FROM entry_resolutions WHERE id = $1 AND event_id = $2`, [id, eventId]);
        if (!row) throw new HttpError(404, 'That item was not found.');
        if (row.status !== 'open') throw new HttpError(409, 'This item is already resolved.');
        if (!riderNotified) throw new HttpError(422, 'Confirm that the rider was told about the change.');
        const entry = await db.get<{ status: string }>(`SELECT status FROM order_entries WHERE id = $1`, [row.entry_id]);
        if (outcome === 'withdrawn' && entry?.status !== 'withdrawn') throw new HttpError(409, 'Withdraw the entry first (Withdraw on the order below), then record it here.');
        if (outcome === 'transferred') {
          const moved = await db.get<{ n: number }>(`SELECT COUNT(*)::int AS n FROM entry_changes WHERE entry_id = $1 AND kind = 'transfer' AND created_at >= $2`, [row.entry_id, row.created_at]);
          if (!moved?.n) throw new HttpError(409, 'Transfer the entry first (Transfer on the order below), then record it here.');
        }
        if (outcome === 'kept' && entry?.status !== 'confirmed') throw new HttpError(409, 'This entry is no longer active, so it cannot be kept as it is.');
        await db.run(`UPDATE entry_resolutions SET status = $1, rider_notified = true, note = $2, resolved_at = $3 WHERE id = $4`, [outcome, note, nowIso(), id]);
        return list(eventId);
      });
    },
  };
}
