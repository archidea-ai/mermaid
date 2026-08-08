import { describe, expect, it } from 'vitest';
import { parse } from '../parser/parse';
import { buildOverview, defaultActive } from './overview';

const MACHINE = `stateDiagram-v2
  [*] --> Draft
  Draft --> Review: submit
  Review --> Approved: accept
  Review --> Rejected: decline
  Approved --> Live: ship
  Rejected --> Draft: revise`;

const ast = parse(MACHINE);
const shape = (activeId: string, radius?: number) =>
  buildOverview(ast, activeId, radius).map((column) => [
    column.depth,
    column.groups.flatMap((group) => group.states),
  ]);

describe('defaultActive', () => {
  it('opens on the state the machine starts at', () => {
    expect(defaultActive(ast)).toBe('Draft');
  });

  it('falls back to the first state when there is no start marker', () => {
    expect(defaultActive(parse('stateDiagram-v2\nAlpha --> Beta: go'))).toBe('Alpha');
  });
});

describe('buildOverview', () => {
  it('returns nothing without an active state', () => {
    expect(buildOverview(ast, null)).toEqual([]);
    expect(buildOverview(ast, 'Nonexistent')).toEqual([]);
  });

  it('puts what leads here on the left and what follows on the right', () => {
    expect(shape('Review')).toEqual([
      [-1, ['Draft']],
      [0, ['Review']],
      [1, ['Approved', 'Rejected']],
      [2, ['Live']],
    ]);
  });

  it('sweeps backwards the same way it sweeps forwards', () => {
    // Two steps of history, not one: the same breadth-first walk both ways.
    expect(shape('Approved')).toEqual([
      [-2, ['Draft']],
      [-1, ['Review']],
      [0, ['Approved']],
      [1, ['Live']],
    ]);
  });

  it('places a state at whichever direction reaches it first', () => {
    // Rejected is one step forward from Review and two steps back through
    // Draft. Sweeping one direction first let the longer route claim it.
    const columns = shape('Review');
    const rejected = columns.find(([, states]) => (states as string[]).includes('Rejected'));

    expect(rejected?.[0]).toBe(1);
  });

  it('leaves terminals out — they are markers, not somewhere to stand', () => {
    const everything = buildOverview(ast, 'Draft', 4).flatMap((column) =>
      column.groups.flatMap((group) => group.states),
    );

    expect(everything.some((state) => state.startsWith('[*]'))).toBe(false);
  });

  it('honours the radius', () => {
    expect(shape('Review', 1)).toEqual([
      [-1, ['Draft']],
      [0, ['Review']],
      [1, ['Approved', 'Rejected']],
    ]);
  });

  it('places a state at the first distance it is reached at, so a cycle settles', () => {
    // Draft → Review → Rejected → Draft. Draft is one step back, not also three
    // steps forward, so the walk terminates instead of circling.
    const depths = buildOverview(ast, 'Review', 5).flatMap((column) =>
      column.groups.flatMap((group) => group.states.map((state) => [state, column.depth])),
    );

    expect(depths.filter(([state]) => state === 'Draft')).toEqual([['Draft', -1]]);
  });

  it('re-centres on whichever state is made active', () => {
    expect(shape('Live')[0]).toEqual([-2, ['Review']]);
    expect(shape('Live').at(-1)).toEqual([0, ['Live']]);
  });

  it('groups states in a column by the container they share', () => {
    const nested = parse(`stateDiagram-v2
      [*] --> Idle
      Idle --> Work: start
      state Work {
        [*] --> Doing
        Doing --> Checking: check
      }`);

    const column = buildOverview(nested, 'Doing', 1).find((c) => c.depth === 1)!;
    expect(column.groups).toHaveLength(1);
    expect(column.groups[0]!.containers.map((c) => c.id)).toEqual(['Work']);
    expect(column.groups[0]!.states).toEqual(['Checking']);
  });
});
