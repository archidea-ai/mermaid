import { useEffect, useMemo, useState } from 'react';
import { proxyRenderer } from '@archidea-ai/mermaid-core';
import { createBindings } from '@archidea-ai/mermaid-scenario';
import {
  RichLabel,
  computeArc,
  useAnchors,
  withBreaks,
} from '@archidea-ai/mermaid-diagram-sequence';
import { parse } from '../parser/parse';
import { buildColumns } from '../model/layout';
import { selectNeighbours } from '../model/neighbours';
import type { DiagramSurfaceProps } from '@archidea-ai/mermaid-core';
import type { FlowGroup } from '../model/layout';
import type { FlowNode, FlowchartAst } from '../parser/ast';

/** A flowchart states no run, so nothing is ever bound in one. */
const NO_BINDINGS = createBindings();

/**
 * The renderer's Component.
 *
 * Same shape as the sequence and state surfaces: parse, and fall back to the
 * proxy if we cannot, so this package never renders worse than upstream.
 */
export function FlowchartSurface(props: DiagramSurfaceProps) {
  const { text, onStepController, onViewportController, onError } = props;

  const parsed = useMemo(() => {
    try {
      return { ast: parse(text), error: null as Error | null };
    } catch (cause) {
      return { ast: null, error: cause instanceof Error ? cause : new Error(String(cause)) };
    }
  }, [text]);

  /*
   * A flowchart has no run to step through, so it offers no step controller —
   * the toolbar's transport disables itself rather than pretending.
   */
  useEffect(() => {
    onStepController?.(null);
    onViewportController?.(null);
  }, [onStepController, onViewportController]);

  useEffect(() => {
    if (!parsed.error) return;
    onError?.(parsed.error);
  }, [parsed.error, onError]);

  if (!parsed.ast) return <ProxyFallback {...props} />;
  return <FlowchartOverview ast={parsed.ast} className={props.className} style={props.style} />;
}

function ProxyFallback({ text, id, config, className, style, onError }: DiagramSurfaceProps) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void proxyRenderer
      .renderToSvg({ id, text, config })
      .then((result) => !cancelled && setSvg(result.svg))
      .catch((cause: unknown) => {
        if (!cancelled) onError?.(cause instanceof Error ? cause : new Error(String(cause)));
      });
    return () => {
      cancelled = true;
    };
  }, [text, id, config, onError]);

  if (!svg) return null;
  return (
    <div
      className={className}
      style={style}
      data-renderer="proxy"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/**
 * The whole chart at once, in dependency order, with one thing to do: click a
 * node to see what it touches.
 *
 * There is no second view and no view selector. A flowchart is not a run —
 * there is no "current" step to walk through — so an overview is the only
 * honest reading of one, and offering a chooser with a single option is chrome
 * that says nothing.
 */
function FlowchartOverview({
  ast,
  className,
  style,
}: {
  ast: FlowchartAst;
  className?: string;
  style?: DiagramSurfaceProps['style'];
}) {
  const { containerRef, register, anchors } = useAnchors<HTMLDivElement>();
  const [selected, setSelected] = useState<string | null>(null);

  const columns = useMemo(() => buildColumns(ast), [ast]);
  const lit = useMemo(() => selectNeighbours(ast, selected), [ast, selected]);

  /* Nodes are placed by CSS, so the edges between them are measured. */
  const arcs = useMemo(
    () =>
      ast.edges.flatMap((edge) => {
        const from = anchors.get(edge.from);
        const to = anchors.get(edge.to);
        if (!from || !to) return [];

        /*
         * Border to border, not centre to centre. A line between centres runs
         * underneath both nodes, and its midpoint — where the edge's own label
         * goes — lands on top of one of them rather than in the gap.
         */
        const forwards = to.x >= from.x;
        const start = { ...from, x: from.x + ((from.width ?? 0) / 2) * (forwards ? 1 : -1) };
        const end = { ...to, x: to.x - ((to.width ?? 0) / 2) * (forwards ? 1 : -1) };

        return [{ edge, arc: computeArc(start, end, { bow: 0.1, self: edge.from === edge.to }) }];
      }),
    [ast.edges, anchors],
  );

  return (
    /*
     * `archidea-sequence` is the renderer root the --seq-* tokens are scoped to,
     * so every native renderer wears it — a host theme reaches all of them by
     * the one class, and nothing outside.
     */
    <div
      className={['archidea-sequence', 'archidea-flowchart', className].filter(Boolean).join(' ')}
      style={style}
    >
      <p className="flow-hint">Click a node to see what it connects to</p>

      <div className="flow-view">
        <div className="flow-chart" ref={containerRef} data-selecting={selected !== null}>
          {/* Behind the nodes, so a line is context rather than something across them. */}
          <svg className="flow-chart__lines" aria-hidden="true">
            {arcs.map(({ edge, arc }) => (
              <path
                key={edge.id}
                className="flow-edge"
                data-lit={lit.edges.has(edge.id)}
                data-style={edge.style}
                data-head={edge.head}
                d={arc.path}
                pathLength={100}
                fill="none"
              />
            ))}
          </svg>

          {columns.map((column) => (
            <div key={column.rank} className="flow-column">
              {column.groups.map((group, index) => (
                <Group
                  key={`${column.rank}-${group.subgraph?.id ?? index}`}
                  group={group}
                  lit={lit.nodes}
                  selected={selected}
                  register={register}
                  onSelect={setSelected}
                />
              ))}
            </div>
          ))}

          {/* Labels ride above the lines, so an edge says what it is. */}
          {arcs.map(({ edge, arc }) =>
            edge.label ? (
              <span
                key={`label-${edge.id}`}
                className="flow-edge__label"
                data-lit={lit.edges.has(edge.id)}
                style={{ left: arc.midX, top: arc.midY }}
              >
                <RichLabel text={edge.label} values={NO_BINDINGS} />
              </span>
            ) : null,
          )}
        </div>
      </div>
    </div>
  );
}

/** Subgraphs are kept, so a node reads inside the group its author drew it in. */
function Group({
  group,
  lit,
  selected,
  register,
  onSelect,
}: {
  group: FlowGroup;
  lit: ReadonlySet<string>;
  selected: string | null;
  register: (id: string) => (element: HTMLElement | null) => void;
  onSelect: (nodeId: string | null) => void;
}) {
  const nodes = (
    <div className="flow-column__nodes">
      {group.nodes.map((node: FlowNode) => (
        <button
          key={node.id}
          ref={register(node.id)}
          type="button"
          className="flow-node"
          data-shape={node.shape}
          data-lit={lit.has(node.id)}
          data-selected={node.id === selected}
          aria-pressed={node.id === selected}
          // Clicking the chosen node again clears it, so there is a way back out.
          onClick={() => onSelect(node.id === selected ? null : node.id)}
        >
          <span className="flow-node__label">{withBreaks(node.label)}</span>
        </button>
      ))}
    </div>
  );

  if (!group.subgraph) return nodes;

  return (
    <section className="flow-group" aria-label={group.subgraph.label}>
      <h4 className="flow-group__title">{withBreaks(group.subgraph.label)}</h4>
      {nodes}
    </section>
  );
}
