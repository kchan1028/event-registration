import { formatDollars, formatTime } from './format';
import type { Category, EventConfig } from './schema';

/**
 * Change impact preview (product.md "Changes after registration opens"). Compares
 * the draft with the latest published version and lists every category whose
 * change touches riders who already entered. Publishing never reprices or removes
 * a paid entry: orders keep the price and rules from the version they were sold under.
 */

export type ImpactKind = 'eligibility' | 'start' | 'classification' | 'limit' | 'price' | 'availability';

export interface ImpactEntry {
  orderId: string;
  categoryId: string;
  status: 'confirmed' | 'held';
  riderName: string;
}

export interface CategoryImpact {
  categoryId: string;
  name: string;
  code: string;
  kinds: ImpactKind[];
  /** Plain-language description of each change, for the organizer. */
  details: string[];
  confirmed: number;
  held: number;
  orders: number;
  riders: string[];
}

export interface ChangeImpact {
  categories: CategoryImpact[];
  totals: { categories: number; confirmed: number; held: number; orders: number };
  /** True when starts, timer codes, or availability change for categories with entries, so the timer needs a new start list. */
  startListsChange: boolean;
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const limitText = (n: number | null) => (n === null ? 'no limit' : String(n));
const STATUS: Record<Category['status'], string> = { active: 'open', closed: 'closed', archived: 'archived' };

/** The shortest reason accepted for a waiver change, after trimming. */
export const WAIVER_REASON_MIN = 3;
export const WAIVER_REASON_MAX = 300;

/**
 * True when publishing the draft changes what riders agree to: the waiver's version or text, or a
 * category's addendum. Deleting a whole category is not a waiver change. An archived category still
 * counts, so its terms cannot be changed while archived and come back without a reason.
 */
export function waiverChanged(published: EventConfig, draft: EventConfig): boolean {
  if (published.registration.waiverVersion !== draft.registration.waiverVersion || published.registration.waiverText !== draft.registration.waiverText) return true;
  const before = new Map(published.categories.map((c) => [c.id, c.addendum]));
  return draft.categories.some((c) => {
    const was = before.get(c.id);
    return was?.title !== c.addendum?.title || was?.text !== c.addendum?.text;
  });
}

function categoryChanges(before: EventConfig, after: EventConfig, b: Category, a: Category): { kinds: ImpactKind[]; details: string[] } {
  const kinds = new Set<ImpactKind>();
  const details: string[] = [];

  if (!sameJson(b.eligibility, a.eligibility)) {
    kinds.add('eligibility');
    details.push('Who can enter changed. Riders already entered were accepted under the old rules.');
  }

  const sgB = before.startGroups.find((g) => g.id === b.startGroupId) ?? null;
  const sgA = after.startGroups.find((g) => g.id === a.startGroupId) ?? null;
  if (b.raceId !== a.raceId) {
    kinds.add('start');
    details.push('Moved to a different race.');
  }
  if ((sgB?.id ?? null) !== (sgA?.id ?? null)) {
    kinds.add('start');
    details.push(`Start group changed from ${sgB ? `“${sgB.name}”` : 'none'} to ${sgA ? `“${sgA.name}”` : 'none'}.`);
  } else if (sgB && sgA) {
    if (sgB.startTime !== sgA.startTime) {
      kinds.add('start');
      details.push(`Start time changed from ${formatTime(sgB.startTime)} to ${formatTime(sgA.startTime)}.`);
    }
    if (sgB.stagingTime !== sgA.stagingTime) {
      kinds.add('start');
      details.push(`Staging time changed from ${formatTime(sgB.stagingTime)} to ${formatTime(sgA.stagingTime)}.`);
    }
    if (sgB.fieldLimit !== sgA.fieldLimit) {
      kinds.add('limit');
      details.push(`Start group field limit changed from ${limitText(sgB.fieldLimit)} to ${limitText(sgA.fieldLimit)}.`);
    }
  }
  if (!sameJson(b.length, a.length)) {
    kinds.add('start');
    details.push('Race length changed.');
  }

  if (!sameJson(b.classifications, a.classifications) || b.timingCode !== a.timingCode) {
    kinds.add('classification');
    details.push('Timer code or finishing classifications changed.');
  }

  if (b.cap !== a.cap) {
    kinds.add('limit');
    details.push(`Category cap changed from ${limitText(b.cap)} to ${limitText(a.cap)}.`);
  }
  const poolKey = (cfg: EventConfig, c: Category) =>
    cfg.capacityPools
      .filter((p) => p.memberCategoryIds.includes(c.id) || (c.startGroupId !== null && p.memberStartGroupIds.includes(c.startGroupId)))
      .map((p) => `${p.id}:${p.limit}`)
      .sort();
  if (!sameJson(poolKey(before, b), poolKey(after, a))) {
    kinds.add('limit');
    details.push('Shared capacity pool membership or limit changed.');
  }

  if (!sameJson(b.pricing, a.pricing) || !sameJson(before.registration.riderRates, after.registration.riderRates)) {
    kinds.add('price');
    const base = b.pricing.baseCents !== a.pricing.baseCents ? ` Base price ${formatDollars(b.pricing.baseCents)} → ${formatDollars(a.pricing.baseCents)}.` : '';
    details.push(`Price changed.${base} Paid entries keep the price they paid; only new entries use the new price.`);
  }

  if (b.status !== a.status) {
    kinds.add('availability');
    details.push(`Category ${STATUS[b.status]} → ${STATUS[a.status]}. Existing entries are kept.`);
  }
  if (!sameJson(b.registration, a.registration)) {
    kinds.add('availability');
    details.push('Registration window changed.');
  }

  return { kinds: [...kinds], details };
}

export function changeImpact(published: EventConfig, draft: EventConfig, entries: readonly ImpactEntry[]): ChangeImpact {
  const byCategory = new Map<string, ImpactEntry[]>();
  for (const e of entries) byCategory.set(e.categoryId, [...(byCategory.get(e.categoryId) ?? []), e]);

  const categories: CategoryImpact[] = [];
  for (const before of published.categories) {
    const own = byCategory.get(before.id);
    if (!own || own.length === 0) continue;
    const after = draft.categories.find((c) => c.id === before.id);
    if (!after) continue; // Deleting a category with entries is refused on save.
    const { kinds, details } = categoryChanges(published, draft, before, after);
    if (kinds.length === 0) continue;
    categories.push({
      categoryId: after.id,
      name: after.name,
      code: after.timingCode,
      kinds,
      details,
      confirmed: own.filter((e) => e.status === 'confirmed').length,
      held: own.filter((e) => e.status === 'held').length,
      orders: new Set(own.map((e) => e.orderId)).size,
      riders: [...new Set(own.map((e) => e.riderName))].sort((x, y) => x.localeCompare(y)),
    });
  }

  const affected = new Set(categories.map((c) => c.categoryId));
  return {
    categories,
    totals: {
      categories: categories.length,
      confirmed: categories.reduce((n, c) => n + c.confirmed, 0),
      held: categories.reduce((n, c) => n + c.held, 0),
      orders: new Set(entries.filter((e) => affected.has(e.categoryId)).map((e) => e.orderId)).size,
    },
    startListsChange: categories.some((c) => c.kinds.includes('start') || c.kinds.includes('availability') || c.kinds.includes('classification')),
  };
}
