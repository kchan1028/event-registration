// @covers src/server/email.ts
// @covers src/server/withdrawalRequests.ts
// @covers src/server/db.ts
import pg from 'pg';
import { formatOrderNumber } from '../src/shared/lookup';
import { expect, test, type Page } from './fixtures';
import { publishReviewed } from './support/publish';

/** The organizer's note is stored on the request. It must not appear in the rider's email. */
const ORGANIZER_REASON = 'Private note: timer packet already closed';

function databaseUrl(): string {
  const url = new URL(process.env.E2E_DATABASE_URL ?? 'postgres://cyclereg:cyclereg@127.0.0.1:5432/cyclereg_e2e');
  expect(['localhost', '127.0.0.1', '::1', '[::1]']).toContain(url.hostname);
  return url.toString();
}

type NoticeRow = {
  kind: string;
  to_email: string;
  subject: string;
  body_text: string;
  status: string;
  ref: string;
  from_email: string | null;
  withdrawal_request_id: string | null;
  organization_id: string | null;
};

async function query<T extends pg.QueryResultRow>(sql: string, params: unknown[]): Promise<T[]> {
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    const { rows } = await client.query<T>(sql, params);
    return rows;
  } finally {
    await client.end();
  }
}

function declineNoticeText(orderId: string, categoryName: string, isDemo: boolean): string {
  const orderNumber = formatOrderNumber(orderId, isDemo);
  return isDemo
    ? `Demo registration ${orderNumber}: the organizer kept your ${categoryName} entry and did not withdraw it. Simulated registration: no money was moved. Sign in and open My registrations to see why.`
    : `Registration ${orderNumber}: the organizer kept your ${categoryName} entry and did not withdraw it. Sign in and open My registrations to see why.`;
}

async function publishedDemo(page: Page) {
  const created = await page.request.post('/api/demo');
  expect(created.status()).toBe(201);
  const { eventId, organizationId } = await created.json();
  const eventUrl = `/api/events/${eventId}`;
  expect((await publishReviewed(page.request, eventUrl, { acknowledgeWarnings: true })).status()).toBe(200);
  const event = await (await page.request.get(eventUrl)).json();
  expect(event.config.event.isDemo).toBe(true);
  return { eventId, organizationId, eventUrl, config: event.config };
}

async function ask(page: Page, eventId: string, config: { categories: { id: string; timingCode: string }[]; registration: { waiverVersion: string } }, first: string) {
  const category = config.categories.find((row) => row.timingCode === 'RR-M35-34');
  expect(category).toBeTruthy();
  const email = `${first.toLowerCase()}-${eventId}@example.test`;
  const headers = { Authorization: `Bearer test:${email}` };
  const created = await page.request.post(`/api/rider/events/${eventId}/orders`, { headers, data: {
    clientRequestId: `decline-notice-${first}-${eventId}`.slice(0, 64),
    categoryIds: [category!.id],
    rider: {
      firstName: first, lastName: 'Fictional', email, team: '', racingAge: 40, licenseCategory: '3', licenseType: 'annual',
      competitionClass: 'men', collegiateDivision: null, guardian: null, emergencyContact: { name: 'Pat Fictional', phone: '555-555-0199' },
    },
    waiver: { version: config.registration.waiverVersion, read: true, agreed: true, signatureName: `${first} Fictional`, signerRole: 'rider' },
  } });
  expect(created.status(), await created.text()).toBe(201);
  const order = await created.json();
  const paid = await page.request.post(`/api/orders/${order.id}/payment`, { headers, data: { attemptId: `decline-notice-paid-${order.id}`, outcome: 'success' } });
  expect(paid.status(), await paid.text()).toBe(200);
  const entryId = (await paid.json()).entries[0].id as string;
  const previewResponse = await page.request.get(`/api/rider/order-entries/${entryId}/withdrawal`, { headers });
  expect(previewResponse.status()).toBe(200);
  const { preview } = await previewResponse.json();
  const asked = await page.request.post(`/api/rider/order-entries/${entryId}/withdrawal-requests`, { headers, data: {
    clientRequestId: `decline-notice-ask-${entryId}`,
    reason: 'Cannot attend',
    expectedCategoryId: preview.categoryId,
    expectedReturnAs: preview.entitlement?.returnAs ?? null,
    expectedAmountCents: preview.entitlement?.amountCents ?? null,
  } });
  expect(asked.status(), await asked.text()).toBe(201);
  const request = await asked.json();
  return { email, orderId: order.id as string, entryId, requestId: request.id as string, categoryName: preview.categoryName as string };
}

/** Every decline notice for this rider's address, so a wrongly linked or unlinked notice is still counted. */
async function declineNotices(email: string) {
  return query<NoticeRow>(
    `SELECT kind, to_email, subject, body_text, status, ref, from_email, withdrawal_request_id, organization_id
     FROM email_messages WHERE kind = 'withdrawal_decline_notice' AND lower(to_email) = lower($1)`,
    [email],
  );
}

async function entryChangeNotices(entryId: string) {
  return query<NoticeRow>(
    `SELECT m.kind, m.to_email, m.subject, m.body_text, m.status, m.ref, m.from_email, m.withdrawal_request_id, m.organization_id
     FROM email_messages m
     JOIN entry_changes c ON c.id = m.entry_change_id
     WHERE c.entry_id = $1 AND m.kind = 'entry_change_notice'`,
    [entryId],
  );
}

test('declining a kept entry records one notice for the rider and leaves the organizer reason off it', { tag: '@smoke' }, async ({ page }) => {
  const { eventId, organizationId, eventUrl, config } = await publishedDemo(page);
  const rider = await ask(page, eventId, config, 'Casey');
  const declined = await page.request.post(`${eventUrl}/withdrawal-requests/${rider.requestId}/decline`, { data: { reason: ORGANIZER_REASON } });
  expect(declined.status(), await declined.text()).toBe(200);
  const decision = await declined.json();
  expect(decision).toMatchObject({ id: rider.requestId, status: 'declined', decisionReason: ORGANIZER_REASON });
  expect((await (await page.request.get(`/api/orders/${rider.orderId}`)).json()).entries[0].status).toBe('confirmed');

  const notices = await declineNotices(rider.email);
  expect(notices).toEqual([expect.objectContaining({
    kind: 'withdrawal_decline_notice',
    to_email: rider.email,
    subject: 'Your withdrawal request',
    body_text: declineNoticeText(rider.orderId, rider.categoryName, true),
    status: 'recorded',
    ref: rider.requestId,
    from_email: null,
    withdrawal_request_id: rider.requestId,
    organization_id: organizationId,
  })]);
  expect(notices[0].body_text).not.toContain(ORGANIZER_REASON);
  expect(notices[0].body_text).not.toContain('Cannot attend');
  expect(await entryChangeNotices(rider.entryId)).toEqual([]);

  // A second decline does not write another notice.
  expect((await page.request.post(`${eventUrl}/withdrawal-requests/${rider.requestId}/decline`, { data: { reason: 'Said again' } })).status()).toBe(409);
  expect(await declineNotices(rider.email)).toHaveLength(1);
});

test('declining after the organizer already withdrew the entry does not say the entry was kept', { tag: '@smoke' }, async ({ page }) => {
  const { eventId, eventUrl, config } = await publishedDemo(page);
  const rider = await ask(page, eventId, config, 'Robin');
  expect((await page.request.post(`/api/order-entries/${rider.entryId}/withdraw`, { data: { reason: 'Organizer withdrew first' } })).status()).toBe(200);
  const declined = await page.request.post(`${eventUrl}/withdrawal-requests/${rider.requestId}/decline`, { data: { reason: ORGANIZER_REASON } });
  expect(declined.status(), await declined.text()).toBe(200);
  expect(await declineNotices(rider.email)).toEqual([]);
  const changes = await entryChangeNotices(rider.entryId);
  expect(changes).toHaveLength(1);
  expect(changes[0].to_email).toBe(rider.email);
  expect(changes[0].body_text).not.toContain('kept your');
});

test('declining after the entry moved to another category does not say it was kept there', async ({ page }) => {
  const { eventId, eventUrl, config } = await publishedDemo(page);
  const rider = await ask(page, eventId, config, 'Avery');
  const other = config.categories.find((row: { timingCode: string }) => row.timingCode === 'CR-M35-34');
  expect(other).toBeTruthy();
  expect((await page.request.post(`/api/order-entries/${rider.entryId}/transfer`, { data: { toCategoryId: other.id, reason: 'Organizer moved the rider' } })).status()).toBe(200);
  const declined = await page.request.post(`${eventUrl}/withdrawal-requests/${rider.requestId}/decline`, { data: { reason: ORGANIZER_REASON } });
  expect(declined.status(), await declined.text()).toBe(200);
  expect((await declined.json()).status).toBe('declined');
  expect(await declineNotices(rider.email)).toEqual([]);
  expect(await entryChangeNotices(rider.entryId)).toHaveLength(1);
  expect((await (await page.request.get(`/api/orders/${rider.orderId}`)).json()).entries[0]).toMatchObject({ status: 'confirmed', categoryId: other.id });
});

test('approving a withdrawal request records the entry-change notice, not a decline notice', async ({ page }) => {
  const { eventId, eventUrl, config } = await publishedDemo(page);
  const rider = await ask(page, eventId, config, 'Jules');
  const approved = await page.request.post(`${eventUrl}/withdrawal-requests/${rider.requestId}/approve`);
  expect(approved.status(), await approved.text()).toBe(200);
  expect((await approved.json()).status).toBe('approved');
  expect(await declineNotices(rider.email)).toEqual([]);
  expect(await entryChangeNotices(rider.entryId)).toHaveLength(1);
  expect((await (await page.request.get(`/api/orders/${rider.orderId}`)).json()).entries[0].status).toBe('withdrawn');
});

test('a live event uses the live decline wording', async ({ page }) => {
  const { organizationId, config } = await publishedDemo(page);
  const created = await page.request.post(`/api/organizations/${organizationId}/events`, {
    data: { name: 'Live fictional road race', template: 'road_race', startDate: '2027-04-04', timeZone: 'America/Los_Angeles' },
  });
  expect(created.status()).toBe(201);
  const draft = await created.json();
  const copied = await page.request.put(`/api/events/${draft.id}/config`, {
    data: {
      revision: draft.revision,
      config: {
        ...config,
        event: { ...config.event, name: 'Live fictional road race', isDemo: false },
        categories: config.categories.map((category: { registration: { opensAt: string | null; closesAt: string | null } }) => ({
          ...category,
          registration: { ...category.registration, opensAt: null, closesAt: null },
        })),
      },
    },
  });
  expect(copied.status(), await copied.text()).toBe(200);
  const eventUrl = `/api/events/${draft.id}`;
  expect((await publishReviewed(page.request, eventUrl, { acknowledgeWarnings: true })).status()).toBe(200);
  const live = await (await page.request.get(eventUrl)).json();
  expect(live.config.event.isDemo).toBe(false);
  const rider = await ask(page, draft.id, live.config, 'Nora');
  const declined = await page.request.post(`${eventUrl}/withdrawal-requests/${rider.requestId}/decline`, { data: { reason: ORGANIZER_REASON } });
  expect(declined.status(), await declined.text()).toBe(200);
  const notices = await declineNotices(rider.email);
  expect(notices).toHaveLength(1);
  expect(notices[0].body_text).toBe(declineNoticeText(rider.orderId, rider.categoryName, false));
  expect(notices[0].body_text).not.toContain('Demo registration');
  expect(notices[0].body_text).not.toContain('Simulated registration');
  expect(notices[0].body_text).not.toContain(ORGANIZER_REASON);
  expect(notices[0].organization_id).toBe(organizationId);
});
