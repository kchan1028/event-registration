import { z } from 'zod';

// The event configuration is one versioned document. Field names follow the
// glossary in docs/documentation-guide.md. Display groups, categories, start
// groups, classifications, and capacity pools stay separate on purpose.

export const LICENSE_CATEGORIES = ['PRO', '1', '2', '3', '4', '5'] as const;
export const LICENSE_TYPES = ['annual', 'one_day'] as const;
export const GENDER_CLASSES = ['any', 'women', 'men'] as const;
export const COLLEGIATE_DIVISIONS = ['A', 'B', 'C', 'D'] as const;

const id = z.string().min(1).max(64);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM');
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/, 'Use YYYY-MM-DDTHH:MM');
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
  classifications: z.array(z.object({ code: z.string().max(24), label: z.string().max(80) })).max(4),
  dualScoringApproved: z.boolean(),
  prizeText: z.string().max(500),
  needsReview: z.boolean(),
  reviewReason: z.string().max(300),
});

export const registrationSettingsSchema = z.object({
  bundles: z
    .array(
      z.object({
        id,
        name: z.string().max(80),
        raceIds: z.array(id).max(7),
        discountCents: cents,
        /** When set, the bundle's entries cost this fixed price instead of taking a discount. */
        priceCents: cents.nullable().default(null),
      }),
    )
    .max(10),
  additionalRaceDiscountCents: cents,
  /** each_additional_entry: every entry after the first; once_same_day: once per order when two or more entries share a day. */
  additionalRaceDiscountMode: z.enum(['each_additional_entry', 'once_same_day']).default('each_additional_entry'),
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
  refundPolicy: z.string().max(1000),
  waiverText: z.string().max(4000),
  waiverVersion: z.string().max(40),
});

export const DEFAULT_REGISTRATION_SETTINGS: z.infer<typeof registrationSettingsSchema> = {
  bundles: [],
  additionalRaceDiscountCents: 0,
  additionalRaceDiscountMode: 'each_additional_entry',
  platformFeeCents: 0,
  platformFeeLabel: 'Platform fee',
  processingFeeBasisPoints: 0,
  processingFeeLabel: 'Processing fee',
  demoIgnoreWindows: true,
  recoveryMinutes: 15,
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
    demoNotice: z.string().max(400),
  }),
  ruleSet: z.object({ source: z.string().max(200), season: z.number().int().min(2000).max(2100) }),
  registration: registrationSettingsSchema.default(DEFAULT_REGISTRATION_SETTINGS),
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

export type LicenseCategory = (typeof LICENSE_CATEGORIES)[number];
export type LicenseType = (typeof LICENSE_TYPES)[number];
export type GenderClass = (typeof GENDER_CLASSES)[number];
export type CollegiateDivision = (typeof COLLEGIATE_DIVISIONS)[number];
export type EligibilityPath = z.infer<typeof eligibilityPathSchema>;
export type RaceLength = z.infer<typeof raceLengthSchema>;
export type Category = z.infer<typeof categorySchema>;
export type EventConfig = z.infer<typeof eventConfigSchema>;
export type Race = EventConfig['races'][number];
export type RaceDay = EventConfig['days'][number];
export type StartGroup = EventConfig['startGroups'][number];
export type DisplayGroup = EventConfig['displayGroups'][number];
export type CapacityPool = EventConfig['capacityPools'][number];
export type RegistrationSettings = z.infer<typeof registrationSettingsSchema>;
export type Bundle = RegistrationSettings['bundles'][number];

/** A simulated entry used to exercise capacity rules. No payment, no rider data. */
export interface TestEntry {
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
