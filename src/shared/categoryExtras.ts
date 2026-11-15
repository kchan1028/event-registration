import { z } from 'zod';
import { NO_START_TIME_SORT_KEY } from './format';
import type { Category, EventConfig } from './schema';

/**
 * Per-category rider questions, waiver addenda, and bib ranges (product.md 1a: category-specific
 * questions, waivers, and bib ranges). Checked on both the rider page and the server.
 */

export const orderExtrasSchema = z.object({
  /** categoryId -> questionId -> answer */
  answers: z.record(z.string().max(64), z.record(z.string().max(64), z.string().trim().max(500))).default({}),
  /** Category IDs whose waiver addendum the rider accepted. */
  addenda: z.array(z.string().max(64)).max(20).default([]),
});

export type OrderExtras = z.infer<typeof orderExtrasSchema>;

export const EMPTY_EXTRAS: OrderExtras = { answers: {}, addenda: [] };

/** Problems with the answers and addenda for the chosen categories, each with the field it belongs to. */
export function checkExtras(config: EventConfig, categoryIds: readonly string[], extras: OrderExtras): { field: string; message: string }[] {
  const problems: { field: string; message: string }[] = [];
  for (const id of categoryIds) {
    const cat = config.categories.find((c) => c.id === id);
    if (!cat) continue;
    for (const q of cat.questions ?? []) {
      const answer = (extras.answers[cat.id]?.[q.id] ?? '').trim();
      const field = `q-${cat.id}-${q.id}`;
      if (!answer) {
        if (q.required) problems.push({ field, message: `${cat.name}: answer "${q.label}".` });
      } else if (q.options.length > 0 && !q.options.includes(answer)) {
        problems.push({ field, message: `${cat.name}: choose one of the listed answers for "${q.label}".` });
      }
    }
    if (cat.addendum && !extras.addenda.includes(cat.id)) problems.push({ field: `addendum-${cat.id}`, message: `${cat.name}: accept "${cat.addendum.title}".` });
  }
  return problems;
}

/** Keep only answers and addenda for the chosen categories and their current questions. */
export function pruneExtras(config: EventConfig, categoryIds: readonly string[], extras: OrderExtras): OrderExtras {
  const answers: OrderExtras['answers'] = {};
  for (const id of categoryIds) {
    const cat = config.categories.find((c) => c.id === id);
    const qs = cat?.questions ?? [];
    const given = extras.answers[id] ?? {};
    const kept = Object.fromEntries(qs.filter((q) => given[q.id]?.trim()).map((q) => [q.id, given[q.id].trim()]));
    if (Object.keys(kept).length) answers[id] = kept;
  }
  return { answers, addenda: extras.addenda.filter((id) => categoryIds.includes(id) && config.categories.find((c) => c.id === id)?.addendum) };
}

/** "Question: answer" pairs for display and export, in category then question order. */
export function describeAnswers(config: EventConfig, extras: OrderExtras): { categoryId: string; category: string; label: string; answer: string }[] {
  const out: { categoryId: string; category: string; label: string; answer: string }[] = [];
  for (const [catId, byQ] of Object.entries(extras.answers)) {
    const cat = config.categories.find((c) => c.id === catId);
    for (const q of cat?.questions ?? []) if (byQ[q.id]) out.push({ categoryId: catId, category: cat!.name, label: q.label, answer: byQ[q.id] });
  }
  return out;
}

/**
 * The bib range for a rider's day: the category range of their earliest-starting race that day that
 * has one, otherwise null (the event or day range applies).
 */
export function categoryBibRange(categories: readonly (Pick<Category, 'id' | 'bibRange'> & { startTime: string | null })[]): { first: number; last: number } | null {
  const withRange = categories.filter((c) => c.bibRange).sort((a, b) => (a.startTime ?? NO_START_TIME_SORT_KEY).localeCompare(b.startTime ?? NO_START_TIME_SORT_KEY));
  return withRange[0]?.bibRange ?? null;
}
