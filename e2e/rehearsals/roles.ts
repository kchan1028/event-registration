import type { Browser, Page } from '@playwright/test';

/** One signed-in browser for one fictional role. The session is not shared. */
export async function rolePage(browser: Browser, baseURL: string, email: string): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({
    baseURL,
    extraHTTPHeaders: { Authorization: `Bearer test:${email}` },
  });
  await context.addInitScript((user) => sessionStorage.setItem('cyclereg.test-session', user), email);
  const page = await context.newPage();
  return { page, close: () => context.close() };
}
