import { useEffect, useMemo, useState } from 'react';
import { useAnchors } from '@archidea-ai/mermaid-diagram-sequence';
import { allBoundaryIds, isVisible } from '../model/collapse';
import { buildLinks } from '../model/links';
import { orderMembers } from '../model/order';
import { buildTree, elementCountOf } from '../model/tree';
import { C4BoundaryBox } from './boundary';
import { C4ElementBox } from './element';
import { C4Toolbar } from './toolbar';
import type { CSSProperties, ReactNode } from 'react';
import type { C4Ast } from '../parser/ast';

export interface C4ChartProps {
  readonly ast: C4Ast;
  readonly id: string;
  readonly className?: string;
  readonly style?: CSSProperties;
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
  // Taken as one object, not destructured: Tasks 15 and 16 add `selection`,
  // `onSelect` and `onStepController`, and reach them through `props`.
  const { ast, id, className, style } = props;
  const { containerRef, register } = useAnchors<HTMLDivElement>();

  const tree = useMemo(() => buildTree(ast), [ast]);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => allBoundaryIds(ast));

  // A new source is a new model, so it starts shut as a fresh one would.
  useEffect(() => setCollapsed(allBoundaryIds(ast)), [ast]);

  const links = useMemo(() => buildLinks(ast, tree, collapsed), [ast, tree, collapsed]);

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
          lit={false}
          selected={false}
          register={register}
          onSelect={() => undefined}
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
        lit={false}
        selected={false}
        register={register}
        onToggle={toggle}
        onSelect={() => undefined}
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
    >
      <C4Toolbar
        onExpandAll={() => setCollapsed(new Set())}
        onCollapseAll={() => setCollapsed(allBoundaryIds(ast))}
      />

      {ast.title ? <h3 className="c4-title">{ast.title}</h3> : null}

      <div className="c4-view">
        <div className="c4-chart" ref={containerRef}>
          {orderMembers(tree.roots, links.links).map(renderBox)}
        </div>
      </div>
    </div>
  );
}
