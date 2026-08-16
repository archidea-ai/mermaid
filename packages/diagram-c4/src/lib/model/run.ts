import { useCallback, useMemo, useRef, useState } from 'react';
import type { StepController } from '@archidea-ai/mermaid-core';
import type { C4Ast, C4Relation } from '../parser/ast';

/**
 * A dynamic diagram's relations, in the order they happen.
 *
 * Static C4 has no run: it is a map, and pretending otherwise would give the
 * transport steps that mean nothing.
 */
export function orderedRelations(ast: C4Ast): readonly C4Relation[] {
  if (ast.kind !== 'dynamic') return [];
  return [...ast.relations].sort((left, right) => (left.index ?? 0) - (right.index ?? 0));
}

/**
 * A plain step controller over a fixed count.
 *
 * Not `runScenario`: a numbered C4 run has no branches, no conditions and no
 * variables, so borrowing the scenario package's decision machinery would be
 * pretence. `current` is -1 before the run starts, as the contract says.
 */
export function useStepController(count: number): {
  current: number;
  controller: StepController;
} {
  const [current, setCurrent] = useState(-1);
  const listeners = useRef(new Set<(index: number) => void>());

  // A live mirror of `current`, read by the controller's getters and by
  // `next`/`prev` below. `goTo` is the only writer — it sets this ref
  // synchronously before `setCurrent`, so two calls in the same tick (no
  // re-render between them) still see each other's result. Without it,
  // `controller` would need `current` in its own dependency list to stay
  // honest — and recomputing on every step is exactly the churn this hook
  // must not produce (see the memo below).
  const currentRef = useRef(current);

  const goTo = useCallback(
    (index: number) => {
      const clamped = Math.max(-1, Math.min(index, count - 1));
      currentRef.current = clamped;
      setCurrent(clamped);
      for (const listener of listeners.current) listener(clamped);
    },
    [count],
  );

  /*
   * Stable across steps: this only recomputes when `count` changes (a new
   * source, effectively), not on every `current` change. `goTo` depends only
   * on `count`, and the getters read `currentRef` rather than closing over
   * `current`, so neither forces a step-by-step churn here. A consumer that
   * re-subscribes whenever the controller identity changes — the chart's own
   * `onStepController` effect does exactly this — would otherwise unsubscribe
   * and resubscribe on every single step.
   */
  const controller = useMemo<StepController>(
    () => ({
      get stepCount() {
        return count;
      },
      get current() {
        return currentRef.current;
      },
      goTo,
      next: () => goTo(currentRef.current + 1),
      prev: () => goTo(currentRef.current - 1),
      reset: () => goTo(-1),
      subscribe: (listener) => {
        listeners.current.add(listener);
        return () => listeners.current.delete(listener);
      },
    }),
    [count, goTo],
  );

  return { current, controller };
}
