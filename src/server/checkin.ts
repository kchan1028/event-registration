import { cancellationRosterStatus } from './cancellationClosure';
import { createHash, randomUUID } from 'node:crypto';
import { bibScopeKey, bibSettingsSchema, bibBatchExclusion, changedBibAssignments, type BibChange, type BibReassignment, type BibReassignmentPlan, type BibReassignmentResult, type BibBatch, type BibPlan, type PaymentState, canCheckInWithBib, checkInResult, checkInTiming, MAX_TIMED_CHECK_IN_MS, mergeReadiness, nextFreeBib, bibRangeForEntries, type BibSettings, type CheckInReadinessConflict } from '../shared/checkin';
import { checkSelection, needsGuardian, profileOf, type RiderDetails, type WaiverAcceptance } from '../shared/checkout';
import { evaluateCategory } from '../shared/eligibility';
import { newId } from '../shared/factory';
import { sortCategories } from '../shared/format';
import type { EventConfig } from '../shared/schema';
import type { Db } from './db';
import type { StartLists } from './startlists';
import type { Identity } from './identity';
import { groupByOrder, isLiveOrder, type Orders, type OrderView } from './orders';
import { eventLock, HttpError, type Repo } from './repo';

/**
 * Race-day check-in. A rider is one order. Volunteers see only what
 * check-in needs: name, team, entries, readiness, and bib. No email, guardian
 * contact, payment amounts, or emergency details leave this module.
 */
export function createCheckIn(db: Db, repo: Repo, orders: Orders, clock: () => Date, identity: Identity, startLists: StartLists) {
  const nowIso = () => clock().toISOString();

  /**
   * The schedule check-in works from: the published version, or the draft while the event has
   * never been published. The draft fallback is deliberate, so this does not use repo.getPublished:
   * the check-in screen opens before the first publish (it shows "not published yet") and bib
   * ranges can be saved early. No rider can be checked in then, because orders need a published version.
   */
  async function schedule(eventId: string): Promise<{ config: EventConfig; published: boolean }> {
    const record = await repo.getEvent(eventId);
    return record.publishedVersion ? { config: await repo.getVersion(eventId, record.publishedVersion), published: true } : { config: record.config, published: false };
  }
  const config = async (eventId: string) => (await schedule(eventId)).config;
  const settings = repo.bibSettings;

  async function takenBibs(eventId: string, scope: string): Promise<Set<number>> {
    const rows = await db.all<{ bib: number }>(`SELECT bib FROM bib_assignments WHERE event_id = $1 AND scope = $2 AND released_at IS NULL`, [eventId, scope]);
    return new Set(rows.map((r) => r.bib));
  }

  /**
   * One rider made from linked orders: use live orders when present, otherwise retained historical orders.
   * Keep the persisted rider key, the selected group's entries, and confirmed payment only when the whole group is confirmed.
   */
  type Rider = OrderView & { checkInCodes: string[] };
  function mergeRider(group: OrderView[], riderKey: string): Rider {
    const live = group.filter(isLiveOrder);
    const sorted = [...(live.length ? live : group)].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    const first = sorted[0];
    return {
      ...first,
      id: riderKey,
      status: sorted.every((o) => o.status === 'confirmed') ? 'confirmed' : sorted.find((o) => o.status !== 'confirmed')!.status,
      entries: sorted.flatMap((o) => o.entries),
      checkInCodes: sorted.map((o) => o.checkInCode).filter((c): c is string => !!c),
    };
  }

  function activeEntries(rider: Rider) {
    return isLiveOrder(rider) ? rider.entries.filter((e) => e.status === 'held' || e.status === 'confirmed') : [];
  }

  type BibRow = { id: string; order_id: string; bib: number; assigned_at: string; released_at: string | null; release_reason: string | null };
  type UndoRow = { order_id: string; checked_in_at: string; undone_at: string; bib: number | null; bib_released: boolean; reason: string };

  /** Check-ins, bibs, and undone check-ins for one event, day, and bib scope, read once for every rider card. */
  async function dayState(eventId: string, dayId: string, scope: string) {
    const checkIns = await db.all<{ order_id: string; checked_in_at: string }>(`SELECT order_id, checked_in_at FROM check_ins WHERE event_id = $1 AND day_id = $2`, [eventId, dayId]);
    const bibs = await db.all<BibRow>(
      `SELECT id, order_id, bib, assigned_at, released_at, release_reason FROM bib_assignments WHERE event_id = $1 AND scope = $2 ORDER BY assigned_at, seq`,
      [eventId, scope],
    );
    const undos = await db.all<UndoRow>(
      `SELECT order_id, checked_in_at, undone_at, bib, bib_released, reason FROM check_in_undos WHERE event_id = $1 AND day_id = $2 ORDER BY undone_at, seq`,
      [eventId, dayId],
    );
    return { checkedInAt: new Map(checkIns.map((c) => [c.order_id, c.checked_in_at])), bibs: groupByOrder(bibs), undos: groupByOrder(undos) };
  }
  type DayState = Awaited<ReturnType<typeof dayState>>;

  function riderCard(o: Rider, dayId: string, state: DayState) {
    const today = o.entries.filter((e) => e.dayId === dayId && (e.status === 'held' || e.status === 'confirmed'));
    const readiness = mergeReadiness(today.map((e) => e.readiness));
    const payment: PaymentState = o.status === 'confirmed' ? 'confirmed' : 'not_complete';
    const result = checkInResult({ payment, entriesToday: today.length, readiness });
    const bibRows = state.bibs.get(o.id) ?? [];
    const history = bibRows.map((r) => ({ bib: r.bib, assignedAt: r.assigned_at, releasedAt: r.released_at, reason: r.release_reason }));
    const undone = state.undos.get(o.id) ?? [];
    return {
      orderId: o.id,
      checkInCode: o.checkInCode,
      checkInCodes: o.checkInCodes,
      name: `${o.rider.firstName} ${o.rider.lastName}`,
      team: o.rider.team,
      racingAge: o.rider.racingAge,
      payment,
      entries: today.map((e) => ({ id: e.id, categoryId: e.categoryId, categoryName: e.categoryName, code: e.code, raceName: e.raceName, startTime: e.startTime, walkUp: e.status === 'confirmed' && e.walkUp })),
      readiness,
      result,
      bib: bibRows.find((r) => r.released_at === null)?.bib ?? null,
      bibHistory: history,
      checkedInAt: state.checkedInAt.get(o.id) ?? null,
      undoneCheckIns: undone.map((u) => ({ checkedInAt: u.checked_in_at, undoneAt: u.undone_at, bib: u.bib, bibReleased: u.bib_released, reason: u.reason })),
    };
  }

  /** Live riders and inactive riders who still hold a bib, with linked orders merged into one rider. */
  async function riders(eventId: string): Promise<Rider[]> {
    const key = await identity.keyOf(eventId);
    const groups = new Map<string, OrderView[]>();
    const assigned = new Set((await db.all<{ order_id: string }>(`SELECT DISTINCT order_id FROM bib_assignments WHERE event_id = $1 AND released_at IS NULL`, [eventId])).map((r) => r.order_id));
    for (const o of await orders.listOrders(eventId)) {
      const k = key(o.id);
      groups.set(k, [...(groups.get(k) ?? []), o]);
    }
    return [...groups].filter(([id, group]) => assigned.has(id) || group.some(isLiveOrder)).map(([id, group]) => mergeRider(group, id));
  }

  function matches(card: ReturnType<typeof riderCard>, q: string): boolean {
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    const bare = (v: string) => v.toLowerCase().replace(/[\s-]/g, '');
    if (card.checkInCodes.some((c) => bare(c) === bare(needle))) return true;
    if (/^\d+$/.test(needle) && card.bib === Number(needle)) return true;
    return card.name.toLowerCase().includes(needle) || card.team.toLowerCase().includes(needle);
  }

  function requireDay(cfg: EventConfig, dayId: string) {
    const day = cfg.days.find((d) => d.id === dayId);
    if (!day) throw new HttpError(400, 'That race day is not part of this event.');
    return day;
  }

  /** Load a canonical rider once, retaining inactive orders only if the whole group is inactive. */
  async function riderFor(eventId: string, orderId: string) {
    const o = await orders.getOrder(orderId);
    if (o.eventId !== eventId) throw new HttpError(404, 'Rider not found for this event.');
    const key = (await identity.keyOf(eventId))(orderId);
    const ids = await identity.groupOf(eventId, key);
    const byId = await orders.getOrders(ids);
    const group = ids.map((id) => byId.get(id)).filter((x): x is OrderView => !!x);
    return mergeRider(group, key);
  }

  /** Bibs and check-ins live under the canonical rider key. */
  async function cardFor(eventId: string, orderId: string, dayId: string) {
    const rider = await riderFor(eventId, orderId);
    const s = await settings(eventId);
    return riderCard(rider, dayId, await dayState(eventId, dayId, bibScopeKey(s, dayId)));
  }

  async function saveWalkUpMarker(entryId: string, eventId: string, actorId: string) {
    await db.run(
      'UPDATE order_entries SET walk_up_marked_at = $1, walk_up_marked_by = $2 WHERE id = $3 AND event_id = $4 AND status = $5 AND walk_up_marked_at IS NULL',
      [nowIso(), actorId, entryId, eventId, 'confirmed'],
    );
  }

  function requireBatchScope(cfg: EventConfig, { dayId, raceId, categoryId }: Pick<BibBatch, 'dayId' | 'raceId' | 'categoryId'>) {
    const day = requireDay(cfg, dayId);
    if (raceId && !cfg.races.some((r) => r.id === raceId && r.dayId === dayId)) throw new HttpError(422, 'The selected race is not on this day.');
    if (categoryId && !cfg.categories.some((c) => c.id === categoryId && (!raceId || c.raceId === raceId) && cfg.races.some((r) => r.id === c.raceId && r.dayId === dayId))) throw new HttpError(422, 'The selected category is not in this race day and scope.');
    return day;
  }

  async function requireRiderSelection(eventId: string, orderIds: string[]) {
    if (new Set(orderIds).size !== orderIds.length) throw new HttpError(422, 'Select each rider only once.');
    const key = await identity.keyOf(eventId);
    if (orderIds.some((id) => key(id) !== id)) throw new HttpError(422, 'Select the rider shown on the check-in list, not a linked order.');
  }

  function requireRiderScope(cfg: EventConfig, card: ReturnType<typeof riderCard>, { raceId, categoryId }: Pick<BibBatch, 'raceId' | 'categoryId'>) {
    if (categoryId && !card.entries.some((e) => e.categoryId === categoryId)) throw new HttpError(409, 'A selected rider is not entered in the chosen category.');
    if (raceId && !card.entries.some((e) => cfg.categories.some((c) => c.id === e.categoryId && c.raceId === raceId))) throw new HttpError(409, 'A selected rider is not entered in the chosen race.');
  }

  function requireBibInRange(bib: number, range: { first: number; last: number }) {
    if (bib < range.first || bib > range.last) throw new HttpError(422, `Bib ${bib} is outside the range ${range.first}–${range.last}.`);
  }

  function riderRange(cfg: EventConfig, entries: Rider['entries'], s: BibSettings, dayId: string) {
    const range = bibRangeForEntries(cfg, entries, s, dayId);
    if (range && range.first > range.last) throw new HttpError(409, 'The rider’s category bib ranges do not overlap. Adjust the ranges or use separate bibs per day.');
    return range;
  }

  /** Assign a bib inside the configured range without colliding with an active one. */
  async function assign(eventId: string, orderId: string, dayId: string, s: BibSettings, requested: number | null): Promise<number> {
    const scope = bibScopeKey(s, dayId);
    const rider = await riderFor(eventId, orderId);
    const range = riderRange(await config(eventId), activeEntries(rider), s, dayId);
    if (!range) throw new HttpError(409, 'No bib range covers every applicable entry. Set bib ranges before checking riders in.');
    const taken = await takenBibs(eventId, scope);
    let bib: number | null = requested;
    if (bib === null) {
      bib = nextFreeBib(range, taken);
      if (bib === null) throw new HttpError(409, `Every bib from ${range.first} to ${range.last} is in use. Extend the bib range.`);
    } else {
      requireBibInRange(bib, range);
      if (taken.has(bib)) throw new HttpError(409, `Bib ${bib} is already issued to another rider.`);
    }
    await db.run(`INSERT INTO bib_assignments (id, event_id, scope, order_id, bib, assigned_at) VALUES ($1, $2, $3, $4, $5, $6)`, [newId('bib'), eventId, scope, orderId, bib, nowIso()]);
    return bib;
  }

  /** Preview uses the same event lock and allocation rules as apply. No bib changes here. */
  async function bibPlan(eventId: string, batch: BibBatch, allocation: 'unassigned' | 'reassign'): Promise<BibPlan> {
    const { dayId, orderIds, raceId, categoryId } = batch;
    const sort = batch.sort ?? 'name';
    const cfg = await config(eventId);
    requireBatchScope(cfg, batch);
    const s = await settings(eventId);
    const scope = bibScopeKey(s, dayId);
    await requireRiderSelection(eventId, orderIds);
    const all = await riders(eventId);
    const byId = new Map(all.map((o) => [o.id, o]));
    const state = await dayState(eventId, dayId, scope);
    const taken = await takenBibs(eventId, scope);
    const sorted = orderIds.map((id) => {
      const o = byId.get(id);
      if (!o) throw new HttpError(404, 'A selected rider was not found.');
      const card = riderCard(o, dayId, state);
      const exclusion = bibBatchExclusion(card, allocation);
      if (exclusion) throw new HttpError(409, exclusion);
      requireRiderScope(cfg, card, batch);
      return { o, card };
    }).sort((a, b) => {
      const byName = () => a.o.rider.lastName.localeCompare(b.o.rider.lastName) || a.o.rider.firstName.localeCompare(b.o.rider.firstName);
      const firstStart = (card: typeof a.card) => card.entries
        .filter((e) => !categoryId || e.categoryId === categoryId)
        .filter((e) => !raceId || cfg.categories.some((c) => c.id === e.categoryId && c.raceId === raceId))
        .map((e) => `${e.startTime ?? '99:99'}\u0000${e.code}`)
        .sort()[0] ?? '';
      const byStart = () => firstStart(a.card).localeCompare(firstStart(b.card)) || byName();
      const primary = sort === 'registration' ? a.o.createdAt.localeCompare(b.o.createdAt) : sort === 'start' ? byStart() : byName();
      return primary || a.o.id.localeCompare(b.o.id);
    });
    if (allocation === 'reassign') for (const { card } of sorted) taken.delete(card.bib!);
    const assignments = [];
    for (const { o, card } of sorted) {
      const range = riderRange(cfg, activeEntries(o), s, dayId);
      if (!range) throw new HttpError(409, 'Set a bib range for every applicable entry before allocating.');
      const bib = nextFreeBib(range, taken);
      if (bib === null) throw new HttpError(409, `Not enough free bibs in ${range.first}–${range.last}; no assignments were made.`);
      taken.add(bib);
      assignments.push({ orderId: o.id, name: card.name, bib, range: { first: range.first, last: range.last } });
    }
    const fingerprint = createHash('sha256').update(JSON.stringify({ eventId, dayId, raceId, categoryId, sort, allocation, scope, settings: s, assigned: [...state.bibs.values()].flat().filter((b) => b.released_at === null).map((b) => [b.order_id, b.bib]).sort(), assignments })).digest('hex');
    return { dayId, raceId: raceId ?? null, categoryId: categoryId ?? null, sort, scope, assignments, fingerprint };
  }

  async function saveBibPlan(eventId: string, plan: BibPlan, automaticJobId: string | null) {
    await db.run(
      `INSERT INTO bib_assignments (id, event_id, scope, order_id, bib, assigned_at, automatic_job_id)
       SELECT id, $1, $2, order_id, bib, $3::timestamptz, $7
       FROM unnest($4::text[], $5::text[], $6::int[]) AS batch(id, order_id, bib)`,
      [eventId, plan.scope, nowIso(), plan.assignments.map(() => newId('bib')), plan.assignments.map((a) => a.orderId), plan.assignments.map((a) => a.bib), automaticJobId],
    );
  }

  async function reassignmentPlan(eventId: string, input: BibReassignment, operation: 'bulk' | 'individual'): Promise<BibReassignmentPlan> {
    const { config: cfg, version } = await repo.getPublished(eventId);
    const day = requireBatchScope(cfg, input);
    const s = await settings(eventId);
    const scope = bibScopeKey(s, day.id);
    const days = cfg.days.filter((d) => bibScopeKey(s, d.id) === scope);
    const proposed = input.mode === 'manual' ? input.assignments : (await bibPlan(eventId, input, 'reassign')).assignments;
    const ids = new Set(proposed.map((a) => a.orderId));
    await requireRiderSelection(eventId, proposed.map((a) => a.orderId));
    if (new Set(proposed.map((a) => a.bib)).size !== proposed.length) throw new HttpError(409, 'Two selected riders cannot receive the same bib.');
    const all = new Map((await riders(eventId)).map((r) => [r.id, r]));
    const state = await dayState(eventId, day.id, scope);
    const activeBibs = [...state.bibs.values()].flat().filter((b) => b.released_at === null);
    const outside = new Set(activeBibs.filter((b) => !ids.has(b.order_id)).map((b) => b.bib));
    const checks = await db.all<{ order_id: string; day_id: string; checked_in_at: string }>(`SELECT order_id, day_id, checked_in_at FROM check_ins WHERE event_id = $1 AND day_id = ANY($2::text[]) AND order_id = ANY($3::text[]) ORDER BY order_id, day_id`, [eventId, days.map((d) => d.id), [...ids]]);
    const raceIds = new Set<string>();
    const assignments = proposed.map((a) => {
      const rider = all.get(a.orderId);
      if (!rider) throw new HttpError(404, 'A selected rider was not found.');
      const card = riderCard(rider, day.id, state);
      const exclusion = bibBatchExclusion(card, operation === 'individual' ? 'individual' : 'reassign');
      if (exclusion) throw new HttpError(409, exclusion);
      requireRiderScope(cfg, card, input);
      const active = activeEntries(rider).filter((e) => days.some((d) => d.id === e.dayId));
      const applicable = active.length ? active : rider.entries.filter((e) => e.status === 'withdrawn' || e.status === 'cancelled');
      const range = riderRange(cfg, applicable, s, day.id);
      if (!range) throw new HttpError(409, 'Set a bib range for every applicable entry before changing numbers.');
      requireBibInRange(a.bib, range);
      if (outside.has(a.bib)) throw new HttpError(409, `Bib ${a.bib} belongs to a rider outside this batch.`);
      if (a.bib !== card.bib) for (const entry of applicable.filter((e) => !active.length || e.status === 'confirmed')) {
        const race = cfg.races.find((r) => r.id === cfg.categories.find((c) => c.id === entry.categoryId)?.raceId);
        if (race && days.some((d) => d.id === race.dayId)) raceIds.add(race.id);
      }
      const previous = activeBibs.find((b) => b.order_id === rider.id)!;
      return { orderId: rider.id, name: card.name, currentBib: card.bib!, bib: a.bib, previousAssignmentId: previous.id, range: { first: range.first, last: range.last }, checkedInDays: days.filter((d) => checks.some((c) => c.order_id === rider.id && c.day_id === d.id)).map((d) => d.label) };
    });
    if (!input.acknowledgeCheckedIn && assignments.some((a) => a.currentBib !== a.bib && a.checkedInDays.length)) throw new HttpError(409, 'Acknowledge changes to checked-in riders before previewing.');
    const races = cfg.races.filter((r) => raceIds.has(r.id)).map((r) => ({ id: r.id, name: r.name }));
    const fingerprint = createHash('sha256').update(JSON.stringify({ eventId, input, operation, version, scope, settings: s, checks, assignments, races, riders: [...ids].map((id) => { const r = all.get(id)!; return [id, r.status, r.entries.map((e) => [e.id, e.status])]; }) })).digest('hex');
    return { dayId: day.id, scope, scopeLabel: s.scope === 'weekend' ? 'Whole event' : day.label, reason: input.reason, publishedVersion: version, races, assignments, fingerprint };
  }

  async function commitReassignment(eventId: string, input: BibReassignment, fingerprint: string, actorId: string, operation: 'bulk' | 'individual'): Promise<BibReassignmentResult> {
    const plan = await reassignmentPlan(eventId, input, operation);
    if (plan.fingerprint !== fingerprint) throw new HttpError(409, 'Bib preview changed. Review a new preview before applying.');
    const changes = changedBibAssignments(plan);
    if (!changes.length) return { ...plan, id: null, applied: 0, snapshots: [] };
    const id = newId('bibchange');
    const at = nowIso();
    const rows = changes.map((a) => ({ orderId: a.orderId, previousAssignmentId: a.previousAssignmentId, previousBib: a.currentBib, bib: a.bib, assignmentId: newId('bib') }));
    await db.run(`INSERT INTO bib_reassignments (id, event_id, day_id, scope, published_version, requested_by, reason, assignments_json, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [id, eventId, plan.dayId, plan.scope, plan.publishedVersion, actorId, plan.reason, JSON.stringify(rows), at]);
    await db.run(`UPDATE bib_assignments SET released_at = $1, release_reason = $2 WHERE event_id = $3 AND id = ANY($4::text[]) AND released_at IS NULL`, [at, plan.reason, eventId, rows.map((r) => r.previousAssignmentId)]);
    await db.run(`INSERT INTO bib_assignments (id, event_id, scope, order_id, bib, assigned_at, reassignment_id)
      SELECT id, $1, $2, order_id, bib, $3::timestamptz, $7 FROM unnest($4::text[], $5::text[], $6::int[]) AS batch(id, order_id, bib)`,
      [eventId, plan.scope, at, rows.map((r) => r.assignmentId), rows.map((r) => r.orderId), rows.map((r) => r.bib), id]);
    const snapshots = [];
    for (const race of plan.races) {
      const snapshot = await startLists.snapshot(eventId, race.id, id);
      snapshots.push({ raceId: race.id, version: snapshot.version });
    }
    return { ...plan, id, applied: changes.length, snapshots };
  }

  return {
    async previewReassignments(eventId: string, input: BibReassignment) {
      return db.transaction(async () => { await db.lock(eventLock(eventId)); return reassignmentPlan(eventId, input, 'bulk'); });
    },
    async applyReassignments(eventId: string, input: BibReassignment, fingerprint: string, actorId: string) {
      return db.transaction(async () => { await db.lock(eventLock(eventId)); return commitReassignment(eventId, input, fingerprint, actorId, 'bulk'); });
    },
    async previewBibChange(eventId: string, orderId: string, input: BibChange) {
      return db.transaction(async () => {
        await db.lock(eventLock(eventId));
        const key = (await identity.keyOf(eventId))(orderId);
        return reassignmentPlan(eventId, { mode: 'manual', dayId: input.dayId, reason: input.reason, acknowledgeCheckedIn: input.acknowledgeCheckedIn, assignments: [{ orderId: key, bib: input.bib }] }, 'individual');
      });
    },
    /** Called by the post-close job under its event lock and transaction. */
    async assignUnassignedBibs(eventId: string, sort: NonNullable<BibBatch['sort']>, automaticJobId: string) {
      const cfg = await config(eventId);
      const s = await settings(eventId);
      const all = await riders(eventId);
      let assigned = 0;
      for (const day of [...cfg.days].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))) {
        const state = await dayState(eventId, day.id, bibScopeKey(s, day.id));
        const ids = all.filter((r) => !bibBatchExclusion(riderCard(r, day.id, state), 'unassigned')).map((r) => r.id);
        if (!ids.length) continue;
        const plan = await bibPlan(eventId, { dayId: day.id, orderIds: ids, sort }, 'unassigned');
        await saveBibPlan(eventId, plan, automaticJobId);
        assigned += plan.assignments.length;
      }
      return assigned;
    },
    async previewBibs(eventId: string, batch: BibBatch) {
      return db.transaction(async () => {
        await db.lock(eventLock(eventId));
        return bibPlan(eventId, batch, 'unassigned');
      });
    },
    async applyBibs(eventId: string, batch: BibBatch, fingerprint: string) {
      return db.transaction(async () => {
        await db.lock(eventLock(eventId));
        const plan = await bibPlan(eventId, batch, 'unassigned');
        if (plan.fingerprint !== fingerprint) throw new HttpError(409, 'Bib preview changed. Review a new preview before applying.');
        await saveBibPlan(eventId, plan, null);
        return { ...plan, applied: plan.assignments.length };
      });
    },
    async list(eventId: string, dayId: string | undefined, q: string) {
      return db.transaction(async () => {
        await db.lock(eventLock(eventId));
        const { config: cfg, published } = await schedule(eventId);
        const day = dayId ? requireDay(cfg, dayId) : cfg.days[0];
        const s = await settings(eventId);
        const state = await dayState(eventId, day.id, bibScopeKey(s, day.id));
        const checkedInScope = new Set((await db.all<{ order_id: string }>(`SELECT DISTINCT order_id FROM check_ins WHERE event_id = $1 AND day_id = ANY($2::text[])`, [eventId, cfg.days.filter((d) => bibScopeKey(s, d.id) === bibScopeKey(s, day.id)).map((d) => d.id)])).map((r) => r.order_id));
        const all = (await riders(eventId)).filter((o) => activeEntries(o).length || state.bibs.get(o.id)?.some((b) => b.released_at === null)).map((o) => riderCard(o, day.id, state)).sort((a, b) => a.name.localeCompare(b.name));
        const enteredToday = all.filter((c) => c.entries.length > 0);
        // A search also finds riders with no entry today, so the volunteer sees why; the plain list shows only today's riders.
        const cards = q.trim() ? all.filter((c) => matches(c, q)) : enteredToday;
        const scope = bibScopeKey(s, day.id);
        const summary = {
          riders: enteredToday.length,
          checkedIn: enteredToday.filter((c) => c.checkedInAt).length,
          blocked: enteredToday.filter((c) => !c.result.ready).length,
          bibsAssigned: (await takenBibs(eventId, scope)).size,
          /** Measured standard check-ins for this day (product.md target: median under 30 s, 95th percentile under 90 s). */
          timing: checkInTiming(
            (await db.all<{ duration_ms: number }>(`SELECT duration_ms FROM check_ins WHERE event_id = $1 AND day_id = $2 AND duration_ms IS NOT NULL`, [eventId, day.id])).map((r) => r.duration_ms),
          ),
        };
        return {
          eventId,
          cancellation: await cancellationRosterStatus(db, eventId, cfg, day.id),
          eventName: cfg.event.name,
          isDemo: cfg.event.isDemo,
          published,
          days: cfg.days.map((d) => ({ id: d.id, label: d.label, date: d.date })),
          dayId: day.id,
          races: cfg.races.filter((r) => r.dayId === day.id).map((r) => ({ id: r.id, name: r.name })),
          categories: cfg.categories.filter((c) => cfg.races.some((r) => r.id === c.raceId && r.dayId === day.id)).map((c) => ({ id: c.id, name: c.name, raceId: c.raceId })),
          settings: s,
          summary,
          checkedInScope: [...checkedInScope],
          riders: q.trim() ? cards.slice(0, 50) : cards,
        };
      });
    },

    async saveSettings(eventId: string, input: unknown) {
      return db.transaction(async () => {
        await db.lock(eventLock(eventId));
        const cfg = await config(eventId);
        const s = bibSettingsSchema.parse(input);
        const validScopes = s.scope === 'weekend' ? ['weekend'] : cfg.days.map((d) => d.id);
        for (const r of s.ranges) if (!validScopes.includes(r.scope)) throw new HttpError(422, 'A bib range does not match the chosen bib scope.');
        if (new Set(s.ranges.map((r) => r.scope)).size !== s.ranges.length) throw new HttpError(422, 'Each day can have only one bib range.');
        await db.run(
          `INSERT INTO bib_settings (event_id, settings_json, updated_at) VALUES ($1, $2, $3) ON CONFLICT (event_id) DO UPDATE SET settings_json = excluded.settings_json, updated_at = excluded.updated_at`,
          [eventId, JSON.stringify(s), nowIso()],
        );
        return s;
      });
    },

    async markWalkUp(eventId: string, orderId: string, dayId: string, entryId: string, actorId: string) {
      return db.transaction(async () => {
        await db.lock(eventLock(eventId));
        requireDay(await config(eventId), dayId);
        const rider = await riderFor(eventId, orderId);
        const entry = rider.entries.find((candidate) => candidate.id === entryId && candidate.dayId === dayId);
        if (!entry) throw new HttpError(404, 'Entry not found for this rider and race day.');
        if (entry.status !== 'confirmed') throw new HttpError(409, 'Confirm the entry before marking it as a walk-up.');
        await saveWalkUpMarker(entryId, eventId, actorId);
        return cardFor(eventId, rider.id, dayId);
      });
    },

    /**
     * Check a ready rider in and issue a bib. Repeating it is safe: the first
     * check-in time and the existing bib come back unchanged.
     */
    async checkIn(eventId: string, orderId: string, dayId: string, requestedBib: number | null, durationMs: number | null = null) {
      requireDay(await config(eventId), dayId);
      orderId = (await identity.keyOf(eventId))(orderId); // linked orders share the rider key
      return db.transaction(async () => {
        await db.lock(eventLock(eventId));
        const card = await cardFor(eventId, orderId, dayId);
        if (card.checkedInAt && card.bib !== null) return card;
        if (!card.result.ready) {
          const details = { code: 'check_in_not_ready', dayId, rider: card } satisfies CheckInReadinessConflict;
          throw new HttpError(409, `Not ready to race: ${card.result.blockers.map((b) => b.label.toLowerCase()).join(', ')}.`, details);
        }
        if (!canCheckInWithBib(card)) throw new HttpError(409, 'No preassigned bib. Refer advance entries to the registration lead for allocation.');
        const s = await settings(eventId);
        if (card.bib === null) await assign(eventId, orderId, dayId, s, requestedBib);
        // Only a first, plausible measurement is kept; a repeat check-in never overwrites it.
        const duration = durationMs !== null && durationMs > 0 && durationMs <= MAX_TIMED_CHECK_IN_MS ? Math.round(durationMs) : null;
        await db.run(
          `INSERT INTO check_ins (id, event_id, order_id, day_id, checked_in_at, duration_ms) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
          [newId('chk'), eventId, orderId, dayId, nowIso(), duration],
        );
        return cardFor(eventId, orderId, dayId);
      });
    },

    /**
     * Undo a mistaken check-in for one race day. The check-in is removed so the rider can be
     * checked in again, and the record is kept with the reason. The bib is released unless the
     * same bib also covers another day this rider is still checked in for (one bib all weekend).
     */
    async undoCheckIn(eventId: string, orderId: string, dayId: string, reason: string) {
      const cfg = await config(eventId);
      requireDay(cfg, dayId);
      orderId = (await identity.keyOf(eventId))(orderId);
      return db.transaction(async () => {
        await db.lock(eventLock(eventId));
        const card = await cardFor(eventId, orderId, dayId);
        if (!card.checkedInAt) throw new HttpError(409, 'This rider is not checked in for this day.');
        const s = await settings(eventId);
        const scope = bibScopeKey(s, dayId);
        const otherDaysInScope = cfg.days.filter((d) => d.id !== dayId && bibScopeKey(s, d.id) === scope).map((d) => d.id);
        let stillCheckedInElsewhere = false;
        for (const d of otherDaysInScope) {
          if (await db.get(`SELECT id FROM check_ins WHERE order_id = $1 AND day_id = $2`, [orderId, d])) stillCheckedInElsewhere = true;
        }
        const t = nowIso();
        const releaseBib = card.bib !== null && !stillCheckedInElsewhere;
        if (releaseBib) {
          await db.run(`UPDATE bib_assignments SET released_at = $1, release_reason = $2 WHERE event_id = $3 AND scope = $4 AND order_id = $5 AND released_at IS NULL`, [
            t,
            `Check-in undone: ${reason}`,
            eventId,
            scope,
            orderId,
          ]);
        }
        await db.run(`DELETE FROM check_ins WHERE order_id = $1 AND day_id = $2`, [orderId, dayId]);
        await db.run(
          `INSERT INTO check_in_undos (id, event_id, order_id, day_id, checked_in_at, bib, bib_released, reason, undone_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [newId('undo'), eventId, orderId, dayId, card.checkedInAt, card.bib, releaseBib, reason, t],
        );
        return cardFor(eventId, orderId, dayId);
      });
    },

    /** Apply the previewed individual correction using the same historical change as bulk edits. */
    async changeBib(eventId: string, orderId: string, input: BibChange, fingerprint: string, actorId: string) {
      return db.transaction(async () => {
        await db.lock(eventLock(eventId));
        const key = (await identity.keyOf(eventId))(orderId);
        await commitReassignment(eventId, { mode: 'manual', dayId: input.dayId, reason: input.reason, acknowledgeCheckedIn: input.acknowledgeCheckedIn, assignments: [{ orderId: key, bib: input.bib }] }, fingerprint, actorId, 'individual');
        return cardFor(eventId, key, input.dayId);
      });
    },

    /**
     * Fictional riders for trying check-in: paid with a simulated payment, a mix
     * of reviewed and unreviewed licenses, and one unpaid hold.
     */
    async addDemoRiders(eventId: string, actorId: string) {
      const { config: cfg } = await repo.getPublished(eventId, 'Publish the event first. Check-in uses the published schedule.');
      const created: string[] = [];
      for (const p of CHECK_IN_DEMO_RIDERS) {
        const full = (guardian: RiderDetails['guardian']): RiderDetails => ({
          ...p.rider,
          phone: '',
          licenseNumber: `DEMO-2${String(created.length + 1).padStart(5, '0')}`,
          demoRiderId: null,
          emergencyContact: { name: 'Robin Demo', phone: '555-555-0199' },
          guardian,
        });
        const categoryIds = pickEntries(cfg, full(null));
        if (categoryIds.length === 0) continue;
        const guardianSigns = needsGuardian(cfg, categoryIds, p.rider.racingAge);
        const rider = full(guardianSigns ? { name: 'Jordan Demo', relationship: 'Parent', email: 'jordan.demo@example.com', phone: '' } : null);
        const waiver: WaiverAcceptance = {
          version: cfg.registration.waiverVersion,
          read: true,
          agreed: true,
          signerRole: guardianSigns ? 'guardian' : 'rider',
          signatureName: guardianSigns ? (rider.guardian?.name ?? '') : `${rider.firstName} ${rider.lastName}`,
        };
        // No account: these are fictional riders placed by the organizer's demo button.
        const order = await orders.createOrder(eventId, { clientRequestId: `demo-checkin-${randomUUID()}`, categoryIds, rider, waiver }, null);
        if (p.paid) {
          await orders.pay(order.id, `demo-${randomUUID()}`, 'success');
          // These desk demo riders are explicitly generated as fictional walk-ups.
          for (const entry of order.entries) await saveWalkUpMarker(entry.id, eventId, actorId);
        }
        if (p.licenseReviewed) for (const e of order.entries) await orders.reviewLicense(e.id, 'Demo: license card shown at the desk (simulated).');
        created.push(order.id);
      }
      return { created: created.length };
    },
  };
}

/** One eligible, open category per race, dropping any that conflict. */
function pickEntries(cfg: EventConfig, rider: RiderDetails): string[] {
  const profile = profileOf(rider);
  const picks: string[] = [];
  for (const race of cfg.races) {
    const cat = sortCategories(cfg.categories.filter((c) => c.raceId === race.id && c.status === 'active')).find((c) => evaluateCategory(c, profile).status !== 'ineligible');
    if (!cat) continue;
    if (checkSelection(cfg, [...picks, cat.id], profile).ok) picks.push(cat.id);
  }
  return picks;
}

/**
 * Fictional riders for the check-in demo button. Not the checkout fixtures (DEMO_RIDERS in
 * src/shared/fixtures.ts): these say whether each rider is paid and license-reviewed, so the
 * desk shows ready and blocked cases.
 */
type CheckInDemoRider = { rider: Omit<RiderDetails, 'guardian' | 'phone' | 'licenseNumber' | 'demoRiderId' | 'emergencyContact'>; paid: boolean; licenseReviewed: boolean };

const base = { collegiateDivision: null, licenseType: 'annual' as const };
const CHECK_IN_DEMO_RIDERS: CheckInDemoRider[] = [
  { rider: { ...base, firstName: 'Alex', lastName: 'Demo', email: 'alex.demo@example.com', team: 'Demo Wheelers', racingAge: 29, licenseCategory: '4', competitionClass: 'men' }, paid: true, licenseReviewed: true },
  { rider: { ...base, firstName: 'Blake', lastName: 'Demo', email: 'blake.demo@example.com', team: 'Sample Velo', racingAge: 38, licenseCategory: '3', competitionClass: 'women' }, paid: true, licenseReviewed: true },
  { rider: { ...base, firstName: 'Casey', lastName: 'Demo', email: 'jordan.demo@example.com', team: '', racingAge: 13, licenseCategory: '5', competitionClass: 'men' }, paid: true, licenseReviewed: true },
  { rider: { ...base, firstName: 'Dana', lastName: 'Demo', email: 'dana.demo@example.com', team: 'Example Cycling Club', racingAge: 44, licenseCategory: '2', competitionClass: 'women' }, paid: true, licenseReviewed: false },
  { rider: { ...base, firstName: 'Emery', lastName: 'Demo', email: 'emery.demo@example.com', team: 'Demo Wheelers', racingAge: 52, licenseCategory: '4', competitionClass: 'men' }, paid: true, licenseReviewed: true },
  { rider: { ...base, firstName: 'Frankie', lastName: 'Demo', email: 'frankie.demo@example.com', team: 'Sample Velo', racingAge: 24, licenseCategory: '1', competitionClass: 'men' }, paid: false, licenseReviewed: false },
  { rider: { ...base, firstName: 'Gray', lastName: 'Demo', email: 'gray.demo@example.com', team: '', racingAge: 33, licenseCategory: '5', competitionClass: 'women', licenseType: 'one_day' }, paid: true, licenseReviewed: false },
  { rider: { ...base, firstName: 'Harper', lastName: 'Demo', email: 'harper.demo@example.com', team: 'Example Cycling Club', racingAge: 61, licenseCategory: '3', competitionClass: 'men' }, paid: true, licenseReviewed: true },
];

export type CheckIn = ReturnType<typeof createCheckIn>;
