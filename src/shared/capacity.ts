import type { EventConfig, TestEntry } from './schema';

/**
 * Capacity rules (product.md, Capacity and entry integrity; coding guide,
 * Capacity rules):
 * - A category cap, its start group's field limit, and every capacity pool
 *   containing the category or its start group all apply at once.
 * - A rider counts once toward a shared limit, however many categories or
 *   classifications they hold inside it.
 * - Display groups never create limits.
 */

export type LimitKind = 'category' | 'start_group' | 'pool';

export interface AppliedLimit {
  kind: LimitKind;
  id: string;
  name: string;
  limit: number;
  categoryIds: string[];
}

export interface LimitUsage extends AppliedLimit {
  used: number;
  remaining: number;
}

export function startGroupCategoryIds(config: EventConfig, startGroupId: string): string[] {
  return config.categories.filter((c) => c.startGroupId === startGroupId && c.status !== 'archived').map((c) => c.id);
}

export function poolCategoryIds(config: EventConfig, poolId: string): string[] {
  const pool = config.capacityPools.find((p) => p.id === poolId);
  if (!pool) return [];
  const ids = new Set(pool.memberCategoryIds);
  for (const sg of pool.memberStartGroupIds) for (const cid of startGroupCategoryIds(config, sg)) ids.add(cid);
  return [...ids].filter((cid) => config.categories.some((c) => c.id === cid && c.status !== 'archived'));
}

/** Every limit that applies to an entry in this category. */
export function limitsForCategory(config: EventConfig, categoryId: string): AppliedLimit[] {
  const cat = config.categories.find((c) => c.id === categoryId);
  if (!cat) return [];
  const out: AppliedLimit[] = [];
  if (cat.cap !== null) out.push({ kind: 'category', id: cat.id, name: cat.name || 'Category', limit: cat.cap, categoryIds: [cat.id] });
  const sg = cat.startGroupId ? config.startGroups.find((g) => g.id === cat.startGroupId) : undefined;
  if (sg && sg.fieldLimit !== null) {
    out.push({ kind: 'start_group', id: sg.id, name: sg.name || 'Start group', limit: sg.fieldLimit, categoryIds: startGroupCategoryIds(config, sg.id) });
  }
  for (const pool of config.capacityPools) {
    const members = poolCategoryIds(config, pool.id);
    if (members.includes(cat.id)) out.push({ kind: 'pool', id: pool.id, name: pool.name || 'Capacity pool', limit: pool.limit, categoryIds: members });
  }
  return out;
}

/** Distinct riders with an entry in any of the given categories. */
export function distinctRiders(entries: readonly TestEntry[], categoryIds: readonly string[]): Set<string> {
  const set = new Set(categoryIds);
  const riders = new Set<string>();
  for (const e of entries) if (set.has(e.categoryId)) riders.add(e.riderRef);
  return riders;
}

export function usageForLimit(limit: AppliedLimit, entries: readonly TestEntry[]): LimitUsage {
  const used = distinctRiders(entries, limit.categoryIds).size;
  return { ...limit, used, remaining: Math.max(0, limit.limit - used) };
}

export function usageForCategory(config: EventConfig, entries: readonly TestEntry[], categoryId: string): LimitUsage[] {
  return limitsForCategory(config, categoryId).map((l) => usageForLimit(l, entries));
}

/** Places left for a new rider in this category; null means no limit applies. */
export function remainingForCategory(config: EventConfig, entries: readonly TestEntry[], categoryId: string): number | null {
  const usage = usageForCategory(config, entries, categoryId);
  if (usage.length === 0) return null;
  return Math.min(...usage.map((u) => u.remaining));
}

export type AdmitResult = { ok: true } | { ok: false; reason: 'full'; blockedBy: LimitUsage } | { ok: false; reason: 'closed' | 'unknown_category' | 'duplicate' };

/**
 * Decide whether a rider can take a place. A rider already counted in a shared
 * limit does not consume a second place in it. Callers must run this inside the
 * same transaction that inserts the entry.
 */
export function canAdmit(config: EventConfig, entries: readonly TestEntry[], categoryId: string, riderRef: string): AdmitResult {
  const cat = config.categories.find((c) => c.id === categoryId);
  if (!cat) return { ok: false, reason: 'unknown_category' };
  if (cat.status !== 'active') return { ok: false, reason: 'closed' };
  if (entries.some((e) => e.categoryId === categoryId && e.riderRef === riderRef)) return { ok: false, reason: 'duplicate' };
  for (const usage of usageForCategory(config, entries, categoryId)) {
    const alreadyCounted = distinctRiders(entries, usage.categoryIds).has(riderRef);
    if (!alreadyCounted && usage.remaining <= 0) return { ok: false, reason: 'full', blockedBy: usage };
  }
  return { ok: true };
}

export function entryCountsByCategory(entries: readonly TestEntry[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of entries) out[e.categoryId] = (out[e.categoryId] ?? 0) + 1;
  return out;
}
