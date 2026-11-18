import { limitsForCategory, usageForLimit } from '../shared/capacity';
import type { CancellationSelection, CancellationImpactPreview } from '../shared/cancellations';
import { blocksPublicSale, effectiveWaitlistStatus, type StoredWaitlistStatus } from '../shared/waitlist';
import type { Db } from './db';
import type { createCancellationAllocations } from './cancellationAllocations';
import { eventLock, HttpError, liveEntrySql, type Repo } from './repo';

/** Read-only planning: the hypothetical removal below does not authorize execution. */
export function createCancellationImpact(db: Db, repo: Repo, allocations: ReturnType<typeof createCancellationAllocations>, clock: () => Date) {
  return {
    async preview(eventId: string, selection: CancellationSelection): Promise<CancellationImpactPreview> {
      return db.transaction(async () => {
        await db.lock(eventLock(eventId));
        const assessmentAt = clock();
        const financial = await allocations.preview(eventId, selection, assessmentAt);
        const { config } = await repo.getPublished(eventId);
        const now = assessmentAt.toISOString();
        const races = config.races.filter((r) => selection.scope === 'event' || (selection.scope === 'race' ? r.id === selection.raceId : r.dayId === selection.dayId));
        const raceIds = new Set(races.map((r) => r.id));
        const categoryIds = config.categories.filter((c) => raceIds.has(c.raceId)).map((c) => c.id);
        const selected = new Set(categoryIds);
        const capacity = await repo.entries(eventId, now);
        if (capacity.some((e) => !config.categories.some((c) => c.id === e.categoryId))) throw new HttpError(409, 'A capacity reservation has no current published category. Review event changes first.');
        const remaining = capacity.filter((e) => !selected.has(e.categoryId));
        const limits = new Map(categoryIds.flatMap((id) => limitsForCategory(config, id)).map((l) => [`${l.kind}:${l.id}`, l]));
        const entries = await db.all<{ id: string; orderId: string; categoryId: string; entryStatus: string; orderStatus: string }>(`SELECT oe.id,oe.order_id AS "orderId",oe.category_id AS "categoryId",oe.status AS "entryStatus",o.status AS "orderStatus"
          FROM order_entries oe JOIN orders o ON o.id=oe.order_id WHERE oe.event_id=$1 AND o.event_id=$1 AND ${liveEntrySql('$2')} ORDER BY oe.seq`, [eventId, now]);
        const affected = entries.filter((e) => selected.has(e.categoryId));
        const orderIds = new Set(affected.map((e) => e.orderId));
        const waitlist = await db.all<{ id: string; categoryId: string; status: StoredWaitlistStatus; orderId: string | null; offerExpiresAt: string | null }>(`SELECT id,category_id AS "categoryId",status,order_id AS "orderId",offer_expires_at AS "offerExpiresAt" FROM waitlist_entries WHERE event_id=$1 ORDER BY seq`, [eventId]);
        if (waitlist.some((w) => blocksPublicSale(effectiveWaitlistStatus(w.status, w.offerExpiresAt, now)) && !config.categories.some((c) => c.id === w.categoryId))) throw new HttpError(409, 'An active waitlist has no current published category. Review event changes first.');
        const affectedWaitlist = waitlist.filter((w) => selected.has(w.categoryId)).map((w) => ({ id: w.id, categoryId: w.categoryId, orderId: w.orderId, status: effectiveWaitlistStatus(w.status, w.offerExpiresAt, now) })).filter((w) => blocksPublicSale(w.status));
        const snapshots = await db.all<{ id: string; raceId: string; version: number }>(`SELECT id,race_id AS "raceId",version FROM start_list_snapshots WHERE event_id=$1 ORDER BY race_id,version`, [eventId]);
        return { eventId, selection, generatedAt: now, currentPublishedVersion: financial.currentPublishedVersion, readOnly: true,
          raceIds: [...raceIds], categoryIds, entries: affected,
          unaffectedLiveEntryIds: entries.filter((e) => orderIds.has(e.orderId) && !selected.has(e.categoryId)).map((e) => e.id),
          waitlist: affectedWaitlist,
          capacity: [...limits.values()].map((limit) => { const before = usageForLimit(limit, capacity); const after = usageForLimit(limit, remaining); return { ...before, hypotheticalUsedAfter: after.used, hypotheticalReleasedPlaces: before.used - after.used }; }),
          startListSnapshots: snapshots.filter((s) => selection.scope === 'event' || raceIds.has(s.raceId)),
          communicationAudience: { orderIds: [...orderIds], waitlistEntryIds: affectedWaitlist.filter((w) => !w.orderId || !orderIds.has(w.orderId)).map((w) => w.id), deliveryPlanned: false },
          financial, requiresFreshConfirmationPreview: true,
          limitations: ['Capacity assumes removal of every selected reservation, including test entries and live waitlist offers; it is not availability for resale.', 'Unsettled payments require reconciliation; entry status alone does not prove payment settlement.', 'Historical exports cannot be recalled. Listed snapshots remain unchanged.', 'No cancellation, credit, refund, message or waitlist change is executed.'],
        };
      });
    },
  };
}
