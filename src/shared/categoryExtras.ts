import { z } from 'zod';
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
  /** Each addendum as shown when the rider accepted it. A list, because any string is a category ID. Checked when places are held, not stored with the order. */
  acceptedTerms: z.array(z.object({ categoryId: z.string().max(64), title: z.string().max(80), text: z.string().max(4000) })).max(20).optional(),
});

export type OrderExtras = z.infer<typeof orderExtrasSchema>;

export const EMPTY_EXTRAS: OrderExtras = { answers: {}, addenda: [] };

/** An acceptance covers only the title and text that were shown: a changed addendum must be accepted again. */
export function acceptedAddendum(cat: Pick<Category, 'id' | 'addendum'>, extras: OrderExtras): boolean {
  const seen = extras.acceptedTerms?.find((terms) => terms.categoryId === cat.id);
  return !!cat.addendum && !!seen && extras.addenda.includes(cat.id) && seen.title === cat.addendum.title && seen.text === cat.addendum.text;
}

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
    if (cat.addendum && !acceptedAddendum(cat, extras)) {
      const renew = extras.addenda.includes(cat.id);
      const message = renew
        ? `${cat.name}: the terms "${cat.addendum.title}" changed or could not be matched to what you accepted. Read them and accept again.`
        : `${cat.name}: accept "${cat.addendum.title}".`;
      problems.push({ field: `addendum-${cat.id}`, message });
    }
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

/** The overlap of all applicable category ranges; an inverted interval means no common bib. */
export function categoryBibRange(categories: readonly Pick<Category, 'bibRange'>[]): { first: number; last: number } | null {
  const ranges = categories.flatMap((c) => c.bibRange ? [c.bibRange] : []);
  return ranges.length ? { first: Math.max(...ranges.map((r) => r.first)), last: Math.min(...ranges.map((r) => r.last)) } : null;
}
