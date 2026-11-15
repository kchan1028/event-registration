import { newId } from '../shared/factory';
import type { ChangeImpact } from '../shared/impact';
import type { Db } from './db';
import type { Orders } from './orders';
import { HttpError } from './repo';

/**
 * Resolution workflow for paid entries affected by a published change (product.md "Changes after
 * registration opens": route affected entries to an explicit resolution workflow). Publishing a
 * change that touches paid entries opens one item per entry; the organizer records what happened
 * (kept, transferred, or withdrawn), confirms the rider was told, and adds a note.
 */

export type ResolutionOutcome = 'kept' | 'transferred' | 'withdrawn';

interface Row {
  id: string;
  event_id: string;
  order_id: string;
  entry_id: string;
  published_version: number;
  details_json: string;
  status: 'open' | ResolutionOutcome;
  rider_notified: number;
  note: string | null;
  created_at: string;
  resolved_at: string | null;
}

export function createResolutions(db: Db, orders: Orders, clock: () => Date) {
  const nowIso = () => clock().toISOString();

  function list(eventId: string) {
    const rows = db.prepare<[string], Row>(`SELECT * FROM entry_resolutions WHERE event_id = ? ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, created_at, rowid`).all(eventId);
    return rows.map((r) => {
      const o = orders.getOrder(r.order_id);
      const entry = o.entries.find((e) => e.id === r.entry_id);
      return {
        id: r.id,
        status: r.status,
        publishedVersion: r.published_version,
        details: JSON.parse(r.details_json) as string[],
        riderName: `${o.rider.firstName} ${o.rider.lastName}`,
        orderNumber: o.orderNumber,
        orderId: o.id,
        entryId: r.entry_id,
        categoryName: entry?.categoryName ?? 'Removed category',
        entryStatus: entry?.status ?? 'released',
        riderNotified: r.rider_notified === 1,
        note: r.note,
        createdAt: r.created_at,
        resolvedAt: r.resolved_at,
      };
    });
  }

  return {
    list,

    /** Open (or refresh) one item per paid entry in each category the published change touched. */
    record(eventId: string, publishedVersion: number, impact: ChangeImpact) {
      if (impact.categories.length === 0) return 0;
      const entriesIn = db.prepare<[string, string], { id: string; order_id: string }>(`SELECT id, order_id FROM order_entries WHERE event_id = ? AND category_id = ? AND status = 'confirmed'`);
      const openFor = db.prepare<[string], { id: string; details_json: string }>(`SELECT id, details_json FROM entry_resolutions WHERE entry_id = ? AND status = 'open'`);
      const insert = db.prepare(
        `INSERT INTO entry_resolutions (id, event_id, order_id, entry_id, published_version, details_json, status, rider_notified, note, created_at, resolved_at) VALUES (?, ?, ?, ?, ?, ?, 'open', 0, NULL, ?, NULL)`,
      );
      const refresh = db.prepare(`UPDATE entry_resolutions SET published_version = ?, details_json = ? WHERE id = ?`);
      let n = 0;
      const t = nowIso();
      for (const cat of impact.categories) {
        for (const e of entriesIn.all(eventId, cat.categoryId)) {
          const existing = openFor.get(e.id);
          if (existing) {
            const prev = JSON.parse(existing.details_json) as string[];
            refresh.run(publishedVersion, JSON.stringify([...prev, ...cat.details.filter((d) => !prev.includes(d))]), existing.id);
          } else {
            insert.run(newId('res'), eventId, e.order_id, e.id, publishedVersion, JSON.stringify(cat.details), t);
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
    resolve(eventId: string, id: string, outcome: ResolutionOutcome, riderNotified: boolean, note: string) {
      const row = db.prepare<[string, string], Row>(`SELECT * FROM entry_resolutions WHERE id = ? AND event_id = ?`).get(id, eventId);
      if (!row) throw new HttpError(404, 'That item was not found.');
      if (row.status !== 'open') throw new HttpError(409, 'This item is already resolved.');
      if (!riderNotified) throw new HttpError(422, 'Confirm that the rider was told about the change.');
      const entry = db.prepare<[string], { status: string }>(`SELECT status FROM order_entries WHERE id = ?`).get(row.entry_id);
      if (outcome === 'withdrawn' && entry?.status !== 'withdrawn') throw new HttpError(409, 'Withdraw the entry first (Withdraw on the order below), then record it here.');
      if (outcome === 'transferred') {
        const moved = db.prepare<[string, string], { n: number }>(`SELECT COUNT(*) AS n FROM entry_changes WHERE entry_id = ? AND kind = 'transfer' AND created_at >= ?`).get(row.entry_id, row.created_at);
        if (!moved?.n) throw new HttpError(409, 'Transfer the entry first (Transfer on the order below), then record it here.');
      }
      if (outcome === 'kept' && entry?.status !== 'confirmed') throw new HttpError(409, 'This entry is no longer active, so it cannot be kept as it is.');
      db.prepare(`UPDATE entry_resolutions SET status = ?, rider_notified = 1, note = ?, resolved_at = ? WHERE id = ?`).run(outcome, note, nowIso(), id);
      return list(eventId);
    },
  };
}

export type Resolutions = ReturnType<typeof createResolutions>;
