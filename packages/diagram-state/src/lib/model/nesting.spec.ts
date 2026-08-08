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
