import { useCallback, useMemo, useState } from 'react';
import { createBindings } from '@archidea-ai/mermaid-scenario';
import { choicePointOf, entryOf, isFinalEnd, outgoingFrom, traverse } from './traverse';
import type { VariableBindings, VariableValue } from '@archidea-ai/mermaid-scenario';
import type { StateDiagramAst } from '../parser/ast';
import type { StateChoice, StateStep, StateTimeline } from './traverse';
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
  /*
   * The ways out of where the viewer stands. A subgroup's end hands back to the
   * machine around it, so its options are the parent's — only the top-level
   * `[*]` finishes the flow. Without the indirection the shared `[*]` token also
   * matched the transitions leaving the *start*.
   */
  const choicePoint = choicePointOf(at);
  const outgoing = useMemo(() => outgoingFrom(ast, at), [ast, at]);

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
      /*
       * The flow is over when standing on an end with nowhere to go. The
       * top-level `[*]` always qualifies; a subgroup end qualifies only when the
       * machine around it has no way onward either.
       */
      atEnd:
        isFinalEnd(at) || (choicePoint !== null && at !== choicePoint && outgoing.length === 0),
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
        /*
         * Keyed by arrival, so choosing the same move on a later visit is a
         * separate decision — and rewinding then choosing differently replaces
         * the choice for *that* arrival rather than every visit to the state.
         *
         * The key for the position after the cursor is whatever the walk already
         * used there; only past the end of the walk is it a new one.
         */
        const key = timeline.steps[clamped + 1]?.fromKey ?? timeline.nextKey;
        if (key === null) return;
        setDecisions((previous) => new Map(previous).set(key, transitionId));
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
    [timeline, clamped, bindings, prompts, canAdvance, goTo, at, outgoing, choicePoint],
  );
}
