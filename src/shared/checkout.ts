import { z } from 'zod';
import { evaluateCategory, type EligibilityResult, type RiderProfile } from './eligibility';
import { formatTime } from './format';
import { normalizeText } from './lookup';
import { COLLEGIATE_DIVISIONS, COMPETITION_CLASSES, LICENSE_CATEGORIES, LICENSE_TYPES, type Category, type EventConfig } from './schema';

/**
 * Rider checkout rules shared by the browser and the server:
 * which selections are allowed, which start times conflict, and what a rider
 * still needs before they are cleared to race.
 */

/** Messages from docs/fixtures/demo-purchase-flow.yaml (validation_messages). */
export const MESSAGES = {
  firstName: 'Enter your first name.',
  lastName: 'Enter your last name.',
  email: 'Enter an email address, like name@example.com.',
  emailFormat: 'This email address is missing an @ or a domain. Check it and try again.',
  emergencyName: "Enter an emergency contact's name.",
  emergencyPhone: "Enter an emergency contact's phone number.",
  phoneFormat: 'Enter a phone number with 10 digits.',
  guardianName: 'Riders under 18 need a parent or guardian. Enter their name.',
  entry: 'Choose at least one race to continue.',
  waiverRead: 'Read the waiver to the end before signing.',
  waiverSignature: 'Type your full name to sign the waiver.',
  waiverAgree: 'Check the box to confirm you agree to the waiver.',
  signatureMismatch: "The typed name must match the rider's name (or the guardian's, for a minor).",
  full: 'This category is full. Choose another category or ask the organizer about the waitlist.',
  ineligible: "This category does not match the rider's age or license category.",
} as const;

const digits = (s: string) => s.replace(/\D/g, '');
/** Something before an @, then a domain with a dot. Used wherever a rider types an email. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const optionalPhone = z
  .string()
  .trim()
  .max(24)
  .default('')
  .refine((v) => v === '' || digits(v).length === 10, MESSAGES.phoneFormat);

/** The rider facts eligibility is checked against (see `RiderProfile`), as a rider enters them at checkout or on a waitlist. */
export const riderProfileFields = {
  racingAge: z.number().int().min(5).max(110),
  licenseCategory: z.enum(LICENSE_CATEGORIES).nullable(),
  licenseType: z.enum(LICENSE_TYPES).nullable(),
  competitionClass: z.enum(COMPETITION_CLASSES).nullable(),
  collegiateDivision: z.enum(COLLEGIATE_DIVISIONS).nullable(),
};

export const riderDetailsSchema = z
  .object({
    firstName: z.string().trim().min(1, MESSAGES.firstName).max(60),
    lastName: z.string().trim().min(1, MESSAGES.lastName).max(60),
    email: z.string().trim().max(120).default(''),
    phone: optionalPhone,
    team: z.string().trim().max(80).default(''),
    ...riderProfileFields,
    licenseNumber: z.string().trim().max(30).default(''),
    demoRiderId: z.string().max(40).nullable().default(null),
    emergencyContact: z.object({
      name: z.string().trim().min(1, MESSAGES.emergencyName).max(120),
      phone: z
        .string()
        .trim()
        .min(1, MESSAGES.emergencyPhone)
        .max(24)
        .refine((v) => digits(v).length === 10, MESSAGES.phoneFormat),
    }),
    guardian: z
      .object({
        name: z.string().trim().min(1, MESSAGES.guardianName).max(120),
        relationship: z.string().trim().max(40).default(''),
        email: z.string().trim().max(120).default(''),
        phone: optionalPhone,
      })
      .nullable(),
  })
  .superRefine((d, ctx) => {
    // A minor's contact can go through the guardian; someone must have an email for the receipt.
    const target = d.guardian && !d.email ? ['guardian', 'email'] : ['email'];
    const value = d.guardian && !d.email ? d.guardian.email : d.email;
    if (!value) ctx.addIssue({ code: 'custom', path: target, message: MESSAGES.email });
    else if (!EMAIL_PATTERN.test(value)) ctx.addIssue({ code: 'custom', path: target, message: MESSAGES.emailFormat });
  });
export type RiderDetails = z.infer<typeof riderDetailsSchema>;

/** Typed-name signature plus confirmation (fixtures: typed_name_plus_checkbox). */
export const waiverAcceptanceSchema = z.object({
  version: z.string().max(60),
  read: z.literal(true, { errorMap: () => ({ message: MESSAGES.waiverRead }) }),
  agreed: z.literal(true, { errorMap: () => ({ message: MESSAGES.waiverAgree }) }),
  signatureName: z.string().trim().min(1, MESSAGES.waiverSignature).max(120),
  signerRole: z.enum(['rider', 'guardian']),
});
export type WaiverAcceptance = z.infer<typeof waiverAcceptanceSchema>;

/**
 * Racing age is the rider's age on December 31 of the season, so a rider with racing age 18 can still be 17 on race day.
 * A parent or guardian signs for every rider with racing age 18 or under, in any category (project owner, November 15, 2026).
 * The federation's minor-signature policy is still open (product.md open question 9).
 */
export const GUARDIAN_MAX_RACING_AGE = 18;

export function mayBeMinor(racingAge: number | null): boolean {
  return racingAge !== null && racingAge <= GUARDIAN_MAX_RACING_AGE;
}

/** A guardian signs when the rider may be a minor or any chosen category asks for one. */
export function needsGuardian(config: EventConfig, categoryIds: readonly string[], racingAge: number | null): boolean {
  return mayBeMinor(racingAge) || categoryIds.some((id) => config.categories.find((c) => c.id === id)?.eligibility.guardianRequired);
}

/** The signer is the guardian when any entry needs one, otherwise the rider; the typed name must match. */
export function checkSignature(rider: Pick<RiderDetails, 'firstName' | 'lastName' | 'guardian'>, waiver: Pick<WaiverAcceptance, 'signatureName' | 'signerRole'>, needsGuardian: boolean): string | null {
  const role = needsGuardian ? 'guardian' : 'rider';
  if (waiver.signerRole !== role) return needsGuardian ? 'A parent or guardian must sign for this entry.' : MESSAGES.signatureMismatch;
  const expected = role === 'guardian' ? (rider.guardian?.name ?? '') : `${rider.firstName} ${rider.lastName}`;
  return normalizeText(waiver.signatureName) === normalizeText(expected) && expected.trim() ? null : MESSAGES.signatureMismatch;
}

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

/* Registration windows ---------------------------------------------------- */

/** Current wall-clock time in the event's time zone as "YYYY-MM-DDTHH:MM", the format windows are stored in. */
export function localNow(timeZone: string, now: Date = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export type WindowState = 'open' | 'not_yet' | 'closed';

/** Open from `from` (inclusive) until `until` (exclusive), all in local event time. A missing side does not limit. */
export function timeWindowState(from: string | null, until: string | null, nowLocal: string): WindowState {
  if (from && nowLocal < from) return 'not_yet';
  if (until && nowLocal >= until) return 'closed';
  return 'open';
}

/** A category's registration window: open from opensAt (inclusive) until closesAt (exclusive). */
export function windowState(cat: Pick<Category, 'registration'>, nowLocal: string): WindowState {
  return timeWindowState(cat.registration.opensAt, cat.registration.closesAt, nowLocal);
}

/** Real events always enforce windows; a demo event can let testers try registration at any time. */
export function enforcesWindows(config: Pick<EventConfig, 'event' | 'registration'>): boolean {
  return !(config.event.isDemo && config.registration.demoIgnoreWindows);
}

/** "Mar 1, 2027, 9:00 AM" from a stored local date-time. */
export function formatLocalDateTime(local: string): string {
  const [d, t] = local.split('T');
  const [y, m, day] = d.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  return `${date}, ${formatTime(t)}`;
}

export function windowMessage(cat: Pick<Category, 'registration' | 'name'>, state: WindowState, timeZoneLabel = ''): string | null {
  const tz = timeZoneLabel ? ` (${timeZoneLabel})` : '';
  if (state === 'not_yet' && cat.registration.opensAt) return `Registration for ${cat.name} opens ${formatLocalDateTime(cat.registration.opensAt)}${tz}.`;
  if (state === 'closed' && cat.registration.closesAt) return `Registration for ${cat.name} closed ${formatLocalDateTime(cat.registration.closesAt)}${tz}.`;
  return null;
}

export interface SelectionCheck {
  ok: boolean;
  problems: string[];
  eligibility: Record<string, EligibilityResult>;
  conflicts: Conflict[];
  needsGuardian: boolean;
}

/** Server-side gate for an order; the browser uses the same rules to explain them early. */
export function checkSelection(config: EventConfig, categoryIds: readonly string[], profile: RiderProfile, opts: { nowLocal?: string } = {}): SelectionCheck {
  const problems: string[] = [];
  const eligibility: Record<string, EligibilityResult> = {};
  if (categoryIds.length === 0) problems.push('Choose at least one race.');
  if (new Set(categoryIds).size !== categoryIds.length) problems.push('A category was chosen twice.');
  for (const id of categoryIds) {
    const cat = config.categories.find((c) => c.id === id);
    if (!cat || cat.status === 'archived') {
      problems.push('A chosen category is no longer offered.');
      continue;
    }
    if (cat.status === 'closed') problems.push(`${cat.name} is closed to new entries.`);
    if (opts.nowLocal && enforcesWindows(config)) {
      const msg = windowMessage(cat, windowState(cat, opts.nowLocal), config.event.timeZone);
      if (msg) problems.push(msg);
    }
    const result = evaluateCategory(cat, profile);
    eligibility[id] = result;
    if (result.status === 'ineligible') problems.push(`You are not eligible for ${cat.name}: ${result.reasons.join('; ')}.`);
  }
  const conflicts = findConflicts(config, categoryIds);
  for (const c of conflicts) if (c.level === 'block') problems.push(c.message);
  return { ok: problems.length === 0, problems, eligibility, conflicts, needsGuardian: needsGuardian(config, categoryIds, profile.racingAge) };
}

/** A paid entry still racing that no organizer has reviewed the license for. A withdrawn entry can never be reviewed. */
export function awaitsLicenseReview(orderStatus: string, entry: { status: string; licenseReviewed: boolean }): boolean {
  return orderStatus === 'confirmed' && entry.status === 'confirmed' && !entry.licenseReviewed;
}

export type ReadinessItem = { key: 'license' | 'waiver' | 'guardian'; label: string; state: 'done' | 'needs_review' | 'missing' };

/** What a rider still needs before they are cleared to race. Paying never clears a rider by itself. */
/** `licenseSimulated`: the review came from the demo's simulated license check, not from a person. */
export function readiness(opts: { licenseReviewed: boolean; licenseSimulated: boolean; signerName: string | null; guardianRequired: boolean; guardianSigned: boolean }): ReadinessItem[] {
  const items: ReadinessItem[] = [
    {
      key: 'license',
      label: opts.licenseReviewed ? (opts.licenseSimulated ? 'License: simulated check valid (demo)' : 'License reviewed by the organizer') : 'License needs review: not verified yet. Bring your license to the registration desk before you race.',
      state: opts.licenseReviewed ? 'done' : 'needs_review',
    },
    { key: 'waiver', label: opts.signerName ? `Waiver signed by ${opts.signerName}` : 'Waiver not signed', state: opts.signerName ? 'done' : 'missing' },
  ];
  if (opts.guardianRequired) items.push({ key: 'guardian', label: opts.guardianSigned ? 'Guardian signature recorded' : 'Guardian must sign the waiver', state: opts.guardianSigned ? 'done' : 'missing' });
  return items;
}
