import type { LimitUsage } from '../shared/capacity';
import type { CreateEventInput, EventConfig, TestEntry } from '../shared/schema';
import type { Issue } from '../shared/validation';
import type { ReadinessItem, RiderDetails, WaiverAcceptance } from '../shared/checkout';
import type { Quote } from '../shared/pricing';

export interface PublicEvent {
  eventId: string;
  publishedVersion: number;
  organizationName: string;
  config: EventConfig;
  remaining: Record<string, number | null>;
  today: string;
  holdMinutes: number;
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
    status: 'held' | 'confirmed' | 'released';
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

export const api = {
  organizations: () => request<OrganizationSummary[]>('GET', '/api/organizations'),
  createOrganization: (name: string) => request<{ id: string; name: string }>('POST', '/api/organizations', { name }),
  createEvent: (orgId: string, input: CreateEventInput) => request<EventPayload>('POST', `/api/organizations/${orgId}/events`, input),
  createDemo: () => request<{ organizationId: string; eventId: string }>('POST', '/api/demo'),
  event: (id: string) => request<EventPayload>('GET', `/api/events/${id}`),
  saveConfig: (id: string, revision: number, config: EventConfig) => request<EventPayload>('PUT', `/api/events/${id}/config`, { revision, config }),
  publish: (id: string, acknowledgeWarnings: boolean) => request<EventPayload & { publishedVersion: number }>('POST', `/api/events/${id}/publish`, { acknowledgeWarnings }),
  addTestEntries: (id: string, categoryId: string, count: number) =>
    request<{ result: TestEntryResult; event: EventPayload }>('POST', `/api/events/${id}/test-entries`, { categoryId, count }),
  clearTestEntries: (id: string) => request<{ removed: number; event: EventPayload }>('DELETE', `/api/events/${id}/test-entries`),
  publicEvents: () => request<PublicEventSummary[]>('GET', '/api/public/events'),
  loadPurchaseFlowDemo: () => request<{ organizationId: string; eventIds: string[] }>('POST', '/api/demo/purchase-flow'),
  publicEvent: (id: string) => request<PublicEvent>('GET', `/api/public/events/${id}`),
  createOrder: (eventId: string, body: { clientRequestId: string; categoryIds: string[]; rider: RiderDetails; waiver: WaiverAcceptance }) =>
    request<OrderView>('POST', `/api/public/events/${eventId}/orders`, body),
  order: (id: string) => request<OrderView>('GET', `/api/orders/${id}`),
  pay: (id: string, attemptId: string, outcome: 'success' | 'failure') => request<OrderView>('POST', `/api/orders/${id}/payment`, { attemptId, outcome }),
  cancelOrder: (id: string) => request<OrderView>('POST', `/api/orders/${id}/cancel`),
  orders: (eventId: string) => request<OrderView[]>('GET', `/api/events/${eventId}/orders`),
  reviewLicense: (entryId: string, note: string) => request<OrderView>('POST', `/api/order-entries/${entryId}/license-review`, { note }),
};
