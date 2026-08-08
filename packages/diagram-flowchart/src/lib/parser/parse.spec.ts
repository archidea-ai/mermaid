import { describe, expect, it } from 'vitest';
import { FlowchartParseError, parse } from './parse';

const wire = (source: string) =>
  parse(source).edges.map(
    (edge) => `${edge.from}->${edge.to}${edge.label ? `:${edge.label.raw}` : ''}`,
  );

describe('flowchart parser', () => {
  it('reads the header and its direction', () => {
    expect(parse('flowchart LR\nA --> B').direction).toBe('LR');
    expect(parse('graph TD\nA --> B').direction).toBe('TB');
    // `graph` is the old spelling of the same thing.
    expect(parse('graph\nA --> B').direction).toBe('TB');
  });

  it('refuses a diagram that is not a flowchart', () => {
    expect(() => parse('sequenceDiagram\nA->>B: hi')).toThrow(FlowchartParseError);
  });

  it('takes the label and shape from the node declaration', () => {
    const ast = parse('flowchart TD\nStart([Begin]) --> Check{All good?}\nCheck --> Done[(Store)]');

    expect(ast.nodes.map((node) => [node.id, node.label, node.shape])).toEqual([
      ['Start', 'Begin', 'stadium'],
      ['Check', 'All good?', 'diamond'],
      ['Done', 'Store', 'cylinder'],
    ]);
  });

  it('reads a chain as one edge per link, not one per line', () => {
    expect(wire('flowchart LR\nA --> B --> C --> D')).toEqual(['A->B', 'B->C', 'C->D']);
  });

  it('takes an edge label written either way round', () => {
    expect(wire('flowchart LR\nA -->|yes| B\nA -- no --> C')).toEqual(['A->B:yes', 'A->C:no']);
  });

  it('keeps the line style an author chose', () => {
    const styles = parse('flowchart LR\nA --> B\nB -.-> C\nC ==> D').edges.map(
      (edge) => edge.style,
    );
    expect(styles).toEqual(['solid', 'dotted', 'thick']);
  });

  it('groups nodes into the subgraph that declared them', () => {
    const ast = parse(
      'flowchart TD\nA --> B\nsubgraph checks [Quality gates]\nB --> C\nC --> D\nend\nD --> E',
    );

    expect(ast.subgraphs).toEqual([{ id: 'checks', label: 'Quality gates', nodeIds: ['C', 'D'] }]);
    // B was declared outside, so a later mention does not move it in.
    expect(ast.nodeById.get('B')!.subgraph).toBeNull();
    expect(ast.nodeById.get('C')!.subgraph).toBe('checks');
  });

  it('names a subgraph after itself when no label is given', () => {
    const ast = parse('flowchart TD\nsubgraph Backend\nA --> B\nend');
    expect(ast.subgraphs[0]).toEqual({ id: 'Backend', label: 'Backend', nodeIds: ['A', 'B'] });
  });

  it('refuses an unclosed subgraph rather than guessing where it ends', () => {
    expect(() => parse('flowchart TD\nsubgraph one\nA --> B')).toThrow(FlowchartParseError);
  });

  it('sets anything it does not understand aside instead of failing', () => {
    const ast = parse('flowchart TD\nA --> B\nclassDef warn fill:#f00\nclass A warn');

    expect(wire('flowchart TD\nA --> B')).toEqual(['A->B']);
    expect(ast.ignored.map((entry) => entry.text)).toEqual([
      'classDef warn fill:#f00',
      'class A warn',
    ]);
  });

  it('ignores comments, including one after a statement', () => {
    const ast = parse('flowchart TD\n%% a note to self\nA --> B %% and another');
    expect(ast.ignored).toEqual([]);
    expect(wire('flowchart TD\nA --> B')).toEqual(['A->B']);
  });

  it('leaves a percent sign inside a quoted label alone', () => {
    const ast = parse('flowchart TD\nA["99%% of the time"] --> B');
    expect(ast.nodeById.get('A')!.label).toBe('99%% of the time');
  });
});
