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

test('the modern view shows bound values, not reference names', async ({ page }) => {
  await page.getByRole('button', { name: 'admin', exact: true }).click();
  await page.getByRole('button', { name: 'Next step' }).click();

  const chip = page.locator('.seq-stage__label .seq-var').first();
  await expect(chip).toHaveText('admin');
  await expect(chip).toHaveAttribute('data-resolved', 'true');
  await expect(chip).toHaveAttribute('title', 'role');
});

test('the modern view is objects on a stage, with no lanes', async ({ page }) => {
  await page.getByRole('button', { name: 'admin', exact: true }).click();
  await page.getByRole('button', { name: 'Next step' }).click();

  const stage = page.locator('.seq-stage');
  await expect(stage).toBeVisible();

  // Every participant is present as a free-placed object.
  await expect(stage.locator('.seq-stage__object')).toHaveCount(3);
  // None of the lane machinery survives here.
  await expect(page.locator('.seq-grid')).toHaveCount(0);
  await expect(page.locator('.seq-lifeline')).toHaveCount(0);

  // Exactly one connection is lit, and it is a curve rather than a straight run.
  await expect(stage.locator('.seq-stage__arc')).toHaveCount(1);
  const d = await stage.locator('.seq-stage__arc').getAttribute('d');
  expect(d).toMatch(/^M .* Q /);

  // Let the entrance finish, or the artefact catches a half-drawn arc.
  await page.waitForTimeout(1400);
  await page.screenshot({ path: 'e2e-results/stage.png', fullPage: true });
});

test('the call animates: the arc draws in and a packet travels it', async ({ page }) => {
  await page.getByRole('button', { name: 'admin', exact: true }).click();
  await page.getByRole('button', { name: 'Next step' }).click();

  const motion = await page.evaluate(() => {
    const arc = document.querySelector('.seq-stage__arc')!;
    const packet = document.querySelector('.seq-stage__packet animateMotion');
    return {
      animation: getComputedStyle(arc).animationName,
      dash: getComputedStyle(arc).strokeDasharray,
      packetPath: packet?.getAttribute('path') ?? null,
    };
  });

  expect(motion.animation).toBe('seq-draw');
  expect(motion.dash).not.toBe('none');
  expect(motion.packetPath).toMatch(/^M /);
});

test('sender and receiver are marked distinctly', async ({ page }) => {
  await page.getByRole('button', { name: 'admin', exact: true }).click();
  await page.getByRole('button', { name: 'Next step' }).click();

  const states = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.seq-stage__object')].map((el) => [
      el.textContent,
      el.dataset.state,
    ]),
  );

  expect(states).toEqual([
    ['User', 'sending'],
    ['API', 'receiving'],
    ['DB', 'resting'],
  ]);
});

test('motion is dropped under prefers-reduced-motion, but the arc still shows', async ({
  browser,
}) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/');
  await page.waitForSelector('.archidea-sequence');
  await page.getByRole('button', { name: 'admin', exact: true }).click();
  await page.getByRole('button', { name: 'Next step' }).click();

  const state = await page.evaluate(() => {
    const arc = document.querySelector('.seq-stage__arc')!;
    return {
      animation: getComputedStyle(arc).animationName,
      offset: getComputedStyle(arc).strokeDashoffset,
      packetShown: !!document.querySelector('.seq-stage__packet')?.checkVisibility?.(),
    };
  });

  // The connection must be fully drawn, not frozen at its starting offset.
  expect(state.animation).toBe('none');
  expect(state.offset).toBe('0px');
  expect(state.packetShown).toBe(false);
  await context.close();
});

test('the arc and label are fully visible once the entrance settles', async ({ page }) => {
  await page.getByRole('button', { name: 'admin', exact: true }).click();
  await page.getByRole('button', { name: 'Next step' }).click();
  await page.waitForTimeout(1400);

  const settled = await page.evaluate(() => {
    const arc = document.querySelector('.seq-stage__arc')!;
    const label = document.querySelector('.seq-stage__label')!;
    const arcBox = arc.getBoundingClientRect();
    return {
      arcWidth: arcBox.width,
      arcHeight: arcBox.height,
      dashoffset: getComputedStyle(arc).strokeDashoffset,
      labelOpacity: Number(getComputedStyle(label).opacity),
    };
  });

  // A stroke still offset by its dash length is an arc that never drew.
  expect(settled.dashoffset).toBe('0px');
  expect(settled.arcWidth + settled.arcHeight).toBeGreaterThan(40);
  expect(settled.labelOpacity).toBe(1);
});

test('a note takes the stage as a centred overlay', async ({ page }) => {
  // Third example carries a standalone note.
  await page.getByRole('button', { name: 'Notes, activations and lifecycle' }).click();

  const next = page.getByRole('button', { name: 'Next step' });
  for (let i = 0; i < 6; i += 1) {
    if (await page.locator('.seq-stage__overlay').count()) break;
    await next.click();
  }

  const overlay = page.locator('.seq-stage__overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay.locator('.seq-stage__scrim')).toBeVisible();

  // Let the pop settle: it animates in from 8px below.
  await page.waitForTimeout(500);

  // Centred on the floor, not anchored to a participant.
  const centring = await page.evaluate(() => {
    const floor = document.querySelector('.seq-stage__floor')!.getBoundingClientRect();
    const note = document.querySelector('.seq-stage__note')!.getBoundingClientRect();
    return {
      dx: Math.abs(note.x + note.width / 2 - (floor.x + floor.width / 2)),
      dy: Math.abs(note.y + note.height / 2 - (floor.y + floor.height / 2)),
    };
  });
  expect(centring.dx).toBeLessThan(2);
  expect(centring.dy).toBeLessThan(2);

  await page.waitForTimeout(700);
  await page.screenshot({ path: 'e2e-results/note.png', fullPage: true });
});

test('the activation shorthand does not render its message twice', async ({ page }) => {
  // Checkout uses `Client->>+Orders` and `Orders-->>-Client: 201 Created`.
  await page.getByRole('button', { name: 'Checkout — parallel work and retries' }).click();
  await page.waitForTimeout(150);

  const labels = await page.locator('.archidea-sequence button[data-emphasis]').allTextContents();

  // `Client->>+Orders: POST /checkout` emits a message step and an activate
  // step sharing one node. Before the fix the label rendered on both.
  expect(labels.filter((label) => label.includes('POST /checkout'))).toHaveLength(1);
  // The lifecycle step is still listed, named for what it is.
  expect(labels.some((label) => label.startsWith('activate'))).toBe(true);
});

test('a boolean offers both answers as buttons, each reachable in one click', async ({ page }) => {
  await page.getByRole('button', { name: 'Checkout — parallel work and retries' }).click();
  await page.getByRole('button', { name: '99' }).count(); // settle
  await page.waitForTimeout(150);

  // The amount prompt comes first; answer it so sendSms is reached.
  const amount = page.getByPlaceholder('Enter a value');
  if (await amount.count()) {
    await amount.fill('4200');
    await amount.blur();
  }

  const no = page.getByRole('button', { name: 'No', exact: true });
  const yes = page.getByRole('button', { name: 'Yes', exact: true });
  await expect(no).toBeVisible();
  await expect(yes).toBeVisible();
  await expect(page.locator('.archidea-sequence [role="switch"]')).toHaveCount(0);

  // Neither is preselected: unanswered is not the same as false.
  await expect(no).not.toHaveAttribute('aria-pressed', 'true');
  await expect(yes).not.toHaveAttribute('aria-pressed', 'true');

  // False is reachable directly, which is what a switch could not do.
  await no.click();
  await expect(page.getByRole('button', { name: 'Clear sendSms' })).toBeVisible();

  await page.screenshot({ path: 'e2e-results/boolean.png', fullPage: true });
});

test('the complex example parses natively and walks end to end', async ({ page }) => {
  await page.getByRole('button', { name: /Access lifecycle/ }).click();
  await page.waitForTimeout(200);

  // Native renderer, not a proxy fallback — the whole point of a hard example.
  await expect(page.locator('.app__badge')).toContainText('sequence-react');
  await expect(page.locator('.seq-stage__object')).toHaveCount(8);

  // A <br/> in a participant name is a line break, not four literal characters.
  await expect(page.locator('.seq-stage__object', { hasText: 'Directory' })).not.toContainText(
    '<br',
  );

  let filledText = false;

  // Walk the whole diagram, answering whatever it asks for as it asks.
  for (let guard = 0; guard < 90; guard += 1) {
    // Scoped to the Values panel: the view toggle is also an aria-pressed group,
    // and an unscoped selector walked the diagram by flipping views instead.
    const values = page.locator('[data-slot="card"]', { hasText: 'Values' });
    const choice = values.locator('button[aria-pressed="false"]');
    if (await choice.count()) {
      await choice.first().click();
      continue;
    }

    const text = values.getByPlaceholder('Enter a value');
    if ((await text.count()) && !filledText) {
      await text.first().fill('subject-1');
      await text.first().blur();
      filledText = true;
      continue;
    }

    // A prose-labelled branch is viewer-chosen by design.
    const branch = page
      .locator('[data-slot="card"]', { hasText: 'Choose a path' })
      .locator('button', { hasText: /Low risk|Elevated risk|Revoke|Keep|otherwise/ });
    if (await branch.count()) {
      await branch.first().click();
      continue;
    }

    const next = page.getByRole('button', { name: 'Next step' });
    if (await next.isDisabled()) break;
    await next.click();
  }

  // It reached the end of a long run rather than stalling on an unanswered prompt.
  const counter = await page
    .locator('.archidea-sequence span')
    .filter({ hasText: /^\d+ \/ \d+$/ })
    .first()
    .textContent();
  const [current, total] = counter!.split('/').map((part) => Number(part.trim()));
  expect(total).toBeGreaterThan(15);
  expect(current).toBe(total);

  await page.waitForTimeout(900);
  await page.screenshot({ path: 'e2e-results/complex.png', fullPage: true });
});

test('the complex example renders its groups in the classic view', async ({ page }) => {
  await page.getByRole('button', { name: /Access lifecycle/ }).click();
  await toClassic(page);
  await page.waitForTimeout(200);

  await expect(page.locator('.seq-lifeline')).toHaveCount(8);
  // A rect region must not print its colour as the frame label.
  const labels = await page.locator('.seq-fragment__label').allTextContents();
  expect(labels.some((label) => label.includes('rgb('))).toBe(false);

  await page.screenshot({ path: 'e2e-results/complex-classic.png', fullPage: true });
});

test('participants are shown in the groups their author declared', async ({ page }) => {
  await page.getByRole('button', { name: /Access lifecycle/ }).click();
  await page.waitForTimeout(250);

  const groups = page.locator('.seq-stage__group');
  await expect(groups).toHaveCount(4);
  await expect(groups.nth(0)).toContainText('Requesting side');
  await expect(groups.nth(0).locator('.seq-stage__object')).toHaveCount(2);

  // Grouped, not scattered: no object may overlap another.
  const boxes = await page.evaluate(() =>
    [...document.querySelectorAll('.seq-stage__object')].map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
    }),
  );
  expect(boxes).toHaveLength(8);
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      const overlaps = a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom;
      expect(overlaps, `objects ${i} and ${j} overlap`).toBe(false);
    }
  }

  await page.screenshot({ path: 'e2e-results/groups.png', fullPage: true });
});

test('a phase note renders as a full-width banner, not a sticky note', async ({ page }) => {
  await page.getByRole('button', { name: /Access lifecycle/ }).click();
  await page.getByRole('button', { name: 'Next step' }).click();

  const banner = page.locator('.seq-stage__banner');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('Phase 1');
  // A heading for the run, not an overlay demanding dismissal.
  await expect(page.locator('.seq-stage__overlay')).toHaveCount(0);

  const width = await page.evaluate(() => {
    const stage = document.querySelector('.seq-stage')!.getBoundingClientRect();
    const el = document.querySelector('.seq-stage__banner')!.getBoundingClientRect();
    return el.width / stage.width;
  });
  expect(width).toBeGreaterThan(0.98);

  // It marks a section, so it stays up through that section's steps. Answer
  // whatever the run asks for so it can actually advance.
  const values = page.locator('[data-slot="card"]', { hasText: 'Values' });
  for (let i = 0; i < 6; i += 1) {
    const next = page.getByRole('button', { name: 'Next step' });
    if (await next.isDisabled()) {
      const choice = values.locator('button[aria-pressed="false"]');
      if (await choice.count()) {
        await choice.first().click();
        continue;
      }
      const text = values.getByPlaceholder('Enter a value');
      if (await text.count()) {
        await text.first().fill('subject-1');
        await text.first().blur();
        continue;
      }
      break;
    }
    await next.click();
    await expect(banner).toContainText('Phase 1');
  }
  await expect(page.locator('.seq-stage__banner')).toHaveCount(1);
});

test('the banner is not displaced while its entrance animation plays', async ({ page }) => {
  await page.getByRole('button', { name: /Access lifecycle/ }).click();
  await page.getByRole('button', { name: 'Next step' }).click();

  // Sampled mid-animation: a keyframe carrying a centring translate drags a
  // static block up and left by half its size for the whole animation.
  const offsets: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    offsets.push(
      await page.evaluate(() => {
        const floor = document.querySelector('.seq-stage__floor')!.getBoundingClientRect();
        const banner = document.querySelector('.seq-stage__banner')!.getBoundingClientRect();
        return banner.left - floor.left;
      }),
    );
    await page.waitForTimeout(70);
  }

  for (const offset of offsets) expect(Math.abs(offset)).toBeLessThan(2);
});

test('the examples app puts the source above the diagram', async ({ page }) => {
  const positions = await page.evaluate(() => {
    const source = document.querySelector('.app__source')!.getBoundingClientRect();
    const diagram = document.querySelector('.archidea-sequence')!.getBoundingClientRect();
    return { sourceBottom: source.bottom, diagramTop: diagram.top, diagramWidth: diagram.width };
  });

  expect(positions.diagramTop).toBeGreaterThan(positions.sourceBottom);
  // And the diagram gets the full width rather than sharing a column.
  expect(positions.diagramWidth).toBeGreaterThan(700);
});

test('a long step list scrolls instead of spilling over the skipped section', async ({ page }) => {
  await page.getByRole('button', { name: /Access lifecycle/ }).click();
  await page.waitForTimeout(200);

  // Answer the prompts so the timeline runs long enough to overflow, and a
  // skipped region exists below the list.
  const values = page.locator('[data-slot="card"]', { hasText: 'Values' });
  for (let guard = 0; guard < 12; guard += 1) {
    const choice = values.locator('button[aria-pressed="false"]');
    if (await choice.count()) {
      await choice.first().click();
      continue;
    }
    const text = values.getByPlaceholder('Enter a value');
    if (await text.count()) {
      await text.first().fill('subject-1');
      await text.first().blur();
      continue;
    }
    break;
  }
  await page.waitForTimeout(200);

  const geometry = await page.evaluate(() => {
    const list = document.querySelector('.seq-steps') as HTMLElement;
    const skipped = [...document.querySelectorAll('*')].find(
      (el) => el.children.length === 0 && el.textContent?.trim() === 'Skipped',
    );
    const listBox = list.getBoundingClientRect();
    return {
      scrolls: list.scrollHeight > list.clientHeight,
      overflowY: getComputedStyle(list).overflowY,
      listBottom: listBox.bottom,
      skippedTop: skipped ? skipped.getBoundingClientRect().top : null,
      // Content must be clipped to the box, not painted past it.
      contentOverhang: listBox.height - list.clientHeight,
    };
  });

  expect(geometry.overflowY).toBe('auto');
  expect(geometry.scrolls).toBe(true);
  expect(geometry.contentOverhang).toBeLessThanOrEqual(2);

  // The skipped heading starts below the list, never underneath it.
  if (geometry.skippedTop !== null) {
    expect(geometry.skippedTop).toBeGreaterThanOrEqual(geometry.listBottom - 1);
  }

  await page.screenshot({ path: 'e2e-results/steps.png', fullPage: true });
});

test('a newly required value takes focus and announces itself', async ({ page }) => {
  await page.getByRole('button', { name: /Access lifecycle/ }).click();
  await page.waitForTimeout(250);

  const focused = await page.evaluate(() => {
    const active = document.activeElement;
    return {
      insidePrompt: !!active?.closest('.seq-prompt'),
      animation: getComputedStyle(document.querySelector('.seq-prompt')!).animationName,
    };
  });

  expect(focused.insidePrompt).toBe(true);
  expect(focused.animation).toBe('seq-attention');
});

test('the next button pulses when an answer unblocks the run', async ({ page }) => {
  // The login example blocks on its very first step; the access one opens on a
  // phase note, which is not waiting for anything.
  await page.waitForTimeout(200);

  await expect(page.locator('.seq-next')).toBeDisabled();
  await page
    .locator('[data-slot="card"]', { hasText: 'Values' })
    .getByRole('button')
    .first()
    .click();

  const pulse = await page.evaluate(
    () => getComputedStyle(document.querySelector('.seq-next')!).animationName,
  );
  expect(pulse).toBe('seq-unblocked');
  await expect(page.locator('.seq-next')).toBeEnabled();
});

test('attention cues collapse under prefers-reduced-motion', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/');
  await page.waitForSelector('.archidea-sequence');
  await page.getByRole('button', { name: /Access lifecycle/ }).click();
  await page.waitForTimeout(200);

  // The cue is still a state change — it just does not move.
  const animation = await page.evaluate(
    () => getComputedStyle(document.querySelector('.seq-prompt')!).animationName,
  );
  expect(animation).toBe('none');

  // Focus is not motion, so it still happens.
  expect(await page.evaluate(() => !!document.activeElement?.closest('.seq-prompt'))).toBe(true);
  await context.close();
});

test('a branch decision is highlighted and takes focus', async ({ page }) => {
  await page.getByRole('button', { name: /Access lifecycle/ }).click();
  await page.waitForTimeout(200);

  // Answer values until only the prose-labelled branch is left outstanding.
  const values = page.locator('[data-slot="card"]', { hasText: 'Values' });
  for (let guard = 0; guard < 14; guard += 1) {
    if (await page.locator('.seq-decision').count()) break;
    const choice = values.locator('button[aria-pressed="false"]');
    if (await choice.count()) {
      await choice.first().click();
      continue;
    }
    const text = values.getByPlaceholder('Enter a value');
    if (await text.count()) {
      await text.first().fill('subject-1');
      await text.first().blur();
      continue;
    }
    const next = page.getByRole('button', { name: 'Next step' });
    if (await next.isDisabled()) break;
    await next.click();
  }

  const decision = page.locator('.seq-decision');
  await expect(decision).toBeVisible();

  const state = await page.evaluate(() => {
    const panel = document.querySelector('.seq-decision')!;
    const card = document.querySelector('.seq-decision-card')!;
    return {
      animation: getComputedStyle(panel).animationName,
      outline: getComputedStyle(card).outlineStyle,
      focusInside: !!document.activeElement?.closest('.seq-decision'),
    };
  });

  expect(state.animation).toBe('seq-attention');
  expect(state.outline).not.toBe('none');
  expect(state.focusInside).toBe(true);

  await page.screenshot({ path: 'e2e-results/decision.png', fullPage: true });
});

test('a state diagram shows only where you are and the ways out', async ({ page }) => {
  await page.getByRole('button', { name: /Order state machine/ }).click();
  await page.waitForTimeout(250);

  await expect(page.locator('.app__badge')).toContainText('state-react');

  // One current state, not the whole machine.
  await expect(page.locator('.state-view__now .seq-stage__object')).toHaveCount(1);
  await expect(page.locator('.state-view__now')).toContainText('Draft');

  // One clickable option per way out, each joined by a drawn line.
  const options = page.locator('.state-option');
  await expect(options).toHaveCount(1);
  await expect(page.locator('.state-line')).toHaveCount(1);

  await options.first().click();
  await page.waitForTimeout(200);
  await expect(page.locator('.state-view__now')).toContainText('Submitted');
});

test('clicking a line at a choice takes that branch', async ({ page }) => {
  await page.getByRole('button', { name: /Order state machine/ }).click();
  await page.waitForTimeout(200);

  // Walk to the <<choice>>, which offers both risk branches.
  for (let i = 0; i < 4; i += 1) {
    const options = page.locator('.state-option');
    if ((await options.count()) > 1) break;
    await options.first().click();
    await page.waitForTimeout(120);
  }

  const options = page.locator('.state-option');
  await expect(options).toHaveCount(2);
  await expect(page.locator('.state-line')).toHaveCount(2);

  await options.nth(1).click();
  await page.waitForTimeout(200);
  await expect(page.locator('.state-view__now')).toContainText('Review');
  await expect(page.locator('.archidea-sequence')).toContainText('Path taken');
});

test('a compound state is drawn as a box, and nested ones as boxes inside boxes', async ({
  page,
}) => {
  await page.getByRole('button', { name: /Deployment machine/ }).click();
  await page.waitForTimeout(250);

  // Top level: no enclosing box.
  await expect(page.locator('.state-box')).toHaveCount(0);
  await expect(page.locator('.state-view__now')).toContainText('Queued');

  // Step into Building — one box.
  await page.locator('.state-option').first().click();
  await page.waitForTimeout(200);
  await expect(page.locator('.state-box')).toHaveCount(1);
  await expect(page.locator('.state-box__title').first()).toContainText('Building');

  // Step into Testing, nested inside Building — two boxes, outermost first.
  await page.locator('.state-option').first().click();
  await page.waitForTimeout(200);
  const titles = await page.locator('.state-box__title').allTextContents();
  expect(titles).toEqual(['Building', 'Testing']);

  // And they really are nested, not siblings.
  const nested = await page.evaluate(() => !!document.querySelector('.state-box .state-box'));
  expect(nested).toBe(true);

  await page.screenshot({ path: 'e2e-results/state-nested.png', fullPage: true });
});

test('an end is red, named, and offers nothing further', async ({ page }) => {
  await page.getByRole('button', { name: /Order state machine/ }).click();
  await page.waitForTimeout(200);

  // Walk to an end.
  for (let i = 0; i < 12; i += 1) {
    const options = page.locator('.state-option');
    if ((await options.count()) === 0) break;
    await options.first().click();
    await page.waitForTimeout(120);
  }

  const now = page.locator('.state-view__now .seq-stage__object');
  await expect(now).toHaveAttribute('data-terminal', 'true');
  await expect(now).toContainText('End');

  // `[*]` is both start and end; an end must not offer the start's transitions.
  await expect(page.locator('.state-option')).toHaveCount(0);
  await expect(page.locator('.state-view__next')).toContainText('end of the run');

  const colour = await page.evaluate(() => {
    const el = document.querySelector('.state-view__now .seq-stage__object')!;
    return getComputedStyle(el).borderTopColor;
  });
  // Red, and distinct from the accent used everywhere else.
  expect(colour).not.toBe('rgb(129, 140, 248)');

  await page.screenshot({ path: 'e2e-results/state-end.png', fullPage: true });
});

test('a substate end is named for the machine it ends', async ({ page }) => {
  await page.getByRole('button', { name: /Deployment machine/ }).click();
  await page.waitForTimeout(200);

  // Into Building, into Testing, then take the failing branch to Testing's end.
  await page.locator('.state-option').first().click();
  await page.waitForTimeout(150);
  await page.locator('.state-option').first().click();
  await page.waitForTimeout(150);

  const labels = await page.locator('.state-option .seq-stage__name').allTextContents();
  // Every option is a real state here; ends carry the machine they finish.
  for (const label of labels) {
    if (label.startsWith('End')) expect(label).toMatch(/^End of /);
  }
});

test('a subgroup end offers the parent ways out; only the top-level end stops', async ({
  page,
}) => {
  await page.getByRole('button', { name: /Deployment machine/ }).click();
  await page.waitForTimeout(200);

  // Walk until we are standing on a subgroup end.
  let sawSubgroupEnd = false;
  for (let i = 0; i < 14; i += 1) {
    const now = page.locator('.state-view__now .seq-stage__object');
    const text = (await now.textContent()) ?? '';
    if (text.startsWith('End of')) {
      sawSubgroupEnd = true;
      // It reads as an end — it is one — but it does not stop the flow: the
      // machine around it still has ways out, and those are offered.
      await expect(now).toHaveAttribute('data-terminal', 'true');
      expect(await page.locator('.state-option').count()).toBeGreaterThan(0);
      await expect(page.locator('.state-view__next')).not.toContainText('end of the run');
      break;
    }
    // Stay inside the composite: an option tagged "leaves X" is an escape and
    // would jump straight out, never reaching the subgroup's own end. Among the
    // local moves take the last, which is the failing branch into `Failed --> [*]`.
    const local = page.locator('.state-option').filter({
      hasNot: page.locator('.state-option__from'),
    });
    const count = await local.count();
    if (count === 0) break;
    await local.nth(count - 1).click();
    await page.waitForTimeout(120);
  }

  expect(sawSubgroupEnd, 'never reached a subgroup end').toBe(true);
});

test('the raw scoped-terminal token never reaches the screen', async ({ page }) => {
  await page.getByRole('button', { name: /Deployment machine/ }).click();
  await page.waitForTimeout(200);

  for (let i = 0; i < 14; i += 1) {
    const rendered = await page.locator('.archidea-sequence').innerText();
    expect(rendered, 'internal terminal id leaked into the UI').not.toContain('[*]@');
    expect(rendered).not.toMatch(/\[\*\](?!@)/);

    const options = page.locator('.state-option');
    const count = await options.count();
    if (count === 0) break;
    await options.nth(count - 1).click();
    await page.waitForTimeout(120);
  }
});

test('a transition on an enclosing state can be taken from inside it', async ({ page }) => {
  await page.getByRole('button', { name: /Deployment machine/ }).click();
  await page.waitForTimeout(250);

  // Step into Building.
  await page.locator('.state-option').first().click();
  await page.waitForTimeout(150);

  // From inside, Building's own escape is on offer and says where it leaves from.
  const escape = page.locator('.state-option', { hasText: 'abort' });
  await expect(escape).toBeVisible();
  await expect(escape.locator('.state-option__from')).toContainText('Building');

  // A local move carries no such tag.
  const local = page.locator('.state-option').first();
  await expect(local.locator('.state-option__from')).toHaveCount(0);

  await escape.click();
  await page.waitForTimeout(200);
  await expect(page.locator('.state-view__now')).toContainText('Cancelled');
  // Leaving the composite drops its box.
  await expect(page.locator('.state-box')).toHaveCount(0);

  await page.screenshot({ path: 'e2e-results/state-escape.png', fullPage: true });
});

test('the state view shows no step counter, since a loop has no total', async ({ page }) => {
  await page.getByRole('button', { name: /Order state machine/ }).click();
  await page.waitForTimeout(200);

  const toolbar = await page.locator('.archidea-sequence').innerText();
  // A denominator would be invented, and one that changes as you choose reads
  // as progress going backwards.
  expect(toolbar).not.toMatch(/\d+\s*\/\s*\d+/);

  // The history is still there, in the panel that can express it honestly.
  await expect(page.locator('.archidea-sequence')).toContainText('Path taken');
});
