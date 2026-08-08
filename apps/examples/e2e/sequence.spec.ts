import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.archidea-sequence');
});

/** Modern is the default view; these checks are about the classic layout. */
const toClassic = (page: Page) => page.getByRole('button', { name: 'Classic view' }).click();

test('the bundled app uses the native renderer, not the proxy', async ({ page }) => {
  // Guards against registration being tree-shaken out of the build, which
  // unit tests cannot see because they resolve packages to source.
  await expect(page.locator('.app__badge')).toContainText('sequence-react');
  await expect(page.locator('.app__cap[data-on="true"]')).toHaveCount(2);
});

test('the diagram is HTML, with no SVG in the canvas', async ({ page }) => {
  await toClassic(page);
  const grid = page.locator('.seq-grid');
  await expect(grid.locator('svg')).toHaveCount(0);
  await expect(page.locator('.seq-participant').first()).toHaveText('User');
});

test('every arrow starts and ends on a lifeline centre', async ({ page }) => {
  await toClassic(page);
  await page.getByRole('button', { name: 'admin', exact: true }).click();

  const offsets = await page.evaluate(() => {
    const centre = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.x + r.width / 2;
    };
    const lifelines = [...document.querySelectorAll('.seq-lifeline')].map(centre);
    const nearest = (v: number) =>
      lifelines.reduce((best, c) => (Math.abs(c - v) < Math.abs(best - v) ? c : best));

    return [...document.querySelectorAll('.seq-message')]
      .filter((m) => (m as HTMLElement).dataset.self !== 'true')
      .flatMap((m) => {
        const l = m.querySelector('.seq-message__line')!.getBoundingClientRect();
        return [l.x - nearest(l.x), l.x + l.width - nearest(l.x + l.width)];
      });
  });

  expect(offsets.length).toBeGreaterThan(0);
  for (const offset of offsets) expect(Math.abs(offset)).toBeLessThan(1.5);
});

test('a fragment frame encloses only its own statements', async ({ page }) => {
  await toClassic(page);
  await page.getByRole('button', { name: 'admin', exact: true }).click();

  const inside = await page.evaluate(() => {
    const frame = document.querySelector('.seq-fragment')!.getBoundingClientRect();
    return [...document.querySelectorAll('.seq-message')]
      .filter((m) => {
        const r = m.getBoundingClientRect();
        return r.y > frame.y && r.y + r.height < frame.y + frame.height;
      })
      .map((m) => m.querySelector('.seq-message__label')!.textContent!.trim());
  });

  // The statement after `end` must not be swallowed by the frame.
  expect(inside.some((label) => label.includes('loadAuditLog'))).toBe(true);
  expect(inside.some((label) => label.includes('session for'))).toBe(false);
});

test('stepping highlights the participants involved in the current step', async ({ page }) => {
  await toClassic(page);
  await page.getByRole('button', { name: 'admin', exact: true }).click();
  await page.getByRole('button', { name: 'Next step' }).click();

  const current = page.locator('.seq-participant[data-emphasis="current"]');
  await expect(current).toHaveText(['User', 'API']);
});

test('a theme rewrites the renderer tokens and leaves the host page alone', async ({ page }) => {
  const surface = () =>
    page.locator('.archidea-sequence').evaluate((el) => getComputedStyle(el).backgroundColor);

  const midnight = await surface();
  await page.getByLabel('Diagram theme').selectOption('daylight');
  await page.waitForTimeout(200);
  const daylight = await surface();

  expect(daylight).not.toBe(midnight);

  // The host page keeps its own variables — the selector reaches our components only.
  const hostToken = await page
    .locator('.app')
    .evaluate((el) => el.style.getPropertyValue('--seq-surface'));
  expect(hostToken).toBe('');

  await page.screenshot({ path: 'e2e-results/daylight.png', fullPage: true });
});

test('variable chips stay legible on every surface they appear on', async ({ page }) => {
  // Midnight is the default; this is the theme chips were illegible in.
  await toClassic(page);
  await page.getByRole('button', { name: 'admin', exact: true }).click();
  await page.getByRole('button', { name: 'Next step' }).click();

  // A chip inherits its container's colour rather than pinning one token, so it
  // must never render as its own text colour against its own background.
  const chips = await page.evaluate(() =>
    [...document.querySelectorAll('.seq-var')].map((el) => {
      const style = getComputedStyle(el);
      return { color: style.color, background: style.backgroundColor };
    }),
  );

  expect(chips.length).toBeGreaterThan(0);
  for (const chip of chips) expect(chip.color).not.toBe(chip.background);

  await page.screenshot({ path: 'e2e-results/midnight.png', fullPage: true });
});

test('form controls are normalised inside the renderer but not outside it', async ({ page }) => {
  // Tailwind preflight is deliberately not imported (it is a global reset), so
  // the renderer carries its own scoped normalisation. Without it the user
  // agent's button chrome shows through — light rows on a dark theme.
  const stepBackground = await page
    .locator('.archidea-sequence button[data-emphasis="rest"]')
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(stepBackground).toBe('rgba(0, 0, 0, 0)');

  // ...but the reset must not out-rank Tailwind utilities, or every shadcn
  // button loses its background and border.
  const primary = await page
    .getByRole('button', { name: 'Next step' })
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(primary).not.toBe('rgba(0, 0, 0, 0)');

  const toggleBorder = await page
    .getByRole('button', { name: 'admin', exact: true })
    .evaluate((el) => getComputedStyle(el).borderTopWidth);
  expect(toggleBorder).not.toBe('0px');

  // The host page's own controls are untouched by our reset.
  const hostSelect = await page
    .getByLabel('Diagram theme')
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(hostSelect).not.toBe('rgba(0, 0, 0, 0)');
});

test('the modern view shows only the active call, with the rest receded', async ({ page }) => {
  await page.getByRole('button', { name: 'admin', exact: true }).click();
  await page.getByRole('button', { name: 'Next step' }).click();

  const spotlight = page.locator('.seq-spotlight');
  await expect(spotlight).toBeVisible();

  // Every participant stays pinned at the top; only one call is drawn.
  await expect(spotlight.locator('.seq-participant')).toHaveCount(3);
  await expect(spotlight.locator('.seq-message')).toHaveCount(1);
  await expect(spotlight.locator('.seq-message')).toContainText('POST /login');

  // Uninvolved participants recede rather than disappearing.
  await expect(spotlight.locator('.seq-participant[data-dimmed="true"]')).toHaveCount(1);

  // The active call still spans sender to receiver centre-to-centre.
  const offsets = await page.evaluate(() => {
    const centre = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.x + r.width / 2;
    };
    const anchors = [...document.querySelectorAll('.seq-spotlight .seq-participant')].map(centre);
    const line = document
      .querySelector('.seq-spotlight .seq-message__line')!
      .getBoundingClientRect();
    const nearest = (v: number) =>
      anchors.reduce((best, c) => (Math.abs(c - v) < Math.abs(best - v) ? c : best));
    return [l1(line.x), l1(line.x + line.width)];
    function l1(v: number) {
      return v - nearest(v);
    }
  });
  for (const offset of offsets) expect(Math.abs(offset)).toBeLessThan(1.5);

  await page.screenshot({ path: 'e2e-results/modern.png', fullPage: true });
});

test('the stepper and values survive switching between views', async ({ page }) => {
  await page.getByRole('button', { name: 'admin', exact: true }).click();
  await page.getByRole('button', { name: 'Next step' }).click();
  await expect(page.getByText('1 / 7')).toBeVisible();

  await page.getByRole('button', { name: 'Classic view' }).click();
  await expect(page.locator('.seq-grid')).toBeVisible();
  await expect(page.getByText('1 / 7')).toBeVisible();
  await expect(page.locator('.archidea-sequence')).toContainText('admin');
});

test('the app opens on the midnight theme', async ({ page }) => {
  await expect(page.getByLabel('Diagram theme')).toHaveValue('midnight');
});

test('receded participants stay legible and the view toggle stays in view', async ({ page }) => {
  await page.getByRole('button', { name: 'admin', exact: true }).click();
  await page.getByRole('button', { name: 'Next step' }).click();

  // A participant dimmed out of visibility reads as absent from the system.
  const dimmed = page.locator('.seq-spotlight .seq-participant[data-dimmed="true"]').first();
  const opacity = await dimmed.evaluate((el) => Number(getComputedStyle(el).opacity));
  expect(opacity).toBeGreaterThanOrEqual(0.55);
  await expect(dimmed).toBeVisible();

  // The toggle must sit inside the renderer, not overflow past its edge.
  const overflow = await page.evaluate(() => {
    const root = document.querySelector('.archidea-sequence')!.getBoundingClientRect();
    const toggle = document
      .querySelector('.archidea-sequence [aria-label="Diagram view"]')!
      .getBoundingClientRect();
    return toggle.right - root.right;
  });
  expect(overflow).toBeLessThanOrEqual(0);
});

test('every participant fits on screen in the modern view', async ({ page }) => {
  await page.getByRole('button', { name: 'admin', exact: true }).click();
  await page.getByRole('button', { name: 'Next step' }).click();

  // This view exists so the whole cast is visible at once; a participant pushed
  // into a horizontal scroll defeats it.
  const overflow = await page.evaluate(() => {
    const stage = document.querySelector('.seq-spotlight')!.getBoundingClientRect();
    return [...document.querySelectorAll('.seq-spotlight .seq-participant')].map((el) => {
      const r = el.getBoundingClientRect();
      return Math.max(stage.left - r.left, r.right - stage.right);
    });
  });

  expect(overflow).toHaveLength(3);
  for (const amount of overflow) expect(amount).toBeLessThanOrEqual(0);
});

test('the modern view shows bound values, not reference names', async ({ page }) => {
  await page.getByRole('button', { name: 'admin', exact: true }).click();
  await page.getByRole('button', { name: 'Next step' }).click();

  const chip = page.locator('.seq-spotlight .seq-var').first();
  await expect(chip).toHaveText('admin');
  await expect(chip).toHaveAttribute('data-resolved', 'true');
  await expect(chip).toHaveAttribute('title', 'role');
});

test('the call connects to both participant boxes', async ({ page }) => {
  await page.getByRole('button', { name: 'admin', exact: true }).click();
  await page.getByRole('button', { name: 'Next step' }).click();

  const gap = await page.evaluate(() => {
    const line = document.querySelector('.seq-spotlight .seq-message__line')!;
    const style = getComputedStyle(line);
    const rect = line.getBoundingClientRect();
    const involved = [...document.querySelectorAll('.seq-spotlight .seq-participant')]
      .filter((el) => (el as HTMLElement).dataset.dimmed === 'false')
      .map((el) => el.getBoundingClientRect());
    const lowestBox = Math.max(...involved.map((r) => r.bottom));
    return {
      legLeft: parseFloat(style.borderLeftWidth),
      legRight: parseFloat(style.borderRightWidth),
      distanceToBoxes: rect.top - lowestBox,
    };
  });

  // Legs rise from both ends, and the connector meets the boxes rather than
  // floating in the middle of the row.
  expect(gap.legLeft).toBeGreaterThan(0);
  expect(gap.legRight).toBeGreaterThan(0);
  expect(gap.distanceToBoxes).toBeLessThanOrEqual(8);
});

test('the arrow head points up into the receiving participant', async ({ page }) => {
  await page.getByRole('button', { name: 'admin', exact: true }).click();
  await page.getByRole('button', { name: 'Next step' }).click();

  const head = await page.evaluate(() => {
    const line = document.querySelector('.seq-spotlight .seq-message__line')!;
    const style = getComputedStyle(line, '::after');
    return {
      top: parseFloat(style.borderTopWidth),
      bottom: parseFloat(style.borderBottomWidth),
      bottomColor: style.borderBottomColor,
    };
  });

  // An up-pointing CSS triangle: no top border, a coloured bottom one.
  expect(head.top).toBe(0);
  expect(head.bottom).toBeGreaterThan(0);
  expect(head.bottomColor).not.toBe('rgba(0, 0, 0, 0)');
});
