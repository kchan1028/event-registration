import type { Category, CollegiateDivision, CompetitionClass, EligibilityPath, LicenseCategory, LicenseType } from './schema';

/**
 * The rider facts eligibility is checked against. The same check gates checkout, joining a
 * waitlist, and transfers, and runs in the organizer preview's "check a rider" tool.
 * Racing age is entered directly: the governing body's racing-age rule is not
 * implemented here (see product.md, Eligibility). License data is self-reported
 * because federation verification is not connected.
 */
export interface RiderProfile {
  racingAge: number | null;
  licenseCategory: LicenseCategory | null; // null = unknown
  licenseType: LicenseType | null;
  competitionClass: CompetitionClass | null;
  collegiateDivision: CollegiateDivision | null; // null = not a collegiate rider
}

export type EligibilityStatus = 'eligible' | 'needs_review' | 'ineligible';

export interface EligibilityResult {
  status: EligibilityStatus;
  /** Plain-English reasons, closest matching path first. */
  reasons: string[];
}

const RANK: Record<EligibilityStatus, number> = { eligible: 2, needs_review: 1, ineligible: 0 };

export function licenseLabel(c: LicenseCategory): string {
  return c === 'PRO' ? 'Pro' : `Cat ${c}`;
}

/** Evaluate one path: every constraint must hold (AND). */
export function evaluatePath(path: EligibilityPath, rider: RiderProfile): { status: EligibilityStatus; reasons: string[] } {
  const fails: string[] = [];
  const unknowns: string[] = [];

  if (path.licenseCategories.length > 0) {
    if (rider.licenseCategory === null) unknowns.push('license category unknown');
    else if (!path.licenseCategories.includes(rider.licenseCategory)) {
      fails.push(`${licenseLabel(rider.licenseCategory)} is not one of ${path.licenseCategories.map(licenseLabel).join(', ')}`);
    }
  }
  if (path.licenseTypes.length === 1) {
    if (rider.licenseType === null) unknowns.push('license type unknown');
    else if (!path.licenseTypes.includes(rider.licenseType)) fails.push(`requires a ${path.licenseTypes[0] === 'annual' ? 'annual' : 'one-day'} license`);
  }
  if (path.minAge !== null || path.maxAge !== null) {
    if (rider.racingAge === null) unknowns.push('racing age unknown');
    else {
      if (path.minAge !== null && rider.racingAge < path.minAge) fails.push(`racing age ${rider.racingAge} is under ${path.minAge}`);
      if (path.maxAge !== null && rider.racingAge > path.maxAge) fails.push(`racing age ${rider.racingAge} is over ${path.maxAge}`);
    }
  }
  if (path.genderClass !== 'any') {
    if (rider.competitionClass === null) unknowns.push('competition class unknown');
    else if (rider.competitionClass === 'other') unknowns.push('competition class needs organizer confirmation');
    else if (rider.competitionClass !== path.genderClass) fails.push(`field is for ${path.genderClass}`);
  }
  if (path.collegiateRequired) {
    if (rider.collegiateDivision === null) fails.push('requires collegiate eligibility');
    else if (path.collegiateDivisions.length > 0 && !path.collegiateDivisions.includes(rider.collegiateDivision)) {
      fails.push(`collegiate division ${rider.collegiateDivision} is not ${path.collegiateDivisions.join('/')}`);
    }
  }

  if (fails.length > 0) return { status: 'ineligible', reasons: fails };
  if (unknowns.length > 0) return { status: 'needs_review', reasons: unknowns };
  return { status: 'eligible', reasons: [] };
}

/** Evaluate a category: any path may qualify (OR). Organizer review is an explicit exception. */
export function evaluateCategory(category: Category, rider: RiderProfile): EligibilityResult {
  const paths = category.eligibility.paths;
  if (paths.length === 0) {
    return withReview(category, { status: 'eligible', reasons: ['no eligibility rules set (open to everyone)'] });
  }
  let best: { status: EligibilityStatus; reasons: string[] } | null = null;
  for (const path of paths) {
    const r = evaluatePath(path, rider);
    if (best === null || RANK[r.status] > RANK[best.status]) best = r;
    if (r.status === 'eligible') break;
  }
  return withReview(category, best!);
}

function withReview(category: Category, r: { status: EligibilityStatus; reasons: string[] }): EligibilityResult {
  if (r.status === 'eligible' && category.eligibility.organizerReview) {
    return { status: 'needs_review', reasons: ['organizer reviews every entry in this category'] };
  }
  return r;
}

/** Short, human summary of one path, e.g. "Cat 3/4 · age 35+ · women". */
export function summarizePath(path: EligibilityPath): string {
  const parts: string[] = [];
  if (path.licenseCategories.length > 0) parts.push(formatLicenseSet(path.licenseCategories));
  if (path.minAge !== null && path.maxAge !== null) parts.push(`age ${path.minAge}–${path.maxAge}`);
  else if (path.minAge !== null) parts.push(`age ${path.minAge}+`);
  else if (path.maxAge !== null) parts.push(`age ${path.maxAge} and under`);
  if (path.genderClass !== 'any') parts.push(path.genderClass);
  if (path.collegiateRequired) parts.push(path.collegiateDivisions.length ? `collegiate ${path.collegiateDivisions.join('/')}` : 'collegiate');
  if (path.licenseTypes.length === 1) parts.push(path.licenseTypes[0] === 'annual' ? 'annual license' : 'one-day license');
  return parts.length ? parts.join(' · ') : 'open to everyone';
}

export function summarizeEligibility(category: Category): string {
  const paths = category.eligibility.paths;
  if (paths.length === 0) return 'Open to everyone';
  return paths.map(summarizePath).join(' or ');
}

/** "Pro/1/2", "Cat 3/4", "Cat 1/2/3". */
export function formatLicenseSet(cats: readonly LicenseCategory[]): string {
  const order = ['PRO', '1', '2', '3', '4', '5'];
  const sorted = [...cats].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const labels = sorted.map((c) => (c === 'PRO' ? 'Pro' : c));
  return sorted[0] === 'PRO' ? labels.join('/') : `Cat ${labels.join('/')}`;
}
