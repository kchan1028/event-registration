import { expect, test, type Page } from './fixtures';

const saved = (page: Page) => expect(page.locator('.save')).toContainText('All changes saved', { timeout: 10_000 });

test('organizer builds, saves, reloads, and previews a category', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Club or organization name').fill('Test Velo Club');
  await page.getByRole('button', { name: 'Create organization' }).click();
  await expect(page.getByRole('heading', { name: 'Test Velo Club' })).toBeVisible();

  await page.getByRole('article').filter({ hasText: 'Test Velo Club' }).getByRole('button', { name: 'New draft event' }).click();
  await page.getByLabel('Event name').fill('Test Velo Weekend');
  await page.getByLabel('First race day').fill('2027-06-12');
  await page.getByRole('button', { name: 'Create draft' }).click();

  await expect(page.getByRole('heading', { name: 'Saturday road race', level: 2 })).toBeVisible();

  // Start group first, so the category can be clipped into it.
  await page.getByRole('button', { name: 'Add start group' }).click();
  await page.getByRole('textbox', { name: 'Start time' }).fill('09:00');
  await page.getByRole('textbox', { name: 'Field limit' }).fill('50');
  await page.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('button', { name: 'Add category' }).click();
  const editor = page.locator('.editor');
  await editor.getByLabel('Category name').fill('Masters 40+ Cat 3/4');
  await editor.getByLabel('Timing code').fill('M40');
  await editor.getByText('Cat 3', { exact: true }).click();
  await editor.getByText('Cat 4', { exact: true }).click();
  await editor.getByLabel('Min racing age').fill('40');
  await editor.getByLabel('Start group', { exact: true }).selectOption({ label: '9:00 AM · Start group 1' });
  await editor.getByRole('radio', { name: 'Distance' }).check();
  await editor.getByRole('button', { name: 'Use timing code and name' }).click();
  await editor.getByLabel('Entry price').fill('45');
  await editor.getByLabel('Category cap').fill('40');
  await saved(page);

  const row = page.locator('.cat-row', { hasText: 'Masters 40+ Cat 3/4' });
  await expect(row).toContainText('Cat 3/4 · age 40+');
  await expect(row).toContainText('9:00 AM');
  await expect(row).toContainText('$45');

  // Duplicate is flagged for review.
  await editor.getByRole('button', { name: 'Duplicate' }).click();
  await expect(page.locator('.cat-row', { hasText: 'Masters 40+ Cat 3/4 (copy)' })).toContainText('Review copy');
  await saved(page);

  // Persistent storage: reload and find both categories.
  await page.reload();
  await expect(page.locator('.cat-row', { hasText: 'Masters 40+ Cat 3/4 (copy)' })).toBeVisible();
  await expect(page.locator('.cat-row', { hasText: /^.*Masters 40\+ Cat 3\/4M40/ })).toBeVisible();

  // Rider preview with a profile check.
  await page.getByRole('link', { name: 'Rider preview' }).click();
  await expect(page.locator('.preview')).toBeVisible();
  await page.getByLabel('Racing age', { exact: true }).fill('45');
  await page.getByLabel('License category').selectOption('3');
  const pv = page.locator('.pv-row', { hasText: 'Masters 40+ Cat 3/4' }).first();
  await expect(pv).toContainText('You qualify');
  await page.getByLabel('Racing age', { exact: true }).fill('35');
  await expect(pv).toContainText('Not eligible');
});

test('demonstration weekend enforces a shared cap and publishes a version', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'fictional example weekend' }).click();
  await expect(page.getByRole('heading', { name: 'Saturday road race', level: 2 })).toBeVisible();
  await expect(page.locator('.demo-banner')).toContainText('not an approved race schedule');

  // 35 entries in Masters 50+ leave 25 places for Masters 60+ under the combined 60.
  await page.locator('.cat-row', { hasText: 'Masters 60+' }).click();
  const editor = page.locator('.editor');
  await expect(editor.locator('.limits li.is-binding')).toContainText('25 left');
  await editor.getByLabel('Number of test entries').fill('30');
  await editor.getByRole('button', { name: 'Add test entries' }).click();
  await expect(editor.locator('.note')).toContainText('Added 25 of 30');
  await expect(editor.locator('.note')).toContainText('Masters 50+ and 60+ combined is full');

  // Publish with warnings acknowledged.
  await page.getByRole('link', { name: /Review and publish/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Review and publish' })).toBeVisible();
  const ack = page.getByLabel(/I have reviewed the/);
  if (await ack.count()) await ack.check();
  await page.getByRole('button', { name: /Publish version 1/ }).click();
  await expect(page.locator('.publish-box .note')).toContainText('Published as version 1');
  await expect(page.getByRole('button', { name: 'Version 1 is current' })).toBeDisabled();
});

test('on a phone, the category editor opens as a drawer that takes and returns focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'fictional example weekend' }).click();
  const name = page.locator('.cat-row__name', { hasText: 'Masters 60+' });
  await name.click();
  await expect(page.locator('.inspector.is-open')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close category editor' })).toBeFocused();
  await page.locator('.scrim').click({ position: { x: 10, y: 400 } });
  await expect(page.locator('.inspector.is-open')).toHaveCount(0);
  await expect(name).toBeFocused();
});
