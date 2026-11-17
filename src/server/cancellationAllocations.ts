import type { CancellationSelection } from '../shared/cancellations';
import type { Quote } from '../shared/pricing';
import { todayIn } from '../shared/pricing';
import { refundPolicyEntitlement } from '../shared/refundPolicy';
import type { EventConfig } from '../shared/schema';
import type { Db } from './db';
import { paidLine } from './orders';
import { eventLock, HttpError, type Repo } from './repo';

type Entry = { id: string; category_id: string; original_category_id: string | null };
type PaidOrder = { id: string; published_version: number; quote_json: Quote; entries: Entry[] };

/** Selection and accepted allocation only, not a cancellation or a refundable-balance calculation. */
export function createCancellationAllocations(db: Db, repo: Repo, clock: () => Date) {
  return {
    async preview(eventId: string, selection: CancellationSelection) {
      return db.transaction(async () => {
        await db.lock(eventLock(eventId));
        const { config: current, version } = await repo.getPublished(eventId);
        if (selection.scope === 'day' && !current.days.some((d) => d.id === selection.dayId)) throw new HttpError(422, 'Choose a current published race day.');
        if (selection.scope === 'race' && !current.races.some((r) => r.id === selection.raceId)) throw new HttpError(422, 'Choose a current published race.');
        const now = clock();
        const groups = await db.all<PaidOrder>(`SELECT o.id,o.published_version,o.quote_json,
          jsonb_agg(jsonb_build_object('id',oe.id,'category_id',oe.category_id,'original_category_id',oe.original_category_id) ORDER BY oe.seq) AS entries
          FROM orders o JOIN order_entries oe ON oe.order_id = o.id
          WHERE o.event_id = $1 AND oe.event_id = $1 AND o.status = 'confirmed' AND oe.status = 'confirmed'
          GROUP BY o.id ORDER BY o.seq`, [eventId]);
        const categories = new Map(current.categories.map((c) => [c.id, c]));
        const races = new Map(current.races.map((r) => [r.id, r]));
        const placed = groups.map((order) => ({ order, entries: order.entries.map((entry) => {
          const category = categories.get(entry.category_id);
          const race = category && races.get(category.raceId);
          if (!category || !race || !current.days.some((d) => d.id === race.dayId)) throw new HttpError(409, 'A paid entry has no current published placement. Review event changes before previewing cancellation allocations.');
          return { entry, category, race };
        }) }));
        const selected = placed.map((p) => ({ ...p, affected: p.entries.filter(({ race }) => selection.scope === 'event' || (selection.scope === 'day' ? race.dayId === selection.dayId : race.id === selection.raceId)) })).filter((p) => p.affected.length);
        const versions = selected.length ? await repo.getVersions(eventId, selected.map((p) => p.order.published_version)) : new Map<number, EventConfig>();
        const refunds = selected.length ? await db.all<{ order_id: string }>(`SELECT DISTINCT order_id FROM refunds WHERE order_id = ANY($1) AND status <> 'failed'`, [selected.map((p) => p.order.id)]) : [];
        const withRefunds = new Set(refunds.map((r) => r.order_id));
        const entries = selected.flatMap(({ order, affected }) => {
          const accepted = versions.get(order.published_version)!;
          return affected.map(({ entry, category, race }) => {
            const line = paidLine(order.quote_json, entry);
            if (!line) throw new HttpError(409, 'A paid entry has no accepted price allocation. Reconcile the order before previewing cancellation.');
            const policy = refundPolicyEntitlement(accepted.registration.refundRules, accepted.days.map((d) => d.date).sort()[0], todayIn(accepted.event.timeZone, now), line.totalCents, 'organizer_cancellation');
            const acceptedCategory = accepted.categories.find((c) => c.id === entry.category_id);
            const acceptedRace = accepted.races.find((r) => r.id === acceptedCategory?.raceId);
            const reviewReasons: string[] = [];
            if (!policy) reviewReasons.push('No structured cancellation policy was accepted.');
            if (policy?.returnAs === 'credit' || policy?.returnAs === 'rider_choice') reviewReasons.push('Credit or rider-choice fulfillment is outside this preview.');
            if (withRefunds.has(order.id)) reviewReasons.push('Refund history exists; reconcile the ledger before returning value.');
            if (!acceptedCategory || acceptedCategory.raceId !== race.id || acceptedRace?.dayId !== race.dayId) reviewReasons.push('Published placement differs from the accepted version; review event changes before cancellation.');
            return { entryId: entry.id, orderId: order.id, currentCategoryId: category.id, currentRaceId: race.id, currentDayId: race.dayId,
              acceptedVersion: order.published_version, acceptedPriceCategoryId: line.categoryId, acceptedEntryCents: line.totalCents, policy, reviewReasons };
          });
        });
        return {
          eventId, currentPublishedVersion: version, selection, generatedAt: now.toISOString(),
          scope: 'confirmed_entries_on_confirmed_orders' as const,
          acceptedEntryAllocationCents: entries.reduce((sum, e) => sum + e.acceptedEntryCents, 0), entries,
          orders: selected.map(({ order, affected, entries: all }) => ({ orderId: order.id,
            excludedWholeOrderFeesCents: order.quote_json.fees.reduce((sum, f) => sum + f.cents, 0),
            unaffectedConfirmedEntryIds: all.filter((e) => !affected.some((a) => a.entry.id === e.entry.id)).map((e) => e.entry.id) })),
          requiresFinancialReconciliation: true, readOnly: true,
        };
      });
    },
  };
}
