import type { RichText } from '@archidea-ai/mermaid-scenario';

/**
 * The shape an author drew the node with. Mermaid's shapes carry meaning by
 * convention — a diamond is a decision, a stadium is a start or end — so they
 * are kept and rendered rather than flattened to one box.
 */
export type FlowNodeShape =
  | 'rect'
  | 'round'
  | 'stadium'
  | 'subroutine'
  | 'cylinder'
  | 'circle'
  | 'diamond'
  | 'hexagon'
  | 'parallelogram'
  | 'trapezoid'
  | 'asymmetric';

export type FlowEdgeLine = 'solid' | 'dotted' | 'thick';
export type FlowEdgeHead = 'arrow' | 'none' | 'circle' | 'cross';

export interface FlowNode {
  readonly id: string;
  readonly label: string;
  readonly shape: FlowNodeShape;
  /** The subgraph that declared it, if any. */
  readonly subgraph: string | null;
}

export interface FlowEdge {
  readonly id: string;
  readonly line: number;
  readonly from: string;
  readonly to: string;
  readonly label: RichText | null;
  readonly style: FlowEdgeLine;
  readonly head: FlowEdgeHead;
}

export interface FlowSubgraph {
  readonly id: string;
  readonly label: string;
  readonly nodeIds: readonly string[];
}

export interface FlowchartAst {
  readonly nodes: readonly FlowNode[];
  readonly nodeById: ReadonlyMap<string, FlowNode>;
  readonly edges: readonly FlowEdge[];
  readonly subgraphs: readonly FlowSubgraph[];
  /** `TD`/`TB`, `BT`, `LR`, `RL` — kept, though the overview always reads left to right. */
  readonly direction: 'TB' | 'BT' | 'LR' | 'RL';
  readonly ignored: readonly { text: string; line: number }[];
}
