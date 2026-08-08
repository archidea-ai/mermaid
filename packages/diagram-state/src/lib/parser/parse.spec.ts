import { describe, expect, it } from 'vitest';
import { parse, StateParseError } from './parse';

describe('state diagram parser', () => {
  it('reads a simple machine with entry and exit terminals', () => {
    const ast = parse(`stateDiagram-v2
      [*] --> Idle
      Idle --> Running: start
      Running --> [*]`);

    expect(ast.transitions.map((t) => [t.from, t.to])).toEqual([
      ['[*]', 'Idle'],
      ['Idle', 'Running'],
      ['Running', '[*]'],
    ]);
    expect(ast.transitions[1]!.label!.raw).toBe('start');
    expect(ast.stateById.get('[*]')!.kind).toBe('terminal');
  });

  it('names a state with a description', () => {
    const ast = parse('stateDiagram-v2\nstate "Waiting for payment" as Pending\nPending --> Paid');
    expect(ast.stateById.get('Pending')!.label).toBe('Waiting for payment');
  });

  it('marks choice, fork and join stereotypes', () => {
    const ast = parse(`stateDiagram-v2
      state Pick <<choice>>
      state Split <<fork>>
      state Merge <<join>>
      A --> Pick`);

    expect(ast.stateById.get('Pick')!.kind).toBe('choice');
    expect(ast.stateById.get('Split')!.kind).toBe('fork');
    expect(ast.stateById.get('Merge')!.kind).toBe('join');
  });

  it('nests a composite state and records its children', () => {
    const ast = parse(`stateDiagram-v2
      [*] --> Active
      state Active {
        [*] --> Warming
        Warming --> Hot
      }
      Active --> [*]`);

    const active = ast.stateById.get('Active')!;
    expect(active.children).toContain('Warming');
    expect(active.children).toContain('Hot');
    expect(ast.stateById.get('Warming')!.parent).toBe('Active');
  });

  it('parses a note attached to a state', () => {
    const ast = parse('stateDiagram-v2\nA --> B\nnote right of A: retries live here');
    expect(ast.stateById.get('A')!.note!.raw).toBe('retries live here');
  });

  it('parses a transition label as a condition when it reads as one', () => {
    const ast = parse(`stateDiagram-v2
      Idle --> Admin: {{role}} == "admin"
      Idle --> Member: otherwise`);

    expect(ast.transitions[0]!.condition).not.toBeNull();
    // Prose stays a viewer choice rather than being misparsed into a default.
    expect(ast.transitions[1]!.condition).toBeNull();
  });

  it('reads the layout direction', () => {
    expect(parse('stateDiagram-v2\ndirection LR\nA --> B').direction).toBe('LR');
    expect(parse('stateDiagram-v2\nA --> B').direction).toBe('TB');
  });

  it('strips comments and directives', () => {
    const ast = parse('stateDiagram-v2\n%% a comment\n%%{init: {}}%%\nA --> B: go %% trailing');
    expect(ast.transitions).toHaveLength(1);
    expect(ast.transitions[0]!.label!.raw).toBe('go');
  });

  it('records anything it does not understand rather than failing', () => {
    const ast = parse('stateDiagram-v2\nA --> B\nclassDef bold font-weight:bold');
    expect(ast.ignored).toHaveLength(1);
    expect(ast.transitions).toHaveLength(1);
  });

  it('throws a diagnostic on an unclosed composite', () => {
    expect(() => parse('stateDiagram-v2\nstate Active {\nA --> B')).toThrow(StateParseError);
    expect(() => parse('stateDiagram-v2\nstate Active {\nA --> B')).toThrow(/unclosed composite/);
  });

  it('throws on an incomplete transition', () => {
    expect(() => parse('stateDiagram-v2\nA -->')).toThrow(/incomplete transition/);
  });
});
