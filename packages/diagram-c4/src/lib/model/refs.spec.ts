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
    expect(isC4Selection(ref) && ref.data.type === 'boundary' && ref.data.members).toEqual(['api']);
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
});
