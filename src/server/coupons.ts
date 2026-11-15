import { localNow } from '../shared/checkout';
import { couponInputSchema, couponUnavailableReason, normalizeCouponCode, termsOf, type CouponTerms } from '../shared/coupons';
import { newId } from '../shared/factory';
import type { Db } from './db';
import { eventLock, HttpError, type Repo } from './repo';

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
  active: boolean;
  created_at: string;
}

export type StoredCoupon = CouponTerms & {
  id: string;
  validFrom: string | null;
  validUntil: string | null;
  maxRedemptions: number | null;
  active: boolean;
  createdAt: string;
};

function fromRow(r: CouponRow): StoredCoupon {
  const base = { id: r.id, code: r.code, categoryIds: r.category_ids, validFrom: r.valid_from, validUntil: r.valid_until, maxRedemptions: r.max_redemptions, active: r.active, createdAt: r.created_at };
  return r.kind === 'percent' ? { ...base, kind: 'percent', percent: r.percent! } : { ...base, kind: 'fixed', amountCents: r.amount_cents! };
}

export function createCoupons(db: Db, repo: Repo, clock: () => Date) {
  const nowIso = () => clock().toISOString();

  /** Redemptions that count against the cap: paid orders and live holds. Call inside the event lock when the answer decides a write. */
  async function usedCount(couponId: string): Promise<number> {
    const row = await db.get<{ n: number }>(
      `SELECT count(*)::int AS n FROM orders WHERE coupon_id = $1 AND (status = 'confirmed' OR (status IN ('held', 'payment_failed') AND hold_expires_at > $2))`,
      [couponId, nowIso()],
    );
    return row?.n ?? 0;
  }

  async function byCode(eventId: string, code: string) {
    const row = await db.get<CouponRow>(`SELECT * FROM coupons WHERE event_id = $1 AND code = $2`, [eventId, normalizeCouponCode(code)]);
    return row ? fromRow(row) : null;
  }

  async function list(eventId: string) {
    await repo.getEvent(eventId);
    const rows = await db.all<CouponRow & { confirmed: number; reserved: number }>(
      `SELECT c.*,
         (SELECT count(*)::int FROM orders o WHERE o.coupon_id = c.id AND o.status = 'confirmed') AS confirmed,
         (SELECT count(*)::int FROM orders o WHERE o.coupon_id = c.id AND o.status IN ('held', 'payment_failed') AND o.hold_expires_at > $2) AS reserved
       FROM coupons c WHERE c.event_id = $1 ORDER BY c.created_at, c.seq`,
      [eventId, nowIso()],
    );
    return rows.map((r) => ({ ...fromRow(r), redemptions: { confirmed: r.confirmed, reserved: r.reserved } }));
  }

  /**
   * The coupon a rider can use now, or an HttpError that says why not.
   * Unknown codes and codes from other events read the same.
   */
  async function redeemable(eventId: string, code: string, timeZone: string): Promise<StoredCoupon> {
    const c = await byCode(eventId, code);
    if (!c) throw new HttpError(404, `${normalizeCouponCode(code)} is not a code for this event.`);
    const used = await usedCount(c.id);
    const reason = couponUnavailableReason(c, localNow(timeZone, clock()), used);
    if (reason) throw new HttpError(c.maxRedemptions !== null && used >= c.maxRedemptions && c.active ? 409 : 422, reason);
    return c;
  }

  return {
    usedCount,
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
          `INSERT INTO coupons (id, event_id, code, kind, amount_cents, percent, category_ids, valid_from, valid_until, max_redemptions, active, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, $11, $11)`,
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
      const record = await repo.getEvent(eventId);
      if (!record.publishedVersion) throw new HttpError(409, 'Registration is not open: this event has no published version yet.');
      return termsOf(await redeemable(eventId, code, record.config.event.timeZone));
    },
  };
}

export type Coupons = ReturnType<typeof createCoupons>;
