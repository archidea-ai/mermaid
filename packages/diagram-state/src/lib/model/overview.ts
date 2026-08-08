import { enclosingStates } from './nesting';
import { isTerminal } from '../parser/ast';
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

export const DEFAULT_OVERVIEW_RADIUS = 2;

/**
 * The neighbourhood of one state, laid out by distance from it.
 *
 * A breadth-first sweep in each direction: backwards for how the machine can
 * reach here, forwards for where it can go. Both use the same walk, so the two
 * sides are the same kind of statement about the machine — which is what makes
 * "history on the left, next on the right" read as one chart rather than two.
 *
 * A state is placed at the first distance it is reached at and never repeated,
 * so a cycle contributes one column rather than looping.
 */
export function buildOverview(
  ast: StateDiagramAst,
  activeId: string | null,
  radius = DEFAULT_OVERVIEW_RADIUS,
): readonly OverviewColumn[] {
  if (!activeId || !ast.stateById.has(activeId)) return [];

  /*
   * Each direction is measured on its own and the nearer wins, forward on a
   * tie. Sweeping one direction and then the other let the first sweep claim a
   * state at two steps that the second could reach in one — the chart then
   * showed a direct successor as distant history.
   */
  const forward = sweep(ast, activeId, radius, 1);
  const backward = sweep(ast, activeId, radius, -1);

  const placed = new Map<string, number>([[activeId, 0]]);
  for (const [stateId, distance] of forward) placed.set(stateId, distance);
  for (const [stateId, distance] of backward) {
    const already = placed.get(stateId);
    if (already === undefined || distance < Math.abs(already)) placed.set(stateId, -distance);
  }
  placed.set(activeId, 0);

  const byDepth = new Map<number, string[]>();
  for (const [stateId, depth] of placed) {
    const column = byDepth.get(depth);
    if (column) column.push(stateId);
    else byDepth.set(depth, [stateId]);
  }

  return [...byDepth.entries()]
    .sort(([a], [b]) => a - b)
    .map(([depth, states]) => ({ depth, groups: groupByContainer(ast, states) }));
}

/**
 * Breadth-first distances from `activeId`, following transitions forwards or
 * backwards. Terminals are skipped: the overview is a map of states you can
 * make active, and `[*]` is a marker rather than somewhere to stand.
 */
function sweep(
  ast: StateDiagramAst,
  activeId: string,
  radius: number,
  direction: 1 | -1,
): ReadonlyMap<string, number> {
  const distances = new Map<string, number>();
  let frontier = [activeId];

  for (let step = 1; step <= radius && frontier.length > 0; step += 1) {
    const next: string[] = [];

    for (const stateId of frontier) {
      for (const transition of ast.transitions) {
        const from = direction === 1 ? transition.from : transition.to;
        const to = direction === 1 ? transition.to : transition.from;
        if (from !== stateId || to === activeId || distances.has(to) || isTerminal(to)) continue;

        distances.set(to, step);
        next.push(to);
      }
    }

    frontier = next;
  }

  return distances;
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
  if (start) return start.to;
  return ast.states.find((state) => !isTerminal(state.id))?.id ?? null;
}
