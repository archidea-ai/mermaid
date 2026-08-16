import { visibleOwner } from './collapse';
import type { C4Ast, C4Relation } from '../parser/ast';
import type { C4Tree } from './tree';

export interface C4Link {
  /** `${a}::${b}` with the two ends sorted, so a pair has one id either way round. */
  readonly id: string;
  readonly a: string;
  readonly b: string;
  /** Every relation this one line stands for, in source order. */
  readonly relations: readonly C4Relation[];
  /** Relations running a → b, counting a BiRel in both. */
  readonly forward: number;
  readonly backward: number;
}

export interface C4LinkSet {
  readonly links: readonly C4Link[];
  readonly byId: ReadonlyMap<string, C4Link>;
  /** Relations that became internal to a collapsed box, by that box's id. */
  readonly internal: ReadonlyMap<string, number>;
  /** Which link carries a given relation, so a pick can find its line. */
  readonly linkOfRelation: ReadonlyMap<string, string>;
}

interface LinkDraft {
  a: string;
  b: string;
  relations: C4Relation[];
  forward: number;
  backward: number;
}

/**
 * Relations, resolved through the collapse state, grouped into the lines a
 * viewer actually sees.
 *
 * One line per unordered visible pair. A relation whose two ends resolve to the
 * same box is internal to a collapsed group: drawing it as a loop would state a
 * self-relationship the model never declared, so it is counted instead and
 * comes back as a real line when the group opens. That is the one lossy step
 * here, and it is deliberate.
 */
export function buildLinks(ast: C4Ast, tree: C4Tree, collapsed: ReadonlySet<string>): C4LinkSet {
  const drafts = new Map<string, LinkDraft>();
  const internal = new Map<string, number>();
  const linkOfRelation = new Map<string, string>();

  for (const relation of ast.relations) {
    // An alias nothing declared has no box to hang a line on — visibleOwner
    // would otherwise return it unchanged and invent a phantom box.
    if (!tree.boxes.has(relation.from) || !tree.boxes.has(relation.to)) continue;

    const from = visibleOwner(relation.from, collapsed, tree);
    const to = visibleOwner(relation.to, collapsed, tree);

    if (from === to) {
      internal.set(from, (internal.get(from) ?? 0) + 1);
      continue;
    }

    // Sorted independent of which end is "from", so both orientations of a
    // pair land in the same draft.
    const a = from < to ? from : to;
    const b = from < to ? to : from;
    const id = `${a}::${b}`;
    const draft: LinkDraft = drafts.get(id) ?? { a, b, relations: [], forward: 0, backward: 0 };

    draft.relations.push(relation);
    if (from === a) {
      draft.forward += 1;
      if (relation.bidirectional) draft.backward += 1;
    } else {
      draft.backward += 1;
      if (relation.bidirectional) draft.forward += 1;
    }

    drafts.set(id, draft);
    linkOfRelation.set(relation.id, id);
  }

  const links: C4Link[] = [...drafts.entries()].map(([id, draft]) => ({ id, ...draft }));

  return { links, byId: new Map(links.map((link) => [link.id, link])), internal, linkOfRelation };
}
