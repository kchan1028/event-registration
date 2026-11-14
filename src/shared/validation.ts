import { distinctRiders, poolCategoryIds, startGroupCategoryIds } from './capacity';
import type { EventConfig, TestEntry } from './schema';

export type IssueLevel = 'error' | 'warning';
export type IssueTarget =
  | { kind: 'event' }
  | { kind: 'race'; id: string }
  | { kind: 'category'; id: string }
  | { kind: 'startGroup'; id: string }
  | { kind: 'pool'; id: string };

export interface Issue {
  key: string;
  level: IssueLevel;
  message: string;
  target: IssueTarget;
}

/**
 * Pre-publication checks. Errors block publishing; warnings must be
 * acknowledged. The same function runs in the browser preview and on the
 * server, so the organizer and the API never disagree.
 */
export function validateConfig(config: EventConfig, entries: readonly TestEntry[] = []): Issue[] {
  const issues: Issue[] = [];
  const add = (level: IssueLevel, key: string, message: string, target: IssueTarget) => issues.push({ key, level, message, target });

  const active = config.categories.filter((c) => c.status !== 'archived');
  const raceById = new Map(config.races.map((r) => [r.id, r]));
  const dayById = new Map(config.days.map((d) => [d.id, d]));
  const sgById = new Map(config.startGroups.map((g) => [g.id, g]));
  const dgIds = new Set(config.displayGroups.map((g) => g.id));

  if (config.races.length === 0) add('error', 'event.no-races', 'Add at least one race.', { kind: 'event' });
  if (active.length === 0) add('error', 'event.no-categories', 'Add at least one registration category.', { kind: 'event' });

  const eventYear = Number(config.days[0]?.date.slice(0, 4));
  if (!config.ruleSet.source.trim()) {
    add('warning', 'event.ruleset-source', 'Record the source of the eligibility rules (for example, the federation rulebook edition) so next season does not reuse them silently.', { kind: 'event' });
  }
  if (config.ruleSet.season !== eventYear) {
    add('warning', 'event.ruleset-season', `Eligibility rules are recorded for ${config.ruleSet.season}, but the event is in ${eventYear}. Review them before reuse.`, { kind: 'event' });
  }

  for (const race of config.races) {
    if (!dayById.has(race.dayId)) add('error', `race.${race.id}.day`, `${race.name} is not assigned to a race day.`, { kind: 'race', id: race.id });
    if (!active.some((c) => c.raceId === race.id)) add('warning', `race.${race.id}.empty`, `${race.name} has no categories yet.`, { kind: 'race', id: race.id });
  }

  // Start groups
  for (const sg of config.startGroups) {
    const race = raceById.get(sg.raceId);
    const members = startGroupCategoryIds(config, sg.id);
    const label = sg.name || 'Unnamed start group';
    if (!race) add('error', `sg.${sg.id}.race`, `${label} belongs to a race that no longer exists.`, { kind: 'startGroup', id: sg.id });
    if (!sg.name.trim()) add('error', `sg.${sg.id}.name`, 'A start group needs a name.', { kind: 'startGroup', id: sg.id });
    if (!sg.startTime) add('error', `sg.${sg.id}.time`, `${label} needs a start time.`, { kind: 'startGroup', id: sg.id });
    if (members.length === 0) add('warning', `sg.${sg.id}.empty`, `${label} has no categories.`, { kind: 'startGroup', id: sg.id });
    if (sg.stagingTime && sg.startTime && sg.stagingTime > sg.startTime) {
      add('error', `sg.${sg.id}.staging`, `${label}: staging time is after the start time.`, { kind: 'startGroup', id: sg.id });
    }
    if (sg.fieldLimit !== null) {
      const used = distinctRiders(entries, members).size;
      if (sg.fieldLimit < used) add('error', `sg.${sg.id}.below-entries`, `${label}: field limit ${sg.fieldLimit} is below the ${used} riders already entered.`, { kind: 'startGroup', id: sg.id });
    }
    // Two categories in one start group must not share a classification code: that would merge their scoring.
    const seen = new Map<string, string>();
    for (const cid of members) {
      const cat = active.find((c) => c.id === cid)!;
      for (const k of cat.classifications) {
        if (!k.code.trim()) continue;
        const other = seen.get(k.code);
        if (other && other !== cat.id) {
          add('error', `sg.${sg.id}.class.${k.code}`, `${label}: two categories use classification code ${k.code}. Each category in a shared start keeps its own classification.`, { kind: 'startGroup', id: sg.id });
        }
        seen.set(k.code, cat.id);
      }
    }
  }
  const byRaceTime = new Map<string, string[]>();
  for (const sg of config.startGroups) {
    if (!sg.startTime) continue;
    const k = `${sg.raceId}@${sg.startTime}`;
    byRaceTime.set(k, [...(byRaceTime.get(k) ?? []), sg.name || 'Unnamed']);
  }
  for (const [k, names] of byRaceTime) {
    if (names.length > 1) {
      const raceId = k.split('@')[0];
      add('warning', `race.${raceId}.same-start.${k}`, `${names.join(' and ')} start at the same time in the same race.`, { kind: 'race', id: raceId });
    }
  }

  // Categories
  const codesByRace = new Map<string, Map<string, string>>();
  for (const cat of active) {
    const t = { kind: 'category', id: cat.id } as const;
    const name = cat.name.trim() || 'Unnamed category';
    const race = raceById.get(cat.raceId);
    if (!cat.name.trim()) add('error', `cat.${cat.id}.name`, 'A category needs a name.', t);
    if (!race) add('error', `cat.${cat.id}.race`, `${name} belongs to a race that no longer exists.`, t);
    if (cat.needsReview) add('error', `cat.${cat.id}.review`, `${name}: ${cat.reviewReason || 'review inherited settings.'}`, t);
    if (cat.displayGroupId && !dgIds.has(cat.displayGroupId)) add('error', `cat.${cat.id}.dg`, `${name} points to a display group that no longer exists.`, t);

    if (!cat.timingCode.trim()) add('error', `cat.${cat.id}.code`, `${name} needs a short timing code.`, t);
    else {
      const codes = codesByRace.get(cat.raceId) ?? new Map<string, string>();
      const dupe = codes.get(cat.timingCode.trim().toUpperCase());
      if (dupe) add('error', `cat.${cat.id}.code-dupe`, `${name} uses timing code ${cat.timingCode}, already used by ${dupe} in this race.`, t);
      codes.set(cat.timingCode.trim().toUpperCase(), name);
      codesByRace.set(cat.raceId, codes);
    }

    if (!cat.startGroupId) add('error', `cat.${cat.id}.sg`, `${name} is not in a start group, so it has no start time.`, t);
    else {
      const sg = sgById.get(cat.startGroupId);
      if (!sg) add('error', `cat.${cat.id}.sg-missing`, `${name} points to a start group that no longer exists.`, t);
      else if (sg.raceId !== cat.raceId) add('error', `cat.${cat.id}.sg-race`, `${name} is in a start group from a different race.`, t);
      else if (cat.cap !== null && sg.fieldLimit !== null && cat.cap > sg.fieldLimit) {
        add('warning', `cat.${cat.id}.cap-over-field`, `${name}: category cap ${cat.cap} is higher than the start group's field limit ${sg.fieldLimit}, so it can never be reached.`, t);
      }
    }

    const filled = cat.classifications.filter((k) => k.code.trim());
    if (filled.length === 0) add('error', `cat.${cat.id}.class`, `${name} needs a classification code for the timer.`, t);
    if (filled.length > 1 && !cat.dualScoringApproved) {
      add('error', `cat.${cat.id}.dual`, `${name} has ${filled.length} classifications. Dual scoring must be explicitly approved.`, t);
    }

    if (cat.length.kind === 'unset') add('error', `cat.${cat.id}.length`, `${name} needs a race length (distance, laps, or duration).`, t);
    else if (race?.discipline === 'road_race' && cat.length.kind === 'duration') {
      add('warning', `cat.${cat.id}.length-kind`, `${name} is a road race measured by time. Check that this is intended.`, t);
    }

    const paths = cat.eligibility.paths;
    if (paths.length === 0) add('warning', `cat.${cat.id}.open`, `${name} has no eligibility rules, so every rider qualifies.`, t);
    paths.forEach((p, i) => {
      const pl = paths.length > 1 ? ` (path ${i + 1})` : '';
      if (p.minAge !== null && p.maxAge !== null && p.minAge > p.maxAge) add('error', `cat.${cat.id}.age.${p.id}`, `${name}${pl}: minimum age is above maximum age.`, t);
      if (p.licenseTypes.length === 0) add('error', `cat.${cat.id}.lictype.${p.id}`, `${name}${pl}: allow at least one license type.`, t);
      if (!p.collegiateRequired && p.collegiateDivisions.length > 0) add('warning', `cat.${cat.id}.coll.${p.id}`, `${name}${pl}: collegiate divisions are set but collegiate eligibility is not required.`, t);
      const empty = p.licenseCategories.length === 0 && p.minAge === null && p.maxAge === null && p.genderClass === 'any' && !p.collegiateRequired && p.licenseTypes.length === 2;
      if (empty) add('warning', `cat.${cat.id}.empty-path.${p.id}`, `${name}${pl}: this eligibility path has no conditions, so every rider qualifies.`, t);
    });

    const { opensAt, closesAt } = cat.registration;
    if (!opensAt || !closesAt) add('warning', `cat.${cat.id}.window`, `${name} has no registration ${!opensAt ? 'opening' : 'closing'} time.`, t);
    if (opensAt && closesAt && opensAt >= closesAt) add('error', `cat.${cat.id}.window-order`, `${name}: registration closes before it opens.`, t);
    const sg = cat.startGroupId ? sgById.get(cat.startGroupId) : undefined;
    const day = race ? dayById.get(race.dayId) : undefined;
    if (closesAt && sg?.startTime && day && closesAt > `${day.date}T${sg.startTime}`) {
      add('warning', `cat.${cat.id}.window-late`, `${name}: registration closes after the race starts.`, t);
    }
    for (const pc of cat.pricing.priceChanges) {
      if (day && pc.effectiveFrom > day.date) add('warning', `cat.${cat.id}.price-late.${pc.effectiveFrom}`, `${name}: a price change on ${pc.effectiveFrom} is after race day.`, t);
    }

    if (cat.cap !== null) {
      const used = distinctRiders(entries, [cat.id]).size;
      if (cat.cap < used) add('error', `cat.${cat.id}.below-entries`, `${name}: cap ${cat.cap} is below the ${used} riders already entered.`, t);
    }
  }

  // Capacity pools
  for (const pool of config.capacityPools) {
    const t = { kind: 'pool', id: pool.id } as const;
    const label = pool.name || 'Unnamed capacity pool';
    const members = poolCategoryIds(config, pool.id);
    if (!pool.name.trim()) add('error', `pool.${pool.id}.name`, 'A capacity pool needs a name.', t);
    if (members.length < 2) add('warning', `pool.${pool.id}.members`, `${label} covers ${members.length === 0 ? 'no categories' : 'only one category'}. A shared limit needs at least two.`, t);
    const caps = members.map((id) => active.find((c) => c.id === id)?.cap ?? null);
    if (members.length > 0 && caps.every((c) => c !== null)) {
      const sum = (caps as number[]).reduce((a, b) => a + b, 0);
      if (pool.limit >= sum) add('warning', `pool.${pool.id}.never-binds`, `${label}: limit ${pool.limit} is not below the combined category caps (${sum}), so it never applies.`, t);
    }
    const used = distinctRiders(entries, members).size;
    if (pool.limit < used) add('error', `pool.${pool.id}.below-entries`, `${label}: limit ${pool.limit} is below the ${used} riders already entered.`, t);
  }

  return issues;
}

export function countIssues(issues: readonly Issue[]): { errors: number; warnings: number } {
  return { errors: issues.filter((i) => i.level === 'error').length, warnings: issues.filter((i) => i.level === 'warning').length };
}
