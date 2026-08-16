import type { C4LinkSet } from './links';

export type C4SelectionKind = 'element' | 'boundary' | 'link' | 'relation';

export interface C4Selection {
  readonly kind: C4SelectionKind;
  readonly id: string;
}

export interface C4Lit {
  /** Elements and boundaries alike — both are boxes on the page. */
  readonly boxes: ReadonlySet<string>;
  readonly links: ReadonlySet<string>;
  /** Set only when one relation was picked out of a line. */
  readonly relations: ReadonlySet<string>;
}

const NOTHING: C4Lit = { boxes: new Set(), links: new Set(), relations: new Set() };

/**
 * What lights up for a selection.
 *
 * First-degree only, as the flowchart established: a chart of any size is
 * mostly not about the box you clicked, and widening the ring past one step
 * lights the whole thing back up — which is the thing selecting was meant to
 * cut through.
 */
export function computeLit(selection: C4Selection | null, links: C4LinkSet): C4Lit {
  if (!selection) return NOTHING;

  if (selection.kind === 'element' || selection.kind === 'boundary') {
    const boxes = new Set<string>([selection.id]);
    const lit = new Set<string>();

    for (const link of links.links) {
      if (link.a !== selection.id && link.b !== selection.id) continue;
      boxes.add(link.a);
      boxes.add(link.b);
      lit.add(link.id);
    }

    return { boxes, links: lit, relations: new Set() };
  }

  const linkId = selection.kind === 'link' ? selection.id : links.linkOfRelation.get(selection.id);
  const link = linkId ? links.byId.get(linkId) : undefined;
  if (!link) return NOTHING;

  return {
    boxes: new Set([link.a, link.b]),
    links: new Set([link.id]),
    relations: selection.kind === 'relation' ? new Set([selection.id]) : new Set(),
  };
}
