import type { StateDiagramAst, StateNode } from '../parser/ast';

/**
 * The composite states enclosing a state, outermost first.
 *
 * A compound state is context the viewer needs while they are inside it — which
 * machine they are in, and which machine that one sits in. Each becomes a box
 * drawn around the whole current view, nested in the same order.
 */
export function enclosingStates(
  ast: StateDiagramAst,
  stateId: string | null,
): readonly StateNode[] {
  if (!stateId) return [];

  const chain: StateNode[] = [];
  let parent = ast.stateById.get(stateId)?.parent ?? null;
  const seen = new Set<string>();

  while (parent && !seen.has(parent)) {
    seen.add(parent);
    const node = ast.stateById.get(parent);
    if (!node) break;
    chain.unshift(node);
    parent = node.parent;
  }

  return chain;
}
