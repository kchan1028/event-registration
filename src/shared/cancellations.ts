import { z } from 'zod';
import type { LimitUsage } from './capacity';
import type { refundPolicyEntitlement } from './refundPolicy';
import type { WaitlistStatus } from './waitlist';

const id = z.string().min(1).max(64);
export const cancellationSelectionSchema = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('event') }).strict(),
  z.object({ scope: z.literal('day'), dayId: id }).strict(),
  z.object({ scope: z.literal('race'), raceId: id }).strict(),
]);
export type CancellationSelection = z.infer<typeof cancellationSelectionSchema>;

export const CANCELLATION_IMPACT_CHANGED = 'Cancellation impact changed. Review a fresh confirmation preview before confirming the plan.';

/** Confirms a reviewed plan only; it is not a cancellation or payment instruction. */
export const cancellationConfirmationSchema = z.object({
  clientRequestId: z.string().trim().refine((value) => { const n = Array.from(value).length; return n >= 8 && n <= 128; }, 'Use a request identity of 8 to 128 characters.'),
  selection: cancellationSelectionSchema,
  previewFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  reason: z.string().trim().refine((value) => { const n = Array.from(value).length; return n >= 3 && n <= 300; }, 'Write a reason of 3 to 300 characters.'),
  acknowledgePlanOnly: z.literal(true),
}).strict();
export type CancellationConfirmationInput = z.infer<typeof cancellationConfirmationSchema>;

export interface CancellationConfirmationPreview {
  fingerprint: string;
  preview: CancellationImpactPreview;
  executionAvailable: false;
}

export interface CancellationConfirmation {
  id: string;
  eventId: string;
  clientRequestId: string;
  status: 'plan_confirmed';
  selection: CancellationSelection;
  reason: string;
  confirmedBy: string;
  confirmedAt: string;
  previewFingerprint: string;
  preview: CancellationImpactPreview;
  acknowledgedPlanOnly: true;
  executionAvailable: false;
}

export interface CancellationAllocationPreview {
  eventId: string;
  currentPublishedVersion: number;
  selection: CancellationSelection;
  generatedAt: string;
  scope: 'confirmed_entries_on_confirmed_orders';
  acceptedEntryAllocationCents: number;
  entries: { entryId: string; orderId: string; currentCategoryId: string; currentRaceId: string; currentDayId: string; acceptedVersion: number; acceptedPriceCategoryId: string; acceptedEntryCents: number; policy: ReturnType<typeof refundPolicyEntitlement>; reviewReasons: string[] }[];
  orders: { orderId: string; excludedWholeOrderFeesCents: number; unaffectedConfirmedEntryIds: string[] }[];
  requiresFinancialReconciliation: boolean;
  readOnly: boolean;
}

export interface CancellationImpactPreview {
  eventId: string;
  selection: CancellationSelection;
  generatedAt: string;
  currentPublishedVersion: number;
  readOnly: boolean;
  raceIds: string[];
  categoryIds: string[];
  entries: { id: string; orderId: string; categoryId: string; entryStatus: string; orderStatus: string }[];
  unaffectedLiveEntryIds: string[];
  waitlist: { id: string; categoryId: string; orderId: string | null; status: WaitlistStatus }[];
  capacity: (LimitUsage & { hypotheticalUsedAfter: number; hypotheticalReleasedPlaces: number })[];
  startListSnapshots: { id: string; raceId: string; version: number }[];
  communicationAudience: { orderIds: string[]; waitlistEntryIds: string[]; deliveryPlanned: boolean };
  financial: CancellationAllocationPreview;
  requiresFreshConfirmationPreview: boolean;
  limitations: string[];
}
