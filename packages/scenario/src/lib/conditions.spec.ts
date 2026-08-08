import { describe, expect, it } from 'vitest';
import { conditionVariables, evaluateCondition, parseCondition } from './conditions';
import { createBindings } from './bindings';

const evaluate = (label: string, values: Record<string, string | number | boolean> = {}) => {
  const condition = parseCondition(label);
  if (!condition) return null;
  return evaluateCondition(condition, createBindings(values));
};

describe('parseCondition', () => {
  it('rejects prose, so ordinary mermaid labels stay viewer-chosen', () => {
    expect(parseCondition('is the user logged in?')).toBeNull();
    expect(parseCondition('retry')).toBeNull();
    expect(parseCondition('')).toBeNull();
  });

  it('requires a variable reference to count as a condition', () => {
    expect(parseCondition('1 == 1')).toBeNull();
    expect(parseCondition('{{x}} == 1')).not.toBeNull();
  });

  it('rejects malformed expressions rather than guessing', () => {
    expect(parseCondition('{{x}} ==')).toBeNull();
    expect(parseCondition('({{x}} == 1')).toBeNull();
  });
});

describe('evaluateCondition', () => {
  it('evaluates every comparison operator', () => {
    expect(evaluate('{{n}} == 5', { n: 5 })).toBe(true);
    expect(evaluate('{{n}} != 5', { n: 5 })).toBe(false);
    expect(evaluate('{{n}} > 3', { n: 5 })).toBe(true);
    expect(evaluate('{{n}} >= 5', { n: 5 })).toBe(true);
    expect(evaluate('{{n}} < 3', { n: 5 })).toBe(false);
    expect(evaluate('{{n}} <= 5', { n: 5 })).toBe(true);
  });

  it('compares quoted strings', () => {
    expect(evaluate('{{role}} == "admin"', { role: 'admin' })).toBe(true);
    expect(evaluate('{{role}} == "admin"', { role: 'member' })).toBe(false);
  });

  it('treats a bare variable as a truthiness test', () => {
    expect(evaluate('{{flag}}', { flag: true })).toBe(true);
    expect(evaluate('{{flag}}', { flag: false })).toBe(false);
  });

  it('applies precedence: comparison over ! over && over ||', () => {
    expect(evaluate('{{a}} == 1 && {{b}} == 2 || {{c}} == 9', { a: 1, b: 9, c: 9 })).toBe(true);
    expect(evaluate('{{a}} == 1 && {{b}} == 2 || {{c}} == 9', { a: 1, b: 9, c: 1 })).toBe(false);
    expect(evaluate('!{{flag}} && {{other}}', { flag: false, other: true })).toBe(true);
  });

  it('honours parenthesised grouping', () => {
    expect(evaluate('{{a}} == 1 && ({{b}} == 2 || {{c}} == 3)', { a: 1, b: 9, c: 3 })).toBe(true);
    expect(evaluate('({{a}} == 1 || {{b}} == 2) && {{c}} == 3', { a: 9, b: 9, c: 3 })).toBe(false);
  });

  it('yields unknown for an unbound variable rather than false', () => {
    expect(evaluate('{{role}} == "admin"')).toBe('unknown');
    expect(evaluate('{{flag}}')).toBe('unknown');
  });

  it('short-circuits unknown only when it cannot change the result', () => {
    expect(evaluate('{{known}} == 2 && {{unknownVar}} == 1', { known: 1 })).toBe(false);
    expect(evaluate('{{known}} == 1 || {{unknownVar}} == 1', { known: 1 })).toBe(true);
    expect(evaluate('{{known}} == 1 && {{unknownVar}} == 1', { known: 1 })).toBe('unknown');
    expect(evaluate('{{known}} == 2 || {{unknownVar}} == 1', { known: 1 })).toBe('unknown');
  });

  it('propagates unknown through negation', () => {
    expect(evaluate('!{{missing}}')).toBe('unknown');
  });

  it('reports the variables a condition reads', () => {
    const condition = parseCondition('{{a}} == 1 && ({{b}} || !{{c}})')!;
    expect(conditionVariables(condition).sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('an assignment is not a condition', () => {
  it('rejects a label that only assigns', () => {
    // Reading `{{token = "t-1"}}` as a condition made it a truthiness test on an
    // unbound variable, stopping the run to ask about a value it was setting.
    expect(parseCondition('{{token = "t-1"}}')).toBeNull();
    expect(parseCondition('issued {{token = "t-1"}}')).toBeNull();
  });

  it('still accepts a comparison, which only looks similar', () => {
    expect(parseCondition('{{token}} == "t-1"')).not.toBeNull();
    expect(parseCondition('{{n}} >= 5')).not.toBeNull();
  });
});
