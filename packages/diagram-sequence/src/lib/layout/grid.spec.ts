import { describe, expect, it } from 'vitest';
import { parse } from '../parser/parse';
import { buildTimeline } from '../model/timeline';
import { createBindings } from '../model/bindings';
import { computeGrid, HEADER_ROW } from './grid';
import { computeEmphasis } from './emphasis';

const build = (source: string) => {
  const ast = parse(source);
  const timeline = buildTimeline(ast, new Map(), createBindings());
  return { ast, timeline, grid: computeGrid(ast, timeline) };
};

describe('computeGrid', () => {
  it('assigns one 1-based column per participant in AST order', () => {
    const { grid } = build('sequenceDiagram\nparticipant B\nA->>B: x\nB->>C: y');

    expect(grid.columns.map((column) => [column.participantId, column.index])).toEqual([
      ['B', 1],
      ['A', 2],
      ['C', 3],
    ]);
    expect(grid.columnCount).toBe(3);
  });

  it('places steps on consecutive rows after the header row', () => {
    const { grid } = build('sequenceDiagram\nA->>B: one\nB->>A: two');

    expect(HEADER_ROW).toBe(1);
    expect(grid.rows.map((row) => row.index)).toEqual([2, 3]);
    expect(grid.rowCount).toBe(3);
  });

  it('spans a message from the lower column to the higher one, whichever way it points', () => {
    const { grid } = build('sequenceDiagram\nA->>C: forward\nC->>A: backward');
    const [forward, backward] = grid.messages;

    expect(forward).toMatchObject({ columnStart: 1, columnEnd: 2, direction: 'forward' });
    expect(backward).toMatchObject({ columnStart: 1, columnEnd: 2, direction: 'backward' });
  });

  it('marks a self message and keeps it in one column', () => {
    const { grid } = build('sequenceDiagram\nA->>A: think');

    expect(grid.messages[0]).toMatchObject({ selfLoop: true, columnStart: 1, columnEnd: 1 });
  });

  it('spans a note over two participants across both their columns', () => {
    const { grid } = build('sequenceDiagram\nA->>B: x\nnote over A,B: shared');

    expect(grid.notes[0]).toMatchObject({ columnStart: 1, columnEnd: 2 });
  });

  it('leans a one-sided note into the neighbouring column', () => {
    const right = build('sequenceDiagram\nA->>B: x\nnote right of A: r').grid.notes[0]!;
    const left = build('sequenceDiagram\nA->>B: x\nnote left of B: l').grid.notes[0]!;

    expect(right).toMatchObject({ columnStart: 1, columnEnd: 2 });
    expect(left).toMatchObject({ columnStart: 1, columnEnd: 2 });
  });

  it('does not lean a note past the edge of the grid', () => {
    const { grid } = build('sequenceDiagram\nA->>B: x\nnote left of A: edge');

    expect(grid.notes[0]!.columnStart).toBe(1);
  });

  it('spans an activation from its activate row to its deactivate row', () => {
    const { grid } = build('sequenceDiagram\nA->>B: start\nactivate B\nB->>A: work\ndeactivate B');

    expect(grid.activations).toHaveLength(1);
    expect(grid.activations[0]).toMatchObject({ participantId: 'B', column: 2, depth: 0 });
    // Exclusive end line: covers through the deactivate row inclusive.
    const deactivateRow = grid.rows[grid.rows.length - 1]!.index;
    expect(grid.activations[0]!.rowEnd).toBe(deactivateRow + 1);
  });

  it('runs an unclosed activation to the end of the diagram', () => {
    const { grid } = build('sequenceDiagram\nA->>B: start\nactivate B\nB->>A: work');
    const lastRow = grid.rows[grid.rows.length - 1]!.index;

    expect(grid.activations[0]!.rowEnd).toBeGreaterThan(lastRow);
  });

  it('nests concurrent activations by depth', () => {
    const { grid } = build(
      'sequenceDiagram\nA->>B: a\nactivate B\nA->>B: b\nactivate B\nA->>B: c\ndeactivate B\ndeactivate B',
    );

    expect(grid.activations.map((activation) => activation.depth).sort()).toEqual([0, 1]);
  });

  it('spans a fragment across exactly its own rows, not the one after `end`', () => {
    // A loop resolves by default; a prose `alt` would pend and emit no steps.
    const { grid } = build('sequenceDiagram\nloop twice\nA->>B: inside\nend\nA->>B: after');
    const fragment = grid.fragments[0]!;
    const [insideRow, afterRow] = grid.rows.map((row) => row.index);

    expect(fragment.rowStart).toBe(insideRow);
    // rowEnd is the exclusive CSS grid line, so it must equal the row after the
    // branch's last statement — never reach the statement following `end`.
    expect(fragment.rowEnd).toBe(afterRow);
  });

  it('nests an inner fragment at a deeper depth than its outer one', () => {
    const { grid } = build('sequenceDiagram\nloop outer\nopt inner\nA->>B: x\nend\nend');
    const depths = grid.fragments.map((fragment) => fragment.depth).sort();

    expect(depths).toEqual([0, 1]);
  });

  it('gives each loop iteration its own fragment span', () => {
    const ast = parse('sequenceDiagram\nloop retry\nA->>B: ping\nend');
    const timeline = buildTimeline(
      ast,
      new Map([['loop-2', { kind: 'iterations', fragmentId: 'loop-2', count: 3 }]]),
      createBindings(),
    );

    expect(computeGrid(ast, timeline).fragments).toHaveLength(3);
  });
});

describe('computeEmphasis with grid placement', () => {
  it('keeps emphasis independent of placement', () => {
    const { timeline } = build('sequenceDiagram\nA->>B: one\nB->>C: two');
    const emphasis = computeEmphasis(timeline, 0);

    expect(emphasis.step(timeline.steps[0]!.id)).toBe('current');
    expect(emphasis.participant('A')).toBe('current');
    expect(emphasis.participant('C')).toBe('rest');
  });
});
