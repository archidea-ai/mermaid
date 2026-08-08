import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * The overview is pure layout: columns placed by CSS, lines measured from the
 * DOM afterwards. jsdom lays nothing out, so where the lines actually land can
 * only be checked here.
 */

const load = async (page: Page, title: string) => {
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Load example' }).click();
  await page.getByRole('option', { name: title }).click();
};

const ORDER = 'Order state machine — pick the next transition';
const NESTED = 'Deployment machine — nested compound states';

const toOverview = (page: Page) => page.getByRole('button', { name: 'Overview' }).click();

test('the toggle swaps between the journey and the overview', async ({ page }) => {
  await load(page, ORDER);
  await expect(page.locator('.state-track')).toBeVisible();

  await toOverview(page);
  await expect(page.locator('.state-overview')).toBeVisible();
  await expect(page.locator('.state-track')).toHaveCount(0);

  await page.getByRole('button', { name: 'Interactive journey' }).click();
  await expect(page.locator('.state-track')).toBeVisible();
});

test('lines run between the boxes, not through them', async ({ page }) => {
  await load(page, ORDER);
  await toOverview(page);
  await expect(page.locator('.state-line').first()).toBeVisible();

  const gap = await page.evaluate(() => {
    const root = document.querySelector('.state-overview')!;
    const from = root.querySelector('[aria-pressed="true"]')!.getBoundingClientRect();
    const to = [...root.querySelectorAll('.state-chip')]
      .map((chip) => chip.getBoundingClientRect())
      .filter((box) => box.left > from.right)
      .sort((a, b) => a.left - b.left)[0]!;
    const line = document.querySelector('.state-line')!.getBoundingClientRect();

    return { fromRight: from.right, toLeft: to.left, lineLeft: line.left, lineRight: line.right };
  });

  // The first line starts at the active state's edge and stops at the next
  // state's edge, so neither box is drawn over.
  expect(gap.lineLeft).toBeGreaterThanOrEqual(gap.fromRight - 1);
  expect(gap.lineRight).toBeLessThanOrEqual(gap.toLeft + 1);
});

test('every line is labelled inside the gap it spans', async ({ page }) => {
  await load(page, ORDER);
  await toOverview(page);

  const labels = page.locator('.state-overview__edge-label');
  await expect(labels).toHaveCount(await page.locator('.state-line').count());

  // A label that overlaps a state is unreadable, whatever it says.
  const overlaps = await page.evaluate(() => {
    const chips = [...document.querySelectorAll('.state-chip')].map((chip) =>
      chip.getBoundingClientRect(),
    );
    return [...document.querySelectorAll('.state-overview__edge-label')]
      .map((label) => label.getBoundingClientRect())
      .filter((box) =>
        chips.some(
          (chip) =>
            box.left < chip.right &&
            box.right > chip.left &&
            box.top < chip.bottom &&
            box.bottom > chip.top,
        ),
      ).length;
  });

  expect(overlaps).toBe(0);
});

test('substates are what a composite offers, inside the box that owns them', async ({ page }) => {
  await load(page, NESTED);
  await toOverview(page);

  // `Queued --> Building` enters Building, so the next column is Building's own
  // first substate rather than the composite.
  const ahead = page.locator('.state-overview__column').nth(1);
  await expect(ahead.locator('.state-box')).toHaveAttribute('aria-label', 'Building');
  await expect(ahead.locator('.state-chip')).toHaveText('Compiling');
});

test('activating a state re-centres the chart on it', async ({ page }) => {
  await load(page, NESTED);
  await toOverview(page);

  await page.getByRole('button', { name: 'Passed', exact: true }).click();

  const active = page.locator('.state-overview__column[data-role="active"]');
  await expect(active).toContainText('Passed');
  // Re-centring means the run up to here becomes history, drawn to its left.
  await expect(page.locator('.state-overview__column[data-role="history"]').first()).toBeVisible();

  const centred = await page.evaluate(() => {
    const view = document.querySelector('.state-view') as HTMLElement;
    const column = document.querySelector(
      '.state-overview__column[data-role="active"]',
    ) as HTMLElement;
    const box = column.getBoundingClientRect();
    const port = view.getBoundingClientRect();
    return box.left >= port.left && box.right <= port.right;
  });

  expect(centred).toBe(true);
});

test('pointing at a state lights the route back to the active one', async ({ page }) => {
  await load(page, NESTED);
  await toOverview(page);
  await expect(page.locator('.state-line').first()).toBeVisible();

  await page.getByRole('button', { name: 'Passed', exact: true }).hover();

  const lit = page.locator('.state-chip[data-lit="true"]');
  await expect(lit).toHaveText(['Queued', 'Compiling', 'Unit', 'Integration', 'Passed']);

  // Lit and unlit have to be tellable apart on screen, not just in the markup —
  // the route is drawn over the chart, and everything else recedes behind it.
  // Retried because dimming is a transition, not an instant state change.
  await expect(async () => {
    const contrast = await page.evaluate(() => {
      const opacity = (selector: string) =>
        Number(getComputedStyle(document.querySelector(selector)!).opacity);
      const layer = (selector: string) =>
        Number(getComputedStyle(document.querySelector(selector)!).zIndex);

      return {
        onRoute: opacity('.state-chip[data-lit="true"]'),
        offRoute: opacity('.state-chip[data-lit="false"]'),
        lines: layer('.state-view__lines'),
        columns: layer('.state-overview__column'),
      };
    });

    expect(contrast.onRoute).toBeGreaterThan(contrast.offRoute);
    expect(contrast.lines).toBeGreaterThan(contrast.columns);
  }).toPass();
});
