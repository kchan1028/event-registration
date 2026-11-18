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
