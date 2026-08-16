import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import { withBreaks } from '@archidea-ai/mermaid-diagram-sequence';
import { styleOfBoundary } from './element';
import type { ReactNode } from 'react';
import type { C4Boundary } from '../parser/ast';

/**
 * One boundary.
 *
 * The chevron toggles and the name selects, both from the header. The design
 * had the body doing the selecting, but a shut boundary has no body — and shut
 * is the state the chart starts in, so its own selection would have been
 * unreachable exactly when it matters.
 */
export function C4BoundaryBox({
  boundary,
  collapsed,
  count,
  lit,
  selected,
  register,
  onToggle,
  onSelect,
  children,
}: {
  boundary: C4Boundary;
  collapsed: boolean;
  count: number;
  lit: boolean;
  selected: boolean;
  register: (id: string) => (node: HTMLElement | null) => void;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  children: ReactNode;
}) {
  const Chevron = collapsed ? ChevronRightIcon : ChevronDownIcon;

  return (
    <section
      className="c4-boundary"
      data-collapsed={collapsed}
      data-node={boundary.isNode}
      data-lit={lit}
      data-selected={selected}
      style={styleOfBoundary(boundary)}
      /*
       * A shut boundary is one box, so it anchors on itself; an open one is a
       * container the size of its members, and a line to its middle would run
       * under them — so it anchors on its header instead.
       */
      ref={collapsed ? register(boundary.id) : undefined}
    >
      <header className="c4-boundary__header" ref={collapsed ? undefined : register(boundary.id)}>
        <button
          type="button"
          className="c4-boundary__toggle"
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${boundary.label}`}
          onClick={() => onToggle(boundary.id)}
        >
          <Chevron size={14} aria-hidden="true" />
          <span className="c4-boundary__title">
            {boundary.type ? <span className="c4-boundary__type">{boundary.type}</span> : null}
            <span className="c4-boundary__name">{withBreaks(boundary.label)}</span>
          </span>
        </button>

        <button
          type="button"
          className="c4-boundary__select"
          aria-pressed={selected}
          onClick={() => onSelect(boundary.id)}
        >
          {collapsed ? `${count} ${count === 1 ? 'element' : 'elements'}` : 'Details'}
        </button>
      </header>

      {collapsed ? null : <div className="c4-boundary__members">{children}</div>}
    </section>
  );
}
