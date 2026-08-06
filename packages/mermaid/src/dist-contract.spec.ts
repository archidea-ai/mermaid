import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards the *built* artifact, not the source.
 *
 * Every other spec resolves workspace packages to source, so they cannot see
 * bundler behaviour. That blind spot let `sideEffects: false` tree-shake renderer
 * registration out of the published facade while all 175 tests stayed green.
 * This project's `test` target depends on `build`, so dist is always present.
 */
const dist = (file: string) => readFileSync(join(import.meta.dirname, '..', 'dist', file), 'utf8');

describe('built facade contract', () => {
  it.each(['index.js', 'react.js', 'registry.js'])(
    '%s imports the registration chunk and calls it',
    (entry) => {
      const source = dist(entry);
      const importMatch = source.match(
        /import\s*\{\s*\w+\s+as\s+(\w+)\s*\}\s*from\s*["']\.\/register-defaults[^"']*["']/,
      );

      expect(importMatch, `${entry} does not import the registration chunk`).not.toBeNull();

      const local = importMatch![1]!;
      const isCalled = new RegExp(`(^|[;{}\\s])${local}\\(\\)`).test(source);
      expect(isCalled, `${entry} imports registration but never calls it`).toBe(true);
    },
  );

  it('keeps the native sequence renderer reachable from the registration chunk', () => {
    const chunk = readFileSync(join(import.meta.dirname, '..', 'dist', chunkName()), 'utf8');

    expect(chunk).toContain('@archidea-ai/mermaid-diagram-sequence');
    expect(chunk).toContain('register');
  });

  it('declares sideEffects for its entry points, or bundlers drop registration', () => {
    const manifest = JSON.parse(dist('../package.json')) as { sideEffects?: unknown };

    expect(manifest.sideEffects).toEqual([
      './dist/index.js',
      './dist/react.js',
      './dist/registry.js',
    ]);
  });

  it('emits ESM only — no require() in a browser-targeted bundle', () => {
    for (const entry of ['index.js', 'react.js', 'registry.js']) {
      expect(dist(entry)).not.toMatch(/\brequire\(/);
    }
  });
});

function chunkName(): string {
  const index = dist('index.js');
  const match = index.match(/from\s*["']\.\/(register-defaults[^"']*)["']/);
  if (!match) throw new Error('registration chunk not found in index.js');
  return match[1]!;
}
