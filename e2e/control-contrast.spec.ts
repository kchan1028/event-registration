import { expect, test, type Page } from './fixtures';
import { publishReviewed } from './support/publish';

/**
 * Shared controls and selected rows. Ratios come from computed colors, the same measurement as the
 * contrast gap: 3:1 for an essential boundary or focus indicator, 4.5:1 for a button or row label.
 * A theme switch must stay on those floors for the whole change, not only after it settles.
 */

type Sample = {
  color: string;
  background: string;
  border: string;
  outside: string;
  outline: string;
  outlineWidth: string;
  transitionProperty: string;
  transitionDuration: string;
};

const TEXT = 4.5;
const EDGE = 3;

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function parse(input: string): { r: number; g: number; b: number; a: number } {
  const rgb = input.trim().match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)$/);
  if (rgb) return { r: +rgb[1], g: +rgb[2], b: +rgb[3], a: rgb[4] === undefined ? 1 : +rgb[4] };
  const srgb = input.trim().match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?\)$/);
  if (srgb) return { r: +srgb[1] * 255, g: +srgb[2] * 255, b: +srgb[3] * 255, a: srgb[4] === undefined ? 1 : +srgb[4] };
  throw new Error(`Unparsed color ${input}`);
}

function over(fg: { r: number; g: number; b: number; a: number }, bg: { r: number; g: number; b: number }): { r: number; g: number; b: number } {
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
  };
}

function contrast(fg: string, bg: string): number {
  const front = over(parse(fg), parse(bg));
  const back = parse(bg);
  const l1 = 0.2126 * channel(front.r) + 0.7152 * channel(front.g) + 0.0722 * channel(front.b);
  const l2 = 0.2126 * channel(back.r) + 0.7152 * channel(back.g) + 0.0722 * channel(back.b);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

function mix(from: string, to: string, t: number): string {
  const a = parse(from);
  const b = parse(to);
  const blend = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${blend(a.r, b.r)} ${blend(a.g, b.g)} ${blend(a.b, b.b)})`;
}

async function openHome(page: Page) {
  await page.goto('/');
  const field = page.getByLabel('Club or organization name');
  await expect(field).toBeVisible();
  await field.fill('Valley Bicycle Club');
  await expect(page.getByRole('button', { name: 'Create organization' })).toBeEnabled();
}

async function samples(page: Page, selector: string, focus: boolean): Promise<Record<'light' | 'dark', Sample>> {
  return page.locator(selector).first().evaluate((el, shouldFocus) => {
    const node = el as HTMLElement;
    function backdrop(target: Element): string {
      const layers: { r: number; g: number; b: number; a: number }[] = [];
      let parent = target.parentElement;
      while (parent) {
        const raw = getComputedStyle(parent).backgroundColor;
        const match = raw.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)$/);
        const layer = match
          ? { r: +match[1], g: +match[2], b: +match[3], a: match[4] === undefined ? 1 : +match[4] }
          : { r: 255, g: 255, b: 255, a: 0 };
        layers.push(layer);
        if (layer.a >= 0.999) break;
        parent = parent.parentElement;
      }
      let acc = { r: 255, g: 255, b: 255 };
      for (let i = layers.length - 1; i >= 0; i--) {
        const layer = layers[i];
        acc = {
          r: layer.r * layer.a + acc.r * (1 - layer.a),
          g: layer.g * layer.a + acc.g * (1 - layer.a),
          b: layer.b * layer.a + acc.b * (1 - layer.a),
        };
      }
      return `rgb(${Math.round(acc.r)} ${Math.round(acc.g)} ${Math.round(acc.b)})`;
    }
    function read(theme: 'light' | 'dark'): Sample {
      const root = document.documentElement;
      const computed = getComputedStyle(node);
      const transitionProperty = computed.transitionProperty;
      const transitionDuration = computed.transitionDuration;
      const previous = node.style.transition;
      node.style.transition = 'none';
      root.dataset.theme = theme;
      void node.offsetWidth;
      if (shouldFocus) node.focus();
      const cs = getComputedStyle(node);
      const sample = {
        color: cs.color,
        background: cs.backgroundColor,
        border: cs.borderTopColor,
        outside: backdrop(node),
        outline: cs.outlineColor,
        outlineWidth: cs.outlineWidth,
        transitionProperty,
        transitionDuration,
      };
      node.style.transition = previous;
      return sample;
    }
    return { light: read('light'), dark: read('dark') };
  }, focus);
}

test('input and secondary button boundaries and focus clear 3:1 in both themes', async ({ page }) => {
  await openHome(page);
  const field = await samples(page, '.panel-form .input', true);
  const secondary = await samples(page, '.demo-callout .btn--secondary', false);
  for (const theme of ['light', 'dark'] as const) {
    const input = field[theme];
    const button = secondary[theme];
    expect(parseFloat(input.outlineWidth), `${theme} focus outline`).toBeGreaterThanOrEqual(2);
    expect(contrast(input.outline, input.outside), `${theme} focus outline`).toBeGreaterThanOrEqual(EDGE);
    expect(contrast(input.border, input.background), `${theme} input border on its fill`).toBeGreaterThanOrEqual(EDGE);
    expect(contrast(input.border, input.outside), `${theme} input border on the surface around it`).toBeGreaterThanOrEqual(EDGE);
    expect(contrast(button.border, button.background), `${theme} secondary border on its fill`).toBeGreaterThanOrEqual(EDGE);
    expect(contrast(button.border, button.outside), `${theme} secondary border on the surface around it`).toBeGreaterThanOrEqual(EDGE);
  }
});

test('selected chip labels stay at 4.5:1 through a theme switch', async ({ page }) => {
  const { eventId } = await (await page.request.post('/api/demo')).json();
  await page.goto(`/#/events/${eventId}/registrations`);
  const chip = page.getByRole('group', { name: 'Show registrations' }).getByRole('button', { name: /^All / });
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  const pair = await samples(page, '.filters .chip.is-on', false);
  const animated = pair.light.transitionProperty.split(',').map((part) => part.trim());
  expect(animated).not.toContain('background-color');
  expect(animated).not.toContain('all');
  const colorMoves = animated.includes('color') || animated.includes('all');
  const fillMoves = animated.includes('background-color') || animated.includes('all');
  for (const [from, to] of [
    ['light', 'dark'],
    ['dark', 'light'],
  ] as const) {
    for (let step = 0; step <= 8; step++) {
      const t = step / 8;
      const color = colorMoves ? mix(pair[from].color, pair[to].color, t) : pair[to].color;
      const background = fillMoves ? mix(pair[from].background, pair[to].background, t) : pair[to].background;
      expect(contrast(color, background), `selected chip ${from} to ${to} at ${t}`).toBeGreaterThanOrEqual(TEXT);
    }
  }
});

function propertyMoves(property: string, duration: string, name: string): boolean {
  const props = property.split(',').map((part) => part.trim());
  const durations = duration.split(',').map((part) => part.trim());
  return props.some((prop, index) => (prop === name || prop === 'all') && (durations[index] ?? durations[durations.length - 1]) !== '0s');
}

async function expectRowLabel(page: Page, rowSelector: string, labelSelector: string, name: string) {
  const row = await samples(page, rowSelector, false);
  const label = await samples(page, labelSelector, false);
  expect(propertyMoves(row.light.transitionProperty, row.light.transitionDuration, 'background-color')).toBe(false);
  const colorMoves = propertyMoves(label.light.transitionProperty, label.light.transitionDuration, 'color');
  const fillMoves = propertyMoves(row.light.transitionProperty, row.light.transitionDuration, 'background-color');
  for (const [from, to] of [
    ['light', 'dark'],
    ['dark', 'light'],
  ] as const) {
    for (let step = 0; step <= 8; step++) {
      const t = step / 8;
      const color = colorMoves ? mix(label[from].color, label[to].color, t) : label[to].color;
      const background = fillMoves ? mix(row[from].background, row[to].background, t) : row[to].background;
      expect(contrast(color, background), `${name} ${from} to ${to} at ${t}`).toBeGreaterThanOrEqual(TEXT);
    }
  }
}

test('selected category and check-in row labels stay at 4.5:1 through a theme switch', async ({ page }) => {
  const api = page.request;
  const { eventId } = await (await api.post('/api/demo')).json();
  await page.goto(`/#/events/${eventId}`);
  const category = page.locator('.cat-row__name').first();
  await expect(category).toBeVisible();
  await category.click();
  await expect(category).toHaveAttribute('aria-pressed', 'true');
  await expectRowLabel(page, '.cat-row.is-selected', '.cat-row.is-selected .cat-row__name', 'category row');

  expect((await publishReviewed(api, `/api/events/${eventId}`, { acknowledgeWarnings: true })).ok()).toBe(true);
  expect((await api.post(`/api/events/${eventId}/check-in-demo-riders`)).ok()).toBe(true);
  await page.goto(`/#/events/${eventId}/check-in`);
  const rider = page.locator('.ci-row').first();
  await expect(rider).toBeVisible();
  await rider.click();
  await expect(rider).toHaveAttribute('aria-current', 'true');
  await expectRowLabel(page, '.ci-row.is-selected', '.ci-row.is-selected .ci-row__name', 'check-in row');
});

test('button labels stay at 4.5:1 through a theme switch', async ({ page }) => {
  await openHome(page);
  const controls: { selector: string; floor: number }[] = [
    { selector: '.panel-form .btn--primary', floor: TEXT },
    { selector: '.demo-callout .btn--secondary', floor: TEXT },
    { selector: '.theme-toggle', floor: EDGE },
  ];
  for (const { selector, floor } of controls) {
    const pair = await samples(page, selector, false);
    const animated = pair.light.transitionProperty.split(',').map((part) => part.trim());
    const colorMoves = animated.includes('color') || animated.includes('all');
    const fillMoves = animated.includes('background-color') || animated.includes('all');
    for (const [from, to] of [
      ['light', 'dark'],
      ['dark', 'light'],
    ] as const) {
      for (let step = 0; step <= 8; step++) {
        const t = step / 8;
        const color = colorMoves ? mix(pair[from].color, pair[to].color, t) : pair[to].color;
        const background = fillMoves ? mix(pair[from].background, pair[to].background, t) : pair[to].background;
        expect(contrast(color, background), `${selector} ${from} to ${to} at ${t}`).toBeGreaterThanOrEqual(floor);
      }
    }
  }
});
