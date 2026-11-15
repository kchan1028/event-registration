import { expect, test } from './fixtures';

const CSV = [
  'race,category,timing_code,display_group,start_group,start_time,license_categories,min_age,competition_class,length_type,distance,laps,minutes,plus_laps,price,cap',
  'Saturday road race,Masters 35+ Cat 3/4,M35,Masters,Masters 35+,09:30,3;4,35,any,distance,62.5,5,,,50,60',
  'Sunday criterium,Women Cat 3/4/5,W345,Women,Women 3/4/5,10:00,3;4;5,,women,duration,,,40,3,35,50',
  'Sunday criterium,Elite P/1/2,P12,Elite,Elite,11:00,P12,,men,duration,,,60,,50,75',
].join('\n');

test('organizer imports categories from CSV with per-row errors, then sees them in the draft', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Club or organization name').fill('CSV Import Club');
  await page.getByRole('button', { name: 'Create organization' }).click();
  await page.getByRole('article').filter({ hasText: 'CSV Import Club' }).getByRole('button', { name: 'New draft event' }).click();
  await page.getByLabel('Event name').fill('CSV Weekend');
  await page.getByLabel('First race day').fill('2027-06-12');
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page.getByRole('heading', { name: 'Saturday road race', level: 2 })).toBeVisible();

  await page.getByRole('link', { name: 'Import and export' }).click();
  await page.getByLabel('CSV file to import').setInputFiles({ name: 'schedule.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });

  await expect(page.locator('.import-summary')).toContainText('2 ready to import · 1 with errors');
  await expect(page.locator('.import-table')).toContainText('"P12" is not one of PRO, 1, 2, 3, 4, 5');
  await page.locator('.import-summary').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/csv-import.png' });
  const add = page.getByRole('button', { name: 'Add 2 categories to the draft' });
  await expect(add).toBeDisabled();
  await page.getByLabel(/skip the 1 with errors/).check();
  await add.click();
  await expect(page.locator('.note--ok')).toContainText('Added 2 categories to the draft and skipped 1 row');
  await expect(page.locator('.save')).toContainText('All changes saved', { timeout: 10_000 });

  await page.getByRole('link', { name: /Sunday criterium/ }).click();
  const row = page.locator('.cat-row', { hasText: 'Women Cat 3/4/5' });
  await expect(row).toContainText('Cat 3/4/5 · women');
  await expect(row).toContainText('40 min + 3 laps');
  await expect(row).toContainText('10:00 AM');
});
