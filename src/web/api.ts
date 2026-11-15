import type { LimitUsage } from '../shared/capacity';
import type { CreateEventInput, EventConfig, TestEntry } from '../shared/schema';
import type { Issue } from '../shared/validation';
import type { ReadinessItem, RiderDetails, WaiverAcceptance } from '../shared/checkout';
import type { Quote } from '../shared/pricing';
import type { BibSettings, CheckInResult, PaymentState } from '../shared/checkin';
import type { StartListDiff, StartListRow } from '../shared/startlist';
import type { ChangeImpact } from '../shared/impact';

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
  status: 'waiting' | 'offered' | 'expired' | 'accepted' | 'removed';
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
  status: WaitlistEntryView['status'];
  offerExpiresAt: string | null;
  rider: { firstName: string; lastName: string; email: string; racingAge: number; licenseCategory: string | null; licenseType: string | null; competitionClass: string | null; collegiateDivision: string | null };
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

export interface OrderView {
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
}

export interface EventPayload {
  id: string;
  organizationId: string;
  organizationName: string;
  revision: number;
  publishedVersion: number | null;
  publishedRevision: number | null;
  updatedAt: string;
  config: EventConfig;
  entries: TestEntry[];
  versions: { version: number; publishedAt: string; draftRevision: number; warningsAcknowledged: number }[];
  issues: Issue[];
  pending: { licenseVerification: string; payments: string; signIn: string };
}

export interface OrganizationSummary {
  id: string;
  name: string;
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

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the CycleReg server. Check that it is running, then try again.');
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (${res.status}).`, data?.details);
  return data as T;
}

export interface CheckInRider {
  orderId: string;
  checkInCode: string | null;
  name: string;
  team: string;
  racingAge: number;
  payment: PaymentState;
  entries: { id: string; categoryName: string; code: string; raceName: string; startTime: string | null }[];
  readiness: ReadinessItem[];
  result: CheckInResult;
  bib: number | null;
  bibHistory: { bib: number; assignedAt: string; releasedAt: string | null; reason: string | null }[];
  checkedInAt: string | null;
  undoneCheckIns: { checkedInAt: string; undoneAt: string; bib: number | null; bibReleased: boolean; reason: string }[];
}

export interface CheckInList {
  eventId: string;
  eventName: string;
  isDemo: boolean;
  published: boolean;
  days: { id: string; label: string; date: string }[];
  dayId: string;
  settings: BibSettings;
  summary: { riders: number; checkedIn: number; blocked: number; bibsIssued: number; timing: { timed: number; medianSeconds: number | null; p95Seconds: number | null } };
  riders: CheckInRider[];
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
  joinWaitlist: (eventId: string, body: Record<string, unknown>) => request<WaitlistEntryView>('POST', `/api/public/events/${eventId}/waitlist`, body),
  waitlistOffer: (token: string) => request<WaitlistOffer>('GET', `/api/public/offers/${encodeURIComponent(token)}`),
  riderIdentity: (eventId: string) => request<RiderIdentityOverview>('GET', `/api/events/${eventId}/rider-identity`),
  linkRiders: (eventId: string, a: string, b: string) => request<RiderIdentityOverview>('POST', `/api/events/${eventId}/rider-identity/link`, { orderIds: [a, b] }),
  dismissRiderMatch: (eventId: string, a: string, b: string) => request<RiderIdentityOverview>('POST', `/api/events/${eventId}/rider-identity/dismiss`, { orderIds: [a, b] }),
  unlinkRider: (eventId: string, orderId: string) => request<RiderIdentityOverview>('POST', `/api/events/${eventId}/rider-identity/unlink`, { orderId }),
  resolutions: (eventId: string) => request<ResolutionItem[]>('GET', `/api/events/${eventId}/resolutions`),
  resolveItem: (eventId: string, id: string, body: { outcome: 'kept' | 'transferred' | 'withdrawn'; riderNotified: boolean; note: string }) =>
    request<ResolutionItem[]>('POST', `/api/events/${eventId}/resolutions/${id}`, body),
  waitlist: (eventId: string) => request<{ offerHours: number; entries: WaitlistEntryView[] }>('GET', `/api/events/${eventId}/waitlist`),
  offerWaitlistPlace: (eventId: string, entryId: string) => request<WaitlistEntryView>('POST', `/api/events/${eventId}/waitlist/${entryId}/offer`),
  removeFromWaitlist: (eventId: string, entryId: string) => request<WaitlistEntryView>('POST', `/api/events/${eventId}/waitlist/${entryId}/remove`),
  publicEvent: (id: string) => request<PublicEvent>('GET', `/api/public/events/${id}`),
  createOrder: (eventId: string, body: { clientRequestId: string; categoryIds: string[]; rider: RiderDetails; waiver: WaiverAcceptance; offerToken?: string | null; extras?: { answers: Record<string, Record<string, string>>; addenda: string[] } }) =>
    request<OrderView>('POST', `/api/public/events/${eventId}/orders`, body),
  order: (id: string) => request<OrderView>('GET', `/api/orders/${id}`),
  pay: (id: string, attemptId: string, outcome: 'success' | 'failure') => request<OrderView>('POST', `/api/orders/${id}/payment`, { attemptId, outcome }),
  cancelOrder: (id: string) => request<OrderView>('POST', `/api/orders/${id}/cancel`),
  orders: (eventId: string) => request<OrderView[]>('GET', `/api/events/${eventId}/orders`),
  transferEntry: (entryId: string, toCategoryId: string, reason: string) => request<OrderView>('POST', `/api/order-entries/${entryId}/transfer`, { toCategoryId, reason }),
  withdrawEntry: (entryId: string, reason: string) => request<OrderView>('POST', `/api/order-entries/${entryId}/withdraw`, { reason }),
  reviewLicense: (entryId: string, note: string) => request<OrderView>('POST', `/api/order-entries/${entryId}/license-review`, { note }),
  checkInList: (eventId: string, dayId: string | null, q: string) =>
    request<CheckInList>('GET', `/api/events/${eventId}/check-in?${new URLSearchParams({ ...(dayId ? { day: dayId } : {}), q })}`),
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
