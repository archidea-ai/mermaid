import { useCallback, useMemo, useRef, useState } from 'react';
import { createBindings, replayEffects } from '@archidea-ai/mermaid-scenario';
import { buildTimeline } from './timeline';
import { collectDeclaredTypes } from '../parser/parse';
import type { VariableBindings, VariableValue } from '@archidea-ai/mermaid-scenario';
import type { Decision, PendingDecision, Step, Timeline } from './timeline';
import type { SequenceDiagramAst, VariableDeclaration } from '../parser/ast';
import type { StepController } from '@archidea-ai/mermaid-core';

export interface VariablePrompt {
  readonly declaration: VariableDeclaration;
  readonly reason: 'step-read' | 'unknown-condition';
}

/**
 * Extends the phase-1 StepController structurally, so existing consumers keep
 * working while this renderer exposes the run state a walkthrough needs.
 */
export interface SequenceRunController extends StepController {
  readonly timeline: Timeline;
  readonly bindings: VariableBindings;
  readonly pending: PendingDecision | null;
  readonly prompts: readonly VariablePrompt[];
  readonly decisions: ReadonlyMap<string, Decision>;
  readonly canAdvance: boolean;
  decide(decision: Decision): void;
  bind(name: string, value: VariableValue): void;
  unbind(name: string): void;
  resetRun(): void;
}

export function useSequenceRun(ast: SequenceDiagramAst): SequenceRunController {
  const [cursor, setCursor] = useState(-1);
  const [decisions, setDecisions] = useState<ReadonlyMap<string, Decision>>(new Map());
  const [values, setValues] = useState<Readonly<Record<string, VariableValue>>>({});
  const listeners = useRef(new Set<(index: number) => void>());

  const declaredTypes = useMemo(() => collectDeclaredTypes(ast), [ast]);
  const seed = useMemo(() => createBindings(values), [values]);
  const timeline = useMemo(() => buildTimeline(ast, decisions, seed), [ast, decisions, seed]);

  const clampedCursor = Math.min(cursor, timeline.steps.length - 1);

  const bindings = useMemo(
    () =>
      replayEffects(
        timeline.steps.map((step) => step.effects),
        clampedCursor,
        seed,
      ),
    [timeline, clampedCursor, seed],
  );

  /**
   * The step about to be revealed is what we prompt for — asking after the fact
   * would show the viewer a message referencing a value they never supplied.
   */
  const nextStep: Step | undefined = timeline.steps[clampedCursor + 1];

  const prompts = useMemo<VariablePrompt[]>(() => {
    const result: VariablePrompt[] = [];

    for (const read of nextStep?.reads ?? []) {
      if (!bindings.has(read.name)) result.push({ declaration: read, reason: 'step-read' });
    }

    if (timeline.pending?.kind === 'variable') {
      // Use the condition's own declarations: inventing untyped ones here is
      // what made `opt {{sendSms : boolean}}` prompt with a text field.
      for (const declaration of timeline.pending.declarations) {
        if (result.some((prompt) => prompt.declaration.name === declaration.name)) continue;
        result.push({
          declaration: {
            ...declaration,
            // The condition rarely annotates the type; the message that first
            // mentioned the variable usually did.
            declaredType: declaration.declaredType ?? declaredTypes.get(declaration.name) ?? null,
          },
          reason: 'unknown-condition',
        });
      }
    }

    return result;
  }, [nextStep, bindings, timeline.pending, declaredTypes]);

  const blockedByPrompt = prompts.some((prompt) => prompt.reason === 'step-read');
  const canAdvance = clampedCursor + 1 < timeline.steps.length && !blockedByPrompt;

  const emit = useCallback((index: number) => {
    for (const listener of [...listeners.current]) listener(index);
  }, []);

  const goTo = useCallback(
    (index: number) => {
      const next = Math.min(Math.max(index, -1), timeline.steps.length - 1);
      setCursor(next);
      emit(next);
    },
    [emit, timeline.steps.length],
  );

  const next = useCallback(() => {
    if (!canAdvance) return;
    goTo(clampedCursor + 1);
  }, [canAdvance, goTo, clampedCursor]);

  const prev = useCallback(() => goTo(clampedCursor - 1), [goTo, clampedCursor]);
  const reset = useCallback(() => goTo(-1), [goTo]);

  const decide = useCallback((decision: Decision) => {
    setDecisions((previous) => new Map(previous).set(decision.fragmentId, decision));
  }, []);

  const bind = useCallback((name: string, value: VariableValue) => {
    setValues((previous) => ({ ...previous, [name]: value }));
  }, []);

  const unbind = useCallback((name: string) => {
    setValues((previous) => {
      const next = { ...previous };
      delete next[name];
      return next;
    });
  }, []);

  const resetRun = useCallback(() => {
    setDecisions(new Map());
    setValues({});
    setCursor(-1);
    emit(-1);
  }, [emit]);

  const subscribe = useCallback((listener: (index: number) => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  return useMemo(
    () => ({
      stepCount: timeline.steps.length,
      current: clampedCursor,
      goTo,
      next,
      prev,
      reset,
      subscribe,
      timeline,
      bindings,
      pending: timeline.pending,
      prompts,
      decisions,
      canAdvance,
      decide,
      bind,
      unbind,
      resetRun,
    }),
    [
      timeline,
      clampedCursor,
      goTo,
      next,
      prev,
      reset,
      subscribe,
      bindings,
      prompts,
      decisions,
      canAdvance,
      decide,
      bind,
      unbind,
      resetRun,
    ],
  );
}
