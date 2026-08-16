import type { DiagramElementRef } from '@archidea-ai/mermaid-core';
import type { C4Ast, C4Boundary, C4Element, C4Relation } from '../parser/ast';
import type { C4Link, C4LinkSet } from './links';
import type { C4Selection } from './selection';
import type { C4Tree } from './tree';

export const C4_DIAGRAM_TYPE = 'c4';

/**
 * The payload a C4 selection carries in DiagramElementRef.data, so an outer
 * panel can render what was chosen without re-parsing the source.
 *
 * A relation's `linkId` is `string | null`: `null` means the relation is
 * currently internal to a collapsed boundary, so no visible line carries it
 * (Task 7's `buildLinks` leaves such a relation out of `linkOfRelation`
 * entirely). The relation is still genuinely selected — only its line is
 * conditional on the collapse state — so `null` here is not "nothing is
 * selected"; that is `toElementRef`'s own `null` return, one level up.
 */
export type C4SelectionData =
  | { readonly type: 'element'; readonly element: C4Element }
  | {
      readonly type: 'boundary';
      readonly boundary: C4Boundary;
      readonly members: readonly string[];
    }
  | { readonly type: 'link'; readonly link: C4Link }
  | {
      readonly type: 'relation';
      readonly relation: C4Relation;
      readonly linkId: string | null;
    };

export interface C4ElementRef extends DiagramElementRef {
  readonly data: C4SelectionData;
}

export function isC4Selection(ref: DiagramElementRef | null): ref is C4ElementRef {
  return !!ref && ref.diagramType === C4_DIAGRAM_TYPE && !!ref.data;
}

/**
 * A selection, in the vocabulary core already declares.
 *
 * Elements are nodes, boundaries are groups, and both a line and one relation
 * on it are edges — the existing kind union covers C4 without a new member.
 *
 * A relation is resolved from `ast.relations`, not from `links` — a relation
 * whose ends currently share a visible box (both inside the same collapsed
 * boundary) has no line and so no entry in `links.linkOfRelation`, but the
 * relation itself was still genuinely picked (a stepped run over a
 * `C4Dynamic` lands on exactly this case whenever a step's boundary hasn't
 * opened yet). Resolving through the link set instead would report that
 * selection as cleared while the chart's own state still held it.
 */
export function toElementRef(
  selection: C4Selection | null,
  tree: C4Tree,
  links: C4LinkSet,
  ast: C4Ast,
): DiagramElementRef | null {
  if (!selection) return null;
  const base = { id: selection.id, diagramType: C4_DIAGRAM_TYPE } as const;

  if (selection.kind === 'element') {
    const element = tree.elementById.get(selection.id);
    return element ? { ...base, kind: 'node', data: { type: 'element', element } } : null;
  }

  if (selection.kind === 'boundary') {
    const boundary = tree.boundaryById.get(selection.id);
    if (!boundary) return null;
    return {
      ...base,
      kind: 'group',
      data: {
        type: 'boundary',
        boundary,
        members: tree.boxes.get(selection.id)?.children ?? [],
      },
    };
  }

  if (selection.kind === 'link') {
    const link = links.byId.get(selection.id);
    return link ? { ...base, kind: 'edge', data: { type: 'link', link } } : null;
  }

  const relation = ast.relations.find((candidate) => candidate.id === selection.id);
  if (!relation) return null;

  const linkId = links.linkOfRelation.get(selection.id) ?? null;
  return { ...base, kind: 'edge', data: { type: 'relation', relation, linkId } };
}

/** The inverse, so a controlling prop can drive the chart. */
export function fromElementRef(ref: DiagramElementRef | null): C4Selection | null {
  if (!isC4Selection(ref)) return null;

  switch (ref.data.type) {
    case 'element':
      return { kind: 'element', id: ref.id };
    case 'boundary':
      return { kind: 'boundary', id: ref.id };
    case 'link':
      return { kind: 'link', id: ref.id };
    default:
      return { kind: 'relation', id: ref.id };
  }
}
