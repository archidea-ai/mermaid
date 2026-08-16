import { ancestorsOf } from './tree';
import type { C4Ast, C4Relation } from '../parser/ast';
import type { C4Tree } from './tree';

/**
 * The box that actually stands for `id` on screen.
 *
 * The OUTERMOST collapsed ancestor, not the innermost: `ancestorsOf` returns
 * innermost first, so the walk runs from the end of that chain backwards.
 * With two nested boundaries both shut, the box a viewer can actually point
 * at is the outer one — resolving to the inner one would draw a line to a
 * box that is not rendered.
 */
export function visibleOwner(id: string, collapsed: ReadonlySet<string>, tree: C4Tree): string {
  const chain = ancestorsOf(tree, id); // innermost first
  for (let at = chain.length - 1; at >= 0; at -= 1) {
    const ancestor = chain[at];
    if (ancestor && collapsed.has(ancestor)) return ancestor;
  }
  return id;
}

/** True when nothing enclosing this box is shut, so it is drawn in its own right. */
export function isVisible(id: string, collapsed: ReadonlySet<string>, tree: C4Tree): boolean {
  return visibleOwner(id, collapsed, tree) === id;
}

/**
 * The boundaries that must open for both ends of a relation to be on screen.
 *
 * The inverse of visibleOwner, and the one mechanism behind both the modal's
 * pick and a dynamic run's step.
 */
export function revealFor(relation: C4Relation, tree: C4Tree): ReadonlySet<string> {
  return new Set([...ancestorsOf(tree, relation.from), ...ancestorsOf(tree, relation.to)]);
}

/** Every boundary in the diagram — the set the chart starts collapsed with. */
export function allBoundaryIds(ast: C4Ast): ReadonlySet<string> {
  return new Set(ast.boundaries.map((boundary) => boundary.id));
}
