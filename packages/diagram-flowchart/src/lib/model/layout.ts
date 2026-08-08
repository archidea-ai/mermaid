import type { FlowNode, FlowSubgraph, FlowchartAst } from '../parser/ast';

export interface FlowGroup {
  /** The subgraph these nodes were declared in, if any. */
  readonly subgraph: FlowSubgraph | null;
  readonly nodes: readonly FlowNode[];
}

export interface FlowColumn {
  readonly rank: number;
  readonly groups: readonly FlowGroup[];
}

/**
 * The whole chart, in columns, read left to right.
 *
 * A node's rank is the longest path to it from anywhere with no way in, which
 * is the ordinary layered-graph reading: nothing is drawn before everything it
 * depends on. The longest path rather than the shortest, because a node that
 * can be reached both early and late belongs after both — placing it at the
 * shortest distance drew edges running backwards through the chart.
 */
export function buildColumns(ast: FlowchartAst): readonly FlowColumn[] {
  const ranks = rankNodes(ast);
  const byRank = new Map<number, FlowNode[]>();

  for (const node of ast.nodes) {
    const rank = ranks.get(node.id) ?? 0;
    const column = byRank.get(rank);
    if (column) column.push(node);
    else byRank.set(rank, [node]);
  }

  const subgraphById = new Map(ast.subgraphs.map((subgraph) => [subgraph.id, subgraph]));

  return [...byRank.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rank, nodes]) => ({ rank, groups: groupBySubgraph(nodes, subgraphById) }));
}

/**
 * Longest-path rank per node.
 *
 * A cycle has no such thing, so the walk simply refuses to revisit a node on
 * the path it is currently following: the back edge is still drawn, it just
 * does not push its target further right for ever.
 */
export function rankNodes(ast: FlowchartAst): ReadonlyMap<string, number> {
  const outgoing = new Map<string, string[]>();
  for (const edge of ast.edges) {
    const bucket = outgoing.get(edge.from);
    if (bucket) bucket.push(edge.to);
    else outgoing.set(edge.from, [edge.to]);
  }

  const hasIncoming = new Set(ast.edges.map((edge) => edge.to));
  const ranks = new Map<string, number>();

  /*
   * Sources first, then anything left over — a chart that is all cycle has no
   * source at all, and leaving those nodes unranked would drop them entirely.
   */
  const roots = [
    ...ast.nodes.filter((node) => !hasIncoming.has(node.id)).map((node) => node.id),
    ...ast.nodes.map((node) => node.id),
  ];

  for (const root of roots) {
    if (ranks.has(root)) continue;
    walk(root, 0, new Set());
  }

  function walk(id: string, rank: number, onPath: Set<string>): void {
    if (onPath.has(id)) return;
    if ((ranks.get(id) ?? -1) >= rank && ranks.has(id)) return;

    ranks.set(id, rank);
    onPath.add(id);
    for (const next of outgoing.get(id) ?? []) walk(next, rank + 1, onPath);
    onPath.delete(id);
  }

  return ranks;
}

/** Nodes in one column, boxed by the subgraph that owns them. */
function groupBySubgraph(
  nodes: readonly FlowNode[],
  subgraphById: ReadonlyMap<string, FlowSubgraph>,
): FlowGroup[] {
  const groups = new Map<string, FlowGroup>();

  for (const node of nodes) {
    const key = node.subgraph ?? '';
    const existing = groups.get(key);

    groups.set(
      key,
      existing
        ? { ...existing, nodes: [...existing.nodes, node] }
        : {
            subgraph: node.subgraph ? (subgraphById.get(node.subgraph) ?? null) : null,
            nodes: [node],
          },
    );
  }

  return [...groups.values()];
}
