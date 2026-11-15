import { randomInt } from 'node:crypto';
import { canAdmit, remainingForCategory } from '../shared/capacity';
import { checkSelection, checkSignature, enforcesWindows, localNow, profileOf, readiness, riderDetailsSchema, waiverAcceptanceSchema, windowState, type RiderDetails, type WaiverAcceptance } from '../shared/checkout';
import { demoRider } from '../shared/fixtures';
import { newId } from '../shared/factory';
import { quote, todayIn, type Quote } from '../shared/pricing';
import type { EventConfig } from '../shared/schema';
import type { Db } from './db';
import { HttpError, type Repo } from './repo';

/**
 * Checkout prototype: atomic holds, simulated payment, and organizer review.
 * Payment is simulated. Nothing is charged and no provider is called.
 */

export type OrderStatus = 'held' | 'payment_failed' | 'confirmed' | 'expired' | 'cancelled' | 'needs_attention';

interface OrderRow {
  id: string;
  event_id: string;
  published_version: number;
  client_request_id: string;
  status: OrderStatus;
  rider_json: string;
  waiver_json: string;
  quote_json: string;
  total_cents: number;
  hold_expires_at: string;
  check_in_code: string | null;
  created_at: string;
  confirmed_at: string | null;
}

interface EntryRow {
  id: string;
  order_id: string;
  category_id: string;
  rider_ref: string;
  status: 'held' | 'confirmed' | 'released';
  license_reviewed: number;
  license_review_note: string | null;
  license_reviewed_at: string | null;
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Opaque check-in code: identifies the order, contains no rider details, hard to guess. */
function checkInCode(): string {
  let s = '';
  for (let i = 0; i < 10; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

export function createOrders(db: Db, repo: Repo, clock: () => Date, holdMinutes: number) {
  const nowIso = () => clock().toISOString();
  const orderRow = db.prepare<[string], OrderRow>(`SELECT * FROM orders WHERE id = ?`);
  const entryRows = db.prepare<[string], EntryRow>(`SELECT * FROM order_entries WHERE order_id = ? ORDER BY rowid`);

  function publishedConfig(eventId: string): { config: EventConfig; version: number; organizationName: string } {
    const record = repo.getEvent(eventId);
    if (!record.publishedVersion) throw new HttpError(409, 'Registration is not open: this event has no published version yet.');
    return { config: repo.getVersion(eventId, record.publishedVersion), version: record.publishedVersion, organizationName: record.organizationName };
  }

  /** Effective status: holds that ran out read as expired without a background job. */
  function effectiveStatus(row: OrderRow): OrderStatus {
    if ((row.status === 'held' || row.status === 'payment_failed') && row.hold_expires_at <= nowIso()) return 'expired';
    return row.status;
  }

  function view(id: string) {
    const row = orderRow.get(id);
    if (!row) throw new HttpError(404, 'Order not found.');
    const config = repo.getVersion(row.event_id, row.published_version);
    const rider = JSON.parse(row.rider_json) as RiderDetails;
    const waiver = JSON.parse(row.waiver_json) as WaiverAcceptance;
    const q = JSON.parse(row.quote_json) as Quote;
    const status = effectiveStatus(row);
    const guardianRequired = entryRows.all(id).some((e) => config.categories.find((c) => c.id === e.category_id)?.eligibility.guardianRequired);
    const entries = entryRows.all(id).map((e) => {
      const cat = config.categories.find((c) => c.id === e.category_id);
      const race = config.races.find((r) => r.id === cat?.raceId);
      const sg = config.startGroups.find((g) => g.id === cat?.startGroupId);
      return {
        id: e.id,
        categoryId: e.category_id,
        categoryName: cat?.name ?? 'Removed category',
        code: cat?.classifications[0]?.code || cat?.timingCode || '',
        raceName: race?.name ?? '',
        dayId: race?.dayId ?? '',
        startTime: sg?.startTime ?? null,
        status: e.status === 'held' && status === 'expired' ? 'released' : e.status,
        licenseReviewed: e.license_reviewed === 1,
        licenseReviewNote: e.license_review_note,
        readiness: readiness({
          licenseReviewed: e.license_reviewed === 1,
          licenseNote: e.license_review_note,
          signerName: waiver.signatureName,
          guardianRequired: !!cat?.eligibility.guardianRequired,
          guardianSigned: waiver.signerRole === 'guardian',
        }),
      };
    });
    return {
      id: row.id,
      /** Shown to riders; marked as a demo because payment is simulated. */
      orderNumber: `DEMO-${row.id.slice(4, 12).toUpperCase()}`,
      eventId: row.event_id,
      eventName: config.event.name,
      isDemo: config.event.isDemo,
      publishedVersion: row.published_version,
      status,
      rider,
      waiver,
      guardianRequired,
      quote: q,
      totalCents: row.total_cents,
      holdExpiresAt: row.hold_expires_at,
      checkInCode: status === 'confirmed' ? row.check_in_code : null,
      createdAt: row.created_at,
      confirmedAt: row.confirmed_at,
      refundPolicy: config.registration.refundPolicy,
      entries,
    };
  }

  /** Re-check and take places for every entry of an order, all or nothing. */
  function admitAll(config: EventConfig, eventId: string, categoryIds: string[], riderRef: string): { ok: true } | { ok: false; message: string; categoryId: string } {
    const current = repo.entries(eventId);
    for (const categoryId of categoryIds) {
      const r = canAdmit(config, current, categoryId, riderRef);
      const name = config.categories.find((c) => c.id === categoryId)?.name ?? 'A category';
      if (!r.ok) {
        const message =
          r.reason === 'full' ? `${name} is full (${r.blockedBy.name}: ${r.blockedBy.used} of ${r.blockedBy.limit}).` : r.reason === 'closed' ? `${name} is closed to new entries.` : `${name} cannot be entered.`;
        return { ok: false, message, categoryId };
      }
      current.push({ id: `pending-${categoryId}`, categoryId, riderRef });
    }
    return { ok: true };
  }

  return {
    publicEvent(eventId: string) {
      const { config, version, organizationName } = publishedConfig(eventId);
      const entries = repo.entries(eventId);
      const remaining: Record<string, number | null> = {};
      for (const c of config.categories) remaining[c.id] = remainingForCategory(config, entries, c.id);
      return {
        eventId,
        publishedVersion: version,
        organizationName,
        config,
        remaining,
        today: todayIn(config.event.timeZone, clock()),
        nowLocal: localNow(config.event.timeZone, clock()),
        enforceWindows: enforcesWindows(config),
        holdMinutes,
      };
    },

    /**
     * Validate the order and hold every place in one immediate transaction.
     * Either all entries are held or none are. A repeated request with the
     * same client request ID returns the first order instead of a duplicate.
     */
    createOrder(eventId: string, input: { clientRequestId: string; categoryIds: string[]; rider?: unknown; waiver?: unknown }) {
      return db
        .transaction(() => {
          const existing = db.prepare<[string, string], { id: string }>(`SELECT id FROM orders WHERE event_id = ? AND client_request_id = ?`).get(eventId, input.clientRequestId);
          if (existing) return view(existing.id);

          const { config, version } = publishedConfig(eventId);
          const rider = riderDetailsSchema.parse(input.rider);
          const waiver = waiverAcceptanceSchema.parse(input.waiver);
          if (waiver.version !== config.registration.waiverVersion) throw new HttpError(409, 'The waiver changed while you were registering. Read the current version and accept it again.');

          // Registration windows are checked when places are held; a hold taken while open may be paid within its time.
          const check = checkSelection(config, input.categoryIds, profileOf(rider), { nowLocal: localNow(config.event.timeZone, clock()) });
          if (!check.ok) throw new HttpError(422, check.problems[0], check.problems);
          if (check.needsGuardian && !rider.guardian) throw new HttpError(422, 'Riders under 18 need a parent or guardian. Enter their name.');
          const signatureProblem = checkSignature(rider, waiver, check.needsGuardian);
          if (signatureProblem) throw new HttpError(422, signatureProblem);

          const id = newId('ord');
          const riderRef = `rider-${id}`;
          const admitted = admitAll(config, eventId, input.categoryIds, riderRef);
          if (!admitted.ok) throw new HttpError(409, `${admitted.message} Nothing was held. Choose another race and try again.`, { categoryId: admitted.categoryId });

          const q = quote(config, input.categoryIds, todayIn(config.event.timeZone, clock()));
          const t = nowIso();
          const expires = new Date(clock().getTime() + holdMinutes * 60_000).toISOString();
          db.prepare(
            `INSERT INTO orders (id, event_id, published_version, client_request_id, status, rider_json, waiver_json, quote_json, total_cents, hold_expires_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'held', ?, ?, ?, ?, ?, ?, ?)`,
          ).run(id, eventId, version, input.clientRequestId, JSON.stringify(rider), JSON.stringify(waiver), JSON.stringify(q), q.totalCents, expires, t, t);
          // Demo riders on demo events carry a simulated license result from the fixtures; everyone else needs review.
          const fixture = config.event.isDemo ? demoRider(rider.demoRiderId) : undefined;
          const simulatedValid = !!fixture && fixture.licenseCheck === 'simulated_valid' && fixture.licenseNumber === rider.licenseNumber;
          const ins = db.prepare(
            `INSERT INTO order_entries (id, order_id, event_id, category_id, rider_ref, status, license_reviewed, license_review_note, license_reviewed_at) VALUES (?, ?, ?, ?, ?, 'held', ?, ?, ?)`,
          );
          for (const categoryId of input.categoryIds) {
            ins.run(newId('oe'), id, eventId, categoryId, riderRef, simulatedValid ? 1 : 0, simulatedValid ? 'Simulated license check: valid (demo fixture)' : null, simulatedValid ? t : null);
          }
          return view(id);
        })
        .immediate();
    },

    getOrder: view,

    /**
     * Process a simulated payment notification exactly once per attempt ID.
     * A success after the hold expired confirms only if every place is still
     * free; otherwise the order goes to the organizer's exception queue.
     */
    pay(orderId: string, attemptId: string, outcome: 'success' | 'failure') {
      return db
        .transaction(() => {
          const seen = db.prepare<[string], { order_id: string }>(`SELECT order_id FROM payment_attempts WHERE id = ?`).get(attemptId);
          if (seen) {
            if (seen.order_id !== orderId) throw new HttpError(409, 'This payment attempt belongs to another order.');
            return view(orderId);
          }
          const row = orderRow.get(orderId);
          if (!row) throw new HttpError(404, 'Order not found.');
          const status = effectiveStatus(row);
          const t = nowIso();
          let next: OrderStatus = status;

          if (status === 'confirmed' || status === 'needs_attention') {
            next = status; // duplicate or late notification: nothing changes
          } else if (outcome === 'failure') {
            next = status === 'held' ? 'payment_failed' : status;
          } else if (status === 'held' || status === 'payment_failed') {
            next = 'confirmed';
          } else if (status === 'cancelled') {
            // The rider walked away; money arriving now goes to a person, never a silent re-entry.
            next = 'needs_attention';
          } else {
            // expired: try to take the places again, all or nothing.
            const config = repo.getVersion(row.event_id, row.published_version);
            const ids = entryRows.all(orderId).map((e) => e.category_id);
            const riderRef = entryRows.all(orderId)[0]?.rider_ref ?? `rider-${orderId}`;
            // The hold ended, so the order needs places again: windows must still be open and every place free.
            const nowLocal = localNow(config.event.timeZone, clock());
            const windowsOpen =
              !enforcesWindows(config) || ids.every((id) => { const c = config.categories.find((x) => x.id === id); return !c || windowState(c, nowLocal) === 'open'; });
            next = windowsOpen && admitAll(config, row.event_id, ids, riderRef).ok ? 'confirmed' : 'needs_attention';
          }

          if (next !== row.status) {
            if (next === 'confirmed') {
              db.prepare(`UPDATE orders SET status = 'confirmed', check_in_code = ?, confirmed_at = ?, updated_at = ? WHERE id = ?`).run(checkInCode(), t, t, orderId);
              db.prepare(`UPDATE order_entries SET status = 'confirmed' WHERE order_id = ?`).run(orderId);
            } else {
              db.prepare(`UPDATE orders SET status = ?, updated_at = ? WHERE id = ?`).run(next, t, orderId);
              if (next === 'needs_attention') db.prepare(`UPDATE order_entries SET status = 'released' WHERE order_id = ?`).run(orderId);
            }
          }
          db.prepare(`INSERT INTO payment_attempts (id, order_id, outcome, result_status, created_at) VALUES (?, ?, ?, ?, ?)`).run(attemptId, orderId, outcome, next, t);
          return view(orderId);
        })
        .immediate();
    },

    /** The rider leaves before paying: release the held places now. */
    cancel(orderId: string) {
      return db
        .transaction(() => {
          const row = orderRow.get(orderId);
          if (!row) throw new HttpError(404, 'Order not found.');
          const status = effectiveStatus(row);
          if (status === 'held' || status === 'payment_failed' || status === 'expired') {
            db.prepare(`UPDATE orders SET status = 'cancelled', updated_at = ? WHERE id = ?`).run(nowIso(), orderId);
            db.prepare(`UPDATE order_entries SET status = 'released' WHERE order_id = ?`).run(orderId);
          }
          return view(orderId);
        })
        .immediate();
    },

    listOrders(eventId: string) {
      repo.getEvent(eventId);
      const ids = db.prepare<[string], { id: string }>(`SELECT id FROM orders WHERE event_id = ? ORDER BY created_at DESC`).all(eventId);
      return ids.map((r) => view(r.id));
    },

    /** Organizer marks a license as reviewed. Needs a reason; the time is recorded. */
    reviewLicense(entryId: string, note: string) {
      const row = db.prepare<[string], { order_id: string }>(`SELECT order_id FROM order_entries WHERE id = ?`).get(entryId);
      if (!row) throw new HttpError(404, 'Entry not found.');
      db.prepare(`UPDATE order_entries SET license_reviewed = 1, license_review_note = ?, license_reviewed_at = ? WHERE id = ?`).run(note, nowIso(), entryId);
      return view(row.order_id);
    },
  };
}

export type Orders = ReturnType<typeof createOrders>;
export type OrderView = ReturnType<Orders['getOrder']>;
