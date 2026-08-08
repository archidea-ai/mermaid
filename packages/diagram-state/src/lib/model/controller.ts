import { useCallback, useMemo, useState } from 'react';
import { createBindings } from '@archidea-ai/mermaid-scenario';
import { entryOf, traverse } from './traverse';
import type { VariableBindings, VariableValue } from '@archidea-ai/mermaid-scenario';
import type { StateDiagramAst } from '../parser/ast';
import type { StateChoice, StateStep, StateTimeline } from './traverse';
import { isTerminal } from '../parser/ast';
import type { StateTransition } from '../parser/ast';

export interface StatePrompt {
  readonly name: string;
  readonly declaredType: unknown;
}

export interface StateRunController {
  readonly timeline: StateTimeline;
  readonly current: number;
  readonly stepCount: number;
  readonly bindings: VariableBindings;
  readonly pending: StateChoice | null;
  readonly prompts: readonly StatePrompt[];
  readonly canAdvance: boolean;
  /** The state the run is standing in right now. */
  readonly at: string | null;
  next(): void;
  prev(): void;
  reset(): void;
  goTo(index: number): void;
  choose(from: string, transitionId: string): void;
  /** Pick a transition out of the current state and move onto it. */
  take(transitionId: string): void;
  /** Transitions leaving the state the run is standing in. */
  readonly options: readonly StateTransition[];
  /** True when the run is standing on an end. */
  readonly atEnd: boolean;
  bind(name: string, value: VariableValue): void;
  unbind(name: string): void;
}

export interface StateRunOptions {
  /** Where to begin. Falls back to `[*]`, then the first state declared. */
  readonly start?: string | null;
}

export function useStateRun(
  ast: StateDiagramAst,
  options: StateRunOptions = {},
): StateRunController {
  const [cursor, setCursor] = useState(-1);
  const [decisions, setDecisions] = useState<ReadonlyMap<string, string>>(new Map());
  const [values, setValues] = useState<Readonly<Record<string, VariableValue>>>({});

  const seed = useMemo(() => createBindings(values), [values]);
  const { start } = options;
  const timeline = useMemo(
    () => traverse(ast, decisions, seed, start),
    [ast, decisions, seed, start],
  );
  const clamped = Math.min(cursor, timeline.steps.length - 1);

  const bindings = useMemo(() => {
    let result = seed;
    for (let index = 0; index <= clamped && index < timeline.steps.length; index += 1) {
      for (const effect of timeline.steps[index]!.effects) {
        result = result.with(effect.name, effect.value);
      }
    }
    return result;
  }, [timeline, clamped, seed]);

  const nextStep: StateStep | undefined = timeline.steps[clamped + 1];

  const prompts = useMemo<StatePrompt[]>(
    () =>
      (nextStep?.reads ?? [])
        .filter((read) => !bindings.has(read.name))
        .map((read) => ({ name: read.name, declaredType: read.declaredType })),
    [nextStep, bindings],
  );

  const canAdvance = clamped + 1 < timeline.steps.length && prompts.length === 0;

  /*
   * Where the *viewer* stands, which is not where the walk ended. traverse()
   * runs as far as the decisions allow, so timeline.at is the end of that walk —
   * using it before the first step showed a state several transitions ahead of
   * the cursor.
   */
  const at = clamped >= 0 ? timeline.steps[clamped]!.to : entryOf(ast, start);
  const outgoing = useMemo(
    // Nothing leaves an end. Without this the shared `[*]` token matched the
    // machine's *start* transitions, so finishing offered its opening moves.
    () =>
      at === null || isTerminal(at)
        ? []
        : ast.transitions.filter((transition) => transition.from === at),
    [ast, at],
  );

  const goTo = useCallback(
    (index: number) => setCursor(Math.min(Math.max(index, -1), timeline.steps.length - 1)),
    [timeline.steps.length],
  );

  return useMemo(
    () => ({
      timeline,
      current: clamped,
      stepCount: timeline.steps.length,
      bindings,
      pending: timeline.pending,
      prompts,
      canAdvance,
      // Standing where the last step landed, or at the entry before any move.
      at,
      options: outgoing,
      atEnd: isTerminal(at),
      next: () => canAdvance && goTo(clamped + 1),
      prev: () => goTo(clamped - 1),
      reset: () => {
        setCursor(-1);
        setDecisions(new Map());
        setValues({});
      },
      goTo,
      choose: (from, transitionId) =>
        setDecisions((previous) => new Map(previous).set(from, transitionId)),
      /*
       * Choosing and moving are one gesture here: the viewer clicks the line
       * they want to travel. Recording the decision re-derives the run, so the
       * cursor simply steps onto the transition it now contains.
       */
      take: (transitionId) => {
        if (at === null) return;
        setDecisions((previous) => new Map(previous).set(at, transitionId));
        setCursor(clamped + 1);
      },
      bind: (name, value) => setValues((previous) => ({ ...previous, [name]: value })),
      unbind: (name) =>
        setValues((previous) => {
          const next = { ...previous };
          delete next[name];
          return next;
        }),
    }),
    [timeline, clamped, bindings, prompts, canAdvance, goTo, at, outgoing],
  );
}
