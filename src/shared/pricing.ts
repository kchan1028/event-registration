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
 * 3. An entry receives at most one discount. Free entries receive none.
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

export interface Quote {
  onDate: string;
  lines: QuoteLine[];
  bundle: { id: string; name: string; discountCents: number } | null;
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

export function quote(config: EventConfig, categoryIds: readonly string[], onDate: string): Quote {
  const settings = config.registration;
  const lines: QuoteLine[] = [];
  for (const id of categoryIds) {
    const cat = config.categories.find((c) => c.id === id);
    if (!cat) continue;
    const race = config.races.find((r) => r.id === cat.raceId);
    const day = config.days.find((d) => d.id === race?.dayId);
    const price = categoryPrice(cat, onDate, day?.date ?? '');
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
      const saving = Math.max(0, Math.min(sum, b.priceCents !== null ? sum - b.priceCents : b.discountCents));
      return { b, picked, saving };
    })
    .filter((o) => o.saving > 0)
    .sort((x, y) => y.saving - x.saving);
  const best = options[0];
  if (best) {
    const applied = allocate(best.picked, best.saving, best.b.name);
    best.picked.forEach((l) => inBundle.add(l));
    appliedBundle = { id: best.b.id, name: best.b.name, discountCents: applied };
  }

  // 2. Additional-race discount outside the bundle.
  const extra = settings.additionalRaceDiscountCents;
  const outside = lines.filter((l) => !inBundle.has(l) && l.priceCents > 0);
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
  return { onDate, lines, bundle: appliedBundle, subtotalCents, discountCents, entriesTotalCents, fees, totalCents };
}

export function todayIn(timeZone: string, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
