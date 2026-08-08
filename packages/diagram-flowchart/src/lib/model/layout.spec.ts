import { describe, expect, it } from 'vitest';
import { parse } from '../parser/parse';
import { buildColumns, rankNodes } from './layout';

const shape = (source: string) =>
  buildColumns(parse(source)).map((column) => [
    column.rank,
    column.groups.flatMap((group) => group.nodes.map((node) => node.id)),
  ]);

describe('buildColumns', () => {
  it('reads a chain left to right, one node per column', () => {
    expect(shape('flowchart LR\nA --> B --> C')).toEqual([
      [0, ['A']],
      [1, ['B']],
      [2, ['C']],
    ]);
  });

  it('puts a node after everything it depends on, not after the nearest of them', () => {
    // D is one step from A and three from C. The longest path wins, or the
    // edge C --> D would be drawn running backwards through the chart.
    expect(shape('flowchart LR\nA --> B --> C --> D\nA --> D')).toEqual([
      [0, ['A']],
      [1, ['B']],
      [2, ['C']],
      [3, ['D']],
    ]);
  });

  it('puts independent branches in the same column', () => {
    expect(shape('flowchart LR\nA --> B\nA --> C')).toEqual([
      [0, ['A']],
      [1, ['B', 'C']],
    ]);
  });

  it('settles on a cycle rather than pushing a node right for ever', () => {
    const ranks = rankNodes(parse('flowchart LR\nA --> B --> C --> A'));
    expect([...ranks.values()].every((rank) => rank < 3)).toBe(true);
  });

  it('places a chart that is nothing but a cycle, with no source to start from', () => {
    expect(shape('flowchart LR\nA --> B --> A')).toEqual([
      [0, ['A']],
      [1, ['B']],
    ]);
  });

  it('boxes each column by the subgraph that owns its nodes', () => {
    const columns = buildColumns(
      parse('flowchart LR\nA --> B\nsubgraph checks [Gates]\nB --> C\nend\nB --> D'),
    );
    const second = columns.find((column) => column.rank === 2)!;

    expect(
      second.groups.map((group) => [group.subgraph?.label ?? null, group.nodes.map((n) => n.id)]),
    ).toEqual([
      ['Gates', ['C']],
      [null, ['D']],
    ]);
  });

  it('keeps a node with no edges at all', () => {
    expect(shape('flowchart LR\nA --> B\nLonely')).toEqual([
      [0, ['A', 'Lonely']],
      [1, ['B']],
    ]);
  });
});
