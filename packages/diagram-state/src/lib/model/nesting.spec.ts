import { describe, expect, it } from 'vitest';
import { parse } from '../parser/parse';
import { enclosingStates } from './nesting';

const NESTED = `stateDiagram-v2
  [*] --> Outer
  state Outer {
    [*] --> Inner
    state Inner {
      [*] --> Deep
      Deep --> Done: finish
    }
  }
  Outer --> [*]`;

describe('enclosingStates', () => {
  it('lists the composite states around one, outermost first', () => {
    const ast = parse(NESTED);
    expect(enclosingStates(ast, 'Deep').map((s) => s.id)).toEqual(['Outer', 'Inner']);
  });

  it('returns nothing for a top-level state', () => {
    const ast = parse(NESTED);
    expect(enclosingStates(ast, 'Outer')).toEqual([]);
  });

  it('returns nothing when nothing is current', () => {
    expect(enclosingStates(parse(NESTED), null)).toEqual([]);
  });

  it('does not loop on a state that somehow contains itself', () => {
    const ast = parse('stateDiagram-v2\nstate A {\n  A --> A: self\n}');
    expect(() => enclosingStates(ast, 'A')).not.toThrow();
  });
});

describe('isWithin', () => {
  const ast = parse(NESTED);

  it('recognises a state inside a composite, however deep', async () => {
    const { isWithin } = await import('./nesting');

    expect(isWithin(ast, 'Deep', 'Outer')).toBe(true);
    expect(isWithin(ast, 'Deep', 'Inner')).toBe(true);
    // A composite contains itself, so a move onto it does not leave it.
    expect(isWithin(ast, 'Outer', 'Outer')).toBe(true);
  });

  it('recognises a state outside it', async () => {
    const { isWithin } = await import('./nesting');

    expect(isWithin(ast, 'Outer', 'Inner')).toBe(false);
    expect(isWithin(ast, 'Deep', null)).toBe(false);
    expect(isWithin(ast, null, 'Outer')).toBe(false);
  });

  it('does not loop on a state that parents itself', async () => {
    const { isWithin } = await import('./nesting');
    const cyclic = parse('stateDiagram-v2\nstate A {\n  A --> A: self\n}');

    expect(() => isWithin(cyclic, 'A', 'B')).not.toThrow();
  });
});

describe('depthWithin', () => {
  const ast = parse(NESTED);

  it('places a state at the nesting level that actually holds it', async () => {
    const { depthWithin, enclosingStates } = await import('./nesting');
    const chain = enclosingStates(ast, 'Deep'); // [Outer, Inner]

    // Deep sits inside both; Inner inside only Outer; a state outside, neither.
    expect(depthWithin(ast, 'Deep', chain)).toBe(2);
    expect(depthWithin(ast, 'Inner', chain)).toBe(1);
    expect(depthWithin(ast, 'Outer', chain)).toBe(0);
    expect(depthWithin(ast, 'Nonexistent', chain)).toBe(0);
  });

  it('stops at the first container that does not hold it', async () => {
    const { depthWithin } = await import('./nesting');
    const chain = [ast.stateById.get('Inner')!, ast.stateById.get('Outer')!];

    // Inner does not contain Outer, so the walk stops immediately.
    expect(depthWithin(ast, 'Outer', chain)).toBe(0);
  });
});
