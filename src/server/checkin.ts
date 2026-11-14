import { randomUUID } from 'node:crypto';
import { bibScopeKey, bibSettingsSchema, checkInResult, DEFAULT_BIB_SETTINGS, mergeReadiness, nextFreeBib, rangeFor, type BibSettings } from '../shared/checkin';
import { checkSelection, profileOf, type RiderDetails } from '../shared/checkout';
import { evaluateCategory } from '../shared/eligibility';
import { newId } from '../shared/factory';
import { sortCategories } from '../shared/format';
import type { EventConfig } from '../shared/schema';
import type { Db } from './db';
import type { Orders, OrderView } from './orders';
import { HttpError, type Repo } from './repo';

/**
 * Race-day check-in (prototype). A rider is one order. Volunteers see only what
 * check-in needs: name, team, entries, readiness, and bib. No email, guardian
 * contact, payment amounts, or emergency details leave this module.
 */
export function createCheckIn(db: Db, repo: Repo, orders: Orders, clock: () => Date) {
  const nowIso = () => clock().toISOString();

  function config(eventId: string): EventConfig {
    const record = repo.getEvent(eventId);
    return record.publishedVersion ? repo.getVersion(eventId, record.publishedVersion) : record.config;
  }

  function settings(eventId: string): BibSettings {
    const row = db.prepare<[string], { settings_json: string }>(`SELECT settings_json FROM bib_settings WHERE event_id = ?`).get(eventId);
    return row ? bibSettingsSchema.parse(JSON.parse(row.settings_json)) : DEFAULT_BIB_SETTINGS;
  }

  function activeBib(eventId: string, scope: string, orderId: string): number | null {
    return db.prepare<[string, string, string], { bib: number }>(`SELECT bib FROM bib_assignments WHERE event_id = ? AND scope = ? AND order_id = ? AND released_at IS NULL`).get(eventId, scope, orderId)?.bib ?? null;
  }

  function takenBibs(eventId: string, scope: string): Set<number> {
    return new Set(db.prepare<[string, string], { bib: number }>(`SELECT bib FROM bib_assignments WHERE event_id = ? AND scope = ? AND released_at IS NULL`).all(eventId, scope).map((r) => r.bib));
  }

  function riderCard(o: OrderView, dayId: string, s: BibSettings) {
    const scope = bibScopeKey(s, dayId);
    const today = o.entries.filter((e) => e.dayId === dayId && e.status !== 'released');
    const readiness = mergeReadiness(today.map((e) => e.readiness));
    const payment = o.status === 'confirmed' ? 'confirmed' : 'not_complete';
    const result = checkInResult({ payment, entriesToday: today.length, readiness });
    const checkIn = db.prepare<[string, string], { checked_in_at: string }>(`SELECT checked_in_at FROM check_ins WHERE order_id = ? AND day_id = ?`).get(o.id, dayId);
    const history = db
      .prepare<[string, string, string], { bib: number; assigned_at: string; released_at: string | null; release_reason: string | null }>(
        `SELECT bib, assigned_at, released_at, release_reason FROM bib_assignments WHERE event_id = ? AND scope = ? AND order_id = ? ORDER BY assigned_at`,
      )
      .all(o.eventId, scope, o.id)
      .map((r) => ({ bib: r.bib, assignedAt: r.assigned_at, releasedAt: r.released_at, reason: r.release_reason }));
    return {
      orderId: o.id,
      checkInCode: o.checkInCode,
      name: `${o.rider.firstName} ${o.rider.lastName}`,
      team: o.rider.team,
      racingAge: o.rider.racingAge,
      payment,
      entries: today.map((e) => ({ id: e.id, categoryName: e.categoryName, code: e.code, raceName: e.raceName, startTime: e.startTime })),
      readiness,
      result,
      bib: activeBib(o.eventId, scope, o.id),
      bibHistory: history,
      checkedInAt: checkIn?.checked_in_at ?? null,
    };
  }

  /** Orders that matter at check-in: anything a rider might show up with, except cancelled or lapsed holds. */
  function riders(eventId: string) {
    return orders.listOrders(eventId).filter((o) => o.status !== 'cancelled' && o.status !== 'expired');
  }

  function matches(card: ReturnType<typeof riderCard>, q: string): boolean {
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    const bare = (v: string) => v.toLowerCase().replace(/[\s-]/g, '');
    if (card.checkInCode && bare(card.checkInCode) === bare(needle)) return true;
    if (/^\d+$/.test(needle) && card.bib === Number(needle)) return true;
    return card.name.toLowerCase().includes(needle) || card.team.toLowerCase().includes(needle);
  }

  function requireDay(cfg: EventConfig, dayId: string) {
    const day = cfg.days.find((d) => d.id === dayId);
    if (!day) throw new HttpError(400, 'That race day is not part of this event.');
    return day;
  }

  function cardFor(eventId: string, orderId: string, dayId: string) {
    const o = orders.getOrder(orderId);
    if (o.eventId !== eventId) throw new HttpError(404, 'Rider not found for this event.');
    return riderCard(o, dayId, settings(eventId));
  }

  /** Assign a bib inside the configured range without colliding with an active one. */
  function assign(eventId: string, orderId: string, dayId: string, s: BibSettings, requested: number | null): number {
    const scope = bibScopeKey(s, dayId);
    const range = rangeFor(s, dayId);
    if (!range) throw new HttpError(409, 'No bib range is set for this day. Set bib ranges before checking riders in.');
    const taken = takenBibs(eventId, scope);
    let bib: number | null = requested;
    if (bib === null) {
      bib = nextFreeBib(range, taken);
      if (bib === null) throw new HttpError(409, `Every bib from ${range.first} to ${range.last} is in use. Extend the bib range.`);
    } else {
      if (bib < range.first || bib > range.last) throw new HttpError(422, `Bib ${bib} is outside the range ${range.first}–${range.last}.`);
      if (taken.has(bib)) throw new HttpError(409, `Bib ${bib} is already issued to another rider.`);
    }
    db.prepare(`INSERT INTO bib_assignments (id, event_id, scope, order_id, bib, assigned_at) VALUES (?, ?, ?, ?, ?, ?)`).run(newId('bib'), eventId, scope, orderId, bib, nowIso());
    return bib;
  }

  return {
    list(eventId: string, dayId: string | undefined, q: string) {
      const cfg = config(eventId);
      const day = dayId ? requireDay(cfg, dayId) : cfg.days[0];
      const s = settings(eventId);
      const cards = riders(eventId)
        .map((o) => riderCard(o, day.id, s))
        .filter((c) => matches(c, q))
        .sort((a, b) => a.name.localeCompare(b.name));
      const scope = bibScopeKey(s, day.id);
      const summary = {
        riders: cards.length,
        checkedIn: cards.filter((c) => c.checkedInAt).length,
        blocked: cards.filter((c) => !c.result.ready && c.entries.length > 0).length,
        bibsIssued: takenBibs(eventId, scope).size,
      };
      return {
        eventId,
        eventName: cfg.event.name,
        isDemo: cfg.event.isDemo,
        published: repo.getEvent(eventId).publishedVersion !== null,
        days: cfg.days.map((d) => ({ id: d.id, label: d.label, date: d.date })),
        dayId: day.id,
        settings: s,
        summary,
        riders: q.trim() ? cards.slice(0, 50) : cards,
      };
    },

    saveSettings(eventId: string, input: unknown) {
      const cfg = config(eventId);
      const s = bibSettingsSchema.parse(input);
      const validScopes = s.scope === 'weekend' ? ['weekend'] : cfg.days.map((d) => d.id);
      for (const r of s.ranges) if (!validScopes.includes(r.scope)) throw new HttpError(422, 'A bib range does not match the chosen bib scope.');
      if (new Set(s.ranges.map((r) => r.scope)).size !== s.ranges.length) throw new HttpError(422, 'Each day can have only one bib range.');
      db.prepare(`INSERT INTO bib_settings (event_id, settings_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(event_id) DO UPDATE SET settings_json = excluded.settings_json, updated_at = excluded.updated_at`).run(
        eventId,
        JSON.stringify(s),
        nowIso(),
      );
      return s;
    },

    /**
     * Check a ready rider in and issue a bib. Repeating it is safe: the first
     * check-in time and the existing bib come back unchanged.
     */
    checkIn(eventId: string, orderId: string, dayId: string, requestedBib: number | null) {
      requireDay(config(eventId), dayId);
      return db
        .transaction(() => {
          const card = cardFor(eventId, orderId, dayId);
          if (card.checkedInAt && card.bib !== null) return card;
          if (!card.result.ready) throw new HttpError(409, `Not ready to race: ${card.result.blockers.map((b) => b.label.toLowerCase()).join(', ')}.`);
          const s = settings(eventId);
          if (card.bib === null) assign(eventId, orderId, dayId, s, requestedBib);
          db.prepare(`INSERT OR IGNORE INTO check_ins (id, event_id, order_id, day_id, checked_in_at) VALUES (?, ?, ?, ?, ?)`).run(newId('chk'), eventId, orderId, dayId, nowIso());
          return cardFor(eventId, orderId, dayId);
        })
        .immediate();
    },

    /** Swap a rider's bib. The old one stays in the history with the reason. */
    changeBib(eventId: string, orderId: string, dayId: string, bib: number, reason: string) {
      requireDay(config(eventId), dayId);
      return db
        .transaction(() => {
          const card = cardFor(eventId, orderId, dayId);
          if (card.bib === null) throw new HttpError(409, 'This rider has no bib yet. Check them in first.');
          if (card.bib === bib) return card;
          const s = settings(eventId);
          const scope = bibScopeKey(s, dayId);
          db.prepare(`UPDATE bib_assignments SET released_at = ?, release_reason = ? WHERE event_id = ? AND scope = ? AND order_id = ? AND released_at IS NULL`).run(nowIso(), reason, eventId, scope, orderId);
          assign(eventId, orderId, dayId, s, bib);
          return cardFor(eventId, orderId, dayId);
        })
        .immediate();
    },

    /**
     * Fictional riders for trying check-in: paid with a simulated payment, a mix
     * of reviewed and unreviewed licenses, and one unpaid hold.
     */
    addDemoRiders(eventId: string) {
      const record = repo.getEvent(eventId);
      if (!record.publishedVersion) throw new HttpError(409, 'Publish the event first. Check-in uses the published schedule.');
      const cfg = repo.getVersion(eventId, record.publishedVersion);
      const created: string[] = [];
      for (const p of DEMO_RIDERS) {
        const categoryIds = pickEntries(cfg, { ...p.rider, guardian: null });
        if (categoryIds.length === 0) continue;
        const needsGuardian = categoryIds.some((id) => cfg.categories.find((c) => c.id === id)?.eligibility.guardianRequired);
        const rider: RiderDetails = { ...p.rider, guardian: needsGuardian || p.rider.racingAge < 18 ? { name: 'Jordan Demo', relationship: 'Parent' } : null };
        const order = orders.createOrder(eventId, {
          clientRequestId: `demo-checkin-${randomUUID()}`,
          categoryIds,
          rider,
          waiver: { version: cfg.registration.waiverVersion, riderAccepted: true, guardianAccepted: !!rider.guardian },
        });
        if (p.paid) orders.pay(order.id, `demo-${randomUUID()}`, 'success');
        if (p.licenseReviewed) for (const e of order.entries) orders.reviewLicense(e.id, 'Demo: license card shown at the desk (simulated).');
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

type DemoRider = { rider: Omit<RiderDetails, 'guardian'>; paid: boolean; licenseReviewed: boolean };

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
