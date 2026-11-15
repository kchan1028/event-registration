import { randomUUID } from 'node:crypto';
import { bibScopeKey, bibSettingsSchema, checkInResult, checkInTiming, DEFAULT_BIB_SETTINGS, MAX_TIMED_CHECK_IN_MS, mergeReadiness, nextFreeBib, rangeFor, type BibSettings } from '../shared/checkin';
import { categoryBibRange } from '../shared/categoryExtras';
import { checkSelection, profileOf, type RiderDetails, type WaiverAcceptance } from '../shared/checkout';
import { evaluateCategory } from '../shared/eligibility';
import { newId } from '../shared/factory';
import { sortCategories } from '../shared/format';
import type { EventConfig } from '../shared/schema';
import type { Db } from './db';
import type { Identity } from './identity';
import type { Orders, OrderView } from './orders';
import { eventLock, HttpError, type Repo } from './repo';

/**
 * Race-day check-in. A rider is one order. Volunteers see only what
 * check-in needs: name, team, entries, readiness, and bib. No email, guardian
 * contact, payment amounts, or emergency details leave this module.
 */
export function createCheckIn(db: Db, repo: Repo, orders: Orders, clock: () => Date, identity: Identity) {
  const nowIso = () => clock().toISOString();

  async function config(eventId: string): Promise<EventConfig> {
    const record = await repo.getEvent(eventId);
    return record.publishedVersion ? repo.getVersion(eventId, record.publishedVersion) : record.config;
  }

  async function settings(eventId: string): Promise<BibSettings> {
    const row = await db.get<{ settings_json: unknown }>(`SELECT settings_json FROM bib_settings WHERE event_id = $1`, [eventId]);
    return row ? bibSettingsSchema.parse(row.settings_json) : DEFAULT_BIB_SETTINGS;
  }

  async function takenBibs(eventId: string, scope: string): Promise<Set<number>> {
    const rows = await db.all<{ bib: number }>(`SELECT bib FROM bib_assignments WHERE event_id = $1 AND scope = $2 AND released_at IS NULL`, [eventId, scope]);
    return new Set(rows.map((r) => r.bib));
  }

  /**
   * One rider made from linked orders (rider identity): the earliest order's details and ID, every
   * order's entries, and paid only when every linked order is paid. An unlinked order is unchanged.
   */
  type Rider = OrderView & { checkInCodes: string[] };
  function mergeRider(group: OrderView[]): Rider {
    const sorted = [...group].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    const first = sorted[0];
    return {
      ...first,
      status: sorted.every((o) => o.status === 'confirmed') ? 'confirmed' : sorted.find((o) => o.status !== 'confirmed')!.status,
      entries: sorted.flatMap((o) => o.entries),
      checkInCodes: sorted.map((o) => o.checkInCode).filter((c): c is string => !!c),
    };
  }

  type BibRow = { order_id: string; bib: number; assigned_at: string; released_at: string | null; release_reason: string | null };
  type UndoRow = { order_id: string; checked_in_at: string; undone_at: string; bib: number | null; bib_released: boolean; reason: string };

  /** Check-ins, bibs, and undone check-ins for one event, day, and bib scope, read once for every rider card. */
  async function dayState(eventId: string, dayId: string, scope: string) {
    const checkIns = await db.all<{ order_id: string; checked_in_at: string }>(`SELECT order_id, checked_in_at FROM check_ins WHERE event_id = $1 AND day_id = $2`, [eventId, dayId]);
    const bibs = await db.all<BibRow>(
      `SELECT order_id, bib, assigned_at, released_at, release_reason FROM bib_assignments WHERE event_id = $1 AND scope = $2 ORDER BY assigned_at, seq`,
      [eventId, scope],
    );
    const undos = await db.all<UndoRow>(
      `SELECT order_id, checked_in_at, undone_at, bib, bib_released, reason FROM check_in_undos WHERE event_id = $1 AND day_id = $2 ORDER BY undone_at, seq`,
      [eventId, dayId],
    );
    const by = <T extends { order_id: string }>(rows: T[]) => {
      const m = new Map<string, T[]>();
      for (const r of rows) m.set(r.order_id, [...(m.get(r.order_id) ?? []), r]);
      return m;
    };
    return { checkedInAt: new Map(checkIns.map((c) => [c.order_id, c.checked_in_at])), bibs: by(bibs), undos: by(undos) };
  }
  type DayState = Awaited<ReturnType<typeof dayState>>;

  function riderCard(o: Rider, dayId: string, state: DayState) {
    const today = o.entries.filter((e) => e.dayId === dayId && e.status !== 'released' && e.status !== 'withdrawn');
    const readiness = mergeReadiness(today.map((e) => e.readiness));
    const payment = o.status === 'confirmed' ? 'confirmed' : 'not_complete';
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
      entries: today.map((e) => ({ id: e.id, categoryId: e.categoryId, categoryName: e.categoryName, code: e.code, raceName: e.raceName, startTime: e.startTime })),
      readiness,
      result,
      bib: bibRows.find((r) => r.released_at === null)?.bib ?? null,
      bibHistory: history,
      checkedInAt: state.checkedInAt.get(o.id) ?? null,
      undoneCheckIns: undone.map((u) => ({ checkedInAt: u.checked_in_at, undoneAt: u.undone_at, bib: u.bib, bibReleased: u.bib_released, reason: u.reason })),
    };
  }

  /** Riders that matter at check-in: live orders (not cancelled or lapsed holds), with linked orders merged into one rider. */
  async function riders(eventId: string): Promise<Rider[]> {
    const key = await identity.keyOf(eventId);
    const groups = new Map<string, OrderView[]>();
    for (const o of await orders.listOrders(eventId)) {
      if (o.status === 'cancelled' || o.status === 'expired') continue;
      const k = key(o.id);
      groups.set(k, [...(groups.get(k) ?? []), o]);
    }
    return [...groups.values()].map(mergeRider);
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

  /** The rider card for an order or any order linked to it; bibs and check-ins live under the rider key. */
  async function cardFor(eventId: string, orderId: string, dayId: string) {
    const o = await orders.getOrder(orderId);
    if (o.eventId !== eventId) throw new HttpError(404, 'Rider not found for this event.');
    const key = (await identity.keyOf(eventId))(orderId);
    const group: OrderView[] = [];
    for (const id of await identity.groupOf(eventId, key)) {
      const x = await orders.getOrder(id);
      if (x.status !== 'cancelled' && x.status !== 'expired') group.push(x);
    }
    const s = await settings(eventId);
    return riderCard(mergeRider(group.length ? group : [o]), dayId, await dayState(eventId, dayId, bibScopeKey(s, dayId)));
  }

  /** Assign a bib inside the configured range without colliding with an active one. */
  /** The category bib range for the rider's races that day (earliest start first), if any category sets one. */
  async function categoryRange(eventId: string, orderId: string, dayId: string) {
    const cfg = await config(eventId);
    const card = await cardFor(eventId, orderId, dayId);
    return categoryBibRange(card.entries.map((e) => ({ id: e.categoryId, bibRange: cfg.categories.find((c) => c.id === e.categoryId)?.bibRange ?? null, startTime: e.startTime })));
  }

  async function assign(eventId: string, orderId: string, dayId: string, s: BibSettings, requested: number | null): Promise<number> {
    const scope = bibScopeKey(s, dayId);
    const catRange = await categoryRange(eventId, orderId, dayId);
    const range = catRange ? { scope, ...catRange } : rangeFor(s, dayId);
    if (!range) throw new HttpError(409, 'No bib range is set for this day. Set bib ranges before checking riders in.');
    const taken = await takenBibs(eventId, scope);
    let bib: number | null = requested;
    if (bib === null) {
      bib = nextFreeBib(range, taken);
      if (bib === null) throw new HttpError(409, `Every bib from ${range.first} to ${range.last} is in use. Extend the bib range.`);
    } else {
      if (bib < range.first || bib > range.last) throw new HttpError(422, `Bib ${bib} is outside the range ${range.first}–${range.last}.`);
      if (taken.has(bib)) throw new HttpError(409, `Bib ${bib} is already issued to another rider.`);
    }
    await db.run(`INSERT INTO bib_assignments (id, event_id, scope, order_id, bib, assigned_at) VALUES ($1, $2, $3, $4, $5, $6)`, [newId('bib'), eventId, scope, orderId, bib, nowIso()]);
    return bib;
  }

  return {
    async list(eventId: string, dayId: string | undefined, q: string) {
      const cfg = await config(eventId);
      const day = dayId ? requireDay(cfg, dayId) : cfg.days[0];
      const s = await settings(eventId);
      const state = await dayState(eventId, day.id, bibScopeKey(s, day.id));
      const all = (await riders(eventId)).map((o) => riderCard(o, day.id, state)).sort((a, b) => a.name.localeCompare(b.name));
      const enteredToday = all.filter((c) => c.entries.length > 0);
      // A search also finds riders with no entry today, so the volunteer sees why; the plain list shows only today's riders.
      const cards = q.trim() ? all.filter((c) => matches(c, q)) : enteredToday;
      const scope = bibScopeKey(s, day.id);
      const summary = {
        riders: enteredToday.length,
        checkedIn: enteredToday.filter((c) => c.checkedInAt).length,
        blocked: enteredToday.filter((c) => !c.result.ready).length,
        bibsIssued: (await takenBibs(eventId, scope)).size,
        /** Measured standard check-ins for this day (product.md target: median under 30 s, 95th percentile under 90 s). */
        timing: checkInTiming(
          (await db.all<{ duration_ms: number }>(`SELECT duration_ms FROM check_ins WHERE event_id = $1 AND day_id = $2 AND duration_ms IS NOT NULL`, [eventId, day.id])).map((r) => r.duration_ms),
        ),
      };
      return {
        eventId,
        eventName: cfg.event.name,
        isDemo: cfg.event.isDemo,
        published: (await repo.getEvent(eventId)).publishedVersion !== null,
        days: cfg.days.map((d) => ({ id: d.id, label: d.label, date: d.date })),
        dayId: day.id,
        settings: s,
        summary,
        riders: q.trim() ? cards.slice(0, 50) : cards,
      };
    },

    async saveSettings(eventId: string, input: unknown) {
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
        if (!card.result.ready) throw new HttpError(409, `Not ready to race: ${card.result.blockers.map((b) => b.label.toLowerCase()).join(', ')}.`);
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

    /** Swap a rider's bib. The old one stays in the history with the reason. */
    async changeBib(eventId: string, orderId: string, dayId: string, bib: number, reason: string) {
      requireDay(await config(eventId), dayId);
      orderId = (await identity.keyOf(eventId))(orderId);
      return db.transaction(async () => {
        await db.lock(eventLock(eventId));
        const card = await cardFor(eventId, orderId, dayId);
        if (card.bib === null) throw new HttpError(409, 'This rider has no bib yet. Check them in first.');
        if (card.bib === bib) return card;
        const s = await settings(eventId);
        const scope = bibScopeKey(s, dayId);
        await db.run(`UPDATE bib_assignments SET released_at = $1, release_reason = $2 WHERE event_id = $3 AND scope = $4 AND order_id = $5 AND released_at IS NULL`, [
          nowIso(),
          reason,
          eventId,
          scope,
          orderId,
        ]);
        await assign(eventId, orderId, dayId, s, bib);
        return cardFor(eventId, orderId, dayId);
      });
    },

    /**
     * Fictional riders for trying check-in: paid with a simulated payment, a mix
     * of reviewed and unreviewed licenses, and one unpaid hold.
     */
    async addDemoRiders(eventId: string) {
      const record = await repo.getEvent(eventId);
      if (!record.publishedVersion) throw new HttpError(409, 'Publish the event first. Check-in uses the published schedule.');
      const cfg = await repo.getVersion(eventId, record.publishedVersion);
      const created: string[] = [];
      for (const p of DEMO_RIDERS) {
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
        const needsGuardian = categoryIds.some((id) => cfg.categories.find((c) => c.id === id)?.eligibility.guardianRequired);
        const rider = full(needsGuardian || p.rider.racingAge < 18 ? { name: 'Jordan Demo', relationship: 'Parent', email: 'jordan.demo@example.com', phone: '' } : null);
        const waiver: WaiverAcceptance = {
          version: cfg.registration.waiverVersion,
          read: true,
          agreed: true,
          signerRole: needsGuardian ? 'guardian' : 'rider',
          signatureName: needsGuardian ? (rider.guardian?.name ?? '') : `${rider.firstName} ${rider.lastName}`,
        };
        const order = await orders.createOrder(eventId, {
          clientRequestId: `demo-checkin-${randomUUID()}`,
          categoryIds,
          rider,
          waiver,
        });
        if (p.paid) await orders.pay(order.id, `demo-${randomUUID()}`, 'success');
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

type DemoRider = { rider: Omit<RiderDetails, 'guardian' | 'phone' | 'licenseNumber' | 'demoRiderId' | 'emergencyContact'>; paid: boolean; licenseReviewed: boolean };

const base = { collegiateDivision: null, licenseType: 'annual' as const };
const DEMO_RIDERS: DemoRider[] = [
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
