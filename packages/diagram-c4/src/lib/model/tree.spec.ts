import { describe, expect, it } from 'vitest';
import type { C4Ast } from '../parser/ast';
import { parse } from '../parser/parse';
import { ancestorsOf, buildTree, descendantsOf, elementCountOf } from './tree';

const ast = parse(`C4Component
Person(customer, "Customer")
Container_Boundary(api, "API Application") {
    Component(signin, "Sign In", "Spring MVC")
    Container_Boundary(services, "Domain Services") {
        Component(security, "Security", "Spring Bean")
        Component(mailer, "E-mail", "Spring Bean")
    }
}`);

const tree = buildTree(ast);

describe('buildTree', () => {
  it('roots everything that has no parent', () => {
    expect(tree.roots).toEqual(['customer', 'api']);
  });

  it('keeps children in declaration order, boundaries among elements', () => {
    expect(tree.boxes.get('api')?.children).toEqual(['signin', 'services']);
  });

  it('knows an element from a boundary', () => {
    expect(tree.boxes.get('signin')?.kind).toBe('element');
    expect(tree.boxes.get('services')?.kind).toBe('boundary');
  });

  it('indexes the source records so a component need not scan the arrays', () => {
    expect(tree.elementById.get('security')?.label).toBe('Security');
    expect(tree.boundaryById.get('services')?.label).toBe('Domain Services');
  });
});

describe('ancestorsOf', () => {
  it('walks outwards, innermost first, and excludes the box itself', () => {
    expect(ancestorsOf(tree, 'security')).toEqual(['services', 'api']);
  });

  it('is empty for a root', () => {
    expect(ancestorsOf(tree, 'customer')).toEqual([]);
  });

  it('is empty for an id nothing declared', () => {
    expect(ancestorsOf(tree, 'nonexistent')).toEqual([]);
  });
});

describe('descendantsOf', () => {
  it('reaches through nested boundaries', () => {
    expect(descendantsOf(tree, 'api').sort()).toEqual(
      ['mailer', 'security', 'services', 'signin'].sort(),
    );
  });
});

describe('elementCountOf', () => {
  it('counts elements only, all the way down — a boundary is not a member', () => {
    expect(elementCountOf(tree, 'api')).toBe(3);
    expect(elementCountOf(tree, 'services')).toBe(2);
  });
});

describe('duplicate alias deduplication', () => {
  it('keeps a duplicate element id once, first declaration winning', () => {
    const ast: C4Ast = {
      kind: 'C4Component',
      title: null,
      ignored: [],
      elements: [
        { id: 'customer', label: 'Customer', type: 'Person', parent: null, style: null },
        { id: 'customer', label: 'Duplicate Customer', type: 'Person', parent: null, style: null },
      ],
      boundaries: [],
      relations: [],
    };
    const tree = buildTree(ast);
    expect(tree.roots).toEqual(['customer']);
    expect(tree.elementById.get('customer')?.label).toBe('Customer');
  });

  it('adds a duplicate boundary id once, first declaration winning', () => {
    const ast: C4Ast = {
      kind: 'C4Component',
      title: null,
      ignored: [],
      elements: [],
      boundaries: [
        { id: 'grp', label: 'Group 1', parent: null, style: null },
        { id: 'grp', label: 'Group 2', parent: null, style: null },
      ],
      relations: [],
    };
    const tree = buildTree(ast);
    expect(tree.roots).toEqual(['grp']);
    expect(tree.boundaryById.get('grp')?.label).toBe('Group 1');
  });

  it('counts a duplicate element once in elementCountOf', () => {
    const ast: C4Ast = {
      kind: 'C4Component',
      title: null,
      ignored: [],
      elements: [
        { id: 'a', label: 'A', type: 'Component', parent: 'grp', style: null },
        { id: 'a', label: 'A duplicate', type: 'Component', parent: 'grp', style: null },
      ],
      boundaries: [{ id: 'grp', label: 'Group', parent: null, style: null }],
      relations: [],
    };
    const tree = buildTree(ast);
    expect(elementCountOf(tree, 'grp')).toBe(1);
  });
});

describe('containment cycle detection', () => {
  it('terminates and returns a finite chain when a cycle exists', () => {
    const ast: C4Ast = {
      kind: 'C4Component',
      title: null,
      ignored: [],
      elements: [],
      boundaries: [
        { id: 'a', label: 'A', parent: 'b', style: null },
        { id: 'b', label: 'B', parent: 'c', style: null },
        { id: 'c', label: 'C', parent: 'a', style: null },
      ],
      relations: [],
    };
    const tree = buildTree(ast);
    const ancestors = ancestorsOf(tree, 'a');
    expect(ancestors).toHaveLength(2);
    expect(ancestors).toEqual(['b', 'c']);
  });
});
