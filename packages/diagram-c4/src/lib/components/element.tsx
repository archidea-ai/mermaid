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
 *
 * Each subject gets its own property names rather than sharing one set:
 * `.c4-element` re-declares its three on itself, which beats inheriting them
 * from a `.c4-boundary` ancestor — so a boundary writing the element names
 * coloured nothing at all, including itself.
 */
export function styleOf(subject: { style: C4Style }): CSSProperties {
  return customProperties(subject.style, 'element');
}

/** `UpdateBoundaryStyle`, on the properties `.c4-boundary` actually reads. */
export function styleOfBoundary(subject: { style: C4Style }): CSSProperties {
  return customProperties(subject.style, 'boundary');
}

/**
 * `UpdateRelStyle`, on the one line that can honestly carry it.
 *
 * A line standing for several relations has no single author style — the
 * directive names a pair, and every relation between that pair takes it, so an
 * aggregate could hold two contradicting colours and drawing either would be a
 * claim the source never made. It is applied only to a line carrying exactly
 * one relation; open the boundary, and each relation gets its own line and its
 * own colour.
 *
 * A line is drawn in two pieces, so its author colour arrives in two: the
 * `<path>` takes the stroke, and `styleOfLinkLabel` puts the text colour on the
 * label — a sibling button, which cannot inherit anything from the path. There
 * is deliberately no fill: a line has none, so `$bgColor` on a relation names
 * nothing, and writing it would leave a property on an element no rule reads.
 */
export function styleOfLink(link: C4StyledLink): CSSProperties {
  const border = onlyRelation(link)?.style?.border;
  return border ? ({ '--c4-link-stroke': border } as CSSProperties) : {};
}

/**
 * The same relation's `$textColor`, on the element that shows its words.
 *
 * Without this, `UpdateRelStyle(a, b, $textColor=…)` parsed, recorded and
 * changed nothing — the same "tested but never drawn" gap the stroke had.
 */
export function styleOfLinkLabel(link: C4StyledLink): CSSProperties {
  const text = onlyRelation(link)?.style?.text;
  return text ? ({ '--c4-link-text': text } as CSSProperties) : {};
}

type C4Style = C4Element['style'];
type C4StyledLink = { relations: readonly { style: C4Style }[] };

const onlyRelation = (link: C4StyledLink) =>
  link.relations.length === 1 ? link.relations[0] : undefined;

function customProperties(style: C4Style, subject: 'element' | 'boundary'): CSSProperties {
  if (!style) return {};

  return {
    ...(style.background ? { [`--c4-${subject}-fill`]: style.background } : {}),
    ...(style.border ? { [`--c4-${subject}-stroke`]: style.border } : {}),
    ...(style.text ? { [`--c4-${subject}-text`]: style.text } : {}),
  } as CSSProperties;
}
