import { defineConfig, devices } from '@playwright/test';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

/**
 * Real-browser checks for what jsdom cannot see.
 *
 * jsdom implements no CSS Grid layout, so unit tests can assert structure but
 * never geometry — and they resolve workspace packages to source, so they never
 * exercise the bundled artefact either. Both blind spots have already shipped
 * bugs: registration tree-shaken out of the build, and arrows drawn column-edge
 * to column-edge instead of lifeline centre to lifeline centre.
 */
export default defineConfig({
  testDir: `${root}/e2e`,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'list' : [['list']],
  use: {
    baseURL: 'http://localhost:4173/mermaid/',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm exec vite preview --port 4173 --strictPort',
    cwd: root,
    url: 'http://localhost:4173/mermaid/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
