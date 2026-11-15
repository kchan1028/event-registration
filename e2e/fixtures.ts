import { test as base } from '@playwright/test';

export { expect, type Page } from '@playwright/test';

/**
 * Browser tests run against the local-only test sign-in (AUTH_MODE=test, playwright.config.ts).
 * This `test` starts every page signed in as one fictional organizer, in the browser (the
 * session the app reads) and for direct API calls through `page.request`.
 */
export const E2E_ORGANIZER = 'organizer@example.test';

export const test = base.extend({
  extraHTTPHeaders: async ({}, use) => {
    await use({ Authorization: `Bearer test:${E2E_ORGANIZER}` });
  },
  page: async ({ page }, use) => {
    await page.addInitScript((email) => sessionStorage.setItem('cyclereg.test-session', email), E2E_ORGANIZER);
    await use(page);
  },
});
