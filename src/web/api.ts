import type { RegistrationFilter } from '../shared/registrationFilters';
import type { PublicCancellationStatus, CancellationExecution, CancellationExecutionInput, CancellationExecutionCheck, CancellationSelection, CancellationConfirmationPreview, CancellationConfirmationInput, CancellationConfirmation } from '../shared/cancellations';
import type { LimitUsage } from '../shared/capacity';
import type { RefundStatus, RefundRequest, RefundRequestResult } from '../shared/refunds';
import type { RefundPolicyPreview } from '../shared/refundPolicy';
import type { CreateEventInput, EventConfig, CapacityEntry, PublicEventSummary } from '../shared/schema';
import type { Issue } from '../shared/validation';
import type { OrderStatus, ReadinessItem, ReservationLookupResult, ReservationStatus, RiderDetails, WaiverAcceptance, WaiverEvidence } from '../shared/checkout';
import type { Quote } from '../shared/pricing';
import type { z } from 'zod';
import type { couponInputSchema, CouponTerms } from '../shared/coupons';
import type { OrderExtras } from '../shared/categoryExtras';
import type { FieldChange, RiderCorrection } from '../shared/lookup';
import type { BibChange, BibReassignment, BibReassignmentPlan, BibReassignmentResult, AutomaticBibInput, AutomaticBibJob, BibSettings, BibBatch, BibPlan, CheckInRider, CheckInList } from '../shared/checkin';
import type { WaitlistJoin, WaitlistStatus } from '../shared/waitlist';
import type { StartListDiff, StartListRow } from '../shared/startlist';
import type { ChangeImpact, PublishReview } from '../shared/impact';
import type { EventSummary } from '../shared/reports';
import type { Invitation, MembershipChange, Role, ExpiredInvitationNotice } from '../shared/roles';
import type { GuardianAccess, GuardianInvitation, GuardianRelationship, JuniorProfile, ReceivedGuardianInvitation, RegistrationAccess } from '../shared/juniors';

/** simulated: the labeled demo button. stripe_test: Stripe hosted Checkout in test mode. */
export type { CheckInRider, CheckInList } from '../shared/checkin';

export type PaymentMode = 'simulated' | 'stripe_test';

/** What an organizer sends to create a coupon code. */
export type CouponInput = z.input<typeof couponInputSchema>;

export interface PublicEvent {
  cancellation: PublicCancellationStatus;
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

export type { OrderStatus, ReservationLookupResult, ReservationStatus };

export type { PublicEventSummary } from '../shared/schema';

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
  clientRequestId: string | null;
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
  releasedByStaff: boolean;
  rider: RiderDetails;
  waiver: WaiverAcceptance;
  waiverEvidence: WaiverEvidence | null;
  guardianRequired: boolean;
  quote: Quote;
  couponCode: string | null;
  totalCents: number;
  holdExpiresAt: string;
  checkInCode: string | null;
  /** Active bibs on this order. A released bib is omitted. */
  bibs: number[];
  createdAt: string;
  confirmedAt: string | null;
  refundPolicy: string[];
  entries: {
    id: string;
    categoryId: string;
    categoryName: string;
    code: string;
    raceName: string;
    dayId: string;
    startTime: string | null;
    status: 'held' | 'confirmed' | 'released' | 'withdrawn' | 'cancelled';
    amountPaidCents: number;
    discountCents: number;
    discountReason: string | null;
    withdrawnAt: string | null;
    cancelledAt: string | null;
    changes: {
      id: string;
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
  versions: {
    version: number;
    publishedAt: string;
    draftRevision: number;
    warningsAcknowledged: number;
    /** Sent only to roles that can publish. Null when the version predates the record or came from a seed script. */
    publishedBy?: string | null;
    waiverChangeReason?: string | null;
  }[];
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

/** What the accepted refund policy would return for one entry today (src/server/withdrawalRequests.ts). */
/** A category the entry could move to now, with its price today and the difference from what was paid (owed if positive). */
export interface TransferOption {
  categoryId: string;
  categoryName: string;
  code: string;
  raceName: string;
  newPriceCents: number;
  differenceCents: number;
}

export interface WithdrawalPolicyPreview {
  entryId: string;
  categoryId: string;
  categoryName: string;
  amountPaidCents: number;
  onDate: string;
  entitlement: { returnAs: 'cash' | 'credit' | 'rider_choice'; percent: number; amountCents: number } | null;
  /** Set only for a category-change request: the target the rider saw. */
  transfer?: { categoryId: string; categoryName: string; code?: string; raceName?: string; newPriceCents: number; differenceCents: number };
}

export interface WithdrawalRequest {
  id: string;
  eventId: string;
  orderId: string;
  entryId: string;
  riderName: string;
  kind: 'withdraw' | 'transfer';
  reason: string;
  policy: WithdrawalPolicyPreview;
  status: 'open' | 'approved' | 'declined';
  decisionReason: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface SavedView { id: string; name: string; filter: RegistrationFilter; createdAt: string }

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
  /** Server time when the list was assembled. Older servers can omit it. */
  asOf?: string;
  members: { accountId: string; email: string; role: Role; revision: string }[];
  invitations: Invitation[];
  /** Addresses in this organization whose operational mail is stopped. */
  stoppedEmails: { email: string; reason: 'bounced' | 'complained' }[];
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

export interface RiderEmailDelivery {
  status: 'recorded' | 'sent' | 'failed' | 'uncertain';
  delivery: 'delivered' | 'bounced' | 'complained' | null;
  canRetry: boolean;
}

export const api = {
  expiredInvitations: () => request<ExpiredInvitationNotice[]>('GET', '/api/rider/expired-invitations'),
  dismissExpiredInvitation: (id: string) => request<ExpiredInvitationNotice[]>('POST', `/api/rider/expired-invitations/${encodeURIComponent(id)}/dismiss`),
  members: (orgId: string) => request<MemberList>('GET', `/api/organizations/${orgId}/members`),
  addMember: (orgId: string, email: string, role: Role) => request<MemberList>('POST', `/api/organizations/${orgId}/members`, { email, role }),
  resendInvitation: (orgId: string, email: string, role: Role, revision: string) => request<MemberList>('POST', `/api/organizations/${orgId}/invitations/resend`, { email, role, revision }),
  sendWithoutExtending: (orgId: string, email: string, role: Role, revision: string) => request<MemberList>('POST', `/api/organizations/${orgId}/invitations/send-without-extending`, { email, role, revision }),
  allowInvitation: (orgId: string, email: string, role: Role) => request<MemberList>('POST', `/api/organizations/${orgId}/invitations/allow`, { email, role }),
  retryInvitation: (orgId: string, email: string, role: Role, retryAttempt: string) => request<MemberList>('POST', `/api/organizations/${orgId}/members`, { email, role, retryAttempt }),
  removeMember: (orgId: string, email: string, role: Role, revision: string) => request<MemberList>('POST', `/api/organizations/${orgId}/members/revoke`, { email, role, revision }),
  cancelInvitation: (orgId: string, email: string, role: Role, revision: string) => request<MemberList>('POST', `/api/organizations/${orgId}/invitations/cancel`, { email, role, revision }),
  transferOwnership: (orgId: string, email: string) => request<MemberList>('POST', `/api/organizations/${orgId}/ownership-transfer`, { email }),
  organizations: () => request<OrganizationSummary[]>('GET', '/api/organizations'),
  createOrganization: (name: string) => request<{ id: string; name: string }>('POST', '/api/organizations', { name }),
  createEvent: (orgId: string, input: CreateEventInput) => request<EventPayload>('POST', `/api/organizations/${orgId}/events`, input),
  createDemo: () => request<{ organizationId: string; eventId: string }>('POST', '/api/demo'),
  createOmnium: () => request<{ organizationId: string; eventId: string }>('POST', '/api/demo/berkeley-omnium'),
  event: (id: string) => request<EventPayload>('GET', `/api/events/${id}`),
  saveConfig: (id: string, revision: number, config: EventConfig) => request<EventPayload>('PUT', `/api/events/${id}/config`, { revision, config }),
  publish: (id: string, reviewed: PublishReview, acknowledgeWarnings: boolean, acknowledgeImpact = false, waiverChangeReason?: string) =>
    request<EventPayload & { publishedVersion: number }>('POST', `/api/events/${id}/publish`, { reviewed, acknowledgeWarnings, acknowledgeImpact, waiverChangeReason }),
  addTestEntries: (id: string, categoryId: string, count: number) =>
    request<{ result: TestEntryResult; event: EventPayload }>('POST', `/api/events/${id}/test-entries`, { categoryId, count }),
  clearTestEntries: (id: string) => request<{ removed: number; event: EventPayload }>('DELETE', `/api/events/${id}/test-entries`),
  publicEvents: () => request<PublicEventSummary[]>('GET', '/api/public/events'),
  joinWaitlist: (eventId: string, body: WaitlistJoin) => request<WaitlistEntryView>('POST', `/api/rider/events/${eventId}/waitlist`, body),
  waitlistOffer: (token: string) => request<WaitlistOffer>('GET', `/api/rider/offers/${encodeURIComponent(token)}`),
  eventParticipantHistory: (eventId: string, orderId: string) => request<{
    orderIds: string[];
    otherEvents: { eventId: string; name: string; demo: boolean; orders: { orderId: string; orderNumber: string; createdAt: string }[] }[];
  }>('GET', `/api/events/${eventId}/orders/${orderId}/participant-history`),
  participantGroups: (eventId: string) => request<{ orderIds: string[] }[]>('GET', `/api/events/${eventId}/participant-groups`),
  riderIdentity: (eventId: string) => request<RiderIdentityOverview>('GET', `/api/events/${eventId}/rider-identity`),
  linkRiders: (eventId: string, a: string, b: string) => request<RiderIdentityOverview>('POST', `/api/events/${eventId}/rider-identity/link`, { orderIds: [a, b] }),
  dismissRiderMatch: (eventId: string, a: string, b: string) => request<RiderIdentityOverview>('POST', `/api/events/${eventId}/rider-identity/dismiss`, { orderIds: [a, b] }),
  unlinkRider: (eventId: string, orderId: string) => request<RiderIdentityOverview>('POST', `/api/events/${eventId}/rider-identity/unlink`, { orderId }),
  savedViews: (eventId: string) => request<SavedView[]>('GET', `/api/events/${eventId}/saved-views`),
  saveView: (eventId: string, name: string, filter: RegistrationFilter) => request<SavedView[]>('POST', `/api/events/${eventId}/saved-views`, { name, filter }),
  deleteView: (eventId: string, viewId: string) => request<SavedView[]>('DELETE', `/api/events/${eventId}/saved-views/${encodeURIComponent(viewId)}`),
  withdrawalRequests: (eventId: string) => request<WithdrawalRequest[]>('GET', `/api/events/${eventId}/withdrawal-requests`),
  approveWithdrawalRequest: (eventId: string, id: string) => request<WithdrawalRequest>('POST', `/api/events/${eventId}/withdrawal-requests/${encodeURIComponent(id)}/approve`),
  declineWithdrawalRequest: (eventId: string, id: string, reason: string) => request<WithdrawalRequest>('POST', `/api/events/${eventId}/withdrawal-requests/${encodeURIComponent(id)}/decline`, { reason }),
  resolutions: (eventId: string) => request<ResolutionItem[]>('GET', `/api/events/${eventId}/resolutions`),
  summary: (eventId: string) => request<EventSummary>('GET', `/api/events/${eventId}/summary`),
  resolveItem: (eventId: string, id: string, body: { outcome: 'kept' | 'transferred' | 'withdrawn'; riderNotified: boolean; note: string }) =>
    request<ResolutionItem[]>('POST', `/api/events/${eventId}/resolutions/${id}`, body),
  waitlist: (eventId: string) => request<{ offerHours: number; entries: WaitlistEntryView[] }>('GET', `/api/events/${eventId}/waitlist`),
  offerWaitlistPlace: (eventId: string, entryId: string) => request<WaitlistEntryView>('POST', `/api/events/${eventId}/waitlist/${entryId}/offer`),
  removeFromWaitlist: (eventId: string, entryId: string) => request<WaitlistEntryView>('POST', `/api/events/${eventId}/waitlist/${entryId}/remove`),
  waitlistOfferEmail: (eventId: string, entryId: string) =>
    request<{ offerEmail: RiderEmailDelivery | null }>('GET', `/api/events/${eventId}/waitlist/${entryId}/offer-email`),
  retryWaitlistOfferEmail: (eventId: string, entryId: string) =>
    request<{ offerEmail: RiderEmailDelivery | null }>('POST', `/api/events/${eventId}/waitlist/${entryId}/offer-email/retry`),
  confirmationDelivery: (eventId: string, orderId: string) =>
    request<{ confirmation: RiderEmailDelivery | null }>('GET', `/api/events/${eventId}/orders/${orderId}/confirmation-delivery`),
  retryConfirmation: (eventId: string, orderId: string) =>
    request<{ confirmation: RiderEmailDelivery | null }>('POST', `/api/events/${eventId}/orders/${orderId}/confirmation-delivery/retry`),
  receiptDelivery: (eventId: string, orderId: string) =>
    request<{ receipt: RiderEmailDelivery | null }>('GET', `/api/events/${eventId}/orders/${orderId}/receipt-delivery`),
  retryReceiptDelivery: (eventId: string, orderId: string) =>
    request<{ receipt: RiderEmailDelivery | null }>('POST', `/api/events/${eventId}/orders/${orderId}/receipt-delivery/retry`),
  noticeDelivery: (eventId: string, refundId: string) =>
    request<{ notice: RiderEmailDelivery | null }>('GET', `/api/events/${eventId}/refunds/${refundId}/notice-delivery`),
  retryRefundNotice: (eventId: string, refundId: string) =>
    request<{ notice: RiderEmailDelivery | null }>('POST', `/api/events/${eventId}/refunds/${refundId}/notice-delivery/retry`),
  entryChangeNotice: (eventId: string, changeId: string) =>
    request<{ notice: RiderEmailDelivery | null }>('GET', `/api/events/${eventId}/entry-changes/${changeId}/notice-delivery`),
  retryEntryChangeNotice: (eventId: string, changeId: string) =>
    request<{ notice: RiderEmailDelivery | null }>('POST', `/api/events/${eventId}/entry-changes/${changeId}/notice-delivery/retry`),
  declineNotice: (eventId: string, requestId: string) =>
    request<{ notice: RiderEmailDelivery | null }>('GET', `/api/events/${eventId}/withdrawal-requests/${requestId}/notice-delivery`),
  retryDeclineNotice: (eventId: string, requestId: string) =>
    request<{ notice: RiderEmailDelivery | null }>('POST', `/api/events/${eventId}/withdrawal-requests/${requestId}/notice-delivery/retry`),
  reservationStatus: (eventId: string, reference: string) =>
    request<ReservationLookupResult>('POST', `/api/events/${eventId}/reservation-status`, { reference }),
  releaseReservation: (eventId: string, input: { reference: string; reason: string; riderRequested: true }) =>
    request<ReservationLookupResult>('POST', `/api/events/${eventId}/reservation-release`, input),
  publicEvent: (id: string) => request<PublicEvent>('GET', `/api/public/events/${id}`),
  createOrder: (eventId: string, body: { clientRequestId: string; categoryIds: string[]; selfRegistrationConfirmed?: true; bundleIntent?: string | null; rider: RiderDetails; waiver: WaiverAcceptance; offerToken?: string | null; extras?: OrderExtras; couponCode?: string | null }) =>
    request<OrderView>('POST', `/api/rider/events/${eventId}/orders`, body),
  checkCoupon: (eventId: string, code: string) => request<CouponTerms>('POST', `/api/rider/events/${eventId}/coupons/check`, { code }),
  coupons: (eventId: string) => request<CouponView[]>('GET', `/api/events/${eventId}/coupons`),
  createCoupon: (eventId: string, body: CouponInput) => request<CouponView>('POST', `/api/events/${eventId}/coupons`, body),
  setCouponActive: (eventId: string, couponId: string, active: boolean) => request<CouponView>('POST', `/api/events/${eventId}/coupons/${couponId}/active`, { active }),
  order: (id: string) => request<OrderView>('GET', `/api/orders/${id}`),
  participantHistory: (orderId: string) => request<{ orders: { orderId: string; eventId: string }[] }>('GET', `/api/rider/orders/${orderId}/participant-history`),
  myRegistrations: () => request<(OrderView & RegistrationAccess)[]>('GET', '/api/rider/registrations'),
  guardianInvitations: () => request<ReceivedGuardianInvitation[]>('GET', '/api/rider/guardian-invitations'),
  acceptGuardianInvitation: (id: string) => request<JuniorProfile[]>('POST', `/api/rider/guardian-invitations/${id}/accept`, { acknowledge: true }),
  guardianRelationships: (id: string) => request<GuardianAccess[]>('GET', `/api/rider/juniors/${id}/guardians`),
  juniorGuardianInvitations: (id: string) => request<GuardianInvitation[]>('GET', `/api/rider/juniors/${id}/guardian-invitations`),
  inviteJuniorGuardian: (id: string, email: string) => request<GuardianInvitation[]>('POST', `/api/rider/juniors/${id}/guardian-invitations`, { email }),
  cancelJuniorGuardianInvitation: (id: string, invitationId: string) => request<GuardianInvitation[]>('POST', `/api/rider/juniors/${id}/guardian-invitations/${invitationId}/cancel`),
  removeJuniorGuardian: (id: string, relationshipId: string, reason: string) => request<GuardianRelationship[]>('POST', `/api/rider/juniors/${id}/guardians/${relationshipId}/remove`, { reason, acknowledge: true }),
  juniors: () => request<JuniorProfile[]>('GET', '/api/rider/juniors'),
  setJuniorViewer: (id: string, email: string | null) => request<JuniorProfile[]>('POST', `/api/rider/juniors/${id}/viewer`, { email }),
  pay: (id: string, attemptId: string, outcome: 'success' | 'failure') => request<OrderView>('POST', `/api/orders/${id}/payment`, { attemptId, outcome }),
  startCheckout: (id: string) => request<{ kind: 'redirect'; url: string } | { kind: 'confirmed' }>('POST', `/api/orders/${id}/checkout-session`),
  refunds: (orderId: string) => request<{ payments: RefundablePaymentView[]; refunds: OrganizerRefundView[] }>('GET', `/api/orders/${orderId}/refunds`),
  currentAccount: () => request<{ account: { id: string; email: string } }>('GET', '/api/me'),
  eventVersion: (eventId: string, version: number) => request<{ version: number; config: EventConfig }>('GET', `/api/events/${eventId}/versions/${version}`),
  cancellationConfirmationPreview: (eventId: string, selection: CancellationSelection) => request<CancellationConfirmationPreview>('POST', `/api/events/${eventId}/cancellation-confirmation-preview`, selection),
  confirmCancellationPlan: (eventId: string, input: CancellationConfirmationInput) => request<CancellationConfirmation>('POST', `/api/events/${eventId}/cancellation-confirmations`, input),
  cancellationConfirmation: (eventId: string, id: string) => request<CancellationConfirmation>('GET', `/api/events/${eventId}/cancellation-confirmations/${encodeURIComponent(id)}`),
  checkCancellationExecution: (eventId: string, id: string) => request<CancellationExecutionCheck>('GET', `/api/events/${eventId}/cancellation-confirmations/${encodeURIComponent(id)}/execution-check`),
  executeCancellation: (eventId: string, input: CancellationExecutionInput) => request<CancellationExecution>('POST', `/api/events/${eventId}/cancellation-executions`, input),
  cancellationExecution: (eventId: string, id: string) => request<CancellationExecution>('GET', `/api/events/${eventId}/cancellation-executions/${encodeURIComponent(id)}`),
  refundPolicyPreview: (orderId: string, reason: RefundPolicyPreview['reason']) => request<RefundPolicyPreview>('GET', `/api/orders/${orderId}/refund-policy-preview?reason=${reason}`),
  requestRefund: (orderId: string, body: RefundRequest) => request<OrderView & RefundRequestResult>('POST', `/api/orders/${orderId}/refunds`, body),
  retryRefund: (refundId: string) => request<OrderView>('POST', `/api/refunds/${refundId}/retry`),
  cancelOrder: (id: string) => request<OrderView>('POST', `/api/orders/${id}/cancel`),
  orders: (eventId: string) => request<OrderView[]>('GET', `/api/events/${eventId}/orders`),
  transferEntry: (entryId: string, toCategoryId: string, reason: string) => request<OrderView>('POST', `/api/order-entries/${entryId}/transfer`, { toCategoryId, reason }),
  withdrawEntry: (entryId: string, reason: string) => request<OrderView>('POST', `/api/order-entries/${entryId}/withdraw`, { reason }),
  withdrawalStatus: (entryId: string) => request<{ preview: WithdrawalPolicyPreview; openRequest: WithdrawalRequest | null }>('GET', `/api/rider/order-entries/${encodeURIComponent(entryId)}/withdrawal`),
  transferOptions: (entryId: string) => request<{ from: WithdrawalPolicyPreview; options: TransferOption[] }>('GET', `/api/rider/order-entries/${encodeURIComponent(entryId)}/transfer-options`),
  requestTransfer: (entryId: string, body: { clientRequestId: string; reason: string; toCategoryId: string; expectedCategoryId: string; expectedNewPriceCents: number }) => request<WithdrawalRequest>('POST', `/api/rider/order-entries/${encodeURIComponent(entryId)}/transfer-requests`, body),
  requestWithdrawal: (entryId: string, body: { clientRequestId: string; reason: string; expectedCategoryId: string; expectedReturnAs: 'cash' | 'credit' | 'rider_choice' | null; expectedAmountCents: number | null }) => request<WithdrawalRequest>('POST', `/api/rider/order-entries/${encodeURIComponent(entryId)}/withdrawal-requests`, body),
  correctRider: (orderId: string, changes: RiderCorrection, reason: string) => request<OrderView>('POST', `/api/orders/${orderId}/rider-corrections`, { changes, reason }),
  reviewLicense: (entryId: string, note?: string) => request<OrderView>('POST', `/api/order-entries/${entryId}/license-review`, { note }),
  viewEmergencyContact: (eventId: string, body: { orderId: string } | { entryId: string }) =>
    request<{ name: string; phone: string }>('POST', `/api/events/${eventId}/emergency-contact`, body),
  checkInList: (eventId: string, dayId: string | null, q: string) =>
    request<CheckInList>('GET', `/api/events/${eventId}/check-in?${new URLSearchParams({ ...(dayId ? { day: dayId } : {}), q })}`),
  automaticBibs: (eventId: string) => request<AutomaticBibJob[]>('GET', `/api/events/${eventId}/automatic-bibs`),
  enableAutomaticBibs: (eventId: string, input: AutomaticBibInput) => request<{ id: string }>('POST', `/api/events/${eventId}/automatic-bibs`, input),
  disableAutomaticBibs: (eventId: string) => request<{ cancelled: boolean }>('DELETE', `/api/events/${eventId}/automatic-bibs`),
  previewBibs: (eventId: string, batch: BibBatch) => request<BibPlan>('POST', `/api/events/${eventId}/bibs/preview`, batch),
  applyBibs: (eventId: string, batch: BibBatch, fingerprint: string) => request<BibPlan & { applied: number }>('POST', `/api/events/${eventId}/bibs/apply`, { ...batch, fingerprint }),
  saveBibSettings: (eventId: string, settings: BibSettings) => request<BibSettings>('PUT', `/api/events/${eventId}/bib-settings`, settings),
  checkIn: (eventId: string, orderId: string, dayId: string, bib: number | null, durationMs: number | null = null) => request<CheckInRider>('POST', `/api/events/${eventId}/check-in/${orderId}`, { dayId, bib, durationMs }),
  markWalkUp: (eventId: string, orderId: string, dayId: string, entryId: string) =>
    request<CheckInRider>('POST', `/api/events/${eventId}/check-in/${orderId}/walk-up`, { dayId, entryId }),
  undoCheckIn: (eventId: string, orderId: string, dayId: string, reason: string) => request<CheckInRider>('POST', `/api/events/${eventId}/check-in/${orderId}/undo`, { dayId, reason }),
  previewBibChange: (eventId: string, orderId: string, input: BibChange) => request<BibReassignmentPlan>('POST', `/api/events/${eventId}/check-in/${orderId}/bib/preview`, input),
  changeBib: (eventId: string, orderId: string, input: BibChange, fingerprint: string) => request<CheckInRider>('POST', `/api/events/${eventId}/check-in/${orderId}/bib`, { ...input, fingerprint }),
  previewReassignments: (eventId: string, input: BibReassignment) => request<BibReassignmentPlan>('POST', `/api/events/${eventId}/bibs/reassign/preview`, input),
  applyReassignments: (eventId: string, batch: BibReassignment, fingerprint: string) => request<BibReassignmentResult>('POST', `/api/events/${eventId}/bibs/reassign/apply`, { batch, fingerprint }),
  addCheckInDemoRiders: (eventId: string) => request<{ created: number }>('POST', `/api/events/${eventId}/check-in-demo-riders`),
  startLists: (eventId: string) => request<StartListOverview>('GET', `/api/events/${eventId}/start-lists`),
  snapshotStartList: (eventId: string, raceId: string) => request<{ version: number; riders: number }>('POST', `/api/events/${eventId}/start-lists/${raceId}/snapshots`),
  changeImpact: (eventId: string) => request<{ revision: number; publishedVersion: number | null; impact: ChangeImpact | null; waiverChanged: boolean }>('GET', `/api/events/${eventId}/impact`),
  lockStartList: (eventId: string, raceId: string) => request<{ version: number; riders: number; lockedAt: string }>('POST', `/api/events/${eventId}/start-lists/${raceId}/lock`),
  startListCsvUrl: (eventId: string, raceId: string, snapshot?: number) => `/api/events/${eventId}/start-lists/${raceId}/csv${snapshot ? `?snapshot=${snapshot}` : ''}`,
};
