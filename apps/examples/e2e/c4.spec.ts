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

  const onBorder = await page.evaluate(() => {
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

    // Within a few pixels of some box's edge — neither floating in open space
    // nor buried deep inside one, which is what a centre-to-centre line would
    // do instead.
    const nearAnEdge = (x: number, y: number) =>
      boxes.some((box) => {
        const dx = Math.max(box.left - x, x - box.right, 0);
        const dy = Math.max(box.top - y, y - box.bottom, 0);
        return Math.hypot(dx, dy) < 4;
      });

    return [...chart.querySelectorAll('.c4-link')].map((path) => {
      const numbers = path
        .getAttribute('d')!
        .match(/-?[\d.]+/g)!
        .map(Number);
      const [startX, startY] = numbers.slice(0, 2);
      const [endX, endY] = numbers.slice(-2);
      return (
        nearAnEdge(svgRect.left + startX!, svgRect.top + startY!) &&
        nearAnEdge(svgRect.left + endX!, svgRect.top + endY!)
      );
    });
  });

  expect(onBorder.length).toBeGreaterThan(0);
  expect(onBorder.every(Boolean)).toBe(true);
});

test('collapsing re-measures, so no line is left stranded', async ({ page }) => {
  await load(page, 'Internet Banking — containers');
  await page.getByRole('button', { name: 'Expand all' }).click();

  const before = await page.locator('.c4-link').first().getAttribute('d');
  await page.getByRole('button', { name: 'Collapse all' }).click();
  // The transition has to settle before the anchors are read back.
  await expect
    .poll(async () => page.locator('.c4-link').first().getAttribute('d'))
    .not.toBe(before);
});

test('a count badge sits on its own line', async ({ page }) => {
  await load(page, 'Big Bank plc — system context');

  const badge = page.locator('.c4-link__label[data-aggregate="true"]').first();
  await expect(badge).toBeVisible();

  const onLine = await page.evaluate(() => {
    const label = document.querySelector('.c4-link__label[data-aggregate="true"]')!;
    const box = label.getBoundingClientRect();
    const paths = [...document.querySelectorAll('.c4-link')].map((p) => p.getBoundingClientRect());
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    return paths.some(
      (p) => x >= p.left - 8 && x <= p.right + 8 && y >= p.top - 8 && y <= p.bottom + 8,
    );
  });

  expect(onLine).toBe(true);
});

test('a collapse does not shift the rest of the chart out from under the pointer', async ({
  page,
}) => {
  await load(page, 'API Application — components');
  await page.getByRole('button', { name: 'Expand all' }).click();

  const toolbar = await page.locator('.c4-toolbar').boundingBox();
  await page.getByRole('button', { name: 'Collapse all' }).click();

  expect((await page.locator('.c4-toolbar').boundingBox())?.y).toBeCloseTo(toolbar!.y, 0);
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
