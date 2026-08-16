import { describe, expect, it } from 'vitest';
import { parse } from '../parser/parse';
import { buildTree } from './tree';
import { allBoundaryIds, isVisible, revealFor, visibleOwner } from './collapse';

const ast = parse(`C4Component
Person(customer, "Customer")
Container_Boundary(api, "API Application") {
    Component(signin, "Sign In", "Spring MVC")
    Container_Boundary(services, "Domain Services") {
        Component(security, "Security", "Spring Bean")
    }
}
Rel(customer, security, "reaches")`);

const tree = buildTree(ast);
const none = new Set<string>();

describe('visibleOwner', () => {
  it('is the box itself when nothing above it is shut', () => {
    expect(visibleOwner('security', none, tree)).toBe('security');
  });

  it('is the collapsed ancestor when one is shut', () => {
    expect(visibleOwner('security', new Set(['services']), tree)).toBe('services');
  });

  it('is the OUTERMOST collapsed ancestor when several are shut', () => {
    // Both shut: the one you can actually see is the outer one.
    expect(visibleOwner('security', new Set(['services', 'api']), tree)).toBe('api');
  });

  it('leaves a collapsed boundary visible as itself', () => {
    expect(visibleOwner('services', new Set(['services']), tree)).toBe('services');
  });

  it('returns an unknown id unchanged, so a caller can spot it', () => {
    expect(visibleOwner('nonexistent', none, tree)).toBe('nonexistent');
  });
});

describe('isVisible', () => {
  it('hides what a shut boundary holds, and keeps the boundary itself', () => {
    const collapsed = new Set(['api']);
    expect(isVisible('api', collapsed, tree)).toBe(true);
    expect(isVisible('signin', collapsed, tree)).toBe(false);
    expect(isVisible('services', collapsed, tree)).toBe(false);
    expect(isVisible('customer', collapsed, tree)).toBe(true);
  });
});

describe('revealFor', () => {
  it('names every boundary hiding either end', () => {
    expect([...revealFor(ast.relations[0]!, tree)].sort()).toEqual(['api', 'services']);
  });

  it('is empty when both ends are already at the top level', () => {
    const flat = parse('C4Context\nSystem(a, "A")\nSystem(b, "B")\nRel(a, b, "x")');
    expect(revealFor(flat.relations[0]!, buildTree(flat)).size).toBe(0);
  });
});

describe('allBoundaryIds', () => {
  it('is the set the chart starts collapsed with', () => {
    expect([...allBoundaryIds(ast)].sort()).toEqual(['api', 'services']);
  });
});
