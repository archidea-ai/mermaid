import { describe, expect, it } from 'vitest';
import { parse } from '../parser/parse';
import { selectNeighbours } from './neighbours';

const ast = parse('flowchart LR\nA --> B\nB --> C\nD --> B\nC --> E\nB --> B');

describe('selectNeighbours', () => {
  it('lights nothing until something is chosen', () => {
    expect(selectNeighbours(ast, null).nodes.size).toBe(0);
    expect(selectNeighbours(ast, 'Nonexistent').edges.size).toBe(0);
  });

  it('lights the node and everything one edge away, in both directions', () => {
    const { nodes } = selectNeighbours(ast, 'B');
    expect([...nodes].sort()).toEqual(['A', 'B', 'C', 'D']);
  });

  it('stops at one step, which is the point of selecting at all', () => {
    // E is two edges from B. Widening the ring lights the chart back up.
    expect(selectNeighbours(ast, 'B').nodes.has('E')).toBe(false);
  });

  it('lights every edge between the chosen node and a neighbour', () => {
    const { edges } = selectNeighbours(ast, 'B');
    const drawn = ast.edges.filter((edge) => edges.has(edge.id));

    expect(drawn.map((edge) => `${edge.from}->${edge.to}`).sort()).toEqual([
      'A->B',
      'B->B',
      'B->C',
      'D->B',
    ]);
  });

  it('leaves an edge between two neighbours dark — it is not about the choice', () => {
    const chain = parse('flowchart LR\nA --> B\nB --> C\nA --> C');
    const { edges } = selectNeighbours(chain, 'B');

    expect(
      chain.edges.filter((edge) => edges.has(edge.id)).map((e) => `${e.from}->${e.to}`),
    ).toEqual(['A->B', 'B->C']);
  });
});
