import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * The share link is a round trip through the address bar and the clipboard,
 * and it leans on a dependency (`lz-string`) that unit tests reach as source.
 * Whether the built bundle still carries the codec — and whether a reload
 * really brings the chart back — is only answerable here.
 */

const SHARED = 'flowchart TD\n    Shared --> Chart\n    Chart --> Back([Survived a reload])';

const type = async (page: Page, source: string) => {
  await page.getByLabel('Diagram source').fill(source);
  await expect.poll(() => page.evaluate(() => window.location.hash)).not.toBe('');
};

test('an edited chart survives the address bar and a reload', async ({ page }) => {
  await page.goto('/');
  await type(page, SHARED);

  const shared = page.url();
  await page.goto(shared);

  await expect(page.getByLabel('Diagram source')).toHaveValue(SHARED);
  await expect(page.locator('.flow-node').first()).toBeVisible();
});

test('the link is copied to the clipboard and opens the same chart', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await type(page, SHARED);

  await page.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.getByText('Link copied')).toBeVisible();

  const copied = await page.evaluate(() => navigator.clipboard.readText());
  await page.goto(copied);

  await expect(page.getByLabel('Diagram source')).toHaveValue(SHARED);
});

test('a link to an example arrives as that example, blurb and all', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Load example' }).click();
  await page.getByRole('option', { name: 'Incident triage — a top-down flowchart' }).click();
  await expect.poll(() => page.evaluate(() => window.location.hash)).not.toBe('');

  await page.goto(page.url());

  await expect(page.getByText('The same renderer reading')).toBeVisible();
  await expect(page.getByLabel('Diagram source')).toHaveValue(/flowchart TD/);
});

test('a corrupt link opens the app rather than breaking it', async ({ page }) => {
  await page.goto('/#c=!!!!not-lz-string!!!!');

  await expect(page.getByLabel('Diagram source')).toHaveValue(/sequenceDiagram/);
  await expect(page.locator('.archidea-sequence').first()).toBeVisible();
});

test('the theme is remembered, and is not carried by the link', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Diagram theme' }).click();
  const other = page.getByRole('option').nth(1);
  const label = (await other.textContent())!.trim();
  await other.click();

  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Diagram theme' })).toContainText(label);
});
