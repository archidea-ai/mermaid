import { describe, expect, it } from 'vitest';
import { parse } from '../parser/parse';
import { buildTimeline } from '../model/timeline';
import { createBindings } from '../model/bindings';
import { layout } from './layout';
import { computeEmphasis } from './emphasis';
import { createEstimateMeasurer } from './measure';

const measurer = createEstimateMeasurer();
const build = (source: string) => {
  const ast = parse(source);
  const timeline = buildTimeline(ast, new Map(), createBindings());
  return { ast, timeline, layout: layout(ast, timeline, measurer) };
};

describe('layout', () => {
  it('orders columns as the AST orders participants, without overlap', () => {
    const { layout: result } = build('sequenceDiagram\nparticipant B\nA->>B: x\nB->>C: y');

    expect(result.columns.map((column) => column.participantId)).toEqual(['B', 'A', 'C']);
    for (let index = 1; index < result.columns.length; index += 1) {
      const previous = result.columns[index - 1]!;
      expect(result.columns[index]!.x).toBeGreaterThanOrEqual(previous.x + previous.width);
    }
  });

  it('widens a column to fit a long participant label', () => {
    const narrow = build('sequenceDiagram\nA->>B: x').layout.columns[0]!;
    const wide = build('sequenceDiagram\nparticipant A as A very long participant label\nA->>B: x')
      .layout.columns[0]!;

    expect(wide.width).toBeGreaterThan(narrow.width);
  });

  it('lays rows out top to bottom without overlapping', () => {
    const { layout: result } = build('sequenceDiagram\nA->>B: one\nB->>A: two\nA->>B: three');

    expect(result.rows).toHaveLength(3);
    for (let index = 1; index < result.rows.length; index += 1) {
      expect(result.rows[index]!.y).toBeGreaterThan(result.rows[index - 1]!.y);
    }
  });

  it('gives a self message a loop-back path taller than zero', () => {
    const { layout: result } = build('sequenceDiagram\nA->>A: think');

    expect(result.arrows[0]!.selfLoop).toBe(true);
    expect(result.arrows[0]!.loopHeight).toBeGreaterThan(0);
  });

  it('encloses every row of a branch inside its fragment frame', () => {
    const { layout: result } = build('sequenceDiagram\nloop twice\nA->>B: one\nB->>A: two\nend');
    const frame = result.fragments[0]!;

    for (const row of result.rows) {
      expect(row.y).toBeGreaterThan(frame.y);
      expect(row.y).toBeLessThan(frame.y + frame.height);
    }
  });

  it('nests an inner fragment inside its outer one', () => {
    const { layout: result } = build('sequenceDiagram\nloop outer\nopt inner\nA->>B: x\nend\nend');
    const [outer, inner] = [...result.fragments].sort((a, b) => a.depth - b.depth);

    expect(inner!.depth).toBeGreaterThan(outer!.depth);
    expect(inner!.x).toBeGreaterThan(outer!.x);
    expect(inner!.width).toBeLessThan(outer!.width);
  });

  it('produces an activation bar spanning activate to deactivate', () => {
    const { layout: result } = build(
      'sequenceDiagram\nA->>B: start\nactivate B\nB->>A: work\ndeactivate B',
    );

    expect(result.activations).toHaveLength(1);
    expect(result.activations[0]!.participantId).toBe('B');
    expect(result.activations[0]!.height).toBeGreaterThan(0);
  });

  it('bounds all content inside the reported width and height', () => {
    const { layout: result } = build('sequenceDiagram\nA->>B: x\nnote over A,B: a note');

    for (const column of result.columns) {
      expect(column.x + column.width).toBeLessThanOrEqual(result.width);
    }
    for (const row of result.rows) {
      expect(row.y).toBeLessThan(result.height);
    }
  });

  it('places a note over two participants between their lifelines', () => {
    const { layout: result } = build('sequenceDiagram\nA->>B: x\nnote over A,B: shared');
    const note = result.notes[0]!;
    const [a, b] = result.columns;

    expect(note.x).toBeLessThan(a!.centerX);
    expect(note.x + note.width).toBeGreaterThan(b!.centerX);
  });
});

describe('computeEmphasis', () => {
  const { timeline } = build('sequenceDiagram\nloop retry\nA->>B: one\nB->>C: two\nend');

  it('holds everything at rest before the run starts', () => {
    const emphasis = computeEmphasis(timeline, -1);

    expect(emphasis.step(timeline.steps[0]!.id)).toBe('rest');
    expect(emphasis.participant('A')).toBe('rest');
    expect(emphasis.fragmentBranch(timeline.steps[0]!.path[0]!.branchId)).toBe('rest');
  });

  it('marks the current step, its participants and its enclosing fragment', () => {
    const emphasis = computeEmphasis(timeline, 0);

    expect(emphasis.step(timeline.steps[0]!.id)).toBe('current');
    expect(emphasis.participant('A')).toBe('current');
    expect(emphasis.participant('B')).toBe('current');
    expect(emphasis.participant('C')).toBe('rest');
    expect(emphasis.fragmentBranch(timeline.steps[0]!.path[0]!.branchId)).toBe('path');
  });

  it('holds walked steps at spent and unreached ones at rest', () => {
    const emphasis = computeEmphasis(timeline, 1);

    expect(emphasis.step(timeline.steps[0]!.id)).toBe('spent');
    expect(emphasis.step(timeline.steps[1]!.id)).toBe('current');
    expect(emphasis.participant('A')).toBe('spent');
  });
});
