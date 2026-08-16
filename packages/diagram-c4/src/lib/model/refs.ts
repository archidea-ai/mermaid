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
      /**
       * The ids of this boundary's *direct* children — nested boundaries
       * included, and nothing from inside them.
       *
       * Deliberately not the same number the chart's own badge and detail
       * panel show: those read `elementCountOf`, which descends the whole
       * subtree and counts elements only. Both facts are true and neither is
       * the other, so the field says which one it is.
       */
      readonly childIds: readonly string[];
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
  return isC4Ref(ref) && !!ref.data;
}

/**
 * A ref this renderer owns, payload or no payload.
 *
 * `isC4Selection` narrows to the full payload `toElementRef` produces; this
 * one only asks whose diagram it is, which is what an id-and-kind ref built
 * by a consumer can honestly answer.
 */
export function isC4Ref(ref: DiagramElementRef | null): ref is DiagramElementRef {
  return !!ref && ref.diagramType === C4_DIAGRAM_TYPE;
}

/**
 * What a bare ref is resolved against.
 *
 * `node` and `group` say which half of the model they mean on their own, but
 * `edge` covers both a drawn line and one relation riding on it — so that one
 * is decided by looking the id up, which only the chart can do.
 *
 * The ast and the tree, deliberately, and never the drawn link set: that is
 * rebuilt on every collapse, and resolving against it made a controlled ref
 * name a freshly allocated selection each time a boundary moved — which the
 * chart's reveal effect read as a new pick and used to re-open what the viewer
 * had just shut. Both of these change only when the source does.
 */
export interface C4RefLookup {
  readonly ast: C4Ast;
  readonly tree: C4Tree;
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
        childIds: tree.boxes.get(selection.id)?.children ?? [],
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

/**
 * The inverse, so a controlling prop can drive the chart.
 *
 * Two shapes are accepted, because two exist in practice. A ref echoed back
 * from `onSelect` carries the full payload and says outright what it is. A ref
 * a consumer *builds* — the search box and the external list the README
 * promises — has an id and a kind and nothing else, because that is all a
 * search index holds; requiring the payload made the documented case
 * unbuildable, and failing it silently made that invisible.
 */
export function fromElementRef(
  ref: DiagramElementRef | null,
  lookup?: C4RefLookup,
): C4Selection | null {
  if (!isC4Ref(ref)) return null;

  if (isC4Selection(ref)) {
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

  if (ref.kind === 'node') return { kind: 'element', id: ref.id };
  if (ref.kind === 'group') return { kind: 'boundary', id: ref.id };

  if (ref.kind === 'edge' && lookup) {
    // A relation first, and from the ast: the two id shapes never collide, and
    // this is the half that can be settled against something that never moves.
    if (lookup.ast.relations.some((relation) => relation.id === ref.id)) {
      return { kind: 'relation', id: ref.id };
    }

    /*
     * Otherwise a line, recognised by its own construction — the two box ids
     * it joins, sorted — rather than by asking whether one is currently drawn.
     * Naming a line is still naming it while the collapse that draws it is
     * open; `computeLit` and the detail panel already find nothing for a line
     * that is not on the chart, which is the honest reading of that moment.
     */
    const ends = ref.id.split('::');
    const [a, b] = ends;
    if (ends.length === 2 && a && b && lookup.tree.boxes.has(a) && lookup.tree.boxes.has(b)) {
      return { kind: 'link', id: ref.id };
    }
  }

  return null;
}
