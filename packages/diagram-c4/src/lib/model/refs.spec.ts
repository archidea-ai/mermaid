import { describe, expect, it } from 'vitest';
import { parse } from '../parser/parse';
import { buildTree } from './tree';
import { buildLinks } from './links';
import { fromElementRef, isC4Selection, toElementRef } from './refs';

const ast = parse(`C4Container
Person(customer, "Customer")
System_Boundary(bank, "Bank") {
    Container(api, "API", "Java")
}
Rel(customer, api, "calls", "HTTPS")`);

const tree = buildTree(ast);
const links = buildLinks(ast, tree, new Set());

describe('toElementRef', () => {
  it('maps an element to the node kind, carrying the element itself', () => {
    const ref = toElementRef({ kind: 'element', id: 'customer' }, tree, links, ast)!;

    expect(ref.kind).toBe('node');
    expect(ref.id).toBe('customer');
    expect(ref.diagramType).toBe('c4');
    expect(isC4Selection(ref) && ref.data.type === 'element' && ref.data.element.label).toBe(
      'Customer',
    );
  });

  it('maps a boundary to the group kind, and names what it holds', () => {
    const ref = toElementRef({ kind: 'boundary', id: 'bank' }, tree, links, ast)!;

    expect(ref.kind).toBe('group');
    // `childIds`, not "members": these are the boundary's direct children,
    // while the badge and the detail panel count elements recursively.
    expect(isC4Selection(ref) && ref.data.type === 'boundary' && ref.data.childIds).toEqual([
      'api',
    ]);
  });

  it('maps a link and a relation to the edge kind, so no new kind is needed', () => {
    expect(toElementRef({ kind: 'link', id: 'api::customer' }, tree, links, ast)?.kind).toBe(
      'edge',
    );
    expect(
      toElementRef({ kind: 'relation', id: ast.relations[0]!.id }, tree, links, ast)?.kind,
    ).toBe('edge');
  });

  it('names the line a relation rides on, so an outer panel need not search', () => {
    const ref = toElementRef({ kind: 'relation', id: ast.relations[0]!.id }, tree, links, ast)!;
    expect(isC4Selection(ref) && ref.data.type === 'relation' && ref.data.linkId).toBe(
      'api::customer',
    );
  });

  it('is null for something the model does not have', () => {
    expect(toElementRef({ kind: 'element', id: 'ghost' }, tree, links, ast)).toBeNull();
  });

  describe('a relation internal to a collapsed boundary', () => {
    // Both ends live inside the same boundary — exactly the shape a
    // C4Dynamic step lands on before that boundary has opened.
    const internalAst = parse(`C4Container
System_Boundary(api, "API") {
    Container(reset, "Reset", "T")
    Container(security, "Security", "T")
}
Rel(reset, security, "validates using")`);
    const internalTree = buildTree(internalAst);
    const relation = internalAst.relations[0]!;

    it('is still a real ref, with linkId null, while the boundary is shut', () => {
      const shutLinks = buildLinks(internalAst, internalTree, new Set(['api']));
      const ref = toElementRef(
        { kind: 'relation', id: relation.id },
        internalTree,
        shutLinks,
        internalAst,
      )!;

      expect(ref).not.toBeNull();
      expect(ref.kind).toBe('edge');
      expect(isC4Selection(ref) && ref.data.type === 'relation' && ref.data.linkId).toBeNull();
    });

    it('carries its line once the boundary is open', () => {
      const openLinks = buildLinks(internalAst, internalTree, new Set());
      const ref = toElementRef(
        { kind: 'relation', id: relation.id },
        internalTree,
        openLinks,
        internalAst,
      )!;

      expect(isC4Selection(ref) && ref.data.type === 'relation' && ref.data.linkId).toBe(
        'reset::security',
      );
    });

    it('round-trips the same C4Selection whichever way the boundary is set', () => {
      const shutLinks = buildLinks(internalAst, internalTree, new Set(['api']));
      const openLinks = buildLinks(internalAst, internalTree, new Set());
      const selection = { kind: 'relation', id: relation.id } as const;

      expect(fromElementRef(toElementRef(selection, internalTree, shutLinks, internalAst))).toEqual(
        selection,
      );
      expect(fromElementRef(toElementRef(selection, internalTree, openLinks, internalAst))).toEqual(
        selection,
      );
    });
  });
});

describe('fromElementRef', () => {
  it('round-trips every kind', () => {
    for (const selection of [
      { kind: 'element', id: 'customer' },
      { kind: 'boundary', id: 'bank' },
      { kind: 'link', id: 'api::customer' },
      { kind: 'relation', id: ast.relations[0]!.id },
    ] as const) {
      expect(fromElementRef(toElementRef(selection, tree, links, ast))).toEqual(selection);
    }
  });

  it('reads null as no selection', () => {
    expect(fromElementRef(null)).toBeNull();
  });

  it('ignores a ref from another diagram type', () => {
    expect(fromElementRef({ kind: 'node', id: 'x', diagramType: 'sequence' })).toBeNull();
  });

  /*
   * The case the README documents and the branch could not build: a search box
   * or an external list holds an id and a kind, never the payload `onSelect`
   * hands back. Requiring the payload made every such ref resolve to null, and
   * resolve silently.
   */
  describe('a bare ref, carrying only an id and a kind', () => {
    // The ast and the tree, never the drawn link set: both change only when
    // the source does, so a ref that still names the same thing resolves to
    // the same selection across a collapse.
    const lookup = { ast, tree };

    it('reads a node as the element it names', () => {
      expect(fromElementRef({ kind: 'node', id: 'customer', diagramType: 'c4' }, lookup)).toEqual({
        kind: 'element',
        id: 'customer',
      });
    });

    it('reads a group as the boundary it names', () => {
      expect(fromElementRef({ kind: 'group', id: 'bank', diagramType: 'c4' }, lookup)).toEqual({
        kind: 'boundary',
        id: 'bank',
      });
    });

    it('reads an edge naming a line as that line, by the two ends its id joins', () => {
      expect(
        fromElementRef({ kind: 'edge', id: 'api::customer', diagramType: 'c4' }, lookup),
      ).toEqual({ kind: 'link', id: 'api::customer' });
    });

    it('claims nothing for a pair id whose ends are not boxes', () => {
      expect(
        fromElementRef({ kind: 'edge', id: 'ghost::phantom', diagramType: 'c4' }, lookup),
      ).toBeNull();
    });

    /*
     * The regression the lookup's shape exists to prevent: resolving against
     * the drawn link set returned a fresh selection on every collapse, and the
     * chart read each one as a new pick and re-opened what the viewer had just
     * shut. A ref that still names the same thing resolves to the same value
     * whatever the boundaries are doing.
     */
    it('resolves the same whatever the collapse state, since neither input moves', () => {
      const id = ast.relations[0]!.id;
      const ref = { kind: 'edge', id, diagramType: 'c4' } as const;

      expect(fromElementRef(ref, { ast, tree })).toEqual(fromElementRef(ref, { ast, tree }));
      // 'api::customer' is a line only while `bank` is shut; the ref names it
      // either way, because the id says which two boxes it joins.
      const line = { kind: 'edge', id: 'api::customer', diagramType: 'c4' } as const;
      expect(fromElementRef(line, { ast, tree })).toEqual({ kind: 'link', id: 'api::customer' });
    });

    it('reads an edge naming one relation as that relation', () => {
      const id = ast.relations[0]!.id;
      expect(fromElementRef({ kind: 'edge', id, diagramType: 'c4' }, lookup)).toEqual({
        kind: 'relation',
        id,
      });
    });

    it('claims nothing for an edge the model does not have', () => {
      expect(fromElementRef({ kind: 'edge', id: 'ghost', diagramType: 'c4' }, lookup)).toBeNull();
    });

    it('claims nothing for an edge with no model to decide against', () => {
      expect(fromElementRef({ kind: 'edge', id: 'api::customer', diagramType: 'c4' })).toBeNull();
    });
  });
});
