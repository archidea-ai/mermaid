import { enclosingStates } from './nesting';
import { ascend, descend, outgoingFrom } from './traverse';
import { TERMINAL, isTerminal } from '../parser/ast';
import type { RichText } from '@archidea-ai/mermaid-scenario';
import type { StateDiagramAst, StateNode } from '../parser/ast';

export interface OverviewGroup {
  /** Containers around every state in this group, outermost first. */
  readonly containers: readonly StateNode[];
  readonly states: readonly string[];
}

export interface OverviewColumn {
  /** Negative is history, 0 is the active state, positive is what comes next. */
  readonly depth: number;
  readonly groups: readonly OverviewGroup[];
}

export interface OverviewEdge {
  readonly id: string;
  /** Column-qualified, because one state can sit on both sides of the chart. */
  readonly fromKey: string;
  readonly toKey: string;
  readonly label: RichText | null;
}

export interface Overview {
  readonly columns: readonly OverviewColumn[];
  readonly edges: readonly OverviewEdge[];
}

/** How a state is addressed once the same one can appear twice. */
export function stateKey(depth: number, stateId: string): string {
  return `${depth}:${stateId}`;
}

/** The column a key belongs to, which is also its distance from the active state. */
export function keyDepth(key: string): number {
  return Number(key.slice(0, key.indexOf(':')));
}

/**
 * Everything between the active state and `key`: the states passed through and
 * the lines between them.
 *
 * Each state is discovered once per side, by exactly one transition, so there
 * is exactly one such route and following it is a walk back down the sweep. It
 * is what a viewer is asking for when they point at something far out — not
 * "what is this" but "how would I get there".
 */
export function routeTo(
  edges: readonly OverviewEdge[],
  key: string | null,
): { readonly states: ReadonlySet<string>; readonly lines: ReadonlySet<string> } {
  const states = new Set<string>();
  const lines = new Set<string>();
  if (!key) return { states, lines };

  let at = key;
  states.add(at);

  while (keyDepth(at) !== 0) {
    // The far endpoint is the one further from the centre, whichever side.
    const edge = edges.find(
      (candidate) =>
        (Math.abs(keyDepth(candidate.fromKey)) > Math.abs(keyDepth(candidate.toKey))
          ? candidate.fromKey
          : candidate.toKey) === at,
    );
    if (!edge) break;

    lines.add(edge.id);
    at = edge.fromKey === at ? edge.toKey : edge.fromKey;
    if (states.has(at)) break;
    states.add(at);
  }

  return { states, lines };
}

const EMPTY: Overview = { columns: [], edges: [] };

/**
 * The whole machine around one state, laid out by distance from it.
 *
 * A breadth-first sweep in each direction, run to exhaustion: backwards for
 * every way the machine can reach here, forwards for everywhere it can go.
 * Both sides come from the same walk, so "history on the left, next on the
 * right" reads as one chart rather than two.
 *
 * A state is placed at the first distance it is reached at and never repeated,
 * so a cycle contributes one column rather than looping.
 */
export function buildOverview(ast: StateDiagramAst, activeId: string | null): Overview {
  if (!activeId || !ast.stateById.has(activeId)) return EMPTY;

  /*
   * Two sweeps, each with its own visited set: one for where the machine can
   * go, one for how it can get here. They are not merged. A state that both
   * follows from here and leads here genuinely belongs on both sides, and
   * showing it once forced a choice between two true statements — which is why
   * a cycle used to read as distant history rather than as the next step.
   */
  const forward = sweep(ast, activeId, successors, 1);
  const backward = sweep(ast, activeId, predecessors, -1);

  const byDepth = new Map<number, string[]>([[0, [activeId]]]);
  const place = (stateId: string, depth: number) => {
    const column = byDepth.get(depth);
    if (column) column.push(stateId);
    else byDepth.set(depth, [stateId]);
  };

  for (const [stateId, { distance }] of forward) place(stateId, distance);
  for (const [stateId, { distance }] of backward) place(stateId, distance);

  const columns = [...byDepth.entries()]
    .sort(([a], [b]) => a - b)
    .map(([depth, states]) => ({ depth, groups: groupByContainer(ast, states) }));

  /*
   * Only the transitions a sweep took to reach somewhere new. Every rightward
   * transition between placed states would draw lines the walk never used —
   * each state is discovered once per side, and that discovery is the chart.
   */
  const edges = [...forward.values(), ...backward.values()]
    .map((reached) => reached.edge)
    .filter((edge): edge is OverviewEdge => edge !== null);

  return { columns, edges };
}

interface Reached {
  /** Signed: negative is history, positive is what comes next. */
  readonly distance: number;
  /** The transition that reached this state, oriented left to right. */
  readonly edge: OverviewEdge | null;
}

/** One neighbour, with the transition that got there. */
interface Reach {
  readonly state: string;
  readonly id: string;
  readonly label: RichText | null;
}

type Step = (ast: StateDiagramAst, stateId: string) => readonly Reach[];

/**
 * Breadth-first distances from `activeId`, following one step relation until
 * nothing new is reached. Terminals never appear: the overview is a map of
 * states you can make active, and `[*]` is a marker rather than somewhere to
 * stand — the step relations resolve through them instead.
 *
 * `sign` orients the result: the forward sweep grows to the right, the backward
 * one to the left, and each records its discovery edge pointing rightwards so
 * both sides read the same way round.
 */
function sweep(
  ast: StateDiagramAst,
  activeId: string,
  step: Step,
  sign: 1 | -1,
): ReadonlyMap<string, Reached> {
  const reached = new Map<string, Reached>();
  let frontier = [activeId];

  for (let distance = 1; frontier.length > 0; distance += 1) {
    const next: string[] = [];
    const from = sign * (distance - 1);
    const to = sign * distance;

    for (const stateId of frontier) {
      for (const neighbour of step(ast, stateId)) {
        if (neighbour.state === activeId || reached.has(neighbour.state)) continue;
        if (isTerminal(neighbour.state)) continue;

        const near = stateKey(from, stateId);
        const far = stateKey(to, neighbour.state);

        reached.set(neighbour.state, {
          distance: to,
          edge: {
            id: `${neighbour.id}:${near}:${far}`,
            fromKey: sign === 1 ? near : far,
            toKey: sign === 1 ? far : near,
            label: neighbour.label,
          },
        });
        next.push(neighbour.state);
      }
    }

    frontier = next;
  }

  return reached;
}

/**
 * Where the machine can go from here — the same relation the interactive
 * journey offers, so the map and the walk cannot disagree.
 */
function successors(ast: StateDiagramAst, stateId: string): readonly Reach[] {
  return outgoingFrom(ast, stateId).flatMap((transition) =>
    arrivals(ast, transition.to, new Set()).map((state) => ({
      state,
      id: transition.id,
      label: transition.label,
    })),
  );
}

/** The mirror of {@link successors}: everything whose next step lands here. */
function predecessors(ast: StateDiagramAst, stateId: string): readonly Reach[] {
  const found: Reach[] = [];

  for (const transition of ast.transitions) {
    if (!arrivals(ast, transition.to, new Set()).includes(stateId)) continue;

    for (const state of departures(ast, transition.from, transition.label !== null, new Set())) {
      found.push({ state, id: transition.id, label: transition.label });
    }
  }

  return found;
}

/**
 * Where a transition actually lands the run.
 *
 * A composite is never somewhere you stand, so entering one means entering its
 * initial substate — and its end is not a stop either: reaching it completes
 * the composite, and the machine around it carries on. Only the top-level `[*]`
 * ends anything, and it alone resolves to nowhere.
 */
function arrivals(ast: StateDiagramAst, target: string, seen: Set<string>): readonly string[] {
  if (seen.has(target)) return [];
  seen.add(target);

  if (!isTerminal(target)) return [descend(ast, target)];
  if (ascend(ast, target) === null) return [];

  return outgoingFrom(ast, target).flatMap((transition) => arrivals(ast, transition.to, seen));
}

/**
 * Where the run really stood before leaving `stateId` by this transition.
 *
 * A composite is never itself somewhere you stand, so a transition drawn on one
 * has to be read back to the substates it could have fired from — and UML gives
 * two different answers, exactly mirroring how {@link successors} offers them:
 *
 * - An unlabelled transition is a completion transition. It fires when the
 *   composite's region reaches its final state, so the run was standing at
 *   whichever substate leads to that end.
 * - A labelled one is a trigger, and a trigger on a composite is an interrupt
 *   available throughout its machine. The run could have been at any substate.
 *
 * Either way it resolves to leaf states, which is what the chart can draw.
 */
function departures(
  ast: StateDiagramAst,
  stateId: string,
  triggered: boolean,
  seen: Set<string>,
): readonly string[] {
  if (seen.has(stateId)) return [];
  seen.add(stateId);

  const node = ast.stateById.get(stateId);
  if (!node || node.children.length === 0) return [stateId];

  if (triggered) return leavesOf(ast, node);

  const ends = ast.transitions
    .filter((transition) => transition.to === `${TERMINAL}@${stateId}`)
    .flatMap((transition) => departures(ast, transition.from, false, seen));

  return ends.length > 0 ? ends : leavesOf(ast, node);
}

/** Every state actually occupiable inside a composite, however deeply nested. */
function leavesOf(ast: StateDiagramAst, node: StateNode): readonly string[] {
  return node.children.flatMap((childId) => {
    const child = ast.stateById.get(childId);
    if (!child || isTerminal(childId)) return [];
    return child.children.length === 0 ? [childId] : leavesOf(ast, child);
  });
}

/** States sharing a container chain sit in one box, as they do elsewhere. */
function groupByContainer(ast: StateDiagramAst, states: readonly string[]): OverviewGroup[] {
  const groups = new Map<string, OverviewGroup>();

  for (const stateId of states) {
    const containers = enclosingStates(ast, stateId);
    const key = containers.map((container) => container.id).join('/');
    const existing = groups.get(key);

    groups.set(
      key,
      existing
        ? { ...existing, states: [...existing.states, stateId] }
        : { containers, states: [stateId] },
    );
  }

  return [...groups.values()];
}

/** Where the overview opens: the machine's own starting point. */
export function defaultActive(ast: StateDiagramAst): string | null {
  const start = ast.transitions.find((transition) => isTerminal(transition.from));
  if (start) return descend(ast, start.to);
  return ast.states.find((state) => !isTerminal(state.id))?.id ?? null;
}
