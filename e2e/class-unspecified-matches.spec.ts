import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

test('Matching races explains class-specific fields hidden when competition class is unspecified', async ({ page }) => {
  const seeded = await page.request.post('/api/demo/berkeley-events');
  expect(seeded.ok()).toBe(true);
  const eventId = (await seeded.json()).eventIds[0];
  await page.goto(`/#/register/${eventId}`);
  const schedule = page.locator('#schedule');
  await page.getByLabel('Racing age').fill('13');
  await page.getByLabel('License category').selectOption('5');
  await expect(page.getByLabel('Competition class')).toHaveValue('');
  await expect(schedule.getByRole('checkbox', { name: /RR-JB1314/ })).toBeVisible();
  await expect(schedule.getByRole('checkbox', { name: /CR-J1314/ })).toBeVisible();
  await expect(schedule.locator('#class-hidden-notice')).toHaveCount(0);

  await page.getByRole('button', { name: 'Find my races', exact: true }).click();
  await expect(schedule.getByRole('heading', { name: 'Your matching races', exact: true })).toBeVisible();
  await expect(schedule.getByRole('checkbox', { name: /CR-J1314/ })).toBeVisible();
  await expect(schedule.getByRole('checkbox', { name: /RR-JB1314/ })).toHaveCount(0);
  const notice = schedule.locator('#class-hidden-notice');
  const status = page.locator('#match-filter-status');
  await expect(notice.getByRole('heading', { name: 'Some races are hidden', exact: true })).toBeVisible();
  await expect(notice).toContainText('categories need a competition class to confirm a match');
  await expect(notice.getByRole('button', { name: 'Show all races', exact: true })).toBeVisible();
  await expect(status).toContainText('categories match your answers');
  await expect(status).not.toContainText('Show all races');
  await expect(status).not.toContainText('Choose All races');
  await expect(status).not.toContainText('to confirm a match');
  await expect(page.getByRole('button', { name: 'All races', exact: true })).toHaveAttribute('aria-describedby', 'class-hidden-reason');
  expect(await schedule.evaluate((node) => {
    const box = node.querySelector('#class-hidden-notice');
    const day = node.querySelector('.sched-day');
    const live = node.querySelector('#match-filter-status');
    if (!box || !day || !live || live.contains(box) || box.getAttribute('role') === 'status' || box.getAttribute('aria-live')) return false;
    const noticeStyle = getComputedStyle(box);
    const statusStyle = getComputedStyle(live);
    const distinct = noticeStyle.backgroundColor !== statusStyle.backgroundColor && noticeStyle.borderTopWidth !== '0px';
    return distinct && (box.compareDocumentPosition(day) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  })).toBe(true);

  for (const theme of ['light', 'dark']) {
    await page.locator('html').evaluate((root, value) => root.setAttribute('data-theme', value), theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await notice.scrollIntoViewIfNeeded();
      expect(await schedule.evaluate((node) => node.getBoundingClientRect().right <= window.innerWidth && node.scrollWidth <= node.clientWidth)).toBe(true);
    }
    expect((await new AxeBuilder({ page }).include('#schedule').analyze()).violations).toEqual([]);
  }
  await page.locator('html').evaluate((root) => root.setAttribute('data-theme', 'light'));
  await page.setViewportSize({ width: 1280, height: 1000 });

  const show = notice.getByRole('button', { name: 'Show all races', exact: true });
  await show.focus();
  await page.keyboard.press('Enter');
  await expect(schedule).toBeFocused();
  const boys = schedule.getByRole('checkbox', { name: /RR-JB1314/ });
  await expect(boys).toBeVisible();
  await expect(notice).toHaveCount(0);

  await page.getByRole('button', { name: 'Matching races', exact: true }).click();
  await expect(schedule.getByRole('checkbox', { name: /RR-JB1314/ })).toHaveCount(0);
  await expect(notice).toBeVisible();
  await page.getByRole('button', { name: 'All races', exact: true }).click();
  await expect(boys).toBeVisible();
  await expect(boys).not.toHaveAttribute('aria-disabled', 'true');
  await boys.click();
  await page.getByRole('button', { name: 'Matching races', exact: true }).click();
  await expect(boys).toBeVisible();
  await expect(boys).toHaveAttribute('aria-checked', 'true');
  await boys.click();
  await expect(schedule.getByRole('checkbox', { name: /RR-JB1314/ })).toHaveCount(0);

  await page.getByLabel('Competition class').selectOption('other');
  await expect(notice).toHaveCount(0);
  await expect(status).not.toContainText('to confirm a match');
  await expect(schedule.getByRole('checkbox', { name: /RR-JB1314/ })).toHaveCount(0);
  await expect(schedule.getByRole('checkbox', { name: /CR-J1314/ })).toBeVisible();

  await page.getByLabel('Competition class').selectOption('men');
  await expect(notice).toHaveCount(0);
  await expect(schedule.getByRole('checkbox', { name: /RR-JB1314/ })).toBeVisible();
  await expect(schedule.getByRole('checkbox', { name: /CR-J1314/ })).toBeVisible();
  await schedule.getByRole('checkbox', { name: /RR-JB1314/ }).click();
  await schedule.getByRole('checkbox', { name: /CR-J1314/ }).click();
  await expect(page.locator('.tray .quote__total')).toContainText('$40');
});
