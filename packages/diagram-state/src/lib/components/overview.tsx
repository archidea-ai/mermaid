import {
  RichLabel,
  computeArc,
  useAnchors,
  withBreaks,
} from '@archidea-ai/mermaid-diagram-sequence';
import { createBindings } from '@archidea-ai/mermaid-scenario';
import { buildOverview, routeTo, stateKey } from '../model/overview';
import { StateNote } from './note';
import { isTerminal } from '../parser/ast';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { StateDiagramAst } from '../parser/ast';
import type { OverviewGroup } from '../model/overview';

export interface StateOverviewProps {
  ast: StateDiagramAst;
  active: string | null;
  onActivate: (stateId: string) => void;
}

/** Nothing is bound in the overview: it is the machine, not a run through it. */
const NO_BINDINGS = createBindings();

/**
 * The whole machine around one state, rather than one run through it.
 *
 * Everything that can lead here is to the left, everything it can lead to is to
 * the right, both from the same breadth-first walk — so the two sides are the
 * same kind of statement and the chart reads as one. Activating a state
 * re-centres on it, which is how you explore a machine you have not walked.
 */
export function StateOverview({ ast, active, onActivate }: StateOverviewProps) {
  const { containerRef, register, anchors } = useAnchors<HTMLDivElement>();
  const { columns, edges } = useMemo(() => buildOverview(ast, active), [ast, active]);

  /* Chips are laid out by CSS, so the transitions between them are measured. */
  const arcs = useMemo(
    () =>
      edges.flatMap((edge) => {
        const from = anchors.get(edge.fromKey);
        const to = anchors.get(edge.toKey);
        if (!from || !to) return [];

        /*
         * Edge to edge, not centre to centre. A line drawn between centres runs
         * underneath both boxes, and its midpoint — where the transition's own
         * label goes — lands on top of one of them rather than in the gap.
         */
        const forwards = to.x >= from.x;
        const start = { ...from, x: from.x + ((from.width ?? 0) / 2) * (forwards ? 1 : -1) };
        const end = { ...to, x: to.x - ((to.width ?? 0) / 2) * (forwards ? 1 : -1) };

        return [{ edge, arc: computeArc(start, end, { bow: 0.08 }) }];
      }),
    [edges, anchors],
  );

  /*
   * The active column is the point of the chart, and it is rarely at either
   * end — a machine of any size puts it off-screen in one direction or the
   * other, so it is brought back into view whenever it changes.
   */
  /*
   * Pointing at a state asks "how would I get there", so the route back to the
   * active state lights up: the lines taken and the states passed through.
   */
  const [pointed, setPointed] = useState<string | null>(null);
  const lit = useMemo(() => routeTo(edges, pointed), [edges, pointed]);
  // The active state's route to itself is empty, and dimming the chart to show
  // nothing is worse than not tracing at all.
  const tracing = lit.lines.size > 0;

  const activeColumn = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Clicking a state leaves it focused, which would otherwise keep tracing a
    // route through a chart that has just been rebuilt around it.
    setPointed(null);

    const column = activeColumn.current;
    // jsdom implements no layout and so has no scrollIntoView at all.
    if (typeof column?.scrollIntoView !== 'function') return;
    column.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [active]);

  if (columns.length === 0) {
    return <p className="seq-stage__idle">Nothing to show.</p>;
  }

  return (
    <div className="state-overview" ref={containerRef} data-tracing={tracing}>
      {/* Behind the states, not across them: a line is context, not content. */}
      <svg className="state-view__lines" aria-hidden="true">
        {arcs.map(({ edge, arc }) => (
          <path
            key={edge.id}
            className="state-line"
            data-lit={lit.lines.has(edge.id)}
            d={arc.path}
            pathLength={100}
            fill="none"
          />
        ))}
      </svg>

      {columns.map((column) => (
        <div
          key={column.depth}
          ref={column.depth === 0 ? activeColumn : undefined}
          className="state-overview__column"
          data-role={column.depth === 0 ? 'active' : column.depth < 0 ? 'history' : 'next'}
        >
          <span className="state-overview__heading">
            {column.depth === 0
              ? 'Active'
              : column.depth < 0
                ? `${-column.depth} back`
                : `${column.depth} ahead`}
          </span>

          {column.groups.map((group, index) => (
            <Group
              key={`${column.depth}-${index}`}
              ast={ast}
              depth={column.depth}
              group={group}
              active={active}
              lit={lit.states}
              register={register}
              onActivate={onActivate}
              onPoint={setPointed}
            />
          ))}
        </div>
      ))}

      {/* Labels ride above the lines, so a transition says what it is. */}
      {arcs.map(({ edge, arc }) =>
        edge.label ? (
          <span
            key={`label-${edge.id}`}
            className="state-overview__edge-label"
            data-lit={lit.lines.has(edge.id)}
            style={{ left: arc.midX, top: arc.midY }}
          >
            <RichLabel text={edge.label} values={NO_BINDINGS} />
          </span>
        ) : null,
      )}
    </div>
  );
}

/** Containers are kept here too, so a state reads in the machine it belongs to. */
function Group({
  ast,
  depth,
  group,
  active,
  lit,
  register,
  onActivate,
  onPoint,
}: {
  ast: StateDiagramAst;
  depth: number;
  group: OverviewGroup;
  active: string | null;
  lit: ReadonlySet<string>;
  register: (id: string) => (element: HTMLElement | null) => void;
  onActivate: (stateId: string) => void;
  onPoint: (key: string | null) => void;
}) {
  const chips = group.states.map((stateId) => {
    const key = stateKey(depth, stateId);

    return (
      <button
        key={stateId}
        ref={register(key)}
        type="button"
        className="seq-stage__object state-chip"
        data-kind={ast.stateById.get(stateId)?.kind === 'choice' ? 'actor' : 'participant'}
        data-state={stateId === active ? 'sending' : 'resting'}
        data-terminal={isTerminal(stateId)}
        data-lit={lit.has(key)}
        aria-pressed={stateId === active}
        onClick={() => onActivate(stateId)}
        // Focus traces the route too, so this is not a pointer-only affordance.
        onPointerEnter={() => onPoint(key)}
        onPointerLeave={() => onPoint(null)}
        onFocus={() => onPoint(key)}
        onBlur={() => onPoint(null)}
      >
        <span className="seq-stage__name">
          {withBreaks(ast.stateById.get(stateId)?.label ?? stateId)}
        </span>
        {stateId === active ? <StateNote ast={ast} stateId={stateId} values={NO_BINDINGS} /> : null}
      </button>
    );
  });

  return group.containers.reduceRight(
    (inner, container) => (
      <section key={container.id} className="state-box" aria-label={container.label}>
        <h4 className="state-box__title">{withBreaks(container.label)}</h4>
        {inner}
      </section>
    ),
    (<div className="state-overview__states">{chips}</div>) as React.ReactNode,
  );
}
