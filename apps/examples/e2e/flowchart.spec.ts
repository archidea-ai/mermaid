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

  /*
   * Lit and unlit have to be tellable apart on screen, not just in the markup.
   * Retried because dimming is a transition: read the instant the class lands
   * and both are still at full opacity, which is a slow runner rather than a
   * broken highlight.
   */
  await expect(async () => {
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
  }).toPass();
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

test('a top-down chart is drawn top-down, as it was written', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Load example' }).click();
  await page.getByRole('option', { name: 'Incident triage — a top-down flowchart' }).click();
  await expect(page.locator('.flow-chart')).toHaveAttribute('data-direction', 'TB');

  const run = await page.evaluate(() => {
    const ranks = [...document.querySelectorAll('.flow-column')].map((column) =>
      column.getBoundingClientRect(),
    );
    // Centres, not left edges: the ranks are centred, so a wider rank starts
    // further left while still sitting on the same axis.
    const centres = ranks.map((box) => box.left + box.width / 2);

    return {
      descends: ranks.every((box, i) => i === 0 || box.top > ranks[i - 1]!.top),
      drift: Math.max(...centres) - Math.min(...centres),
    };
  });

  expect(run.descends).toBe(true);
  expect(run.drift).toBeLessThan(2);
});

test('every directed edge is capped with a head that paints', async ({ page }) => {
  await load(page);

  // The marker has to exist, be referenced, and actually render — a marker that
  // resolves to nothing leaves a chart that says what connects but not which
  // way anything flows, which is most of what a flowchart is for.
  const heads = await page.evaluate(() => {
    const edges = [...document.querySelectorAll('.flow-edge')];
    const referenced = edges
      .map((edge) => edge.getAttribute('marker-end'))
      .filter((value): value is string => value !== null);

    /*
     * A marker's children have no layout box of their own — they are painted
     * only as part of the path that references them — so the head is proved by
     * its geometry and its paint, not by a bounding rect.
     */
    const head = document.querySelector('marker path') as SVGPathElement;

    return {
      edges: edges.length,
      referenced: referenced.length,
      resolve: referenced.every((value) => Boolean(document.getElementById(value.slice(5, -1)))),
      geometry: head.getTotalLength(),
      // context-stroke is what makes a head take its own line's colour; a
      // browser that did not understand it would compute something else.
      fill: getComputedStyle(head).fill,
    };
  });

  expect(heads.referenced).toBe(heads.edges);
  expect(heads.resolve).toBe(true);
  expect(heads.geometry).toBeGreaterThan(0);
  expect(heads.fill).toBe('context-stroke');
});

test('Escape clears the selection', async ({ page }) => {
  await load(page);

  await page.getByRole('button', { name: 'Coverage >= 80%?' }).click();
  await expect(page.locator('.flow-chart')).toHaveAttribute('data-selecting', 'true');

  await page.keyboard.press('Escape');
  await expect(page.locator('.flow-chart')).toHaveAttribute('data-selecting', 'false');
});
