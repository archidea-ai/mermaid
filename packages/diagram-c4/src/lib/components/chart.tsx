import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { computeArc, useAnchors } from '@archidea-ai/mermaid-diagram-sequence';
import { allBoundaryIds, isVisible, revealFor } from '../model/collapse';
import { insetEndpoints } from '../model/geometry';
import { buildLinks } from '../model/links';
import { orderMembers } from '../model/order';
import { fromElementRef, toElementRef } from '../model/refs';
import { orderedRelations, useStepController } from '../model/run';
import { computeLit } from '../model/selection';
import { buildTree, elementCountOf } from '../model/tree';
import { C4BoundaryBox } from './boundary';
import { C4Detail } from './detail';
import { C4ElementBox, styleOfLink, styleOfLinkLabel } from './element';
import { C4LinkDialog } from './link-dialog';
import { C4Toolbar, C4Transport } from './toolbar';
import type { DiagramElementRef, DiagramEventMap, StepController } from '@archidea-ai/mermaid-core';
import type { CSSProperties, ReactNode } from 'react';
import type { C4Ast, C4Relation } from '../parser/ast';
import type { C4Selection } from '../model/selection';

export interface C4ChartProps {
  readonly ast: C4Ast;
  readonly id: string;
  readonly className?: string;
  readonly style?: CSSProperties;
  /** Omit for uncontrolled. Passing it — including null — takes control. */
  readonly selection?: DiagramElementRef | null;
  readonly onSelect?: (event: DiagramEventMap['select']) => void;
  /**
   * Reports the run controller for a `C4Dynamic` source, or null for a static
   * one — a static chart is a map, not a run, so it has no controller and the
   * transport disables itself rather than pretending.
   */
  readonly onStepController?: (controller: StepController | null) => void;
}

/**
 * The whole model at once, shut.
 *
 * Boundaries are real nested elements and members flow in a wrapping grid, so
 * collapsing is a CSS reflow rather than a re-solve — which is the only way the
 * toggle can animate honestly, and why the arc layer measures afterwards
 * instead of computing positions itself.
 */
export function C4Chart(props: C4ChartProps) {
  // Taken as one object, not destructured: Task 16 adds `onStepController`
  // and reaches it through `props`.
  const { ast, id, className, style, selection: selectionProp, onSelect } = props;
  const { containerRef, register, anchors } = useAnchors<HTMLDivElement>();

  const tree = useMemo(() => buildTree(ast), [ast]);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => allBoundaryIds(ast));

  // A new source is a new model, so it starts shut as a fresh one would.
  useEffect(() => setCollapsed(allBoundaryIds(ast)), [ast]);

  const links = useMemo(() => buildLinks(ast, tree, collapsed), [ast, tree, collapsed]);

  const [internal, setInternal] = useState<C4Selection | null>(null);
  const controlled = selectionProp !== undefined;
  /*
   * The lookup is what lets a *bare* ref — an id and a kind, all a search box
   * or an external list has — name an edge: only the chart knows whether that
   * id is a drawn line or one relation on one.
   *
   * It is `tree`, not `links`. `fromElementRef` allocates a fresh selection
   * per call, and `buildLinks` rebuilds the link set on every collapse — so
   * depending on it here handed the reveal effect below a brand new object
   * naming the very same relation each time a boundary moved, and it re-opened
   * what the viewer had just shut. Collapse all and every chevron were dead
   * for as long as a controlling prop named a relation: Task 16's symptom
   * again, on the path its fix did not cover. `tree` changes only when the
   * source does, so a ref that still names the same thing still resolves to
   * the same selection.
   */
  const selection = useMemo(
    () => (controlled ? fromElementRef(selectionProp ?? null, { ast, tree }) : internal),
    [controlled, selectionProp, internal, ast, tree],
  );

  // A new source is a new model, so nothing carried over is still true.
  useEffect(() => setInternal(null), [ast]);

  const lit = useMemo(() => computeLit(selection, links), [selection, links]);

  /**
   * Standard two-mode React: the controller decides when it is controlling,
   * and the chart always reports. There is no third mode where both hold state.
   */
  const commit = useCallback(
    (next: C4Selection | null) => {
      if (!controlled) setInternal(next);
      onSelect?.({ element: toElementRef(next, tree, links, ast) });
    },
    // A stable identity, so Task 16's step effect can depend on it without
    // re-firing on every render — which would re-select on each keystroke.
    // `ast` is already in every other effect's dependency array here for the
    // same reason: it only changes when the source itself does.
    [controlled, onSelect, tree, links, ast],
  );

  /** Choosing the same thing again clears it, so there is a way back out. */
  const select = (next: C4Selection) =>
    commit(selection && selection.kind === next.kind && selection.id === next.id ? null : next);

  /*
   * A dynamic diagram's relations, in run order. Empty for a static chart,
   * which is a map rather than a run — `useStepController` then holds at
   * count 0 and the transport disables itself rather than pretending.
   */
  const steps = useMemo(() => orderedRelations(ast), [ast]);
  const { current, controller } = useStepController(steps.length);

  /*
   * The relation this run last put on the chart.
   *
   * `commit` closes over `links`, which is rebuilt on every collapse change,
   * so the effect below re-runs whenever a boundary opens or shuts — not only
   * when the step moves. Re-committing there would reinstate the run's
   * relation over whatever the viewer had since chosen, and the reveal effect
   * would re-open the boundary they had just shut: Collapse all and every
   * chevron were dead for the rest of a run. Holding the id makes the effect
   * idempotent, so only an actual step commits.
   */
  const steppedRef = useRef<string | null>(null);

  // A new source is a new run, so nothing it committed is still true. Declared
  // before the step effect so the clearing lands first, in the same pass.
  useEffect(() => {
    steppedRef.current = null;
  }, [ast]);

  // Stepping is just a selection, so it reveals and docks like any other —
  // the reveal effect below is the only place that opens a relation's ends.
  useEffect(() => {
    const relation = current >= 0 ? steps[current] : null;
    if (!relation) {
      // Rewinding past the start ends the run, so stepping back onto the same
      // relation is a fresh step and must commit again.
      steppedRef.current = null;
      return;
    }

    if (steppedRef.current === relation.id) return;
    steppedRef.current = relation.id;
    commit({ kind: 'relation', id: relation.id });
  }, [current, steps, commit]);

  const { onStepController } = props;
  useEffect(() => {
    onStepController?.(ast.kind === 'dynamic' ? controller : null);
  }, [ast.kind, controller, onStepController]);

  const [dialogLinkId, setDialogLinkId] = useState<string | null>(null);

  // A new source is a new model, so a dialog open over the old one is stale —
  // its link may no longer exist, or exist with a different meaning.
  useEffect(() => setDialogLinkId(null), [ast]);

  /**
   * A line with one relation selects directly; a line with several asks which.
   * A dialog listing a single option is chrome that says nothing.
   */
  const openLink = (linkId: string) => {
    const link = links.byId.get(linkId);
    if (!link) return;

    const single = link.relations.length === 1 ? link.relations[0] : null;
    if (single) select({ kind: 'relation', id: single.id });
    else setDialogLinkId(linkId);
  };

  /*
   * A relation is only meaningful if you can see both its ends, so selecting
   * one opens whatever hides them — whether the pick came from the modal, from
   * a stepped run, or from the controlling prop.
   */
  useEffect(() => {
    if (selection?.kind !== 'relation') return;
    const relation = ast.relations.find((candidate) => candidate.id === selection.id);
    if (!relation) return;

    const needed = revealFor(relation, tree);
    setCollapsed((previous) =>
      [...needed].some((boundaryId) => previous.has(boundaryId))
        ? new Set([...previous].filter((shut) => !needed.has(shut)))
        : previous,
    );
  }, [selection, ast, tree]);

  /**
   * Picking a relation opens whatever hides either end, then lights it. The
   * same call a dynamic run's step makes — one mechanism, two triggers.
   */
  const reveal = (relation: C4Relation) => {
    commit({ kind: 'relation', id: relation.id });
    setDialogLinkId(null);
  };

  /* Boxes are placed by CSS, so the lines between them are measured. */
  const arcs = useMemo(
    () =>
      links.links.flatMap((link) => {
        const a = anchors.get(link.a);
        const b = anchors.get(link.b);
        if (!a || !b) return [];

        const [start, end] = insetEndpoints(a, b);
        /*
         * Barely bowed. A C4 line is a statement that two things talk; a
         * pronounced curve bends the approach so the head reads as pointing
         * somewhere other than the box it lands on. Enough to keep a pair of
         * lines apart, and no more.
         */
        return [{ link, arc: computeArc(start, end, { bow: 0.035 }) }];
      }),
    [links, anchors],
  );

  const toggle = (boundaryId: string) =>
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (!next.delete(boundaryId)) next.add(boundaryId);
      return next;
    });

  const renderBox = (boxId: string): ReactNode => {
    if (!isVisible(boxId, collapsed, tree)) return null;

    const element = tree.elementById.get(boxId);
    if (element) {
      return (
        <C4ElementBox
          key={boxId}
          element={element}
          lit={lit.boxes.has(boxId)}
          selected={selection?.kind === 'element' && selection.id === boxId}
          register={register}
          onSelect={(elementId) => select({ kind: 'element', id: elementId })}
        />
      );
    }

    const boundary = tree.boundaryById.get(boxId);
    if (!boundary) return null;

    const children = tree.boxes.get(boxId)?.children ?? [];
    return (
      <C4BoundaryBox
        key={boxId}
        boundary={boundary}
        collapsed={collapsed.has(boxId)}
        count={elementCountOf(tree, boxId)}
        lit={lit.boxes.has(boxId)}
        selected={selection?.kind === 'boundary' && selection.id === boxId}
        register={register}
        onToggle={toggle}
        onSelect={(boundaryId) => select({ kind: 'boundary', id: boundaryId })}
      >
        {orderMembers(children, links.links).map(renderBox)}
      </C4BoundaryBox>
    );
  };

  return (
    /*
     * `archidea-sequence` is the root the --seq-* tokens are scoped to, so every
     * native renderer wears it: one class reaches all of them, and nothing else.
     */
    <div
      className={['archidea-sequence', 'archidea-c4', className].filter(Boolean).join(' ')}
      style={style}
      data-diagram={id}
      // Escape is the way out of a selection without hunting for the box again.
      onKeyDown={(event) => event.key === 'Escape' && commit(null)}
    >
      <C4Toolbar
        onExpandAll={() => setCollapsed(new Set())}
        onCollapseAll={() => setCollapsed(allBoundaryIds(ast))}
      >
        <C4Transport
          current={current}
          count={steps.length}
          onPrev={() => controller.prev()}
          onNext={() => controller.next()}
        />
      </C4Toolbar>

      {ast.title ? <h3 className="c4-title">{ast.title}</h3> : null}

      <div className="c4-view">
        <div className="c4-chart" data-selecting={selection !== null} ref={containerRef}>
          {/* Behind the boxes, so a line is context rather than something across them. */}
          <svg className="c4-chart__lines" aria-hidden="true">
            <defs>
              <marker
                id={`c4-${id}-arrow`}
                markerUnits="strokeWidth"
                orient="auto"
                markerWidth={4.4}
                markerHeight={3.2}
                refX={4}
                refY={1.6}
              >
                <path d="M 0 0 L 4 1.6 L 0 3.2 z" fill="context-stroke" />
              </marker>
              <marker
                id={`c4-${id}-arrow-start`}
                markerUnits="strokeWidth"
                orient="auto-start-reverse"
                markerWidth={4.4}
                markerHeight={3.2}
                refX={4}
                refY={1.6}
              >
                <path d="M 0 0 L 4 1.6 L 0 3.2 z" fill="context-stroke" />
              </marker>
            </defs>

            {arcs.map(({ link, arc }) => (
              <path
                key={link.id}
                className="c4-link"
                data-link={link.id}
                data-lit={lit.links.has(link.id)}
                d={arc.path}
                fill="none"
                style={styleOfLink(link)}
                markerEnd={link.forward ? `url(#c4-${id}-arrow)` : undefined}
                markerStart={link.backward ? `url(#c4-${id}-arrow-start)` : undefined}
              />
            ))}
          </svg>

          {orderMembers(tree.roots, links.links).map(renderBox)}

          {/* Labels ride above the lines, so a line says what it is. */}
          {arcs.map(({ link, arc }) => {
            const single = link.relations.length === 1 ? link.relations[0] : null;
            const text = single
              ? single.label || '1 relation'
              : `${link.relations.length} relations`;

            return (
              <button
                key={`label-${link.id}`}
                type="button"
                className="c4-link__label"
                // The line this label belongs to, so a check that it sits on
                // that line can name the one path rather than accepting any.
                data-link={link.id}
                data-aggregate={!single}
                data-lit={lit.links.has(link.id)}
                /*
                 * An aggregate shows its count and says the whole phrase. A
                 * visually-hidden word beside the number would leave the
                 * accessible name to however the name computation joins two
                 * text nodes; an explicit label is the same string every time.
                 */
                aria-label={single ? undefined : text}
                // The label is a sibling of the path, so a relation's own text
                // colour has to be put here — it cannot inherit it from there.
                style={{ ...styleOfLinkLabel(link), left: arc.midX, top: arc.midY }}
                onClick={() => openLink(link.id)}
              >
                {single ? text : link.relations.length}
              </button>
            );
          })}
        </div>
      </div>

      <C4Detail selection={selection} ast={ast} tree={tree} links={links} />

      <C4LinkDialog
        link={dialogLinkId ? (links.byId.get(dialogLinkId) ?? null) : null}
        tree={tree}
        open={dialogLinkId !== null}
        // Portalled to <body>, so the host's inline theme cannot reach it by
        // inheritance — it travels explicitly.
        style={style}
        onOpenChange={(next) => !next && setDialogLinkId(null)}
        onPick={reveal}
      />
    </div>
  );
}
