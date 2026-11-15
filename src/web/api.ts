import type { LimitUsage } from '../shared/capacity';
import type { RefundStatus } from '../shared/refunds';
import type { CreateEventInput, EventConfig, CapacityEntry } from '../shared/schema';
import type { Issue } from '../shared/validation';
import type { ReadinessItem, RiderDetails, WaiverAcceptance } from '../shared/checkout';
import type { Quote } from '../shared/pricing';
import type { z } from 'zod';
import type { couponInputSchema, CouponTerms } from '../shared/coupons';
import type { OrderExtras } from '../shared/categoryExtras';
import type { FieldChange, RiderCorrection } from '../shared/lookup';
import type { BibSettings, BibBatch, BibPlan, CheckInRider, CheckInList } from '../shared/checkin';
import type { WaitlistJoin, WaitlistStatus } from '../shared/waitlist';
import type { StartListDiff, StartListRow } from '../shared/startlist';
import type { ChangeImpact } from '../shared/impact';
import type { EventSummary } from '../shared/reports';
import type { Invitation, MembershipChange, Role } from '../shared/roles';

/** simulated: the labeled demo button. stripe_test: Stripe hosted Checkout in test mode. */
export type { CheckInRider, CheckInList } from '../shared/checkin';

export type PaymentMode = 'simulated' | 'stripe_test';

/** What an organizer sends to create a coupon code. */
export type CouponInput = z.input<typeof couponInputSchema>;

export interface PublicEvent {
  eventId: string;
  publishedVersion: number;
  organizationName: string;
  config: EventConfig;
  remaining: Record<string, number | null>;
  today: string;
  nowLocal: string;
  enforceWindows: boolean;
  holdMinutes: number;
  paymentMode: PaymentMode;
  /** Categories with a waitlist turned on, and how many riders are in line. */
  waitlist: Record<string, { waiting: number }>;
}

export interface WaitlistEntryView {
  id: string;
  categoryId: string;
  firstName: string;
  lastName: string;
  email: string;
  racingAge: number;
  status: WaitlistStatus;
  position: number | null;
  joinedAt: string;
  offeredAt: string | null;
  offerExpiresAt: string | null;
  offerToken: string | null;
  orderId: string | null;
}

export interface IdentityOrderLabel {
  orderId: string;
  name: string;
  orderNumber: string;
  team: string;
  status: OrderStatus;
}

export interface RiderIdentityOverview {
  suggestions: { a: string; b: string; reasons: string[]; orders: IdentityOrderLabel[] }[];
  groups: { key: string; orders: IdentityOrderLabel[] }[];
}

export interface ResolutionItem {
  id: string;
  status: 'open' | 'kept' | 'transferred' | 'withdrawn';
  publishedVersion: number;
  details: string[];
  riderName: string;
  orderNumber: string;
  orderId: string;
  entryId: string;
  categoryName: string;
  entryStatus: string;
  riderNotified: boolean;
  note: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface WaitlistOffer {
  eventId: string;
  categoryId: string;
  categoryName: string;
  status: WaitlistStatus;
  offerExpiresAt: string | null;
  rider: Omit<WaitlistJoin, 'categoryId'>;
}

export type OrderStatus = 'held' | 'payment_failed' | 'confirmed' | 'expired' | 'cancelled' | 'needs_attention';

export interface PublicEventSummary {
  id: string;
  organizationName: string;
  name: string;
  venue: string;
  isDemo: boolean;
  days: { date: string; label: string; races: string[] }[];
  categoryCount: number;
}

export interface RefundablePaymentView {
  ref: string | null;
  provider: PaymentMode;
  kind: 'order' | 'duplicate';
  amountCents: number;
  refundedCents: number;
  remainingCents: number;
}

export interface OrganizerRefundView {
  id: string;
  entryId: string | null;
  paymentRef: string | null;
  provider: PaymentMode;
  amountCents: number;
  reason: string;
  status: RefundStatus;
  failureReason: string | null;
  requestedBy: string | null;
  createdAt: string;
}

export interface OrderView {
  /** How the order was paid: the simulated button or Stripe test mode. Null until paid. */
  paidWith: PaymentMode | null;
  /** Refunds, oldest first (no reason: riders see this too). */
  /** duplicateCharge: the refund returned a second charge for this order, not the order's own payment. */
  refunds: { id: string; entryId: string | null; amountCents: number; status: RefundStatus; at: string; duplicateCharge: boolean }[];
  answers: { categoryId: string; category: string; label: string; answer: string }[];
  addenda: { categoryId: string; title: string }[];
  id: string;
  orderNumber: string;
  eventId: string;
  eventName: string;
  isDemo: boolean;
  publishedVersion: number;
  status: OrderStatus;
  rider: RiderDetails;
  waiver: WaiverAcceptance;
  guardianRequired: boolean;
  quote: Quote;
  couponCode: string | null;
  totalCents: number;
  holdExpiresAt: string;
  checkInCode: string | null;
  createdAt: string;
  confirmedAt: string | null;
  refundPolicy: string;
  entries: {
    id: string;
    categoryId: string;
    categoryName: string;
    code: string;
    raceName: string;
    dayId: string;
    startTime: string | null;
    status: 'held' | 'confirmed' | 'released' | 'withdrawn';
    amountPaidCents: number;
    discountCents: number;
    discountReason: string | null;
    withdrawnAt: string | null;
    changes: {
      kind: 'transfer' | 'withdraw';
      fromCategoryName: string;
      toCategoryName: string | null;
      amountPaidCents: number;
      newPriceCents: number | null;
      differenceCents: number | null;
      reason: string;
      at: string;
    }[];
    licenseReviewed: boolean;
    licenseReviewNote: string | null;
    readiness: ReadinessItem[];
  }[];
  corrections: { changes: FieldChange[]; licenseReviewsCleared: number; reason: string; by: string | null; at: string }[];
}

export type CouponView = CouponTerms & {
  id: string;
  validFrom: string | null;
  validUntil: string | null;
  maxRedemptions: number | null;
  maxPerRider: number | null;
  active: boolean;
  createdAt: string;
  redemptions: { confirmed: number; reserved: number };
};

export interface EventPayload {
  id: string;
  organizationId: string;
  organizationName: string;
  revision: number;
  publishedVersion: number | null;
  publishedRevision: number | null;
  updatedAt: string;
  config: EventConfig;
  entries: CapacityEntry[];
  versions: { version: number; publishedAt: string; draftRevision: number; warningsAcknowledged: number }[];
  issues: Issue[];
  /** What is not connected yet, in words for the screen. `payments` follows the server's payment mode. */
  pending: { licenseVerification: string; payments: string; signIn: string };
  /** The caller's roles in the event's organization (sent by GET /api/events/:id). */
  roles?: Role[];
}

export interface OrganizationSummary {
  id: string;
  name: string;
  /** The caller's roles in this organization. */
  roles: Role[];
  events: {
    id: string;
    name: string;
    isDemo: boolean;
    firstDay: string | null;
    raceCount: number;
    categoryCount: number;
    publishedVersion: number | null;
    hasUnpublishedChanges: boolean;
  }[];
}

export interface TestEntryResult {
  requested: number;
  created: number;
  reason: string | null;
  blockedBy: LimitUsage | null;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/** Supplies the signed-in session token (src/web/auth.tsx); every API call sends it. */
let tokenGetter: () => Promise<string | null> = async () => null;
export function setTokenGetter(fn: () => Promise<string | null>): void {
  tokenGetter = fn;
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await tokenGetter().catch(() => null);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { ...(await authHeaders()), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the CycleReg server. Check that it is running, then try again.');
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (${res.status}).`, data?.details);
  return data as T;
}

/**
 * Downloads a file from a signed-in route. A plain link cannot send the session token, so the
 * file is fetched with it and saved under the name the server gives.
 */
/** Saves a blob as a file download under the given name. */
export function saveBlob(name: string, blob: Blob): void {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export async function downloadFile(url: string): Promise<void> {
  const res = await fetch(url, { headers: await authHeaders() }).catch(() => {
    throw new ApiError(0, 'Cannot reach the CycleReg server. Check that it is running, then try again.');
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data?.error ?? `Download failed (${res.status}).`);
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'download.csv';
  saveBlob(name, await res.blob());
}

export interface MemberList {
  members: { accountId: string; email: string; role: Role }[];
  invitations: Invitation[];
  /** The most recent role changes, newest first. */
  history: MembershipChange[];
}

export interface StartListRace {
  raceId: string;
  raceName: string;
  date: string;
  rows: StartListRow[];
  snapshots: { version: number; createdAt: string; publishedVersion: number; riders: number; changesFromPrevious: StartListDiff | null }[];
  changesSinceLastSnapshot: StartListDiff | null;
  lock: { snapshotVersion: number; lockedAt: string } | null;
  changesSinceLock: StartListDiff | null;
}

export interface StartListOverview {
  eventId: string;
  eventName: string;
  isDemo: boolean;
  publishedVersion: number;
  races: StartListRace[];
}

export const api = {
  members: (orgId: string) => request<MemberList>('GET', `/api/organizations/${orgId}/members`),
  addMember: (orgId: string, email: string, role: Role) => request<MemberList>('POST', `/api/organizations/${orgId}/members`, { email, role }),
  removeMember: (orgId: string, email: string, role: Role) => request<MemberList>('POST', `/api/organizations/${orgId}/members/remove`, { email, role }),
  transferOwnership: (orgId: string, email: string) => request<MemberList>('POST', `/api/organizations/${orgId}/ownership-transfer`, { email }),
  organizations: () => request<OrganizationSummary[]>('GET', '/api/organizations'),
  createOrganization: (name: string) => request<{ id: string; name: string }>('POST', '/api/organizations', { name }),
  createEvent: (orgId: string, input: CreateEventInput) => request<EventPayload>('POST', `/api/organizations/${orgId}/events`, input),
  createDemo: () => request<{ organizationId: string; eventId: string }>('POST', '/api/demo'),
  createOmnium: () => request<{ organizationId: string; eventId: string }>('POST', '/api/demo/berkeley-omnium'),
  event: (id: string) => request<EventPayload>('GET', `/api/events/${id}`),
  saveConfig: (id: string, revision: number, config: EventConfig) => request<EventPayload>('PUT', `/api/events/${id}/config`, { revision, config }),
  publish: (id: string, acknowledgeWarnings: boolean, acknowledgeImpact = false) =>
    request<EventPayload & { publishedVersion: number }>('POST', `/api/events/${id}/publish`, { acknowledgeWarnings, acknowledgeImpact }),
  addTestEntries: (id: string, categoryId: string, count: number) =>
    request<{ result: TestEntryResult; event: EventPayload }>('POST', `/api/events/${id}/test-entries`, { categoryId, count }),
  clearTestEntries: (id: string) => request<{ removed: number; event: EventPayload }>('DELETE', `/api/events/${id}/test-entries`),
  publicEvents: () => request<PublicEventSummary[]>('GET', '/api/public/events'),
  loadPurchaseFlowDemo: () => request<{ organizationId: string; eventIds: string[] }>('POST', '/api/demo/purchase-flow'),
  joinWaitlist: (eventId: string, body: WaitlistJoin) => request<WaitlistEntryView>('POST', `/api/rider/events/${eventId}/waitlist`, body),
  waitlistOffer: (token: string) => request<WaitlistOffer>('GET', `/api/rider/offers/${encodeURIComponent(token)}`),
  riderIdentity: (eventId: string) => request<RiderIdentityOverview>('GET', `/api/events/${eventId}/rider-identity`),
  linkRiders: (eventId: string, a: string, b: string) => request<RiderIdentityOverview>('POST', `/api/events/${eventId}/rider-identity/link`, { orderIds: [a, b] }),
  dismissRiderMatch: (eventId: string, a: string, b: string) => request<RiderIdentityOverview>('POST', `/api/events/${eventId}/rider-identity/dismiss`, { orderIds: [a, b] }),
  unlinkRider: (eventId: string, orderId: string) => request<RiderIdentityOverview>('POST', `/api/events/${eventId}/rider-identity/unlink`, { orderId }),
  resolutions: (eventId: string) => request<ResolutionItem[]>('GET', `/api/events/${eventId}/resolutions`),
  summary: (eventId: string) => request<EventSummary>('GET', `/api/events/${eventId}/summary`),
  resolveItem: (eventId: string, id: string, body: { outcome: 'kept' | 'transferred' | 'withdrawn'; riderNotified: boolean; note: string }) =>
    request<ResolutionItem[]>('POST', `/api/events/${eventId}/resolutions/${id}`, body),
  waitlist: (eventId: string) => request<{ offerHours: number; entries: WaitlistEntryView[] }>('GET', `/api/events/${eventId}/waitlist`),
  offerWaitlistPlace: (eventId: string, entryId: string) => request<WaitlistEntryView>('POST', `/api/events/${eventId}/waitlist/${entryId}/offer`),
  removeFromWaitlist: (eventId: string, entryId: string) => request<WaitlistEntryView>('POST', `/api/events/${eventId}/waitlist/${entryId}/remove`),
  publicEvent: (id: string) => request<PublicEvent>('GET', `/api/public/events/${id}`),
  createOrder: (eventId: string, body: { clientRequestId: string; categoryIds: string[]; rider: RiderDetails; waiver: WaiverAcceptance; offerToken?: string | null; extras?: OrderExtras; couponCode?: string | null }) =>
    request<OrderView>('POST', `/api/rider/events/${eventId}/orders`, body),
  checkCoupon: (eventId: string, code: string) => request<CouponTerms>('POST', `/api/rider/events/${eventId}/coupons/check`, { code }),
  coupons: (eventId: string) => request<CouponView[]>('GET', `/api/events/${eventId}/coupons`),
  createCoupon: (eventId: string, body: CouponInput) => request<CouponView>('POST', `/api/events/${eventId}/coupons`, body),
  setCouponActive: (eventId: string, couponId: string, active: boolean) => request<CouponView>('POST', `/api/events/${eventId}/coupons/${couponId}/active`, { active }),
  order: (id: string) => request<OrderView>('GET', `/api/orders/${id}`),
  pay: (id: string, attemptId: string, outcome: 'success' | 'failure') => request<OrderView>('POST', `/api/orders/${id}/payment`, { attemptId, outcome }),
  startCheckout: (id: string) => request<{ kind: 'redirect'; url: string } | { kind: 'confirmed' }>('POST', `/api/orders/${id}/checkout-session`),
  refunds: (orderId: string) => request<{ payments: RefundablePaymentView[]; refunds: OrganizerRefundView[] }>('GET', `/api/orders/${orderId}/refunds`),
  requestRefund: (orderId: string, body: { paymentRef: string | null; entryId: string | null; amountCents: number; reason: string }) => request<OrderView>('POST', `/api/orders/${orderId}/refunds`, body),
  retryRefund: (refundId: string) => request<OrderView>('POST', `/api/refunds/${refundId}/retry`),
  cancelOrder: (id: string) => request<OrderView>('POST', `/api/orders/${id}/cancel`),
  orders: (eventId: string) => request<OrderView[]>('GET', `/api/events/${eventId}/orders`),
  transferEntry: (entryId: string, toCategoryId: string, reason: string) => request<OrderView>('POST', `/api/order-entries/${entryId}/transfer`, { toCategoryId, reason }),
  withdrawEntry: (entryId: string, reason: string) => request<OrderView>('POST', `/api/order-entries/${entryId}/withdraw`, { reason }),
  correctRider: (orderId: string, changes: RiderCorrection, reason: string) => request<OrderView>('POST', `/api/orders/${orderId}/rider-corrections`, { changes, reason }),
  reviewLicense: (entryId: string, note: string) => request<OrderView>('POST', `/api/order-entries/${entryId}/license-review`, { note }),
  checkInList: (eventId: string, dayId: string | null, q: string) =>
    request<CheckInList>('GET', `/api/events/${eventId}/check-in?${new URLSearchParams({ ...(dayId ? { day: dayId } : {}), q })}`),
  previewBibs: (eventId: string, batch: BibBatch) => request<BibPlan>('POST', `/api/events/${eventId}/bibs/preview`, batch),
  applyBibs: (eventId: string, batch: BibBatch, fingerprint: string) => request<BibPlan & { applied: number }>('POST', `/api/events/${eventId}/bibs/apply`, { ...batch, fingerprint }),
  saveBibSettings: (eventId: string, settings: BibSettings) => request<BibSettings>('PUT', `/api/events/${eventId}/bib-settings`, settings),
  checkIn: (eventId: string, orderId: string, dayId: string, bib: number | null, durationMs: number | null = null) => request<CheckInRider>('POST', `/api/events/${eventId}/check-in/${orderId}`, { dayId, bib, durationMs }),
  undoCheckIn: (eventId: string, orderId: string, dayId: string, reason: string) => request<CheckInRider>('POST', `/api/events/${eventId}/check-in/${orderId}/undo`, { dayId, reason }),
  changeBib: (eventId: string, orderId: string, dayId: string, bib: number, reason: string) =>
    request<CheckInRider>('POST', `/api/events/${eventId}/check-in/${orderId}/bib`, { dayId, bib, reason }),
  addCheckInDemoRiders: (eventId: string) => request<{ created: number }>('POST', `/api/events/${eventId}/check-in-demo-riders`),
  startLists: (eventId: string) => request<StartListOverview>('GET', `/api/events/${eventId}/start-lists`),
  snapshotStartList: (eventId: string, raceId: string) => request<{ version: number; riders: number }>('POST', `/api/events/${eventId}/start-lists/${raceId}/snapshots`),
  changeImpact: (eventId: string) => request<{ publishedVersion: number | null; impact: ChangeImpact | null }>('GET', `/api/events/${eventId}/impact`),
  lockStartList: (eventId: string, raceId: string) => request<{ version: number; riders: number; lockedAt: string }>('POST', `/api/events/${eventId}/start-lists/${raceId}/lock`),
  startListCsvUrl: (eventId: string, raceId: string, snapshot?: number) => `/api/events/${eventId}/start-lists/${raceId}/csv${snapshot ? `?snapshot=${snapshot}` : ''}`,
};
