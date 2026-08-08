import { MermaidReplacementError } from '@archidea-ai/mermaid-core';
import { parseRichText } from '@archidea-ai/mermaid-scenario';
import type {
  FlowEdge,
  FlowEdgeHead,
  FlowEdgeLine,
  FlowNode,
  FlowNodeShape,
  FlowSubgraph,
  FlowchartAst,
} from './ast';

export class FlowchartParseError extends MermaidReplacementError {
  readonly line: number;

  constructor(message: string, line: number, lineText: string) {
    super('DIAGRAM_PARSE_ERROR', `${message} (line ${line}: "${lineText}")`);
    this.line = line;
  }
}

const DIRECTIVE = /%%\{.*?\}%%/g;

/**
 * Node shapes, longest delimiter first.
 *
 * Order matters and is the whole reason this is a list rather than one regex:
 * `((` has to be tried before `(`, or every circle parses as a rounded box with
 * a stray bracket in its label.
 */
const SHAPES: readonly { open: string; close: string; shape: FlowNodeShape }[] = [
  { open: '([', close: '])', shape: 'stadium' },
  { open: '[[', close: ']]', shape: 'subroutine' },
  { open: '[(', close: ')]', shape: 'cylinder' },
  { open: '((', close: '))', shape: 'circle' },
  { open: '{{', close: '}}', shape: 'hexagon' },
  { open: '[/', close: '/]', shape: 'parallelogram' },
  { open: '[\\', close: '\\]', shape: 'parallelogram' },
  { open: '[/', close: '\\]', shape: 'trapezoid' },
  { open: '>', close: ']', shape: 'asymmetric' },
  { open: '[', close: ']', shape: 'rect' },
  { open: '(', close: ')', shape: 'round' },
  { open: '{', close: '}', shape: 'diamond' },
];

/**
 * The connector between two nodes, and what it looks like.
 *
 * Written to match the whole connector including an inline `-- text -->` label,
 * because the label sits inside the arrow rather than beside it.
 */
const LINK =
  /(?:<-{1,2}|<=+|<-\.-)?\s*(-{2,}|-\.-+|={2,})(?:\s*([^->|=.][^>|]*?)\s*(-{2,}|-\.-+|={2,}))?\s*(>|o|x)?(?=\s|\||$)/;

const NODE_START = /^\s*([A-Za-z0-9_.:-]+)/;

/*
 * Statements that are not nodes. Every one of them opens with a bare word, so
 * without this list `classDef warn fill:#f00` parses as a node called
 * "classDef" and the chart grows members the author never drew.
 */
const NOT_A_NODE = /^(?:classDef|class|style|linkStyle|click|callback|link|accTitle|accDescr)\b/;

interface Draft {
  id: string;
  label: string;
  shape: FlowNodeShape;
  subgraph: string | null;
}

/**
 * Line-oriented parser for `flowchart` / `graph`.
 *
 * Same shape and the same reason as the sequence and state parsers: upstream's
 * grammar is private, and an interactive renderer needs a structured model that
 * no public API hands back.
 */
export function parse(source: string): FlowchartAst {
  const drafts = new Map<string, Draft>();
  const edges: FlowEdge[] = [];
  const subgraphs: FlowSubgraph[] = [];
  const ignored: { text: string; line: number }[] = [];
  const stack: { id: string; label: string; nodeIds: string[] }[] = [];

  let direction: FlowchartAst['direction'] = 'TB';
  let header = false;

  const ensure = (id: string, label?: string, shape?: FlowNodeShape): Draft => {
    const existing = drafts.get(id);
    if (existing) {
      // A later mention that spells out the label wins; a bare id never does.
      if (label !== undefined) existing.label = label;
      if (shape !== undefined) existing.shape = shape;
      return existing;
    }

    const open = stack[stack.length - 1];
    const draft: Draft = {
      id,
      label: label ?? id,
      shape: shape ?? 'rect',
      subgraph: open?.id ?? null,
    };
    drafts.set(id, draft);
    open?.nodeIds.push(id);
    return draft;
  };

  const lines = source.replace(DIRECTIVE, '').split(/\r?\n/);

  lines.forEach((raw, index) => {
    const line = index + 1;
    const text = stripComment(raw).trim();
    if (text.length === 0) return;

    if (!header) {
      const match = /^(?:flowchart|graph)\b\s*([A-Za-z]{2})?/.exec(text);
      if (!match) {
        throw new FlowchartParseError('expected a "flowchart" or "graph" header', line, text);
      }
      header = true;
      direction = readDirection(match[1]) ?? 'TB';
      return;
    }

    const dir = /^direction\s+([A-Za-z]{2})$/.exec(text);
    if (dir) {
      direction = readDirection(dir[1]) ?? direction;
      return;
    }

    const open = /^subgraph\s+(.*)$/.exec(text);
    if (open) {
      const { id, label } = readSubgraphHead(open[1]!);
      stack.push({ id, label, nodeIds: [] });
      return;
    }

    if (/^end$/i.test(text)) {
      const frame = stack.pop();
      if (!frame) throw new FlowchartParseError('unmatched "end"', line, text);
      subgraphs.push({ id: frame.id, label: frame.label, nodeIds: [...frame.nodeIds] });
      return;
    }

    if (!NOT_A_NODE.test(text) && readStatement(text, line, ensure, edges)) return;
    ignored.push({ text, line });
  });

  if (!header) throw new FlowchartParseError('expected a "flowchart" or "graph" header', 1, '');
  if (stack.length > 0) {
    const unclosed = stack[stack.length - 1]!;
    throw new FlowchartParseError(
      `unclosed "subgraph ${unclosed.label}" — expected a matching "end"`,
      0,
      'subgraph',
    );
  }

  const nodes: FlowNode[] = [...drafts.values()].map((draft) => ({
    id: draft.id,
    label: draft.label,
    shape: draft.shape,
    subgraph: draft.subgraph,
  }));

  return {
    nodes,
    nodeById: new Map(nodes.map((node) => [node.id, node])),
    edges,
    subgraphs,
    direction,
    ignored,
  };
}

/**
 * One statement: a chain of nodes joined by connectors, or a lone declaration.
 *
 * Chains are the point — `A --> B --> C` on one line is idiomatic, and each
 * link in it is an edge, so the line is consumed left to right rather than
 * split on the first arrow.
 */
function readStatement(
  text: string,
  line: number,
  ensure: (id: string, label?: string, shape?: FlowNodeShape) => Draft,
  edges: FlowEdge[],
): boolean {
  const head = readNode(text);
  if (!head) return false;

  ensure(head.id, head.label, head.shape);
  let previous = head.id;
  let rest = head.rest.trimStart();

  // Bounded only so a pathological line cannot spin; real chains are short.
  for (let guard = 0; guard < 64 && rest.length > 0; guard += 1) {
    const link = readLink(rest);
    if (!link) return true;

    const next = readNode(link.rest);
    if (!next) return true;

    ensure(next.id, next.label, next.shape);
    edges.push({
      id: `edge-${line}-${edges.length}`,
      line,
      from: previous,
      to: next.id,
      label: link.label === null ? null : parseRichText(link.label),
      style: link.style,
      head: link.head,
    });

    previous = next.id;
    rest = next.rest.trimStart();
  }

  return true;
}

interface ReadNode {
  id: string;
  label: string | undefined;
  shape: FlowNodeShape | undefined;
  rest: string;
}

/** An id, optionally followed by a shape carrying its label. */
function readNode(text: string): ReadNode | null {
  const match = NODE_START.exec(text);
  if (!match) return null;

  const id = match[1]!;
  const rest = text.slice(match[0].length);

  for (const { open, close, shape } of SHAPES) {
    if (!rest.startsWith(open)) continue;
    const end = rest.indexOf(close, open.length);
    if (end === -1) continue;

    return {
      id,
      label: unquote(rest.slice(open.length, end)),
      shape,
      rest: rest.slice(end + close.length),
    };
  }

  return { id, label: undefined, shape: undefined, rest };
}

interface ReadLink {
  label: string | null;
  style: FlowEdgeLine;
  head: FlowEdgeHead;
  rest: string;
}

/** A connector, with a label written either inside it or in `|...|` after it. */
function readLink(text: string): ReadLink | null {
  const match = LINK.exec(text);
  if (!match || match.index !== 0) return null;

  let rest = text.slice(match[0].length).trimStart();
  let label = match[2] ?? null;

  if (rest.startsWith('|')) {
    const end = rest.indexOf('|', 1);
    if (end !== -1) {
      label = rest.slice(1, end);
      rest = rest.slice(end + 1).trimStart();
    }
  }

  return {
    label: label === null ? null : unquote(label),
    style: readLine(match[1]!),
    head: readHead(match[4]),
    rest,
  };
}

function readLine(token: string): FlowEdgeLine {
  if (token.includes('.')) return 'dotted';
  if (token.includes('=')) return 'thick';
  return 'solid';
}

function readHead(token: string | undefined): FlowEdgeHead {
  if (token === 'o') return 'circle';
  if (token === 'x') return 'cross';
  return token === '>' ? 'arrow' : 'none';
}

/** `subgraph id[Label]`, `subgraph id [Label]`, or just `subgraph Label`. */
function readSubgraphHead(text: string): { id: string; label: string } {
  const bracketed = /^([A-Za-z0-9_.:-]+)\s*[[(]"?(.*?)"?[\])]\s*$/.exec(text);
  if (bracketed) return { id: bracketed[1]!, label: bracketed[2]! };

  const id = unquote(text.trim());
  return { id, label: id };
}

function readDirection(token: string | undefined): FlowchartAst['direction'] | null {
  if (token === 'TD' || token === 'TB') return 'TB';
  if (token === 'BT' || token === 'LR' || token === 'RL') return token;
  return null;
}

function unquote(text: string): string {
  const trimmed = text.trim();
  const quoted = /^"(.*)"$/.exec(trimmed);
  return quoted ? quoted[1]! : trimmed;
}

/** `%%` starts a comment, but only outside a quoted label. */
function stripComment(text: string): string {
  let quoted = false;
  for (let index = 0; index < text.length - 1; index += 1) {
    if (text[index] === '"') quoted = !quoted;
    if (!quoted && text[index] === '%' && text[index + 1] === '%') return text.slice(0, index);
  }
  return text;
}
