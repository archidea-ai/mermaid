import { describe, expect, it } from 'vitest';
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
