import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.seq-grid');
});

test('the bundled app uses the native renderer, not the proxy', async ({ page }) => {
  // Guards against registration being tree-shaken out of the build, which
  // unit tests cannot see because they resolve packages to source.
  await expect(page.locator('.app__badge')).toContainText('sequence-react');
  await expect(page.locator('.app__cap[data-on="true"]')).toHaveCount(2);
});

test('the diagram is HTML, with no SVG in the canvas', async ({ page }) => {
  const grid = page.locator('.seq-grid');
  await expect(grid.locator('svg')).toHaveCount(0);
  await expect(page.locator('.seq-participant').first()).toHaveText('User');
});

test('every arrow starts and ends on a lifeline centre', async ({ page }) => {
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
  await page.getByRole('button', { name: 'admin', exact: true }).click();
  await page.getByRole('button', { name: 'Next step' }).click();

  const current = page.locator('.seq-participant[data-emphasis="current"]');
  await expect(current).toHaveText(['User', 'API']);
});

test('a theme rewrites the renderer tokens and leaves the host page alone', async ({ page }) => {
  const surface = () =>
    page.locator('.archidea-sequence').evaluate((el) => getComputedStyle(el).backgroundColor);

  const light = await surface();
  await page.getByLabel('Diagram theme').selectOption('midnight');
  await page.waitForTimeout(200);
  const dark = await surface();

  expect(dark).not.toBe(light);

  // The host page keeps its own variables — the selector reaches our components only.
  const hostToken = await page
    .locator('.app')
    .evaluate((el) => el.style.getPropertyValue('--seq-surface'));
  expect(hostToken).toBe('');

  await page.screenshot({ path: 'e2e-results/midnight.png', fullPage: true });
});

test('variable chips stay legible on every surface they appear on', async ({ page }) => {
  await page.getByLabel('Diagram theme').selectOption('midnight');
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
  await page.getByLabel('Diagram theme').selectOption('midnight');

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
