import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { parse } from '../parser/parse';
import { orderedRelations, useStepController } from './run';

describe('orderedRelations', () => {
  it('walks a dynamic diagram in its numbered order, not its written order', () => {
    const ast = parse(`C4Dynamic
    RelIndex(3, c, d, "third")
    RelIndex(1, a, b, "first")
    RelIndex(2, b, c, "second")`);

    expect(orderedRelations(ast).map((relation) => relation.label)).toEqual([
      'first',
      'second',
      'third',
    ]);
  });

  it('falls back to declaration order where no number was given', () => {
    const ast = parse('C4Dynamic\nRel(a, b, "one")\nRel(b, c, "two")');
    expect(orderedRelations(ast).map((r) => r.label)).toEqual(['one', 'two']);
  });

  it('is empty for a static diagram, which is a map rather than a run', () => {
    expect(orderedRelations(parse('C4Context\nRel(a, b, "x")'))).toEqual([]);
  });
});

describe('useStepController', () => {
  it('lands on the correct sequential index after two synchronous next() calls in one tick', () => {
    const { result } = renderHook(() => useStepController(3));

    // Both calls run against the very same controller instance before React
    // gets a chance to re-render between them — the shape a double-click (or
    // a host driving the controller from an effect) actually produces. A
    // `next` that closes over a stale `current` from the render that created
    // it would read -1 both times and land on 0, not 1.
    act(() => {
      result.current.controller.next();
      result.current.controller.next();
    });

    expect(result.current.current).toBe(1);
    expect(result.current.controller.current).toBe(1);
  });

  it('tells a subscribe listener every transition, including across those two synchronous calls', () => {
    const { result } = renderHook(() => useStepController(3));
    const listener = vi.fn();
    result.current.controller.subscribe(listener);

    act(() => {
      result.current.controller.next();
      result.current.controller.next();
    });

    expect(listener).toHaveBeenNthCalledWith(1, 0);
    expect(listener).toHaveBeenNthCalledWith(2, 1);
  });

  it('keeps the same controller identity across a step, so onStepController is not handed a fresh object each time', () => {
    const { result } = renderHook(() => useStepController(3));
    const first = result.current.controller;

    act(() => {
      result.current.controller.next();
    });

    expect(result.current.controller).toBe(first);
  });
});
