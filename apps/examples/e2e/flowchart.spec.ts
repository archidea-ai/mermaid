import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * The flowchart is pure layout: columns placed by CSS, edges measured from the
 * DOM afterwards. jsdom lays nothing out and resolves the workspace to source,
 * so where the lines land and whether the bundle carries the renderer at all
 * can only be checked here.
 */

const load = async (page: Page) => {
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Load example' }).click();
  await page.getByRole('option', { name: 'Release pipeline — a flowchart to explore' }).click();
  await expect(page.locator('.flow-chart')).toBeVisible();
};

test('the built bundle resolves flowcharts to the native renderer', async ({ page }) => {
  await load(page);

  // Registration has been tree-shaken out of a published build before, and
  // source-aliased tests could not see it.
  await expect(page.getByText('flowchart-react')).toBeVisible();
  await expect(page.locator('[data-renderer="proxy"]')).toHaveCount(0);
});

test('there is one view, and no selector offering to change it', async ({ page }) => {
  await load(page);

  await expect(page.getByRole('button', { name: 'Overview' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Interactive journey' })).toHaveCount(0);
});

test('edges run between the nodes, not through them', async ({ page }) => {
  await load(page);

  const gap = await page.evaluate(() => {
    const chart = document.querySelector('.flow-chart')!;
    const nodes = [...chart.querySelectorAll('.flow-node')].map((n) => n.getBoundingClientRect());
    const first = nodes[0]!;
    const next = nodes.filter((box) => box.left > first.right).sort((a, b) => a.left - b.left)[0]!;
    const line = chart.querySelector('.flow-edge')!.getBoundingClientRect();

    return { fromRight: first.right, toLeft: next.left, left: line.left, right: line.right };
  });

  expect(gap.left).toBeGreaterThanOrEqual(gap.fromRight - 1);
  expect(gap.right).toBeLessThanOrEqual(gap.toLeft + 1);
});

test('choosing a node lights it, its neighbours, and the edges between', async ({ page }) => {
  await load(page);

  await page.getByRole('button', { name: 'Coverage >= 80%?' }).click();

  await expect(page.locator('.flow-node[data-lit="true"]')).toHaveText([
    'Unit tests',
    'Coverage >= 80%?',
    'Report and stop',
    'Build bundle',
  ]);

  // Lit and unlit have to be tellable apart on screen, not just in the markup.
  const contrast = await page.evaluate(() => {
    const opacity = (selector: string) =>
      Number(getComputedStyle(document.querySelector(selector)!).opacity);
    return {
      on: opacity('.flow-node[data-lit="true"]'),
      off: opacity('.flow-node[data-lit="false"]'),
      onEdge: opacity('.flow-edge[data-lit="true"]'),
      offEdge: opacity('.flow-edge[data-lit="false"]'),
    };
  });

  expect(contrast.on).toBeGreaterThan(contrast.off);
  expect(contrast.onEdge).toBeGreaterThan(contrast.offEdge);
});

test("a lit edge's own text stays readable over the edge it belongs to", async ({ page }) => {
  await load(page);
  await page.getByRole('button', { name: 'Coverage >= 80%?' }).click();

  const layers = await page.evaluate(() => {
    const layer = (selector: string) =>
      Number(getComputedStyle(document.querySelector(selector)!).zIndex);
    return {
      label: layer('.flow-edge__label[data-lit="true"]'),
      lines: layer('.flow-chart__lines'),
      column: layer('.flow-column'),
    };
  });

  /*
   * Compared between siblings only. A node's own z-index is resolved inside its
   * column's stacking context, so it is not comparable with the line layer's —
   * the column is what actually competes with the lines.
   */
  expect(layers.lines).toBeGreaterThan(layers.column);
  expect(layers.label).toBeGreaterThan(layers.lines);

  // And nothing is painted on top of it where it actually sits.
  const onTop = await page.evaluate(() => {
    const label = document.querySelector('.flow-edge__label[data-lit="true"]') as HTMLElement;

    // The label ignores pointer events by design, so it is invisible to
    // elementFromPoint as well. Turn that off for the probe only — what is
    // being checked is paint order, not whether the label is clickable.
    const restore = label.style.pointerEvents;
    label.style.pointerEvents = 'auto';

    const box = label.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    label.style.pointerEvents = restore;

    return label === hit || label.contains(hit);
  });

  expect(onTop).toBe(true);
});

test('choosing the same node again clears the selection', async ({ page }) => {
  await load(page);
  const node = page.getByRole('button', { name: 'Coverage >= 80%?' });

  await node.click();
  await expect(page.locator('.flow-chart')).toHaveAttribute('data-selecting', 'true');

  await node.click();
  await expect(page.locator('.flow-chart')).toHaveAttribute('data-selecting', 'false');
  await expect(page.locator('.flow-node[data-lit="true"]')).toHaveCount(0);
});
