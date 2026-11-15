import { localNow } from '../shared/checkout';
import { couponInputSchema, couponUnavailableReason, normalizeCouponCode, termsOf, type CouponTerms } from '../shared/coupons';
import { newId } from '../shared/factory';
import { sameRiderReasons, type IdentityRider } from '../shared/riderIdentity';
import type { Db } from './db';
import { eventLock, HttpError, reservedOrderSql, type Repo } from './repo';

/**
 * Coupon codes per event (product.md: Promotions). A redemption is an order carrying the
 * coupon: reserved while its hold is live, confirmed once paid, released when the hold
 * expires or is cancelled. Counting happens under the event lock, in the same transaction
 * that creates the order, so concurrent checkouts cannot exceed the cap.
 */

interface CouponRow {
  id: string;
  event_id: string;
  code: string;
  kind: 'fixed' | 'percent';
  amount_cents: number | null;
  percent: number | null;
  category_ids: string[];
  valid_from: string | null;
  valid_until: string | null;
  max_redemptions: number | null;
  max_per_rider: number | null;
  active: boolean;
  created_at: string;
}

type StoredCoupon =CouponTerms & {
  id: string;
  validFrom: string | null;
  validUntil: string | null;
  maxRedemptions: number | null;
  maxPerRider: number | null;
  active: boolean;
  createdAt: string;
};

function fromRow(r: CouponRow): StoredCoupon {
  const base = { id: r.id, code: r.code, categoryIds: r.category_ids, validFrom: r.valid_from, validUntil: r.valid_until, maxRedemptions: r.max_redemptions, maxPerRider: r.max_per_rider, active: r.active, createdAt: r.created_at };
  return r.kind === 'percent' ? { ...base, kind: 'percent', percent: r.percent! } : { ...base, kind: 'fixed', amountCents: r.amount_cents! };
}

export function createCoupons(db: Db, repo: Repo, clock: () => Date) {
  const nowIso = () => clock().toISOString();

  /** One row for the coupon `ref` names: its paid orders (confirmed) and its live holds (reserved) at time $2. */
  const redemptionsSql = (ref: string) =>
    `SELECT count(*) FILTER (WHERE o.status = 'confirmed')::int AS confirmed, count(*) FILTER (WHERE ${reservedOrderSql('$2')})::int AS reserved FROM orders o WHERE o.coupon_id = ${ref}`;

  /** Redemptions that count against the cap: paid orders and live holds. Call inside the event lock when the answer decides a write. */
  async function usedCount(couponId: string): Promise<number> {
    const row = await db.get<{ confirmed: number; reserved: number }>(redemptionsSql('$1'), [couponId, nowIso()]);
    return (row?.confirmed ?? 0) + (row?.reserved ?? 0);
  }

  /**
   * This rider's redemptions of the coupon that count (paid orders and live holds), matched by the
   * same-rider rule. `exceptOrderId`: leave out that order, when re-checking an order that already exists.
   */
  async function riderUsedCount(couponId: string, rider: IdentityRider, exceptOrderId: string | null): Promise<number> {
    const rows = await db.all<{ rider_json: IdentityRider }>(
      `SELECT o.rider_json FROM orders o WHERE o.coupon_id = $1 AND (o.status = 'confirmed' OR ${reservedOrderSql('$2')}) AND o.id IS DISTINCT FROM $3`,
      [couponId, nowIso(), exceptOrderId],
    );
    return rows.filter((r) => sameRiderReasons(r.rider_json, rider).length > 0).length;
  }

  async function byCode(eventId: string, code: string) {
    const row = await db.get<CouponRow>(`SELECT * FROM coupons WHERE event_id = $1 AND code = $2`, [eventId, normalizeCouponCode(code)]);
    return row ? fromRow(row) : null;
  }

  async function list(eventId: string) {
    await repo.getEvent(eventId);
    const rows = await db.all<CouponRow & { confirmed: number; reserved: number }>(
      `SELECT c.*, r.confirmed, r.reserved FROM coupons c CROSS JOIN LATERAL (${redemptionsSql('c.id')}) r WHERE c.event_id = $1 ORDER BY c.created_at, c.seq`,
      [eventId, nowIso()],
    );
    return rows.map((r) => ({ ...fromRow(r), redemptions: { confirmed: r.confirmed, reserved: r.reserved } }));
  }

  /**
   * The coupon a rider can use now, or an HttpError that says why not.
   * Unknown codes and codes from other events read the same. `rider`: null before the rider's
   * details are known (checking a code); the per-rider limit is then checked when the order is placed.
   */
  async function redeemable(eventId: string, code: string, timeZone: string, rider: IdentityRider | null): Promise<StoredCoupon> {
    const c = await byCode(eventId, code);
    if (!c) throw new HttpError(404, `${normalizeCouponCode(code)} is not a code for this event.`);
    const used = await usedCount(c.id);
    const riderUsed = rider && c.maxPerRider !== null ? await riderUsedCount(c.id, rider, null) : 0;
    const reason = couponUnavailableReason(c, localNow(timeZone, clock()), used, riderUsed);
    const full = (c.maxRedemptions !== null && used >= c.maxRedemptions) || (c.maxPerRider !== null && riderUsed >= c.maxPerRider);
    if (reason) throw new HttpError(full && c.active ? 409 : 422, reason);
    return c;
  }

  return {
    usedCount,
    riderUsedCount,
    redeemable,
    list,

    async create(eventId: string, body: unknown) {
      const input = couponInputSchema.parse(body);
      return db.transaction(async () => {
        await db.lock(eventLock(eventId));
        const { config } = await repo.getEvent(eventId);
        if (input.categoryIds.some((id) => !config.categories.some((c) => c.id === id))) throw new HttpError(422, 'Choose categories from this event.');
        if (await byCode(eventId, input.code)) throw new HttpError(409, `${input.code} already exists for this event. Choose another code.`);
        const id = newId('cpn');
        const t = nowIso();
        await db.run(
          `INSERT INTO coupons (id, event_id, code, kind, amount_cents, percent, category_ids, valid_from, valid_until, max_redemptions, max_per_rider, active, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, $12, $12)`,
          [
            id,
            eventId,
            input.code,
            input.kind,
            input.kind === 'fixed' ? input.amountCents : null,
            input.kind === 'percent' ? input.percent : null,
            JSON.stringify([...new Set(input.categoryIds)]),
            input.validFrom,
            input.validUntil,
            input.maxRedemptions,
            input.maxPerRider,
            t,
          ],
        );
        return (await list(eventId)).find((c) => c.id === id)!;
      });
    },

    /** Turn a code off or back on. Orders already placed keep the price they accepted. */
    async setActive(eventId: string, couponId: string, active: boolean) {
      const n = await db.run(`UPDATE coupons SET active = $1, updated_at = $2 WHERE id = $3 AND event_id = $4`, [active, nowIso(), couponId, eventId]);
      if (n === 0) throw new HttpError(404, 'Coupon not found.');
      return (await list(eventId)).find((c) => c.id === couponId)!;
    },

    /** What a rider's browser needs to price the code with the shared rule. Redemption counts are not revealed. */
    async check(eventId: string, code: string) {
      // The published time zone, as checkout uses: a draft edit must not move the code's valid dates.
      const { config } = await repo.getPublished(eventId);
      return termsOf(await redeemable(eventId, code, config.event.timeZone, null));
    },
  };
}

export type Coupons = ReturnType<typeof createCoupons>;
