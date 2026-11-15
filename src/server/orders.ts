import { randomInt } from 'node:crypto';
import { canAdmit, remainingForCategory } from '../shared/capacity';
import { evaluateCategory } from '../shared/eligibility';
import { checkSelection, checkSignature, enforcesWindows, findConflicts, localNow, profileOf, readiness, riderDetailsSchema, waiverAcceptanceSchema, windowState, type RiderDetails, type WaiverAcceptance } from '../shared/checkout';
import { demoRider } from '../shared/fixtures';
import { newId } from '../shared/factory';
import { categoryPrice, quote, todayIn, type Quote } from '../shared/pricing';
import { checkExtras, describeAnswers, EMPTY_EXTRAS, orderExtrasSchema, pruneExtras, type OrderExtras } from '../shared/categoryExtras';
import type { EventConfig } from '../shared/schema';
import { blocksPublicSale, effectiveWaitlistStatus, type StoredWaitlistStatus } from '../shared/waitlist';
import type { Db } from './db';
import { eventLock, HttpError, type Repo } from './repo';

/**
 * Checkout: atomic holds, simulated payment, and organizer review.
 * Payment is simulated. Nothing is charged and no provider is called.
 */

export type OrderStatus = 'held' | 'payment_failed' | 'confirmed' | 'expired' | 'cancelled' | 'needs_attention';

interface OrderRow {
  id: string;
  event_id: string;
  published_version: number;
  client_request_id: string;
  status: OrderStatus;
  rider_json: RiderDetails;
  waiver_json: WaiverAcceptance;
  quote_json: Quote;
  total_cents: number;
  hold_expires_at: string;
  check_in_code: string | null;
  created_at: string;
  confirmed_at: string | null;
  extras_json: OrderExtras | null;
}

interface ChangeRow {
  order_id: string;
  entry_id: string;
  kind: 'transfer' | 'withdraw';
  from_category_id: string;
  to_category_id: string | null;
  amount_paid_cents: number;
  new_price_cents: number | null;
  difference_cents: number | null;
  reason: string;
  created_at: string;
}

interface EntryRow {
  id: string;
  order_id: string;
  category_id: string;
  rider_ref: string;
  status: 'held' | 'confirmed' | 'released' | 'withdrawn';
  original_category_id: string | null;
  withdrawn_at: string | null;
  license_reviewed: boolean;
  license_review_note: string | null;
  license_reviewed_at: string | null;
}

function groupBy<T extends { order_id: string }>(rows: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) out.set(r.order_id, [...(out.get(r.order_id) ?? []), r]);
  return out;
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
  const orderRow = (id: string) => db.get<OrderRow>(`SELECT * FROM orders WHERE id = $1`, [id]);
  const entryRows = (orderId: string) => db.all<EntryRow>(`SELECT * FROM order_entries WHERE order_id = $1 ORDER BY seq`, [orderId]);

  async function publishedConfig(eventId: string): Promise<{ config: EventConfig; version: number; organizationName: string }> {
    const record = await repo.getEvent(eventId);
    if (!record.publishedVersion) throw new HttpError(409, 'Registration is not open: this event has no published version yet.');
    return { config: await repo.getVersion(eventId, record.publishedVersion), version: record.publishedVersion, organizationName: record.organizationName };
  }

  /** Inside a transaction: take the event lock of the order or entry that `sql` finds, if it exists. */
  async function lockEventOf(sql: string, id: string) {
    const row = await db.get<{ event_id: string }>(sql, [id]);
    if (row) await db.lock(eventLock(row.event_id));
  }

  /** Effective status: holds that ran out read as expired without a background job. */
  function effectiveStatus(row: OrderRow): OrderStatus {
    if ((row.status === 'held' || row.status === 'payment_failed') && row.hold_expires_at <= nowIso()) return 'expired';
    return row.status;
  }

  /**
   * Views for many orders with a fixed number of queries: one per event for its versions, then
   * every entry and change of the orders at once. Same result as building each order alone.
   */
  async function viewsOf(rows: OrderRow[]) {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const configs = new Map<string, EventConfig>();
    const latestByEvent = new Map<string, number | null>();
    for (const eventId of new Set(rows.map((r) => r.event_id))) {
      const latest = (await repo.getEvent(eventId)).publishedVersion;
      latestByEvent.set(eventId, latest);
      const wanted = rows.filter((r) => r.event_id === eventId).map((r) => r.published_version);
      if (latest) wanted.push(latest);
      for (const [v, cfg] of await repo.getVersions(eventId, wanted)) configs.set(`${eventId}:${v}`, cfg);
    }
    const entries = groupBy(await db.all<EntryRow>(`SELECT * FROM order_entries WHERE order_id = ANY($1) ORDER BY seq`, [ids]));
    const changes = groupBy(
      await db.all<ChangeRow>(
        `SELECT order_id, entry_id, kind, from_category_id, to_category_id, amount_paid_cents, new_price_cents, difference_cents, reason, created_at FROM entry_changes WHERE order_id = ANY($1) ORDER BY created_at, seq`,
        [ids],
      ),
    );
    return rows.map((row) => {
      const config = configs.get(`${row.event_id}:${row.published_version}`)!;
      // A transfer can move an entry to a category added in a later published version.
      const latestVersion = latestByEvent.get(row.event_id);
      const latest = latestVersion ? configs.get(`${row.event_id}:${latestVersion}`)! : config;
      return buildView(row, config, latest, entries.get(row.id) ?? [], changes.get(row.id) ?? []);
    });
  }

  async function view(id: string) {
    const row = await orderRow(id);
    if (!row) throw new HttpError(404, 'Order not found.');
    return (await viewsOf([row]))[0];
  }

  function buildView(row: OrderRow, config: EventConfig, latest: EventConfig, rows: EntryRow[], changes: ChangeRow[]) {
    const findCat = (id: string) => config.categories.find((c) => c.id === id) ?? latest.categories.find((c) => c.id === id);
    const rider = row.rider_json;
    const waiver = row.waiver_json;
    const q = row.quote_json;
    const extras: OrderExtras = row.extras_json ?? EMPTY_EXTRAS;
    const status = effectiveStatus(row);
    const guardianRequired = rows.some((e) => config.categories.find((c) => c.id === e.category_id)?.eligibility.guardianRequired);
    const entries = rows.map((e) => {
      const cat = findCat(e.category_id);
      const cfg = config.categories.some((c) => c.id === e.category_id) ? config : latest;
      const race = cfg.races.find((r) => r.id === cat?.raceId);
      const sg = cfg.startGroups.find((g) => g.id === cat?.startGroupId);
      const paidLine = q.lines.find((l) => l.categoryId === (e.original_category_id ?? e.category_id));
      return {
        id: e.id,
        categoryId: e.category_id,
        categoryName: cat?.name ?? 'Removed category',
        code: cat?.classifications[0]?.code || cat?.timingCode || '',
        raceName: race?.name ?? '',
        dayId: race?.dayId ?? '',
        startTime: sg?.startTime ?? null,
        status: e.status === 'held' && status === 'expired' ? 'released' : e.status,
        licenseReviewed: e.license_reviewed,
        licenseReviewNote: e.license_review_note,
        /** What the rider paid for this entry at purchase (after discounts). Never changed by a transfer or withdrawal. */
        amountPaidCents: paidLine?.totalCents ?? 0,
        withdrawnAt: e.withdrawn_at,
        changes: changes
          .filter((c) => c.entry_id === e.id)
          .map((c) => ({
            kind: c.kind,
            fromCategoryName: findCat(c.from_category_id)?.name ?? 'Removed category',
            toCategoryName: c.to_category_id ? (findCat(c.to_category_id)?.name ?? 'Removed category') : null,
            amountPaidCents: c.amount_paid_cents,
            newPriceCents: c.new_price_cents,
            differenceCents: c.difference_cents,
            reason: c.reason,
            at: c.created_at,
          })),
        readiness: readiness({
          licenseReviewed: e.license_reviewed,
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
      /** Answers to per-category questions and accepted category waiver addenda. */
      extras,
      answers: describeAnswers(latest, extras),
      addenda: extras.addenda.map((id) => ({ categoryId: id, title: findCat(id)?.addendum?.title ?? 'Category waiver addendum' })),
      entries,
    };
  }

  /**
   * Waitlist rows that keep a category off public sale (waiting riders and live offers),
   * per category. Only categories with the waitlist turned on count.
   */
  async function waitlistBlockers(config: EventConfig, eventId: string): Promise<Map<string, { id: string; status: 'waiting' | 'offered' }[]>> {
    const enabled = new Set(config.categories.filter((c) => c.waitlistEnabled).map((c) => c.id));
    const out = new Map<string, { id: string; status: 'waiting' | 'offered' }[]>();
    if (enabled.size === 0) return out;
    const rows = await db.all<{ id: string; category_id: string; status: StoredWaitlistStatus; offer_expires_at: string | null }>(
      `SELECT id, category_id, status, offer_expires_at FROM waitlist_entries WHERE event_id = $1 AND status IN ('waiting', 'offered') ORDER BY created_at, seq`,
      [eventId],
    );
    for (const r of rows) {
      if (!enabled.has(r.category_id)) continue;
      const status = effectiveWaitlistStatus(r.status, r.offer_expires_at, nowIso());
      if (!blocksPublicSale(status)) continue;
      out.set(r.category_id, [...(out.get(r.category_id) ?? []), { id: r.id, status: status as 'waiting' | 'offered' }]);
    }
    return out;
  }

  /** Re-check and take places for every entry of an order, all or nothing. `excludeEntryIds` drops a redeemed offer's own reservation. */
  async function admitAll(
    config: EventConfig,
    eventId: string,
    categoryIds: string[],
    riderRef: string,
    excludeEntryIds: readonly string[] = [],
  ): Promise<{ ok: true } | { ok: false; message: string; categoryId: string }> {
    const current = (await repo.entries(eventId)).filter((e) => !excludeEntryIds.includes(e.id));
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
    async publicEvent(eventId: string) {
      const { config, version, organizationName } = await publishedConfig(eventId);
      const entries = await repo.entries(eventId);
      const blockers = await waitlistBlockers(config, eventId);
      const remaining: Record<string, number | null> = {};
      // A category with riders waiting is not on public sale, so it reads as full.
      for (const c of config.categories) remaining[c.id] = blockers.has(c.id) ? 0 : remainingForCategory(config, entries, c.id);
      const waitlist: Record<string, { waiting: number }> = {};
      for (const c of config.categories) if (c.waitlistEnabled) waitlist[c.id] = { waiting: blockers.get(c.id)?.length ?? 0 };
      return {
        eventId,
        waitlist,
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
     * Validate the order and hold every place in one transaction under the event lock.
     * Either all entries are held or none are. A repeated request with the
     * same client request ID returns the first order instead of a duplicate.
     */
    async createOrder(eventId: string, input: { clientRequestId: string; categoryIds: string[]; rider?: unknown; waiver?: unknown; extras?: unknown; offerToken?: string | null }) {
      return db.transaction(async () => {
        await db.lock(eventLock(eventId));
        const existing = await db.get<{ id: string }>(`SELECT id FROM orders WHERE event_id = $1 AND client_request_id = $2`, [eventId, input.clientRequestId]);
        if (existing) return view(existing.id);

        const { config, version } = await publishedConfig(eventId);
        const rider = riderDetailsSchema.parse(input.rider);
        const waiver = waiverAcceptanceSchema.parse(input.waiver);
        if (waiver.version !== config.registration.waiverVersion) throw new HttpError(409, 'The waiver changed while you were registering. Read the current version and accept it again.');

        // Registration windows are checked when places are held; a hold taken while open may be paid within its time.
        const check = checkSelection(config, input.categoryIds, profileOf(rider), { nowLocal: localNow(config.event.timeZone, clock()) });
        if (!check.ok) throw new HttpError(422, check.problems[0], check.problems);
        if (check.needsGuardian && !rider.guardian) throw new HttpError(422, 'Riders under 18 need a parent or guardian. Enter their name.');
        const signatureProblem = checkSignature(rider, waiver, check.needsGuardian);
        if (signatureProblem) throw new HttpError(422, signatureProblem);
        // Per-category questions and waiver addenda (product.md 1a).
        const extras = pruneExtras(config, input.categoryIds, orderExtrasSchema.parse(input.extras ?? {}));
        const extraProblems = checkExtras(config, input.categoryIds, extras);
        if (extraProblems.length > 0) throw new HttpError(422, extraProblems[0].message, extraProblems);

        // A waitlist offer lets its rider take the reserved place in that one category.
        let offer: { id: string; category_id: string } | null = null;
        if (input.offerToken) {
          const row = await db.get<{ id: string; category_id: string; status: StoredWaitlistStatus; offer_expires_at: string | null }>(
            `SELECT id, category_id, status, offer_expires_at FROM waitlist_entries WHERE offer_token = $1 AND event_id = $2`,
            [input.offerToken, eventId],
          );
          const status = row ? effectiveWaitlistStatus(row.status, row.offer_expires_at, nowIso()) : null;
          if (!row || status === 'removed') throw new HttpError(404, 'This waitlist offer was not found or was withdrawn.');
          if (status === 'expired') throw new HttpError(409, 'This waitlist offer has expired. Ask the organizer whether a place is still open.');
          if (status === 'accepted') throw new HttpError(409, 'This waitlist offer has already been used.');
          if (!input.categoryIds.includes(row.category_id)) throw new HttpError(422, 'Include the category you were offered a place in.');
          offer = row;
        }
        // Waitlist first: while riders are waiting, freed places are not sold to the public.
        const blockers = await waitlistBlockers(config, eventId);
        for (const categoryId of input.categoryIds) {
          if (offer && categoryId === offer.category_id) continue;
          if (blockers.has(categoryId)) {
            const name = config.categories.find((c) => c.id === categoryId)?.name ?? 'A category';
            throw new HttpError(409, `${name} is full and has a waitlist. Places go to riders on the waitlist first. Nothing was held.`, { categoryId });
          }
        }

        const id = newId('ord');
        const riderRef = `rider-${id}`;
        const admitted = await admitAll(config, eventId, input.categoryIds, riderRef, offer ? [offer.id] : []);
        if (!admitted.ok) throw new HttpError(409, `${admitted.message} Nothing was held. Choose another race and try again.`, { categoryId: admitted.categoryId });

        const q = quote(config, input.categoryIds, todayIn(config.event.timeZone, clock()));
        const t = nowIso();
        const expires = new Date(clock().getTime() + holdMinutes * 60_000).toISOString();
        await db.run(
          `INSERT INTO orders (id, event_id, published_version, client_request_id, status, rider_json, waiver_json, quote_json, total_cents, hold_expires_at, created_at, updated_at, extras_json)
           VALUES ($1, $2, $3, $4, 'held', $5, $6, $7, $8, $9, $10, $11, $12)`,
          [id, eventId, version, input.clientRequestId, JSON.stringify(rider), JSON.stringify(waiver), JSON.stringify(q), q.totalCents, expires, t, t, JSON.stringify(extras)],
        );
        // Demo riders on demo events carry a simulated license result from the fixtures; everyone else needs review.
        const fixture = config.event.isDemo ? demoRider(rider.demoRiderId) : undefined;
        const simulatedValid = !!fixture && fixture.licenseCheck === 'simulated_valid' && fixture.licenseNumber === rider.licenseNumber;
        for (const categoryId of input.categoryIds) {
          await db.run(
            `INSERT INTO order_entries (id, order_id, event_id, category_id, rider_ref, status, license_reviewed, license_review_note, license_reviewed_at) VALUES ($1, $2, $3, $4, $5, 'held', $6, $7, $8)`,
            [newId('oe'), id, eventId, categoryId, riderRef, simulatedValid, simulatedValid ? 'Simulated license check: valid (demo fixture)' : null, simulatedValid ? t : null],
          );
        }
        if (offer) await db.run(`UPDATE waitlist_entries SET order_id = $1, updated_at = $2 WHERE id = $3`, [id, t, offer.id]);
        return view(id);
      });
    },

    getOrder: view,

    /**
     * Process a simulated payment notification exactly once per attempt ID.
     * A success after the hold expired confirms only if every place is still
     * free; otherwise the order goes to the organizer's exception queue.
     */
    async pay(orderId: string, attemptId: string, outcome: 'success' | 'failure') {
      return db.transaction(async () => {
        await lockEventOf(`SELECT event_id FROM orders WHERE id = $1`, orderId);
        const seen = await db.get<{ order_id: string }>(`SELECT order_id FROM payment_attempts WHERE id = $1`, [attemptId]);
        if (seen) {
          if (seen.order_id !== orderId) throw new HttpError(409, 'This payment attempt belongs to another order.');
          return view(orderId);
        }
        const row = await orderRow(orderId);
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
          const config = await repo.getVersion(row.event_id, row.published_version);
          const own = await entryRows(orderId);
          const ids = own.map((e) => e.category_id);
          const riderRef = own[0]?.rider_ref ?? `rider-${orderId}`;
          // The hold ended, so the order needs places again: windows must still be open and every place free.
          const nowLocal = localNow(config.event.timeZone, clock());
          const windowsOpen =
            !enforcesWindows(config) || ids.every((id) => { const c = config.categories.find((x) => x.id === id); return !c || windowState(c, nowLocal) === 'open'; });
          // A live offer behind this order reserves its own place; don't count it against the rider.
          const ownOffer = (await db.all<{ id: string }>(`SELECT id FROM waitlist_entries WHERE order_id = $1`, [orderId])).map((r) => r.id);
          next = windowsOpen && (await admitAll(config, row.event_id, ids, riderRef, ownOffer)).ok ? 'confirmed' : 'needs_attention';
        }

        if (next !== row.status) {
          if (next === 'confirmed') {
            await db.run(`UPDATE orders SET status = 'confirmed', check_in_code = $1, confirmed_at = $2, updated_at = $3 WHERE id = $4`, [checkInCode(), t, t, orderId]);
            await db.run(`UPDATE order_entries SET status = 'confirmed' WHERE order_id = $1`, [orderId]);
            await db.run(`UPDATE waitlist_entries SET status = 'accepted', updated_at = $1 WHERE order_id = $2 AND status = 'offered'`, [t, orderId]);
          } else {
            await db.run(`UPDATE orders SET status = $1, updated_at = $2 WHERE id = $3`, [next, t, orderId]);
            if (next === 'needs_attention') await db.run(`UPDATE order_entries SET status = 'released' WHERE order_id = $1`, [orderId]);
          }
        }
        await db.run(`INSERT INTO payment_attempts (id, order_id, outcome, result_status, created_at) VALUES ($1, $2, $3, $4, $5)`, [attemptId, orderId, outcome, next, t]);
        return view(orderId);
      });
    },

    /** The rider leaves before paying: release the held places now. */
    async cancel(orderId: string) {
      return db.transaction(async () => {
        await lockEventOf(`SELECT event_id FROM orders WHERE id = $1`, orderId);
        const row = await orderRow(orderId);
        if (!row) throw new HttpError(404, 'Order not found.');
        const status = effectiveStatus(row);
        if (status === 'held' || status === 'payment_failed' || status === 'expired') {
          await db.run(`UPDATE orders SET status = 'cancelled', updated_at = $1 WHERE id = $2`, [nowIso(), orderId]);
          await db.run(`UPDATE order_entries SET status = 'released' WHERE order_id = $1`, [orderId]);
        }
        return view(orderId);
      });
    },

    async listOrders(eventId: string) {
      await repo.getEvent(eventId);
      return viewsOf(await db.all<OrderRow>(`SELECT * FROM orders WHERE event_id = $1 ORDER BY created_at DESC, seq`, [eventId]));
    },

    /**
     * Organizer moves a paid entry to another category. Eligibility, capacity, the waitlist,
     * schedule conflicts, and the guardian waiver are rechecked. The price paid is kept; any
     * difference is recorded for the organizer to settle outside the app (payments are simulated).
     */
    async transferEntry(entryId: string, toCategoryId: string, reason: string) {
      return db.transaction(async () => {
        await lockEventOf(`SELECT event_id FROM order_entries WHERE id = $1`, entryId);
        const e = await db.get<EntryRow & { event_id: string }>(`SELECT * FROM order_entries WHERE id = $1`, [entryId]);
        if (!e) throw new HttpError(404, 'Entry not found.');
        const row = (await orderRow(e.order_id))!;
        if (effectiveStatus(row) !== 'confirmed' || e.status !== 'confirmed') throw new HttpError(409, 'Only a paid, active entry can be transferred.');
        if (e.category_id === toCategoryId) throw new HttpError(422, 'Choose a different category.');
        const { config } = await publishedConfig(e.event_id);
        const target = config.categories.find((c) => c.id === toCategoryId);
        if (!target || target.status !== 'active') throw new HttpError(422, 'That category is not open for entries.');
        const others = (await entryRows(e.order_id)).filter((x) => x.id !== e.id && x.status === 'confirmed');
        if (others.some((x) => x.category_id === target.id)) throw new HttpError(409, `This rider is already entered in ${target.name}.`);

        const rider = row.rider_json;
        const waiver = row.waiver_json;
        const elig = evaluateCategory(target, profileOf(rider));
        if (elig.status === 'ineligible') throw new HttpError(422, `Not eligible for ${target.name}: ${elig.reasons.join('; ')}.`);
        if (target.eligibility.guardianRequired && waiver.signerRole !== 'guardian') throw new HttpError(422, `${target.name} needs a waiver signed by a parent or guardian. Register the rider again with a guardian instead.`);
        const block = findConflicts(config, [...others.map((x) => x.category_id), target.id]).find((c) => c.level === 'block');
        if (block) throw new HttpError(409, block.message);
        if ((await waitlistBlockers(config, e.event_id)).has(target.id)) throw new HttpError(409, `${target.name} has riders on its waitlist. Offer the place through the waitlist instead.`);
        const room = canAdmit(config, (await repo.entries(e.event_id)).filter((x) => x.id !== e.id), target.id, e.rider_ref);
        if (!room.ok) throw new HttpError(409, room.reason === 'full' ? `${target.name} is full (${room.blockedBy.name}: ${room.blockedBy.used} of ${room.blockedBy.limit}).` : `${target.name} cannot take this entry.`);

        const q = row.quote_json;
        const paid = q.lines.find((l) => l.categoryId === (e.original_category_id ?? e.category_id))?.totalCents ?? 0;
        const race = config.races.find((r) => r.id === target.raceId);
        const day = config.days.find((d) => d.id === race?.dayId);
        const newPrice = categoryPrice(target, todayIn(config.event.timeZone, clock()), day?.date ?? '').cents;
        const t = nowIso();
        await db.run(`UPDATE order_entries SET original_category_id = COALESCE(original_category_id, category_id), category_id = $1 WHERE id = $2`, [target.id, e.id]);
        await db.run(
          `INSERT INTO entry_changes (id, event_id, order_id, entry_id, kind, from_category_id, to_category_id, amount_paid_cents, new_price_cents, difference_cents, reason, created_at) VALUES ($1, $2, $3, $4, 'transfer', $5, $6, $7, $8, $9, $10, $11)`,
          [newId('chg'), e.event_id, e.order_id, e.id, e.category_id, target.id, paid, newPrice, newPrice - paid, reason, t],
        );
        return view(e.order_id);
      });
    },

    /** Organizer withdraws a paid entry. The place is freed; the amount paid is recorded, and any refund is handled outside the app. */
    async withdrawEntry(entryId: string, reason: string) {
      return db.transaction(async () => {
        await lockEventOf(`SELECT event_id FROM order_entries WHERE id = $1`, entryId);
        const e = await db.get<EntryRow & { event_id: string }>(`SELECT * FROM order_entries WHERE id = $1`, [entryId]);
        if (!e) throw new HttpError(404, 'Entry not found.');
        const row = (await orderRow(e.order_id))!;
        if (effectiveStatus(row) !== 'confirmed' || e.status !== 'confirmed') throw new HttpError(409, 'Only a paid, active entry can be withdrawn.');
        const q = row.quote_json;
        const paid = q.lines.find((l) => l.categoryId === (e.original_category_id ?? e.category_id))?.totalCents ?? 0;
        const t = nowIso();
        await db.run(`UPDATE order_entries SET status = 'withdrawn', withdrawn_at = $1 WHERE id = $2`, [t, e.id]);
        await db.run(
          `INSERT INTO entry_changes (id, event_id, order_id, entry_id, kind, from_category_id, to_category_id, amount_paid_cents, new_price_cents, difference_cents, reason, created_at) VALUES ($1, $2, $3, $4, 'withdraw', $5, NULL, $6, NULL, NULL, $7, $8)`,
          [newId('chg'), e.event_id, e.order_id, e.id, e.category_id, paid, reason, t],
        );
        return view(e.order_id);
      });
    },

    /** Organizer marks a license as reviewed. Needs a reason; the time is recorded. */
    async reviewLicense(entryId: string, note: string) {
      const row = await db.get<{ order_id: string }>(`SELECT order_id FROM order_entries WHERE id = $1`, [entryId]);
      if (!row) throw new HttpError(404, 'Entry not found.');
      await db.run(`UPDATE order_entries SET license_reviewed = true, license_review_note = $1, license_reviewed_at = $2 WHERE id = $3`, [note, nowIso(), entryId]);
      return view(row.order_id);
    },
  };
}

export type Orders = ReturnType<typeof createOrders>;
export type OrderView = Awaited<ReturnType<Orders['getOrder']>>;
