import { z } from 'zod';
import type { EventConfig } from './schema';
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

/** A published move or new category cannot reopen a cancelled scope. */
export function cancellationClosesCategory(selection: CancellationSelection, raceIds: string[], frozenCategoryIds: string[], config: EventConfig, categoryId: string): boolean {
  if (selection.scope === 'event' || frozenCategoryIds.includes(categoryId)) return true;
  const category = config.categories.find((c) => c.id === categoryId);
  const race = config.races.find((r) => r.id === category?.raceId);
  return !!race && (raceIds.includes(race.id) || (selection.scope === 'day' && race.dayId === selection.dayId));
}

export function cancellationScopesOverlap(a: { selection: CancellationSelection; raceIds: string[] }, b: { selection: CancellationSelection; raceIds: string[] }, config: EventConfig): boolean {
  if (a.selection.scope === 'event' || b.selection.scope === 'event') return true;
  if (a.selection.scope === 'day' && b.selection.scope === 'day' && a.selection.dayId === b.selection.dayId) return true;
  if (a.selection.scope === 'race' && b.selection.scope === 'race' && a.selection.raceId === b.selection.raceId) return true;
  return a.raceIds.some((id) => b.raceIds.includes(id))
    || config.races.some((r) => (a.selection.scope === 'day' && r.dayId === a.selection.dayId && b.raceIds.includes(r.id)) || (b.selection.scope === 'day' && r.dayId === b.selection.dayId && a.raceIds.includes(r.id)));
}

export function cancellationPlacementChanges(selection: CancellationSelection, raceIds: string[], frozenCategoryIds: string[], before: EventConfig, after: EventConfig): boolean {
  return before.categories.some((old) => {
    const next = after.categories.find((c) => c.id === old.id);
    if (!next) return false;
    const oldDay = before.races.find((r) => r.id === old.raceId)?.dayId;
    const newDay = after.races.find((r) => r.id === next.raceId)?.dayId;
    return (old.raceId !== next.raceId || oldDay !== newDay)
      && (cancellationClosesCategory(selection, raceIds, frozenCategoryIds, before, old.id) || cancellationClosesCategory(selection, raceIds, frozenCategoryIds, after, next.id));
  });
}

export const cancellationExecutionSchema = z.object({
  clientRequestId: z.string().trim().refine((value) => { const n = Array.from(value).length; return n >= 8 && n <= 128; }, 'Use a request identity of 8 to 128 characters.'),
  confirmationId: id,
  acknowledgeSimulatedCancellation: z.literal(true),
}).strict();
export type CancellationExecutionInput = z.infer<typeof cancellationExecutionSchema>;
export interface CancellationExecution {
  id: string; eventId: string; confirmationId: string; executedBy: string; executedAt: string;
  status: 'simulated_cancellation_executed';
  selection: CancellationSelection; cancelledEntryIds: string[]; removedWaitlistIds: string[];
  refunds: { entryId: string; refundId: string; amountCents: number }[];
  communicationAudience: CancellationImpactPreview['communicationAudience'];
  startListSnapshotIds: string[];
}

export const CANCELLATION_PLAN_NOT_RECORDED = 'cancellation_plan_not_recorded';
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

/** A conservative financial preflight, never authorization or an executable instruction. */
export interface CancellationFinancialPreflight {
  confirmationId: string;
  eventId: string;
  assessedAt: string;
  status: 'financially_eligible_for_simulation' | 'blocked';
  executionAvailable: false;
  blockers: { code: 'plan_changed' | 'impact_unreviewable' | 'unsettled_order' | 'unsupported_policy' | 'allocation_review' | 'payment_reconciliation' | 'provider_payment' | 'refund_history'; orderId?: string; entryId?: string }[];
  entries: { entryId: string; orderId: string; acceptedEntryCents: number; nominalCashCents: number | null }[];
  simulatedCashCents: number | null;
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
