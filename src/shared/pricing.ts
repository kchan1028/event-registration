import { evaluatePath, type RiderProfile } from './eligibility';
import type { CouponTerms } from './coupons';
import type { Category, EventConfig } from './schema';

/**
 * Order pricing (product.md: Pricing, Rider-facing behavior, Multi-race discount;
 * demo values in docs/fixtures/).
 *
 * Discount precedence, so discounts never stack on one entry:
 * 1. At most one bundle applies: the one saving the most whose races all have a
 *    selected entry. It covers one entry per bundle race (the most expensive).
 *    A bundle either takes a fixed discount or sets a fixed price for those entries.
 * 2. The additional-race discount then applies to entries outside the bundle,
 *    capped at each entry's price:
 *    - each_additional_entry: every entry after the first full-price entry;
 *    - once_same_day: once per order, on the cheapest entry outside the bundle on
 *      a day that has two or more entries.
 * 2a. Before that, when sameRaceExtraEntryCents is set, every entry after the
 *    most expensive one in the same race (outside the bundle) costs that flat price.
 * 3. A coupon (one code per order) applies last, and only to entries in its eligible
 *    categories that have no discount from steps 1 and 2. It never stacks on a bundle,
 *    a same-race extra entry, or an additional-race discount, and never makes a price
 *    negative. A percentage coupon takes that share of each such entry, rounded half
 *    up to the cent. A fixed coupon takes its amount off the order, split across those
 *    entries in proportion to price and capped at their total.
 *    An entry receives at most one discount. Free entries receive none.
 * 4. Fees are added once per order after discounts: a flat platform fee and a
 *    processing fee as a percentage of the entries subtotal after discounts,
 *    rounded half up to the cent.
 */

export interface QuoteLine {
  categoryId: string;
  raceId: string;
  dayId: string;
  code: string;
  name: string;
  priceCents: number;
  dayOfSurcharge: boolean;
  discountCents: number;
  discountReason: string | null;
  totalCents: number;
}

export interface QuoteFee {
  key: 'platform' | 'processing';
  label: string;
  cents: number;
}

/** The coupon accepted with the order. `discountCents` is 0 when it saved nothing (see `unappliedReason`). */
export interface QuoteCoupon {
  terms: CouponTerms;
  discountCents: number;
  /** Categories whose entries received the coupon discount. */
  appliedCategoryIds: string[];
  /** Why the code saves nothing on this selection; null when it applied. */
  unappliedReason: string | null;
}

export interface Quote {
  onDate: string;
  lines: QuoteLine[];
  bundle: { id: string; name: string; discountCents: number; omnium?: {
    code: string;
    label: string;
    categoryIds: string[];
    status: 'needs_review';
  } } | null;
  /** Stored quotes from before coupons existed have no `coupon` field, so readers must allow for it. */
  coupon?: QuoteCoupon | null;
  subtotalCents: number;
  discountCents: number;
  entriesTotalCents: number;
  fees: QuoteFee[];
  totalCents: number;
}

/** Price for an entry bought on `onDate` (YYYY-MM-DD) for a race on `raceDate`. */
export function categoryPrice(cat: Category, onDate: string, raceDate: string): { cents: number; dayOf: boolean } {
  let cents = cat.pricing.baseCents;
  for (const pc of [...cat.pricing.priceChanges].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))) {
    if (pc.effectiveFrom <= onDate) cents = pc.cents;
  }
  const dayOf = onDate === raceDate && cat.pricing.dayOfSurchargeCents > 0;
  return { cents: cents + (dayOf ? cat.pricing.dayOfSurchargeCents : 0), dayOf };
}

/** Split `total` across lines in order, never giving a line more than its price. */
function allocate(lines: QuoteLine[], total: number, reason: string): number {
  let remaining = total;
  const capacity = lines.reduce((s, l) => s + l.priceCents, 0);
  lines.forEach((l, i) => {
    const fair = i === lines.length - 1 ? remaining : Math.round((total * l.priceCents) / Math.max(1, capacity));
    const share = Math.min(fair, l.priceCents, remaining);
    l.discountCents = share;
    l.discountReason = reason;
    remaining -= share;
  });
  for (const l of lines) {
    if (remaining <= 0) break;
    const extra = Math.min(l.priceCents - l.discountCents, remaining);
    l.discountCents += extra;
    remaining -= extra;
  }
  return total - remaining;
}

export function quote(config: EventConfig, categoryIds: readonly string[], onDate: string, coupon: CouponTerms | null = null, profile: RiderProfile | null = null): Quote {
  const settings = config.registration;
  const rates = profile ? (settings.riderRates ?? []).filter((r) => evaluatePath(r.eligibility, profile).status === 'eligible') : [];
  const scopedRates = (categoryId: string) => rates.filter((r) => r.categoryIds ? r.categoryIds.length === 0 || r.categoryIds.includes(categoryId) : r.categoryGenderClass === 'any' || config.categories.some((c) => c.id === categoryId && c.eligibility.paths.length > 0 && c.eligibility.paths.every((p) => p.genderClass === r.categoryGenderClass)));
  const lines: QuoteLine[] = [];
  for (const id of categoryIds) {
    const cat = config.categories.find((c) => c.id === id);
    if (!cat) continue;
    const race = config.races.find((r) => r.id === cat.raceId);
    const day = config.days.find((d) => d.id === race?.dayId);
    const price = categoryPrice(cat, onDate, day?.date ?? '');
    const riderPrices = scopedRates(cat.id).flatMap((r) => r.racePrices.filter((p) => p.raceId === cat.raceId).map((p) => p.cents + (price.dayOf ? cat.pricing.dayOfSurchargeCents : 0)));
    price.cents = Math.min(price.cents, ...riderPrices);
    lines.push({
      categoryId: cat.id,
      raceId: cat.raceId,
      dayId: race?.dayId ?? '',
      code: cat.classifications[0]?.code || cat.timingCode,
      name: cat.name,
      priceCents: price.cents,
      dayOfSurcharge: price.dayOf,
      discountCents: 0,
      discountReason: null,
      totalCents: price.cents,
    });
  }

  // 1. The bundle that saves the most.
  const selectedRaces = new Set(lines.map((l) => l.raceId));
  const inBundle = new Set<QuoteLine>();
  let appliedBundle: Quote['bundle'] = null;
  const options = settings.bundles
    .filter((b) => new Set(b.raceIds).size >= 2 && b.raceIds.every((r) => selectedRaces.has(r)))
    .map((b) => {
      const picked = [...new Set(b.raceIds)].map((raceId) => lines.filter((l) => l.raceId === raceId).sort((x, y) => y.priceCents - x.priceCents)[0]);
      const sum = picked.reduce((s, l) => s + l.priceCents, 0);
      const riderBundlePrices = rates.filter((r) => picked.every((l) => scopedRates(l.categoryId).includes(r) && r.racePrices.some((p) => p.raceId === l.raceId))).map((r) => r.bundlePriceCents);
      const price = b.priceCents === null ? null : Math.min(b.priceCents, ...riderBundlePrices);
      const saving = Math.max(0, Math.min(sum, price !== null ? sum - price : b.discountCents));
      return { b, picked, saving };
    })
    .filter((o) => o.saving > 0)
    .sort((x, y) => y.saving - x.saving);
  const best = options[0];
  if (best) {
    const applied = allocate(best.picked, best.saving, best.b.name);
    best.picked.forEach((l) => inBundle.add(l));
    appliedBundle = {
      id: best.b.id, name: best.b.name, discountCents: applied,
      ...(best.b.omnium ? { omnium: {
        ...best.b.omnium,
        categoryIds: best.picked.map((l) => l.categoryId),
        status: 'needs_review' as const,
      } } : {}),
    };
  }

  // 2a. Flat price for extra entries in the same race.
  const flatExtra = new Set<QuoteLine>();
  const sameRace = settings.sameRaceExtraEntryCents;
  if (sameRace !== null) {
    for (const raceId of selectedRaces) {
      const inRace = lines.filter((l) => l.raceId === raceId).sort((a, b) => b.priceCents - a.priceCents);
      for (const l of inRace.slice(1)) {
        const extraPrice = Math.min(sameRace, ...scopedRates(l.categoryId).flatMap((r) => r.racePrices.filter((p) => p.raceId === raceId).map((p) => p.extraEntryCents)));
        if (inBundle.has(l) || l.priceCents <= extraPrice) continue;
        l.discountCents = l.priceCents - extraPrice;
        l.discountReason = 'Extra entry in the same race';
        flatExtra.add(l);
      }
    }
  }

  // 2. Additional-race discount outside the bundle.
  const extra = settings.additionalRaceDiscountCents;
  const outside = lines.filter((l) => !inBundle.has(l) && !flatExtra.has(l) && l.priceCents > 0);
  if (extra > 0 && outside.length > 0) {
    if (settings.additionalRaceDiscountMode === 'once_same_day') {
      const byDay = new Map<string, number>();
      for (const l of lines) byDay.set(l.dayId, (byDay.get(l.dayId) ?? 0) + 1);
      const candidate = outside.filter((l) => (byDay.get(l.dayId) ?? 0) >= 2).sort((a, b) => a.priceCents - b.priceCents)[0];
      if (candidate) {
        candidate.discountCents = Math.min(extra, candidate.priceCents);
        candidate.discountReason = 'Second race discount';
      }
    } else {
      outside
        .sort((a, b) => b.priceCents - a.priceCents)
        .forEach((l, i) => {
          if (i === 0 && inBundle.size === 0) return;
          l.discountCents = Math.min(extra, l.priceCents);
          l.discountReason = 'Additional race';
        });
    }
  }

  // 3. Coupon, only on entries with no discount yet.
  const appliedCoupon = coupon ? applyCoupon(config, lines, inBundle, coupon) : null;

  for (const l of lines) l.totalCents = l.priceCents - l.discountCents;
  const subtotalCents = lines.reduce((s, l) => s + l.priceCents, 0);
  const discountCents = lines.reduce((s, l) => s + l.discountCents, 0);
  const entriesTotalCents = subtotalCents - discountCents;

  // 4. Fees, once per order.
  const fees: QuoteFee[] = [];
  if (lines.length > 0 && settings.platformFeeCents > 0) fees.push({ key: 'platform', label: settings.platformFeeLabel, cents: settings.platformFeeCents });
  if (lines.length > 0 && settings.processingFeeBasisPoints > 0 && entriesTotalCents > 0) {
    fees.push({ key: 'processing', label: settings.processingFeeLabel, cents: Math.floor((entriesTotalCents * settings.processingFeeBasisPoints) / 10_000 + 0.5) });
  }
  const totalCents = entriesTotalCents + fees.reduce((s, f) => s + f.cents, 0);
  return { onDate, lines, bundle: appliedBundle, coupon: appliedCoupon, subtotalCents, discountCents, entriesTotalCents, fees, totalCents };
}

function applyCoupon(config: EventConfig, lines: QuoteLine[], inBundle: ReadonlySet<QuoteLine>, terms: CouponTerms): QuoteCoupon {
  const reason = `Coupon ${terms.code}`;
  const inScope = lines.filter((l) => terms.categoryIds.length === 0 || terms.categoryIds.includes(l.categoryId));
  const open = inScope.filter((l) => l.priceCents > 0 && l.discountCents === 0 && !inBundle.has(l));
  let discountCents = 0;
  if (terms.kind === 'percent') {
    for (const l of open) {
      l.discountCents = Math.min(l.priceCents, Math.floor((l.priceCents * terms.percent) / 100 + 0.5));
      l.discountReason = reason;
      discountCents += l.discountCents;
    }
  } else if (open.length > 0) {
    discountCents = allocate(open, Math.min(terms.amountCents, open.reduce((s, l) => s + l.priceCents, 0)), reason);
  }
  let unappliedReason: string | null = null;
  if (discountCents === 0) {
    if (inScope.length === 0) {
      const names = terms.categoryIds.map((id) => config.categories.find((c) => c.id === id)?.name).filter(Boolean);
      unappliedReason = `${terms.code} applies only to ${names.length > 0 ? names.join(', ') : 'categories no longer offered'}.`;
    } else {
      unappliedReason = `${terms.code} does not apply: the eligible entries are free or already discounted. Each entry gets at most one discount.`;
    }
  }
  return { terms, discountCents, appliedCategoryIds: open.filter((l) => l.discountCents > 0).map((l) => l.categoryId), unappliedReason };
}

export function todayIn(timeZone: string, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
