import type { FlowchartAst } from '../parser/ast';

export interface FlowSelection {
  /** The chosen node and everything one edge away from it. */
  readonly nodes: ReadonlySet<string>;
  /** The edges that make it so — every edge between the chosen node and a neighbour. */
  readonly edges: ReadonlySet<string>;
}

const NOTHING: FlowSelection = { nodes: new Set(), edges: new Set() };

/**
 * What lights up when a node is chosen: the node, its immediate neighbours in
 * both directions, and the edges joining them.
 *
 * First-degree only. A flowchart of any size is mostly not about the node you
 * clicked, and widening the ring past one step lights the whole chart back up —
 * which is the thing selecting was meant to cut through.
 */
export function selectNeighbours(ast: FlowchartAst, nodeId: string | null): FlowSelection {
  if (!nodeId || !ast.nodeById.has(nodeId)) return NOTHING;

  const nodes = new Set<string>([nodeId]);
  const edges = new Set<string>();

  for (const edge of ast.edges) {
    // A self-loop is still an edge worth showing, hence no from/to symmetry test.
    if (edge.from === nodeId) {
      nodes.add(edge.to);
      edges.add(edge.id);
    }
    if (edge.to === nodeId) {
      nodes.add(edge.from);
      edges.add(edge.id);
    }
  }

  return { nodes, edges };
}
