import { describe, expect, it } from 'vitest';
import upstream from 'mermaid';
import facade from './index';

/**
 * Documented, intentional omissions. Keep this empty if possible — each entry is
 * a place the drop-in is not actually a drop-in, and must be justified here and
 * in the README. Loosening this set is how the guarantee silently rots.
 */
const INTENTIONAL_OMISSIONS = new Set<string>([]);

const upstreamKeys = () =>
  Object.keys(upstream as object).filter((key) => !INTENTIONAL_OMISSIONS.has(key));

describe('drop-in parity with upstream mermaid', () => {
  it('exposes a superset of upstream default-export keys', () => {
    const facadeKeys = new Set(Object.keys(facade));
    expect(upstreamKeys().filter((key) => !facadeKeys.has(key))).toEqual([]);
  });

  it('exposes every upstream function as a function of the same name', () => {
    const mismatched = upstreamKeys().filter((key) => {
      const upstreamValue = (upstream as Record<string, unknown>)[key];
      if (typeof upstreamValue !== 'function') return false;
      return typeof (facade as unknown as Record<string, unknown>)[key] !== 'function';
    });

    expect(mismatched).toEqual([]);
  });
});
