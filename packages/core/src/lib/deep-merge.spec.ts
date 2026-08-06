import { describe, expect, it } from 'vitest';
import { deepMerge } from './deep-merge';

describe('deepMerge', () => {
  it('merges nested plain objects instead of replacing them', () => {
    expect(
      deepMerge(
        { theme: 'dark', sequence: { showSequenceNumbers: true, mirrorActors: true } },
        { sequence: { mirrorActors: false } },
      ),
    ).toEqual({ theme: 'dark', sequence: { showSequenceNumbers: true, mirrorActors: false } });
  });

  it('replaces arrays wholesale rather than concatenating them', () => {
    expect(deepMerge({ fontFamily: ['a', 'b'] }, { fontFamily: ['c'] })).toEqual({
      fontFamily: ['c'],
    });
  });

  it('lets the patch win for scalars and explicit null', () => {
    expect(deepMerge({ a: 1, b: 2 }, { a: 9, b: null })).toEqual({ a: 9, b: null });
  });

  it('ignores undefined patch values so an absent option cannot erase a set one', () => {
    expect(deepMerge({ theme: 'dark' }, { theme: undefined })).toEqual({ theme: 'dark' });
  });

  it('does not mutate either input', () => {
    const base = { nested: { keep: true } };
    const patch = { nested: { added: 1 } };

    deepMerge(base, patch);

    expect(base).toEqual({ nested: { keep: true } });
    expect(patch).toEqual({ nested: { added: 1 } });
  });

  it('replaces rather than merges class instances', () => {
    const replacement = new Date(0);
    expect(deepMerge({ when: new Date(1) }, { when: replacement }).when).toBe(replacement);
  });
});
