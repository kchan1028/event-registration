import { z } from 'zod';
import type { CancellationScopeState } from './cancellations';

export const bibNumberSchema = z.number().int().min(1).max(99999);

// The event configuration is one versioned document. Field names follow the
// glossary in docs/documentation-guide.md. Display groups, categories, start
// groups, classifications, and capacity pools stay separate on purpose.

export const LICENSE_CATEGORIES = ['PRO', '1', '2', '3', '4', '5'] as const;
export const LICENSE_TYPES = ['annual', 'one_day'] as const;
export const GENDER_CLASSES = ['any', 'women', 'men'] as const;
/** What a rider declares. "other" needs organizer confirmation for a women's or men's field. */
export const COMPETITION_CLASSES = ['women', 'men', 'other'] as const;
export const COLLEGIATE_DIVISIONS = ['A', 'B', 'C', 'D'] as const;

const id = z.string().min(1).max(64);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM');
/** Wall-clock time in the event's time zone, as stored for registration and coupon windows. */
export const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/, 'Use YYYY-MM-DDTHH:MM');
const cents = z.number().int().min(0).max(10_000_00);
const limit = z.number().int().min(1).max(10_000).nullable();

export const eligibilityPathSchema = z.object({
  id,
  label: z.string().max(80),
  licenseCategories: z.array(z.enum(LICENSE_CATEGORIES)),
  licenseTypes: z.array(z.enum(LICENSE_TYPES)),
  minAge: z.number().int().min(0).max(120).nullable(),
  maxAge: z.number().int().min(0).max(120).nullable(),
  genderClass: z.enum(GENDER_CLASSES),
  collegiateRequired: z.boolean(),
  collegiateDivisions: z.array(z.enum(COLLEGIATE_DIVISIONS)),
});

export const raceLengthSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('distance'),
    distance: z.number().positive().max(1000),
    unit: z.enum(['km', 'mi']),
    laps: z.number().int().min(1).max(500).nullable(),
    partialFinalLap: z.boolean(),
  }),
  z.object({
    kind: z.literal('duration'),
    minutes: z.number().int().min(1).max(600),
    plusLaps: z.number().int().min(0).max(50).nullable(),
  }),
  z.object({ kind: z.literal('laps'), laps: z.number().int().min(1).max(500) }),
  z.object({ kind: z.literal('unset') }),
]);

export const categorySchema = z.object({
  id,
  raceId: id,
  name: z.string().max(120),
  timingCode: z.string().max(24),
  description: z.string().max(1000),
  displayGroupId: id.nullable(),
  sortOrder: z.number().int(),
  status: z.enum(['active', 'closed', 'archived']),
  eligibility: z.object({
    paths: z.array(eligibilityPathSchema).max(10),
    organizerReview: z.boolean(),
    guardianRequired: z.boolean(),
  }),
  length: raceLengthSchema,
  pricing: z.object({
    baseCents: cents,
    dayOfSurchargeCents: cents,
    priceChanges: z.array(z.object({ effectiveFrom: date, cents })).max(10),
  }),
  registration: z.object({ opensAt: localDateTime.nullable(), closesAt: localDateTime.nullable() }),
  cap: limit,
  startGroupId: id.nullable(),
  /** Organizer-managed waitlist when the category is full (product.md capacity rules). Off unless set. */
  waitlistEnabled: z.boolean().optional(),
  /** Extra questions riders in this category answer at checkout. Free text when there are no options. */
  questions: z
    .array(z.object({ id, label: z.string().max(120), required: z.boolean(), options: z.array(z.string().trim().min(1).max(60)).max(10) }))
    .max(5)
    .optional(),
  /** Category waiver addendum riders accept on top of the event waiver (for example junior gear rules). */
  addendum: z.object({ title: z.string().max(80), text: z.string().max(4000) }).nullable().optional(),
  /** Bib range for this category; overrides the event or day range at check-in. */
  bibRange: z.object({ first: bibNumberSchema, last: bibNumberSchema }).nullable().optional(),
  classifications: z.array(z.object({ code: z.string().max(24), label: z.string().max(80) })).max(4),
  dualScoringApproved: z.boolean(),
  prizeText: z.string().max(500),
  needsReview: z.boolean(),
  reviewReason: z.string().max(300),
});

/** Refund and credit rules (product.md "Event and race cancellation"); described for riders by src/shared/refundPolicy.ts. A step returns `percent` of the entry amount when a rider withdraws on or before `daysBefore` days ahead of the first race day. */
export const refundTierSchema = z.object({
  daysBefore: z.number().int().min(0).max(365),
  percent: z.number().int().min(0).max(100),
});

export const refundRulesSchema = z.object({
  /** Steps; two with the same `daysBefore` block publishing (validation), so an autosave in between is never refused. */
  tiers: z.array(refundTierSchema).max(5),
  /** How a rider withdrawal is paid back. */
  returnAs: z.enum(['cash', 'credit']),
  /** What a rider gets when the organizer cancels their race, day, or event. Separate from withdrawals. */
  organizerCancellation: z.enum(['full_refund', 'credit', 'rider_choice']),
});

export type RefundRules = z.infer<typeof refundRulesSchema>;

export const registrationSettingsSchema = z.object({
  /** Lowest eligible rider rate wins; category scope follows structured eligibility. */
  riderRates: z.array(z.object({
    eligibility: eligibilityPathSchema,
    categoryGenderClass: z.enum(GENDER_CLASSES).default('any'),
    /** Retained when reading the interim local published rate format; new fixtures use structured scope. */
    categoryIds: z.array(id).optional(),
    racePrices: z.array(z.object({ raceId: id, cents, extraEntryCents: cents })),
    bundlePriceCents: cents,
  })).max(10).optional(),
  bundles: z
    .array(
      z.object({
        id,
        name: z.string().max(80),
        raceIds: z.array(id).max(7),
        discountCents: cents,
        /** When set, the bundle's entries cost this fixed price instead of taking a discount. */
        priceCents: cents.nullable().default(null),
        /** Nomination only. Award eligibility and grouping need organizer review. */
        omnium: z.object({ code: z.string().min(1).max(24), label: z.string().min(1).max(80) }).optional(),
      }),
    )
    .max(10),
  additionalRaceDiscountCents: cents,
  /** each_additional_entry: every entry after the first; once_same_day: once per order when two or more entries share a day. */
  additionalRaceDiscountMode: z.enum(['each_additional_entry', 'once_same_day']).default('each_additional_entry'),
  /** When set, each entry after the first in the same race costs this flat price (e.g. a second criterium category). */
  sameRaceExtraEntryCents: cents.nullable().default(null),
  platformFeeCents: cents.default(0),
  platformFeeLabel: z.string().max(60).default('Platform fee'),
  /** Percentage of the entries subtotal after discounts, in basis points (300 = 3%). */
  processingFeeBasisPoints: z.number().int().min(0).max(2000).default(0),
  processingFeeLabel: z.string().max(60).default('Processing fee'),
  /**
   * Demo events only: let testers register outside each category's registration
   * window. Ignored for real events, which always enforce the windows.
   */
  demoIgnoreWindows: z.boolean().default(true),
  recoveryMinutes: z.number().int().min(0).max(180),
  /** Structured refund and credit rules. Null: none set (events saved before rules existed). */
  refundRules: refundRulesSchema.nullable().default(null),
  /** Extra notes shown with the rules before payment. */
  refundPolicy: z.string().max(1000),
  waiverText: z.string().max(4000),
  waiverVersion: z.string().max(40),
});

export const DEFAULT_REGISTRATION_SETTINGS: z.infer<typeof registrationSettingsSchema> = {
  bundles: [],
  additionalRaceDiscountCents: 0,
  additionalRaceDiscountMode: 'each_additional_entry',
  sameRaceExtraEntryCents: null,
  platformFeeCents: 0,
  platformFeeLabel: 'Platform fee',
  processingFeeBasisPoints: 0,
  processingFeeLabel: 'Processing fee',
  demoIgnoreWindows: true,
  recoveryMinutes: 15,
  refundRules: null,
  refundPolicy: '',
  waiverText: '',
  waiverVersion: '',
};

export const eventConfigSchema = z.object({
  schemaVersion: z.literal(1),
  event: z.object({
    name: z.string().min(1).max(120),
    timeZone: z.string().min(1).max(64),
    venue: z.string().max(200),
    isDemo: z.boolean(),
    /** Read-only published demo research; never accepts registrations. */
    researchOnly: z.boolean().optional(),
    demoNotice: z.string().max(400),
  }),
  ruleSet: z.object({ source: z.string().max(200), season: z.number().int().min(2000).max(2100) }),
  registration: registrationSettingsSchema.prefault(DEFAULT_REGISTRATION_SETTINGS),
  days: z.array(z.object({ id, date, label: z.string().max(60) })).min(1).max(7),
  races: z
    .array(z.object({ id, dayId: id, name: z.string().max(120), discipline: z.enum(['road_race', 'criterium']), course: z.string().max(200) }))
    .max(20),
  displayGroups: z.array(z.object({ id, name: z.string().max(80), sortOrder: z.number().int() })).max(40),
  startGroups: z
    .array(z.object({ id, raceId: id, name: z.string().max(80), startTime: time.nullable(), stagingTime: time.nullable(), fieldLimit: limit }))
    .max(100),
  categories: z.array(categorySchema).max(300),
  capacityPools: z
    .array(
      z.object({
        id,
        name: z.string().max(80),
        limit: z.number().int().min(1).max(10_000),
        memberCategoryIds: z.array(id),
        memberStartGroupIds: z.array(id),
      }),
    )
    .max(50),
});

export interface PublicEventSummary {
  cancellation: CancellationScopeState;
  id: string;
  organizationName: string;
  name: string;
  venue: string;
  isDemo: boolean;
  researchOnly: boolean;
  days: { date: string; label: string; races: string[] }[];
  categoryCount: number;
}

export type LicenseCategory = (typeof LICENSE_CATEGORIES)[number];
export type LicenseType = (typeof LICENSE_TYPES)[number];
export type GenderClass = (typeof GENDER_CLASSES)[number];
export type CompetitionClass = (typeof COMPETITION_CLASSES)[number];
export type CollegiateDivision = (typeof COLLEGIATE_DIVISIONS)[number];
export type EligibilityPath = z.infer<typeof eligibilityPathSchema>;
export type RaceLength = z.infer<typeof raceLengthSchema>;
export type Category = z.infer<typeof categorySchema>;
export type EventConfig = z.infer<typeof eventConfigSchema>;
export type Race = EventConfig['races'][number];
export type StartGroup = EventConfig['startGroups'][number];
export type CapacityPool = EventConfig['capacityPools'][number];
export type RegistrationSettings = z.infer<typeof registrationSettingsSchema>;
export type Bundle = RegistrationSettings['bundles'][number];

/** A place in use for capacity counting: an organizer test entry, a confirmed or held order entry, or a live waitlist offer. */
export interface CapacityEntry {
  id: string;
  categoryId: string;
  riderRef: string;
}

export const TEMPLATES = ['road_race', 'criterium', 'weekend'] as const;
export type Template = (typeof TEMPLATES)[number];

export const createEventInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  template: z.enum(TEMPLATES),
  startDate: date,
  timeZone: z.string().min(1).max(64),
  venue: z.string().max(200).default(''),
});
export type CreateEventInput = z.infer<typeof createEventInputSchema>;
