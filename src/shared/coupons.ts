import { z } from 'zod';
import { formatLocalDateTime } from './checkout';

/**
 * Basic coupons (product.md: Promotions). An organizer creates codes per event; a rider
 * applies one code per order. How a coupon combines with bundles and other discounts is
 * step 3 of the pricing rule in `pricing.ts`. Redemption caps are enforced on the server
 * under the event lock (src/server/coupons.ts).
 */

const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/, 'Use YYYY-MM-DDTHH:MM');

/** Codes are stored and compared in upper case, so riders can type them in any case. */
export const normalizeCouponCode = (code: string) => code.trim().toUpperCase();

export const couponCodeSchema = z
  .string()
  .trim()
  .min(3, 'Use at least 3 characters.')
  .max(32, 'Use at most 32 characters.')
  .regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, hyphens, or underscores.')
  .transform(normalizeCouponCode);

const categoryIds = z.array(z.string().min(1).max(64)).max(200);
const fixedTerms = { kind: z.literal('fixed'), code: couponCodeSchema, amountCents: z.number().int().min(1).max(10_000_00), categoryIds };
const percentTerms = { kind: z.literal('percent'), code: couponCodeSchema, percent: z.number().int().min(1).max(100), categoryIds };

/**
 * What decides a coupon's discount. Copied into the order's quote at purchase.
 * `categoryIds` empty means every category of the event.
 */
export const couponTermsSchema = z.discriminatedUnion('kind', [z.object(fixedTerms), z.object(percentTerms)]);
export type CouponTerms = z.infer<typeof couponTermsSchema>;

const windowFields = {
  /** Local event time the code starts working (inclusive). Null: no start limit. */
  validFrom: localDateTime.nullable(),
  /** Local event time the code stops working (exclusive). Null: no end limit. */
  validUntil: localDateTime.nullable(),
  /** Total redemptions allowed across all riders. Null: no cap. */
  maxRedemptions: z.number().int().min(1).max(100_000).nullable(),
};

export const couponInputSchema = z
  .discriminatedUnion('kind', [z.object({ ...fixedTerms, ...windowFields }), z.object({ ...percentTerms, ...windowFields })])
  .refine((c) => !c.validFrom || !c.validUntil || c.validFrom < c.validUntil, { message: 'The end must be after the start.', path: ['validUntil'] });
export type CouponInput = z.infer<typeof couponInputSchema>;

export type CouponWindowState = 'not_yet' | 'open' | 'ended';

export function couponWindowState(c: { validFrom: string | null; validUntil: string | null }, nowLocal: string): CouponWindowState {
  if (c.validFrom && nowLocal < c.validFrom) return 'not_yet';
  if (c.validUntil && nowLocal >= c.validUntil) return 'ended';
  return 'open';
}

/** Why a code cannot be used right now, in words for the rider. Null when it can. */
export function couponUnavailableReason(
  c: { code: string; active: boolean; validFrom: string | null; validUntil: string | null; maxRedemptions: number | null },
  nowLocal: string,
  used: number,
): string | null {
  if (!c.active) return `${c.code} is no longer available.`;
  const state = couponWindowState(c, nowLocal);
  if (state === 'not_yet') return `${c.code} starts working ${formatLocalDateTime(c.validFrom!)}.`;
  if (state === 'ended') return `${c.code} expired ${formatLocalDateTime(c.validUntil!)}.`;
  if (c.maxRedemptions !== null && used >= c.maxRedemptions) return `${c.code} has been fully redeemed.`;
  return null;
}

/** Copy only the terms out of a stored or public coupon, so extra fields never reach a quote. */
export function termsOf(c: CouponTerms): CouponTerms {
  return c.kind === 'percent'
    ? { kind: 'percent', code: c.code, percent: c.percent, categoryIds: [...c.categoryIds] }
    : { kind: 'fixed', code: c.code, amountCents: c.amountCents, categoryIds: [...c.categoryIds] };
}
