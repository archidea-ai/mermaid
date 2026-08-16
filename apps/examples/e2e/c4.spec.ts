import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * jsdom lays nothing out and resolves the workspace to source, so where the
 * lines land, whether a collapse re-measures them, and whether the bundle
 * carries the renderer at all can only be checked here.
 */

const load = async (page: Page, title: string) => {
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Load example' }).click();
  await page.getByRole('option', { name: title }).click();
  await expect(page.locator('.c4-chart')).toBeVisible();
};

test('the built bundle resolves C4 to the native renderer', async ({ page }) => {
  await load(page, 'Internet Banking — containers');

  // Registration has been tree-shaken out of a published build before, and
  // source-aliased tests could not see it.
  await expect(page.getByText('c4-react')).toBeVisible();
  await expect(page.locator('[data-renderer="proxy"]')).toHaveCount(0);
});

/*
 * Not "no line may cross any box" — the design never promised that. Members
 * are ordered by a barycentre pass over CSS-flowed boxes, and arcs are
 * measured between them afterwards with no obstacle routing; an unrelated box
 * can still sit between two connected ones and a long arc can still cross it.
 * That is a known, accepted consequence of laying out with CSS flow rather
 * than solving positions — it is what keeps a collapse a real reflow and the
 * containment model unit-testable without a geometry solver. What the design
 * does promise, and what `insetEndpoints` exists to guarantee, is that every
 * arc's own two ends land on the borders of the two boxes it actually joins,
 * not at their centres — that is what this test proves.
 */
test('a line leaves and lands on the borders of its own two endpoints', async ({ page }) => {
  await load(page, 'Internet Banking — containers');
  await page.getByRole('button', { name: 'Expand all' }).click();

  const clearances = await page.evaluate(() => {
    const chart = document.querySelector('.c4-chart')!;
    const svgRect = chart.querySelector('.c4-chart__lines')!.getBoundingClientRect();

    // The anchor an arc measures against: a collapsed boundary registers on
    // its own box, an open one on its header only — the same rule chart.tsx
    // itself uses when deciding what to measure.
    const boxes = [
      ...[...chart.querySelectorAll('.c4-element')].map((n) => n.getBoundingClientRect()),
      ...[...chart.querySelectorAll('.c4-boundary')].map((n) =>
        (n.getAttribute('data-collapsed') === 'true'
          ? n
          : n.querySelector('.c4-boundary__header')!
        ).getBoundingClientRect(),
      ),
    ];

    // insetEndpoints moves a point from its own box's centre out to the
    // border facing the other box — along whichever axis has the larger
    // delta, by exactly half that box's extent on that axis. So the box this
    // endpoint belongs to is whichever one it is nearest, by centre — and the
    // discriminating fact is *how far* from that centre it landed, not merely
    // that some box exists nearby: a centre-to-centre regression would still
    // be "nearest" its own box, at distance zero.
    const clearanceFromOwnCentre = (x: number, y: number) => {
      let best: { box: DOMRect; distance: number } | null = null;
      for (const box of boxes) {
        const cx = box.left + box.width / 2;
        const cy = box.top + box.height / 2;
        const distance = Math.hypot(x - cx, y - cy);
        if (!best || distance < best.distance) best = { box, distance };
      }
      return {
        distance: best!.distance,
        halfExtent: Math.min(best!.box.width, best!.box.height) / 2,
      };
    };

    return [...chart.querySelectorAll('.c4-link')].map((path) => {
      const svgPath = path as SVGPathElement;
      const start = svgPath.getPointAtLength(0);
      const end = svgPath.getPointAtLength(svgPath.getTotalLength());

      const from = clearanceFromOwnCentre(svgRect.left + start.x, svgRect.top + start.y);
      const to = clearanceFromOwnCentre(svgRect.left + end.x, svgRect.top + end.y);

      // A third of the box's own half-extent is comfortably below the real
      // inset (a full half-extent along the dominant axis) while still well
      // clear of zero, where centre-to-centre would land.
      return from.distance >= from.halfExtent / 3 && to.distance >= to.halfExtent / 3;
    });
  });

  expect(clearances.length).toBeGreaterThan(0);
  expect(clearances.every(Boolean)).toBe(true);
});

test('collapsing re-measures, so no line is left stranded', async ({ page }) => {
  await load(page, 'API Application — components');
  await page.getByRole('button', { name: 'Expand all' }).click();

  /*
   * One named line, present on both sides of the collapse — not `.first()`
   * across a Collapse all, which replaces the whole link set and so returns a
   * different path whatever the arc layer did. Shutting Domain Services leaves
   * Sign In Controller and the Single-Page Application both on the chart, so
   * this exact line survives; what must change is where it was measured to.
   */
  const line = page.locator('.c4-link[data-link="signin::spa"]');
  await expect(line).toHaveCount(1);
  const before = await line.getAttribute('d');

  await page.getByRole('button', { name: 'Collapse Domain Services' }).click();

  // The transition has to settle before the anchors are read back.
  await expect.poll(async () => line.getAttribute('d')).not.toBe(before);
  await expect(line).toHaveCount(1);
});

test('a count badge sits on its own line', async ({ page }) => {
  await load(page, 'Big Bank plc — system context');

  const badge = page.locator('.c4-link__label[data-aggregate="true"]').first();
  await expect(badge).toBeVisible();

  /*
   * Against the path's own geometry, not its bounding box: a long diagonal's
   * bounding box covers much of the chart, so a badge anywhere in that
   * rectangle — nowhere near the curve — passed. And against *its own* path,
   * named by data-link, rather than `some()` over every line on the chart.
   */
  const offsets = await page.evaluate(() => {
    const chart = document.querySelector('.c4-chart')!;
    const svgRect = chart.querySelector('.c4-chart__lines')!.getBoundingClientRect();

    return [...chart.querySelectorAll('.c4-link__label[data-aggregate="true"]')].map((label) => {
      const id = label.getAttribute('data-link');
      const path = chart.querySelector(`.c4-link[data-link="${id}"]`) as SVGPathElement | null;
      if (!path) return Number.POSITIVE_INFINITY;

      const middle = path.getPointAtLength(path.getTotalLength() / 2);
      const box = label.getBoundingClientRect();

      return Math.hypot(
        box.left + box.width / 2 - (svgRect.left + middle.x),
        box.top + box.height / 2 - (svgRect.top + middle.y),
      );
    });
  });

  expect(offsets.length).toBeGreaterThan(0);
  // The badge is centred on the arc's midpoint, so a couple of pixels of
  // rounding is the whole budget — a badge sitting anywhere else fails.
  for (const offset of offsets) expect(offset).toBeLessThan(3);
});

/*
 * Measured on boxes inside `.c4-chart`, not on `.c4-toolbar`: the toolbar is
 * the renderer root's first child and the chart sits below it, so nothing the
 * chart could possibly do would move it — the old assertion held under every
 * regression, including one that reflowed the whole chart.
 *
 * And measured against the chart's own content box rather than the viewport,
 * because clicking a control scrolls `.c4-view` to keep it visible: that moves
 * every viewport coordinate on the page without one box having moved.
 *
 * This is not free. `orderMembers` is re-run over the *link set*, which
 * `buildLinks` rebuilds on every collapse — so member order is genuinely
 * recomputed here and could reflow the row. What has to hold is that nothing
 * laid out before the box being shut moves at all.
 */
test('a collapse leaves everything laid out before it exactly where it was', async ({ page }) => {
  await load(page, 'API Application — components');
  await page.getByRole('button', { name: 'Expand all' }).click();

  const places = () =>
    page.evaluate(() => {
      const chart = document.querySelector('.c4-chart')!;
      const origin = chart.getBoundingClientRect();

      return Object.fromEntries(
        [...chart.querySelectorAll('.c4-element')].map((node) => {
          const box = node.getBoundingClientRect();
          return [
            node.querySelector('.c4-element__name')!.textContent!,
            [Math.round(box.x - origin.x), Math.round(box.y - origin.y)] as const,
          ];
        }),
      );
    });

  const before = await places();
  // Located structurally, not by accessible name: the chevron renames itself
  // to "Expand …" the moment it is clicked.
  await page
    .locator('.c4-boundary .c4-boundary > .c4-boundary__header > .c4-boundary__toggle')
    .click();
  const after = await places();

  // The three root boxes, and the two controllers ahead of Domain Services
  // inside API Application. What follows it is free to close up — that is the
  // collapse doing its job.
  for (const name of [
    'Database',
    'Mainframe Banking System',
    'E-mail System',
    'Sign In Controller',
    'Accounts Summary Controller',
  ]) {
    expect(after[name], name).toEqual(before[name]);
  }
});

test('picking a relation in the modal opens both ends and lights it', async ({ page }) => {
  await load(page, 'Big Bank plc — system context');

  await page.locator('.c4-link__label[data-aggregate="true"]').first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  await dialog.getByRole('button').first().click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.c4-link[data-lit="true"]')).toHaveCount(1);
});

test('the dialog traps focus and Escape closes it', async ({ page }) => {
  await load(page, 'Big Bank plc — system context');

  await page.locator('.c4-link__label[data-aggregate="true"]').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('a dynamic run steps, and each step opens what hides it', async ({ page }) => {
  await load(page, 'Reset password — the order of calls');

  // Scoped to the chart: the raw source — including this very component name
  // — sits in a textarea elsewhere on the page.
  const chart = page.locator('.c4-chart');
  await expect(chart.getByText('Reset Password Controller')).toHaveCount(0);
  await page.getByRole('button', { name: 'Next step' }).click();
  await expect(chart.getByText('Reset Password Controller')).toBeVisible();
});

test('every C4 example renders natively rather than proxying', async ({ page }) => {
  for (const title of [
    'Big Bank plc — system context',
    'Internet Banking — containers',
    'API Application — components',
    'Internet Banking — production deployment',
    'Reset password — the order of calls',
  ]) {
    await load(page, title);
    await expect(page.locator('[data-renderer="proxy"]')).toHaveCount(0);
  }
});
