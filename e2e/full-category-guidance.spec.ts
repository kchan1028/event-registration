import { E2E_ORGANIZER, expect, test, type Page } from './fixtures';
import { seedRegistrationCase } from './support/registration-case';
import type { EventConfig } from '../src/shared/schema';
import { publishReviewed } from './support/publish';

const CLOSED = 'There is no online waitlist for this category. Choose another category.';
const OPEN_WAITLIST = 'Join the waitlist on this category. Joining is not an entry and is not a charge. It does not hold a place or reserve a package.';

async function openOmnium(page: Page) {
  const eventId = await seedRegistrationCase(page.request, 'omnium');
  await page.goto(`/#/register/${eventId}`);
  await expect(page.getByRole('heading', { name: 'About you' })).toBeVisible();
  await page.getByLabel('Racing age').fill('40');
  await page.getByLabel('License category').selectOption('4');
  return eventId;
}

async function publishCategory(page: Page, eventId: string, change: (category: EventConfig['categories'][number]) => void) {
  const eventUrl = `/api/events/${eventId}`;
  const event = await (await page.request.get(eventUrl)).json() as { config: EventConfig; revision: number };
  const category = event.config.categories.find((row) => row.timingCode === 'DRW-CR-M35');
  expect(category).toBeTruthy();
  change(category!);
  expect((await page.request.put(`${eventUrl}/config`, { data: { config: event.config, revision: event.revision } })).ok()).toBe(true);
  expect((await publishReviewed(page.request, eventUrl, { acknowledgeWarnings: true, acknowledgeImpact: true })).ok()).toBe(true);
  return category!;
}

test('a full category without a waitlist names that fact, and an enabled waitlist stays on the category', async ({ page }) => {
  const eventId = await openOmnium(page);
  const sunday = page.getByRole('checkbox', { name: /DRW-CR-M35/ });
  await sunday.click();
  await expect(sunday).toHaveAttribute('aria-checked', 'true');

  const category = await publishCategory(page, eventId, (row) => {
    row.cap = 1;
    row.waitlistEnabled = false;
  });
  expect((await page.request.post(`/api/events/${eventId}/test-entries`, { data: { categoryId: category.id, count: 1 } })).ok()).toBe(true);
  await page.reload();
  await expect(sunday).toHaveAttribute('aria-checked', 'true');
  await expect(sunday).toHaveAccessibleDescription(new RegExp(CLOSED.replace(/[.]/g, '\\.')));
  await expect(sunday).not.toHaveAccessibleDescription(/ask the organizer/i);
  await expect(sunday).not.toHaveAccessibleDescription(/contact/i);
  await expect(page.getByRole('button', { name: 'Join the waitlist', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Continue to racer details' }).click();
  const summary = page.locator('.error-summary');
  await expect(summary).toContainText(`${category.name}: This category is full. ${CLOSED}`);
  await expect(summary).not.toContainText('ask the organizer');
  await expect(summary).not.toContainText('no longer available');
  await expect(summary).not.toContainText('does not hold a place');

  await publishCategory(page, eventId, (row) => {
    row.waitlistEnabled = true;
  });
  await page.reload();
  await expect(sunday).toHaveAccessibleDescription(/Full · waitlist/);
  await expect(sunday).toHaveAccessibleDescription(/Freed places go to the waitlist first/);
  await expect(sunday).toHaveAccessibleDescription(/Join the waitlist/);
  await expect(sunday).not.toHaveAccessibleDescription(/no online waitlist/);
  await expect(sunday).not.toHaveAccessibleDescription(/ask the organizer/i);
  await expect(page.getByRole('button', { name: 'Join the waitlist', exact: true })).toBeVisible();
  await expect(page.getByText('Your place is held')).toHaveCount(0);
  await expect(page.getByText('Your selected package is no longer available')).toHaveCount(0);

  await page.getByRole('button', { name: 'Continue to racer details' }).click();
  await expect(summary).toContainText(OPEN_WAITLIST);
  await expect(summary).not.toContainText('no online waitlist');
  await expect(summary).not.toContainText('ask the organizer');

  await sunday.click();
  await page.getByLabel(/I want the/).check();
  await page.getByRole('checkbox', { name: /DRW-RR-M35/ }).click();
  await page.getByRole('button', { name: 'Continue to racer details' }).click();
  await expect(summary).toContainText('needs an entry in every included race');
  await expect(summary).not.toContainText('no longer available');
  await expect(summary).not.toContainText('no online waitlist');
  await expect(page.getByRole('button', { name: 'Join the waitlist', exact: true })).toBeVisible();
});

test('a held waitlist offer is a reserved place and is not a missing package', async ({ page }) => {
  const eventId = await openOmnium(page);
  const category = await publishCategory(page, eventId, (row) => {
    row.cap = 1;
    row.waitlistEnabled = true;
  });
  const eventUrl = `/api/events/${eventId}`;
  expect((await page.request.post(`${eventUrl}/test-entries`, { data: { categoryId: category.id, count: 1 } })).ok()).toBe(true);
  const joined = await page.request.post(`/api/rider/events/${eventId}/waitlist`, {
    data: {
      categoryId: category.id,
      firstName: 'Emery',
      lastName: 'Fictional',
      email: E2E_ORGANIZER,
      racingAge: 40,
      licenseCategory: '4',
      licenseType: 'annual',
      competitionClass: 'men',
      collegiateDivision: null,
    },
  });
  expect(joined.ok()).toBe(true);
  const entryId = (await joined.json()).id as string;
  expect((await page.request.delete(`${eventUrl}/test-entries`)).ok()).toBe(true);
  const offered = await page.request.post(`${eventUrl}/waitlist/${entryId}/offer`);
  expect(offered.ok()).toBe(true);
  const token = (await offered.json()).offerToken as string;
  expect(token).toBeTruthy();

  await page.goto(`/#/events/${eventId}/registrations`);
  await expect(page.getByText('Offer open', { exact: true })).toBeVisible();
  await expect(page.getByText(/Copy the link to share an offer/)).toBeVisible();
  const emailPanel = page.locator('.offer-email-delivery');
  await emailPanel.locator('summary').click();
  await expect(emailPanel.getByRole('status')).toContainText('Send status: Recorded');
  await expect(emailPanel.getByRole('button', { name: 'Retry offer email' })).toHaveCount(0);

  await page.goto(`/#/register/${eventId}?offer=${token}`);
  await expect(page.getByText('Your place is held')).toBeVisible();
  await expect(page.getByText('Place offered to you')).toBeVisible();
  await expect(page.getByText('There is no online waitlist')).toHaveCount(0);
  await expect(page.getByText('Your selected package is no longer available')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Join the waitlist', exact: true })).toHaveCount(0);
  await expect(page.getByText(/ask the organizer about the waitlist/)).toHaveCount(0);

  await page.getByRole('button', { name: 'Continue to racer details' }).click();
  await expect(page.getByRole('heading', { name: 'Racer details' })).toBeVisible();
  await expect(page.locator('.error-summary')).toHaveCount(0);
});
