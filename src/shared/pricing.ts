import type { Category, EventConfig } from './schema';

/**
 * Order pricing (product.md: Pricing, Rider-facing behavior, Multi-race discount).
 *
 * Discount precedence, so discounts never stack on one entry:
 * 1. At most one bundle applies: the one with the largest discount whose races
 *    all have a selected entry. Its discount is split across one entry per
 *    bundle race.
 * 2. Every other entry after the first full-price entry gets the
 *    additional-race discount, capped at that entry's price.
 * 3. An entry receives at most one discount. Free entries receive none.
 */

export interface QuoteLine {
  categoryId: string;
  raceId: string;
  code: string;
  name: string;
  priceCents: number;
  dayOfSurcharge: boolean;
  discountCents: number;
  discountReason: string | null;
  totalCents: number;
}

export interface Quote {
  onDate: string;
  lines: QuoteLine[];
  bundle: { id: string; name: string; discountCents: number } | null;
  subtotalCents: number;
  discountCents: number;
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

export function quote(config: EventConfig, categoryIds: readonly string[], onDate: string): Quote {
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
      code: cat.classifications[0]?.code || cat.timingCode,
      name: cat.name,
      priceCents: price.cents,
      dayOfSurcharge: price.dayOf,
      discountCents: 0,
      discountReason: null,
      totalCents: price.cents,
    });
  }

  // 1. Best fully covered bundle.
  const selectedRaces = new Set(lines.map((l) => l.raceId));
  const candidates = config.registration.bundles
    .filter((b) => b.raceIds.length >= 2 && b.discountCents > 0 && b.raceIds.every((r) => selectedRaces.has(r)))
    .sort((a, b) => b.discountCents - a.discountCents);
  const bundle = candidates[0] ?? null;
  const inBundle = new Set<QuoteLine>();
  let appliedBundle: Quote['bundle'] = null;
  if (bundle) {
    // One entry per bundle race, preferring the most expensive so the discount fits.
    const picked = bundle.raceIds.map((raceId) => [...lines].filter((l) => l.raceId === raceId).sort((a, b) => b.priceCents - a.priceCents)[0]);
    const capacity = picked.reduce((sum, l) => sum + l.priceCents, 0);
    const total = Math.min(bundle.discountCents, capacity);
    if (total > 0) {
      let remaining = total;
      picked.forEach((l, i) => {
        const share = i === picked.length - 1 ? remaining : Math.min(l.priceCents, Math.floor(total / picked.length));
        const applied = Math.min(share, l.priceCents, remaining);
        l.discountCents = applied;
        l.discountReason = bundle.name;
        remaining -= applied;
        inBundle.add(l);
      });
      // If rounding or caps left cents over, give them to any picked line with room.
      for (const l of picked) {
        if (remaining <= 0) break;
        const room = l.priceCents - l.discountCents;
        const extra = Math.min(room, remaining);
        l.discountCents += extra;
        remaining -= extra;
      }
      appliedBundle = { id: bundle.id, name: bundle.name, discountCents: total - remaining };
    }
  }

  // 2. Additional-race discount for the rest.
  const extraDiscount = config.registration.additionalRaceDiscountCents;
  const others = lines.filter((l) => !inBundle.has(l)).sort((a, b) => b.priceCents - a.priceCents);
  others.forEach((l, i) => {
    const isFirstEntry = i === 0 && inBundle.size === 0;
    if (isFirstEntry || extraDiscount <= 0 || l.priceCents === 0) return;
    l.discountCents = Math.min(extraDiscount, l.priceCents);
    l.discountReason = 'Additional race';
  });

  for (const l of lines) l.totalCents = l.priceCents - l.discountCents;
  const subtotalCents = lines.reduce((s, l) => s + l.priceCents, 0);
  const discountCents = lines.reduce((s, l) => s + l.discountCents, 0);
  return { onDate, lines, bundle: appliedBundle, subtotalCents, discountCents, totalCents: subtotalCents - discountCents };
}

export function todayIn(timeZone: string, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
