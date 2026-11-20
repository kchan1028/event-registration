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

  await page.getByRole('button', { name: 'Find my races', exact: true }).click();
  await expect(schedule.getByRole('heading', { name: 'Your matching races', exact: true })).toBeVisible();
  await expect(schedule.getByRole('checkbox', { name: /CR-J1314/ })).toBeVisible();
  await expect(schedule.getByRole('checkbox', { name: /RR-JB1314/ })).toHaveCount(0);
  const status = page.locator('#match-filter-status');
  await expect(status).toContainText('categories need a competition class to confirm a match');
  await expect(status).toContainText('Choose All races to see them');
  await expect(status).not.toContainText('not a match');
  await expect(page.getByRole('button', { name: 'All races', exact: true })).toHaveAttribute('aria-describedby', 'match-filter-status');

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await status.scrollIntoViewIfNeeded();
    expect(await schedule.evaluate((node) => node.getBoundingClientRect().right <= window.innerWidth && node.scrollWidth <= node.clientWidth)).toBe(true);
  }
  expect((await new AxeBuilder({ page }).include('#schedule').analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 1280, height: 1000 });

  await page.getByRole('button', { name: 'All races', exact: true }).click();
  const boys = schedule.getByRole('checkbox', { name: /RR-JB1314/ });
  await expect(boys).toBeVisible();
  await expect(boys).not.toHaveAttribute('aria-disabled', 'true');
  await boys.click();
  await page.getByRole('button', { name: 'Matching races', exact: true }).click();
  await expect(boys).toBeVisible();
  await expect(boys).toHaveAttribute('aria-checked', 'true');
  await boys.click();
  await expect(schedule.getByRole('checkbox', { name: /RR-JB1314/ })).toHaveCount(0);

  await page.getByLabel('Competition class').selectOption('other');
  await expect(status).not.toContainText('to confirm a match');
  await expect(schedule.getByRole('checkbox', { name: /RR-JB1314/ })).toHaveCount(0);
  await expect(schedule.getByRole('checkbox', { name: /CR-J1314/ })).toBeVisible();

  await page.getByLabel('Competition class').selectOption('men');
  await expect(schedule.getByRole('checkbox', { name: /RR-JB1314/ })).toBeVisible();
  await expect(schedule.getByRole('checkbox', { name: /CR-J1314/ })).toBeVisible();
  await schedule.getByRole('checkbox', { name: /RR-JB1314/ }).click();
  await schedule.getByRole('checkbox', { name: /CR-J1314/ }).click();
  await expect(page.locator('.tray .quote__total')).toContainText('$40');
});
