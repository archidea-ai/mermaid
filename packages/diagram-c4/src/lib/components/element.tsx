import { withBreaks } from '@archidea-ai/mermaid-diagram-sequence';
import type { CSSProperties } from 'react';
import type { C4Element } from '../parser/ast';

const KINDS: Readonly<Record<C4Element['kind'], string>> = {
  person: 'Person',
  system: 'System',
  container: 'Container',
  component: 'Component',
  node: 'Node',
};

const VARIANTS: Readonly<Record<C4Element['variant'], string>> = {
  plain: '',
  db: ' · database',
  queue: ' · queue',
};

/**
 * One element, at a uniform size.
 *
 * Type, name and technology, and deliberately not the description: uniform
 * boxes are what let a forty-element chart grid cleanly, and a wall of prose is
 * the failure mode C4 diagrams are famous for. The description is one click
 * away in the detail panel.
 */
export function C4ElementBox({
  element,
  lit,
  selected,
  register,
  onSelect,
}: {
  element: C4Element;
  lit: boolean;
  selected: boolean;
  register: (id: string) => (node: HTMLElement | null) => void;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      ref={register(element.id)}
      type="button"
      className="c4-element"
      data-kind={element.kind}
      data-variant={element.variant}
      data-external={element.external}
      data-lit={lit}
      data-selected={selected}
      aria-pressed={selected}
      style={styleOf(element)}
      onClick={() => onSelect(element.id)}
    >
      <span className="c4-element__type">
        {KINDS[element.kind]}
        {VARIANTS[element.variant]}
        {element.external ? ' · external' : ''}
      </span>
      <span className="c4-element__name">{withBreaks(element.label)}</span>
      {element.technology ? <span className="c4-element__tech">{element.technology}</span> : null}
    </button>
  );
}

/**
 * Author-declared colour, and nothing else. No component here picks a colour;
 * this is the source's own content reaching the chart, the same exception
 * mermaid's `rect rgb(...)` already gets in the sequence renderer.
 */
export function styleOf(subject: { style: C4Element['style'] }): CSSProperties {
  const style = subject.style;
  if (!style) return {};

  return {
    ...(style.background ? { '--c4-element-fill': style.background } : {}),
    ...(style.border ? { '--c4-element-stroke': style.border } : {}),
    ...(style.text ? { '--c4-element-text': style.text } : {}),
  } as CSSProperties;
}
