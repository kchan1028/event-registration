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

test('category editor keeps helper text from shifting the control beside it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Load Berkeley Omnium' }).click();
  await expect(page.getByRole('heading', { name: 'Berkeley Hills Road Race', level: 2 })).toBeVisible();
  await page.getByRole('link', { name: /Berkeley Streets Criterium/ }).click();
  await expect(page.getByRole('heading', { name: 'Berkeley Streets Criterium', level: 2 })).toBeVisible();
  await page.locator('.cat-row', { hasText: 'Masters 50+ 3/4' }).click();
  const editor = page.locator('.editor');
  await expect(editor.getByText('Short code on start lists')).toBeVisible();

  const bounds = (locator: ReturnType<Page['locator']>) =>
    locator.evaluate((el) => {
      const { top, left, bottom, right } = el.getBoundingClientRect();
      return { top, left, bottom, right };
    });
  const labelTop = (control: ReturnType<Page['locator']>) =>
    control.evaluate((el) => {
      const label = (el as HTMLInputElement).labels?.[0];
      if (!label) throw new Error('missing label');
      return label.getBoundingClientRect().top;
    });
  const pair = async (leftLabel: string, rightLabel: string) => {
    const left = editor.getByLabel(leftLabel, { exact: true });
    const right = editor.getByLabel(rightLabel, { exact: true });
    const leftBox = await bounds(left);
    const rightBox = await bounds(right);
    expect(Math.abs(leftBox.top - rightBox.top)).toBeLessThan(1);
    expect(Math.abs((await labelTop(left)) - (await labelTop(right)))).toBeLessThan(1);
    expect(rightBox.left).toBeGreaterThan(leftBox.right - 1);
    return { left, leftBox };
  };

  const timing = await pair('Timing code', 'Status');
  const hint = await bounds(editor.getByText('Short code on start lists'));
  expect(hint.top).toBeGreaterThanOrEqual(timing.leftBox.bottom - 1);
  await expect(timing.left).toHaveAttribute('aria-describedby', /.+/);

  await pair('Entry price', 'Day-of surcharge');
  await pair('Bib range: first', 'Bib range: last');
  await pair('Minutes', 'Plus laps');

  const opens = await bounds(editor.getByLabel('Registration opens', { exact: true }));
  const closes = await bounds(editor.getByLabel('Registration closes', { exact: true }));
  expect(Math.abs(opens.top - closes.top)).toBeLessThan(1);

  await editor.getByRole('button', { name: 'Add price change' }).click();
  const priceFrom = await bounds(editor.getByLabel('From', { exact: true }));
  const remove = await bounds(editor.getByRole('button', { name: 'Remove price change' }));
  expect(Math.abs(remove.bottom - priceFrom.bottom)).toBeLessThan(4);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(editor.getByText('Short code on start lists')).toBeVisible();
  const narrowTiming = await bounds(editor.getByLabel('Timing code', { exact: true }));
  const narrowStatus = await bounds(editor.getByLabel('Status', { exact: true }));
  const narrowHint = await bounds(editor.getByText('Short code on start lists'));
  expect(Math.abs(narrowTiming.left - narrowStatus.left)).toBeLessThan(1);
  expect(narrowStatus.top).toBeGreaterThan(narrowHint.bottom - 1);
  expect(narrowHint.right).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  // The narrow drawer takes focus when the width change arrives, which can be after the resize returns.
  await expect(editor.getByRole('button', { name: 'Close category editor' })).toBeFocused();
  await editor.getByLabel('Timing code', { exact: true }).focus();
  await expect(editor.getByLabel('Timing code', { exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(editor.getByLabel('Status', { exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(editor.getByLabel('Timing code', { exact: true })).toBeFocused();
});

test('on a phone, the category editor opens as a drawer that takes and returns focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'fictional example weekend' }).click();
  const name = page.locator('.cat-row__name', { hasText: 'Masters 60+' });
  await name.click();
  await expect(page.locator('.inspector.is-open')).toBeVisible();
  const close = page.getByRole('button', { name: 'Close category editor' });
  await expect(close).toBeFocused();
  await close.click();
  await expect(page.locator('.inspector.is-open')).toHaveCount(0);
  await expect(name).toBeFocused();

  // At 390px the drawer fills the viewport. At 600px its 460px width leaves a backdrop.
  await page.setViewportSize({ width: 600, height: 844 });
  await name.click();
  await expect(close).toBeFocused();
  await page.locator('.scrim').click({ position: { x: 70, y: 400 } });
  await expect(page.locator('.inspector.is-open')).toHaveCount(0);
  await expect(name).toBeFocused();
});

test('changed waiver text needs a new waiver version before it publishes', async ({ page }) => {
  const { eventId } = await (await page.request.post('/api/demo')).json();
  expect((await page.request.post(`/api/events/${eventId}/publish`, { data: { acknowledgeWarnings: true } })).ok()).toBe(true);
  await page.goto(`/#/events/${eventId}/setup`);
  await page.getByLabel('Waiver text', { exact: true }).fill('Changed fictional waiver.');
  await saved(page);
  const publish = async () => {
    await page.getByRole('link', { name: /Review and publish/ }).first().click();
    const ack = page.getByLabel(/I have reviewed the/);
    if (await ack.count()) await ack.first().check();
    await page.getByRole('button', { name: 'Publish version 2' }).click();
  };
  await publish();
  await expect(page.locator('.publish-box').getByRole('status')).toContainText('already published with different text. In Event setup, enter a new waiver version');

  await page.getByRole('link', { name: 'Event setup', exact: true }).click();
  await page.getByLabel('Waiver version', { exact: true }).fill('sample-changed');
  await saved(page);
  await publish();
  await expect(page.locator('.publish-box').getByRole('status')).toContainText('Published as version 2');
});

test('the refund warning opens refund rules and clears once notes are saved', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Club or organization name').fill('Refund Warning Club');
  await page.getByRole('button', { name: 'Create organization' }).click();
  await expect(page.getByRole('heading', { name: 'Refund Warning Club' })).toBeVisible();
  await page.getByRole('article').filter({ hasText: 'Refund Warning Club' }).getByRole('button', { name: 'New draft event' }).click();
  await page.getByLabel('Event name').fill('Refund Warning Weekend');
  await page.getByLabel('First race day').fill('2027-06-12');
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page.getByRole('heading', { name: 'Saturday road race', level: 2 })).toBeVisible();

  // A wide race schedule shows start groups. Event setup shows the checks panel, which lists this draft's few warnings.
  await page.getByRole('link', { name: 'Event setup', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Event setup', level: 2 })).toBeVisible();
  const refund = page.locator('aside').getByRole('button', { name: 'Set up refund policy' });
  await expect(refund).toContainText('Event setup > Bundles, discounts, and rider policies > Refund and credit rules');
  await expect(refund).toContainText('No refund policy is set. Riders should see it before they pay.');
  const waiver = page.locator('aside').getByRole('button', { name: /No waiver text is set/ });
  await expect(waiver).not.toContainText('Set up refund policy');

  await refund.focus();
  await page.keyboard.press('Enter');
  const rules = page.locator('#refund-and-credit-rules');
  await expect(rules).toBeFocused();
  await expect(rules).toBeInViewport();

  await page.getByRole('link', { name: /Saturday road race/ }).click();
  await expect(page.getByRole('heading', { name: 'Saturday road race', level: 2 })).toBeVisible();
  await expect(page.locator('.topbar')).toContainText('Draft, not published');

  await page.getByRole('link', { name: 'Review and publish', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review and publish', level: 2 })).toBeVisible();
  await page.locator('main').getByRole('button', { name: /No waiver text is set/ }).click();
  await expect(page.getByRole('heading', { name: 'Event setup', level: 2 })).toBeVisible();
  await expect(rules).not.toBeFocused();

  await page.getByRole('link', { name: 'Review and publish', exact: true }).click();
  await page.locator('main').getByRole('button', { name: 'Set up refund policy' }).click();
  await expect(rules).toBeFocused();
  await page.getByLabel('Other refund notes shown before payment (optional)').fill('Fictional note: riders may request a refund up to 7 days before the first race day.');
  await saved(page);
  await page.getByRole('link', { name: 'Review and publish', exact: true }).click();
  await expect(page.locator('main').getByRole('button', { name: 'Set up refund policy' })).toHaveCount(0);
  await expect(page.locator('main').getByRole('button', { name: /No waiver text is set/ })).toBeVisible();
  await expect(page.locator('.topbar')).toContainText('Draft, not published');
  await expect(page.getByRole('heading', { name: 'Refund Warning Weekend', level: 1 })).toBeVisible();
});
