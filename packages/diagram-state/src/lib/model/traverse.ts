import { evaluateCondition } from '@archidea-ai/mermaid-scenario';
import { TERMINAL, isTerminal, terminalOwner } from '../parser/ast';
import type { VariableBindings, VariableEffect } from '@archidea-ai/mermaid-scenario';
import type { StateDiagramAst, StateTransition } from '../parser/ast';

export interface StateStep {
  readonly id: string;
  readonly index: number;
  /** The decision key this step departed from. See StateDecisions. */
  readonly fromKey: string;
  readonly transition: StateTransition;
  readonly from: string;
  readonly to: string;
  /** Elements to highlight while this step is current. */
  readonly involved: readonly string[];
  readonly effects: readonly VariableEffect[];
  readonly reads: readonly { name: string; declaredType: unknown; assigns: boolean }[];
  /**
   * True when this step is a composite's completion transition — the lone
   * unlabelled way out, taken because its machine finished. Finishing a
   * submachine and carrying on is one move, so the viewer never stops here.
   */
  readonly completion: boolean;
}

export interface StateChoice {
  readonly from: string;
  readonly options: readonly StateTransition[];
  /** A <<choice>> node is a decision by definition, even with one way out. */
  readonly forced: boolean;
}

export interface StateTimeline {
  readonly steps: readonly StateStep[];
  /** The decision key at the point the walk stopped, if it can go further. */
  readonly nextKey: string | null;
  /** Where the run currently stands. */
  readonly at: string | null;
  readonly pending: StateChoice | null;
  readonly done: boolean;
  /** States never reached under the current decisions. */
  readonly unreached: readonly string[];
}

/**
 * Decisions keyed by *arrival*, not by state: `Idle#0` is the first visit to
 * Idle, `Idle#1` the second.
 *
 * Keying by state alone made "take retry at Idle" one fact about the whole run,
 * so it fired again every time the walk returned — an infinite loop. Guarding
 * against that in turn stopped the viewer deliberately repeating a move, and
 * made a rewind-then-choose-differently silently keep the old choice. A
 * positional key is the thing that was actually meant: this arrival, this way.
 */
export type StateDecisions = ReadonlyMap<string, string>;

export function decisionKey(stateId: string, visit: number): string {
  return `${stateId}#${visit}`;
}

/**
 * Walks the machine from its entry state, taking the transition the viewer
 * picked at each fork.
 *
 * The run is a pure projection of (ast, decisions, bindings), exactly as the
 * sequence timeline is — so choosing differently re-derives it rather than
 * patching state, and a chain of choices is replayable as a scenario.
 */
export function traverse(
  ast: StateDiagramAst,
  decisions: StateDecisions = new Map(),
  bindings: VariableBindings,
  start?: string | null,
): StateTimeline {
  const steps: StateStep[] = [];
  const visited = new Set<string>();
  const visits = new Map<string, number>();
  // Transitions the walk took on its own, so it never auto-repeats one.
  const autoTaken = new Set<string>();

  let current = entryOf(ast, start);
  let pending: StateChoice | null = null;
  let nextKey: string | null = null;
  let done = false;

  // Bounded: a loop in the machine is legitimate, so stop at a generous depth
  // rather than trusting the diagram to terminate.
  for (let guard = 0; guard < 500 && current !== null; guard += 1) {
    visited.add(current);

    // A composite's internal terminal hands control back to the composite.
    const climbed = ascend(ast, current);
    const atContainerEnd = climbed !== null;
    if (climbed) {
      current = climbed;
      visited.add(current);
    }

    const outgoing = outgoingFrom(ast, current);
    if (outgoing.length === 0) {
      done = true;
      break;
    }

    const node = ast.stateById.get(current);
    const forced = node?.kind === 'choice';

    // Each arrival gets its own key, so a loop asks again rather than replaying.
    const visit = visits.get(current) ?? 0;
    visits.set(current, visit + 1);
    const key = decisionKey(current, visit);

    /*
     * Finishing a submachine is not the same as being anywhere else. Its
     * completion transition — the lone unlabelled way out — is what the diagram
     * says happens next, so the run takes it without asking.
     */
    const completion = atContainerEnd && outgoing.length === 1 && outgoing[0]!.label === null;

    const chosen = resolve(key, outgoing, decisions, bindings, forced);

    if (!chosen) {
      pending = { from: current, options: outgoing, forced: Boolean(forced) };
      nextKey = key;
      break;
    }

    /*
     * Advancing on its own is a convenience for the unambiguous case, so it must
     * not carry the run round a loop unasked — a lone `A --> A` would otherwise
     * spin until the guard caught it. An explicit choice is always honoured,
     * however often it repeats: that is the viewer's call each time.
     */
    const decided = decisions.has(key);
    if (!decided) {
      /*
       * Anything other than a completion waits. A labelled transition on the
       * composite is a trigger, and firing one unasked because it happened to
       * be the only option left silently aborted runs that had merely finished.
       */
      if (atContainerEnd && !completion && chosen.condition === null) {
        pending = { from: current, options: outgoing, forced: Boolean(forced) };
        nextKey = key;
        break;
      }

      if (autoTaken.has(chosen.id)) {
        pending = { from: current, options: outgoing, forced: Boolean(forced) };
        nextKey = key;
        break;
      }
      autoTaken.add(chosen.id);
    }

    // The step lands where the run actually ends up: entering a composite means
    // entering its machine, so the cursor belongs on the inner state, not on the
    // composite's name.
    const landing = chosen.to === TERMINAL ? TERMINAL : descend(ast, chosen.to);

    const step: StateStep = {
      id: `${chosen.id}#${steps.length}`,
      index: steps.length,
      fromKey: key,
      transition: chosen,
      from: chosen.from,
      to: landing,
      involved: [chosen.from, landing],
      effects: chosen.label?.effects ?? [],
      reads: (chosen.label?.reads ?? []).filter((read) => !read.assigns),
      completion,
    };
    steps.push(step);

    for (const effect of step.effects) bindings = bindings.with(effect.name, effect.value);

    if (chosen.to === TERMINAL) {
      visited.add(TERMINAL);
      done = true;
      break;
    }

    // Entering a composite means entering its machine, so descend to whatever
    // its own `[*]` points at. Reaching a composite's internal terminal means
    // that machine finished, so climb back out to the composite itself.
    current = landing;
  }

  return {
    steps,
    nextKey,
    at: steps.length > 0 ? steps[steps.length - 1]!.to : entryOf(ast, start),
    pending,
    done,
    unreached: ast.states
      .filter((state) => state.kind !== 'terminal' && !visited.has(state.id))
      .map((state) => state.id),
  };
}

/**
 * Where the run begins.
 *
 * The consumer decides first — a diagram is often worth walking from partway in,
 * and only they know which state that is. Failing that, `[*] --> X` names the
 * entry, and failing that the first state declared. An unknown id falls through
 * rather than starting the run nowhere.
 */
export function entryOf(ast: StateDiagramAst, preferred?: string | null): string | null {
  if (preferred && ast.stateById.has(preferred) && !isTerminal(preferred)) {
    return descend(ast, preferred);
  }

  const start = ast.transitions.find((transition) => transition.from === TERMINAL);
  if (start) return descend(ast, start.to);

  const first = ast.states.find((state) => state.kind !== 'terminal');
  return first ? descend(ast, first.id) : null;
}

/** The innermost state actually occupied when arriving at `stateId`. */
export function descend(ast: StateDiagramAst, stateId: string): string {
  let current = stateId;
  const seen = new Set<string>();

  while (!seen.has(current)) {
    seen.add(current);
    const node = ast.stateById.get(current);
    if (!node || node.children.length === 0) return current;

    const inner = ast.transitions.find(
      (transition) => transition.from === `${TERMINAL}@${current}`,
    );
    if (!inner) return current;
    current = inner.to;
  }
  return current;
}

/** Where the run continues when a composite's internal machine finishes. */
export function ascend(ast: StateDiagramAst, terminalId: string): string | null {
  const composite = terminalId.startsWith(`${TERMINAL}@`)
    ? terminalId.slice(`${TERMINAL}@`.length)
    : null;
  return composite;
}

function resolve(
  key: string,
  outgoing: readonly StateTransition[],
  decisions: StateDecisions,
  bindings: VariableBindings,
  forced: boolean,
): StateTransition | null {
  const decided = decisions.get(key);
  if (decided) {
    const match = outgoing.find((transition) => transition.id === decided);
    if (match) return match;
  }

  // A condition that evaluates true takes the transition with no prompt. An
  // `unknown` never falls through — it asks, as everywhere else in the model.
  let sawUnknown = false;
  for (const transition of outgoing) {
    if (!transition.condition) continue;
    const verdict = evaluateCondition(transition.condition, bindings);
    if (verdict === true) return transition;
    if (verdict === 'unknown') sawUnknown = true;
  }
  if (sawUnknown) return null;

  const unconditional = outgoing.filter((transition) => !transition.condition);
  if (forced) return null;
  if (outgoing.length === 1 && unconditional.length === 1) return unconditional[0]!;
  if (unconditional.length === 1 && outgoing.length > 1) return unconditional[0]!;

  return null;
}

/**
 * The state whose transitions are the ways out of where the viewer stands.
 *
 * Standing on a subgroup's end is not the end of anything but that subgroup —
 * the run continues in the machine around it, so the options are the parent's.
 * Only the top-level `[*]` finishes the flow, and it alone returns null.
 */
export function choicePointOf(at: string | null): string | null {
  if (at === null) return null;
  if (!isTerminal(at)) return at;
  return terminalOwner(at);
}

/** True only for the end that actually finishes the run. */
export function isFinalEnd(at: string | null): boolean {
  return at !== null && isTerminal(at) && terminalOwner(at) === null;
}

/**
 * Every transition that can fire from where the viewer stands.
 *
 * A transition drawn on an enclosing composite state leaves that composite from
 * *any* of its substates — `Building --> Cancelled` is reachable while you are
 * deep inside Building's machine. Offering only the innermost state's own
 * transitions hid every way of interrupting the submachine.
 *
 * Innermost first, so the local choices read before the escapes.
 */
export function outgoingFrom(
  ast: StateDiagramAst,
  stateId: string | null,
): readonly StateTransition[] {
  const point = choicePointOf(stateId);
  if (point === null) return [];

  const result: StateTransition[] = [];
  const seen = new Set<string>();
  let owner: string | null = point;

  while (owner && !seen.has(owner)) {
    seen.add(owner);
    for (const transition of ast.transitions) {
      if (transition.from !== owner) continue;

      /*
       * An unlabelled transition leaving a composite is a completion
       * transition: it fires when that composite's machine finishes, not
       * whenever you happen to be somewhere inside it. Offering it early
       * invited leaving a machine that had not run.
       *
       * A labelled one is a trigger and stays available throughout — that is
       * how you interrupt a submachine.
       */
      if (owner !== point && transition.label === null) continue;

      result.push(transition);
    }
    owner = ast.stateById.get(owner)?.parent ?? null;
  }

  return result;
}
