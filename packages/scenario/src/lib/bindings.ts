import type { VariableEffect } from './types';

export type VariableValue = string | number | boolean;

export interface VariableBindings {
  get(name: string): VariableValue | undefined;
  has(name: string): boolean;
  entries(): readonly (readonly [string, VariableValue])[];
  with(name: string, value: VariableValue): VariableBindings;
  without(name: string): VariableBindings;
}

export function createBindings(
  initial: Readonly<Record<string, VariableValue>> = {},
): VariableBindings {
  const values = new Map(Object.entries(initial));

  const make = (map: Map<string, VariableValue>): VariableBindings => ({
    get: (name) => map.get(name),
    has: (name) => map.has(name),
    entries: () => [...map.entries()],
    with: (name, value) => make(new Map(map).set(name, value)),
    without: (name) => {
      const next = new Map(map);
      next.delete(name);
      return make(next);
    },
  });

  return make(values);
}

/**
 * Rebuilds bindings by replaying every effect from the start up to `upTo`.
 *
 * Replay rather than mutate-and-undo: stepping backwards restores earlier
 * values correctly, and goTo(n) is consistent regardless of the path taken.
 */
export function replayEffects(
  effectsByStep: readonly (readonly VariableEffect[])[],
  upTo: number,
  initial: VariableBindings,
): VariableBindings {
  let bindings = initial;

  for (let index = 0; index <= upTo && index < effectsByStep.length; index += 1) {
    for (const effect of effectsByStep[index]!) {
      bindings = bindings.with(effect.name, effect.value);
    }
  }

  return bindings;
}
