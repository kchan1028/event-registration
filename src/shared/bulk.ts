import { cloneCategory, codesInUse, newId } from './factory';
import { formatCents } from './format';
import type { Category, EventConfig } from './schema';

/**
 * Copy-day and bulk edit for the category builder (product.md 1a, Setup workflow):
 * "Duplicate category and copy-day actions generate new IDs and require review of
 * inherited times, prices, rules, and capacity links. Bulk changes show a before/after preview."
 */

/**
 * Copy every race on one day, with its start groups and categories, to another day.
 * Everything gets new IDs. Copied categories are flagged for review, timing and classification
 * codes get a "-COPY" suffix (then "-COPY2", and so on) so they never collide, and shared capacity
 * pool links and bib ranges are not copied: a pool across two days must be set up deliberately.
 */
export function copyDay(config: EventConfig, fromDayId: string, toDayId: string): { config: EventConfig; races: number; categories: number } {
  const from = config.days.find((d) => d.id === fromDayId);
  const to = config.days.find((d) => d.id === toDayId);
  if (!from || !to || from.id === to.id) return { config, races: 0, categories: 0 };

  const races = config.races.filter((r) => r.dayId === from.id);
  const raceMap = new Map(races.map((r) => [r.id, newId('race')]));
  const sgMap = new Map(config.startGroups.filter((g) => raceMap.has(g.raceId)).map((g) => [g.id, newId('sg')]));
  const reason = `Copied from ${from.label} (${from.date}) to ${to.label}. Check the start time, price, registration window, eligibility, timing code, bib range, and capacity before publishing. Shared capacity pools were not copied.`;
  const takenCodes = codesInUse(config);

  const newRaces = races.map((r) => ({ ...r, id: raceMap.get(r.id)!, dayId: to.id, name: `${r.name} (copy)`.slice(0, 120) }));
  const newGroups = config.startGroups.filter((g) => sgMap.has(g.id)).map((g) => ({ ...g, id: sgMap.get(g.id)!, raceId: raceMap.get(g.raceId)! }));
  const newCats: Category[] = config.categories
    .filter((c) => raceMap.has(c.raceId) && c.status !== 'archived')
    .map((c) =>
      cloneCategory(c, takenCodes, {
        raceId: raceMap.get(c.raceId)!,
        startGroupId: c.startGroupId ? (sgMap.get(c.startGroupId) ?? null) : null,
        reviewReason: reason,
      }),
    );
  return {
    config: { ...config, races: [...config.races, ...newRaces], startGroups: [...config.startGroups, ...newGroups], categories: [...config.categories, ...newCats] },
    races: newRaces.length,
    categories: newCats.length,
  };
}

export type BulkField = 'price' | 'dayOfSurcharge' | 'cap' | 'opensAt' | 'closesAt' | 'status';

export type BulkChange =
  | { field: 'price' | 'dayOfSurcharge'; cents: number }
  | { field: 'cap'; cap: number | null }
  | { field: 'opensAt' | 'closesAt'; at: string | null }
  | { field: 'status'; status: 'active' | 'closed' };

interface BulkPreviewRow {
  categoryId: string;
  name: string;
  before: string;
  after: string;
  /** Why this row cannot take the change; such rows are left unchanged. */
  problem: string | null;
}

const capText = (n: number | null) => (n === null ? 'No cap' : String(n));
const atText = (s: string | null) => (s === null ? 'Not set' : s.replace('T', ' '));
const statusText = (s: Category['status']) => (s === 'active' ? 'Open' : s === 'closed' ? 'Closed' : 'Archived');

function apply(c: Category, change: BulkChange): Category {
  switch (change.field) {
    case 'price':
      return { ...c, pricing: { ...c.pricing, baseCents: change.cents } };
    case 'dayOfSurcharge':
      return { ...c, pricing: { ...c.pricing, dayOfSurchargeCents: change.cents } };
    case 'cap':
      return { ...c, cap: change.cap };
    case 'opensAt':
      return { ...c, registration: { ...c.registration, opensAt: change.at } };
    case 'closesAt':
      return { ...c, registration: { ...c.registration, closesAt: change.at } };
    case 'status':
      return { ...c, status: change.status };
  }
}

function describe(c: Category, field: BulkField): string {
  switch (field) {
    case 'price':
      return formatCents(c.pricing.baseCents);
    case 'dayOfSurcharge':
      return formatCents(c.pricing.dayOfSurchargeCents);
    case 'cap':
      return capText(c.cap);
    case 'opensAt':
      return atText(c.registration.opensAt);
    case 'closesAt':
      return atText(c.registration.closesAt);
    case 'status':
      return statusText(c.status);
  }
}

/**
 * Before/after preview for a bulk change, plus the config with the change applied to
 * every row that can take it. A cap below the entries already taken, or a window that
 * would close before it opens, is shown as a problem and that row is left unchanged.
 */
export function planBulkEdit(config: EventConfig, categoryIds: readonly string[], change: BulkChange, entryCounts: Record<string, number>): { rows: BulkPreviewRow[]; config: EventConfig } {
  const ids = new Set(categoryIds);
  const rows: BulkPreviewRow[] = [];
  const categories = config.categories.map((c) => {
    if (!ids.has(c.id)) return c;
    const next = apply(c, change);
    let problem: string | null = null;
    const used = entryCounts[c.id] ?? 0;
    if (change.field === 'cap' && change.cap !== null && change.cap < used) problem = `Cap cannot go below the ${used} entries already taken.`;
    const { opensAt, closesAt } = next.registration;
    if ((change.field === 'opensAt' || change.field === 'closesAt') && opensAt && closesAt && closesAt <= opensAt) problem = 'Registration would close before it opens.';
    if (c.status === 'archived') problem = 'Archived categories are not changed.';
    rows.push({ categoryId: c.id, name: c.name, before: describe(c, change.field), after: describe(next, change.field), problem });
    return problem ? c : next;
  });
  return { rows, config: { ...config, categories } };
}
