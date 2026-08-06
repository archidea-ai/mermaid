import { describe, expect, it } from 'vitest';
import { createBindings, replayEffects } from './bindings';

describe('bindings', () => {
  it('is immutable — with() returns a new object and leaves the original alone', () => {
    const original = createBindings({ a: 1 });
    const next = original.with('b', 2);

    expect(original.has('b')).toBe(false);
    expect(next.get('a')).toBe(1);
    expect(next.get('b')).toBe(2);
  });

  it('removes a binding without touching the original', () => {
    const original = createBindings({ a: 1 });
    expect(original.without('a').has('a')).toBe(false);
    expect(original.has('a')).toBe(true);
  });
});

describe('replayEffects', () => {
  const effects = [
    [{ name: 'stage', value: 'one' as const }],
    [],
    [{ name: 'stage', value: 'two' as const }],
    [{ name: 'extra', value: 42 }],
  ];

  it('applies only effects up to the given index', () => {
    expect(replayEffects(effects, 0, createBindings()).get('stage')).toBe('one');
    expect(replayEffects(effects, 1, createBindings()).get('stage')).toBe('one');
    expect(replayEffects(effects, 2, createBindings()).get('stage')).toBe('two');
  });

  it('restores the earlier value when replaying to an earlier index', () => {
    const late = replayEffects(effects, 3, createBindings());
    const early = replayEffects(effects, 1, createBindings());

    expect(late.get('stage')).toBe('two');
    expect(late.get('extra')).toBe(42);
    expect(early.get('stage')).toBe('one');
    expect(early.has('extra')).toBe(false);
  });

  it('is path independent — the same index always yields the same bindings', () => {
    expect(replayEffects(effects, 2, createBindings()).entries()).toEqual(
      replayEffects(effects, 2, createBindings()).entries(),
    );
  });

  it('keeps viewer-supplied bindings, which are seeds rather than effects', () => {
    const seeded = replayEffects(effects, 3, createBindings({ role: 'admin' }));
    expect(seeded.get('role')).toBe('admin');
  });

  it('replays to -1 as no effects at all', () => {
    expect(replayEffects(effects, -1, createBindings()).entries()).toEqual([]);
  });
});
