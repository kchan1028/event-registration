import { z } from 'zod';
import { evaluateCategory, type EligibilityResult, type RiderProfile } from './eligibility';
import { COLLEGIATE_DIVISIONS, LICENSE_CATEGORIES, LICENSE_TYPES, type Category, type EventConfig } from './schema';

/**
 * Rider checkout rules shared by the browser and the server:
 * which selections are allowed, which start times conflict, and what a rider
 * still needs before they are cleared to race.
 */

export const riderDetailsSchema = z.object({
  firstName: z.string().trim().min(1, 'Enter a first name.').max(60),
  lastName: z.string().trim().min(1, 'Enter a last name.').max(60),
  email: z.string().trim().email('Enter an email address for the receipt.').max(120),
  team: z.string().trim().max(80).default(''),
  racingAge: z.number().int().min(5).max(110),
  licenseCategory: z.enum(LICENSE_CATEGORIES).nullable(),
  licenseType: z.enum(LICENSE_TYPES).nullable(),
  competitionClass: z.enum(['women', 'men', 'other']).nullable(),
  collegiateDivision: z.enum(COLLEGIATE_DIVISIONS).nullable(),
  guardian: z
    .object({ name: z.string().trim().min(1, 'Enter the guardian’s name.').max(120), relationship: z.string().trim().min(1, 'Enter the relationship.').max(40) })
    .nullable(),
});
export type RiderDetails = z.infer<typeof riderDetailsSchema>;

export const waiverAcceptanceSchema = z.object({
  version: z.string().max(40),
  riderAccepted: z.literal(true, { errorMap: () => ({ message: 'Accept the waiver to continue.' }) }),
  guardianAccepted: z.boolean(),
});
export type WaiverAcceptance = z.infer<typeof waiverAcceptanceSchema>;

export function profileOf(d: Pick<RiderDetails, 'racingAge' | 'licenseCategory' | 'licenseType' | 'competitionClass' | 'collegiateDivision'>): RiderProfile {
  return {
    racingAge: d.racingAge,
    licenseCategory: d.licenseCategory,
    licenseType: d.licenseType,
    competitionClass: d.competitionClass,
    collegiateDivision: d.collegiateDivision,
  };
}

export interface StartWindow {
  dayId: string;
  start: number; // minutes after midnight
  end: number | null; // null when the length is a distance or laps (finish time unknown)
}

export function startWindow(config: EventConfig, cat: Category): StartWindow | null {
  const sg = config.startGroups.find((g) => g.id === cat.startGroupId);
  const race = config.races.find((r) => r.id === cat.raceId);
  if (!sg?.startTime || !race) return null;
  const [h, m] = sg.startTime.split(':').map(Number);
  const start = h * 60 + m;
  // Criterium laps after the clock runs out take a few minutes; 3 minutes per lap is a planning estimate.
  const end = cat.length.kind === 'duration' ? start + cat.length.minutes + (cat.length.plusLaps ?? 0) * 3 : null;
  return { dayId: race.dayId, start, end };
}

export interface Conflict {
  a: string;
  b: string;
  level: 'block' | 'warn';
  message: string;
}

/** Overlapping starts block; tight recovery and unknown finish times warn (product.md, Rider-facing behavior). */
export function findConflicts(config: EventConfig, categoryIds: readonly string[]): Conflict[] {
  const cats = categoryIds.map((id) => config.categories.find((c) => c.id === id)).filter((c): c is Category => !!c);
  const out: Conflict[] = [];
  const recovery = config.registration.recoveryMinutes;
  for (let i = 0; i < cats.length; i++) {
    for (let j = i + 1; j < cats.length; j++) {
      let [a, b] = [cats[i], cats[j]];
      if (a.startGroupId && a.startGroupId === b.startGroupId) {
        out.push({ a: a.id, b: b.id, level: 'block', message: `${a.name} and ${b.name} start together. You can only ride one of them.` });
        continue;
      }
      let wa = startWindow(config, a);
      let wb = startWindow(config, b);
      if (!wa || !wb || wa.dayId !== wb.dayId) continue;
      if (wb.start < wa.start) [a, b, wa, wb] = [b, a, wb, wa];
      if (wa.end === null) {
        if (wb.start - wa.start < 180) out.push({ a: a.id, b: b.id, level: 'warn', message: `${a.name} has no fixed finish time. Check that you can finish it before ${b.name} starts.` });
        continue;
      }
      if (wb.start < wa.end) out.push({ a: a.id, b: b.id, level: 'block', message: `${b.name} starts before ${a.name} is expected to finish.` });
      else if (wb.start < wa.end + recovery) out.push({ a: a.id, b: b.id, level: 'warn', message: `Only ${wb.start - wa.end} minutes between ${a.name} and ${b.name}. The event suggests at least ${recovery}.` });
    }
  }
  return out;
}

export interface SelectionCheck {
  ok: boolean;
  problems: string[];
  eligibility: Record<string, EligibilityResult>;
  conflicts: Conflict[];
  needsGuardian: boolean;
}

/** Server-side gate for an order; the browser uses the same rules to explain them early. */
export function checkSelection(config: EventConfig, categoryIds: readonly string[], profile: RiderProfile): SelectionCheck {
  const problems: string[] = [];
  const eligibility: Record<string, EligibilityResult> = {};
  if (categoryIds.length === 0) problems.push('Choose at least one race.');
  if (new Set(categoryIds).size !== categoryIds.length) problems.push('A category was chosen twice.');
  let needsGuardian = false;
  for (const id of categoryIds) {
    const cat = config.categories.find((c) => c.id === id);
    if (!cat || cat.status === 'archived') {
      problems.push('A chosen category is no longer offered.');
      continue;
    }
    if (cat.status === 'closed') problems.push(`${cat.name} is closed to new entries.`);
    const result = evaluateCategory(cat, profile);
    eligibility[id] = result;
    if (result.status === 'ineligible') problems.push(`You are not eligible for ${cat.name}: ${result.reasons.join('; ')}.`);
    if (cat.eligibility.guardianRequired) needsGuardian = true;
  }
  const conflicts = findConflicts(config, categoryIds);
  for (const c of conflicts) if (c.level === 'block') problems.push(c.message);
  return { ok: problems.length === 0, problems, eligibility, conflicts, needsGuardian };
}

export type ReadinessItem = { key: 'license' | 'waiver' | 'guardian'; label: string; state: 'done' | 'needs_review' | 'missing' };

/** What a rider still needs before they are cleared to race. Paying never clears a rider by itself. */
export function readiness(opts: { licenseReviewed: boolean; waiverAccepted: boolean; guardianRequired: boolean; guardianAccepted: boolean }): ReadinessItem[] {
  const items: ReadinessItem[] = [
    { key: 'license', label: opts.licenseReviewed ? 'License reviewed by the organizer' : 'License not verified: the organizer will review it', state: opts.licenseReviewed ? 'done' : 'needs_review' },
    { key: 'waiver', label: opts.waiverAccepted ? 'Waiver accepted' : 'Waiver not accepted', state: opts.waiverAccepted ? 'done' : 'missing' },
  ];
  if (opts.guardianRequired) items.push({ key: 'guardian', label: opts.guardianAccepted ? 'Guardian accepted the waiver' : 'Guardian must accept the waiver', state: opts.guardianAccepted ? 'done' : 'missing' });
  return items;
}
