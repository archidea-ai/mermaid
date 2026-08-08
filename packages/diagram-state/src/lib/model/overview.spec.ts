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
const shape = (activeId: string) =>
  buildOverview(ast, activeId).columns.map((column) => [
    column.depth,
    column.groups.flatMap((group) => group.states),
  ]);

// Sorted: the edge list carries no order of its own, only membership. Keys are
// column-qualified, so `-1:Draft->0:Review` reads as "Draft, one column back".
const wires = (activeId: string) =>
  buildOverview(ast, activeId)
    .edges.map((edge) => `${edge.fromKey}->${edge.toKey}`)
    .sort();

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
    expect(buildOverview(ast, null)).toEqual({ columns: [], edges: [] });
    expect(buildOverview(ast, 'Nonexistent')).toEqual({ columns: [], edges: [] });
  });

  it('puts what leads here on the left and what follows on the right', () => {
    expect(shape('Review')).toEqual([
      [-2, ['Rejected']],
      [-1, ['Draft']],
      [0, ['Review']],
      [1, ['Approved', 'Rejected']],
      [2, ['Live', 'Draft']],
    ]);
  });

  it('sweeps backwards the same way it sweeps forwards', () => {
    // Three steps of history, not one: the same breadth-first walk both ways,
    // each run until it stops finding states.
    expect(shape('Approved')).toEqual([
      [-3, ['Rejected']],
      [-2, ['Draft']],
      [-1, ['Review']],
      [0, ['Approved']],
      [1, ['Live']],
    ]);
  });

  it('lets one state stand on both sides when it genuinely does', () => {
    // Rejected follows Review by `decline` and leads back to it through Draft.
    // Both are true, and each side is swept without reference to the other.
    const columns = shape('Review');
    const depths = columns
      .filter(([, states]) => (states as string[]).includes('Rejected'))
      .map(([depth]) => depth);

    expect(depths).toEqual([-2, 1]);
  });

  it('leaves terminals out — they are markers, not somewhere to stand', () => {
    const everything = buildOverview(ast, 'Draft').columns.flatMap((column) =>
      column.groups.flatMap((group) => group.states),
    );

    expect(everything.some((state) => state.startsWith('[*]'))).toBe(false);
  });

  it('runs to exhaustion, so the whole machine is on the chart', () => {
    // Every state, reached from wherever you stand — no radius to cut it short.
    const everything = buildOverview(ast, 'Live').columns.flatMap((column) =>
      column.groups.flatMap((group) => group.states),
    );

    expect([...new Set(everything)].sort()).toEqual([
      'Approved',
      'Draft',
      'Live',
      'Rejected',
      'Review',
    ]);
  });

  it('places a state once per side, so a cycle settles instead of circling', () => {
    // Draft → Review → Rejected → Draft. Draft is one step back and two steps
    // forward — each sweep reaches it once, and then neither goes round again.
    const depths = buildOverview(ast, 'Review').columns.flatMap((column) =>
      column.groups.flatMap((group) => group.states.map((state) => [state, column.depth])),
    );

    expect(depths.filter(([state]) => state === 'Draft')).toEqual([
      ['Draft', -1],
      ['Draft', 2],
    ]);
  });

  it('re-centres on whichever state is made active', () => {
    expect(shape('Live')[0]).toEqual([-4, ['Rejected']]);
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

    const column = buildOverview(nested, 'Doing').columns.find((c) => c.depth === 1)!;
    expect(column.groups).toHaveLength(1);
    expect(column.groups[0]!.containers.map((c) => c.id)).toEqual(['Work']);
    expect(column.groups[0]!.states).toEqual(['Checking']);
  });
});

describe('composite states', () => {
  const NESTED = parse(`stateDiagram-v2
    [*] --> Idle
    Idle --> Work: start
    state Work {
      [*] --> Doing
      Doing --> Checking: check
      Checking --> [*]
    }
    Work --> Done
    Work --> Cancelled: abort
    Done --> [*]`);

  const box = (activeId: string, depth: number) =>
    buildOverview(NESTED, activeId)
      .columns.find((column) => column.depth === depth)!
      .groups.map((group) => [group.containers.map((container) => container.id), group.states]);

  const links = (activeId: string) =>
    buildOverview(NESTED, activeId)
      .edges.map((edge) => `${edge.fromKey}->${edge.toKey}`)
      .sort();

  it('shows the substate a composite starts at, not the composite', () => {
    // Entering Work means entering Work's initial substate, so that is what the
    // next column offers — inside the Work box, which is kept.
    expect(box('Idle', 1)).toEqual([[['Work'], ['Doing']]]);
  });

  it('carries on past a composite ending, rather than stopping at its end', () => {
    // Checking --> [*] completes Work, and Work --> Done fires on completion.
    expect(box('Idle', 3)).toEqual([[[], ['Done']]]);
    expect(links('Idle')).toContain('2:Checking->3:Done');
  });

  it('offers a trigger on a composite from inside it, as UML does', () => {
    // `Work --> Cancelled: abort` interrupts Work's machine from any substate.
    expect(box('Idle', 2)).toEqual([
      [['Work'], ['Checking']],
      [[], ['Cancelled']],
    ]);
    expect(links('Idle')).toContain('1:Doing->2:Cancelled');
  });

  it('reads history back into the substates that were actually occupied', () => {
    // Standing at Done, the run was at Checking, which completed Work — never
    // "at Work", which is a container rather than somewhere to stand.
    expect(box('Done', -1)).toEqual([[['Work'], ['Checking']]]);
    expect(box('Done', -2)).toEqual([[['Work'], ['Doing']]]);
    expect(box('Done', -3)).toEqual([[[], ['Idle']]]);
  });
});

describe('the edges between columns', () => {
  it('wires each state to the ones a column further right', () => {
    expect(wires('Review')).toEqual([
      '-1:Draft->0:Review',
      '-2:Rejected->-1:Draft',
      '0:Review->1:Approved',
      '0:Review->1:Rejected',
      '1:Approved->2:Live',
      '1:Rejected->2:Draft',
    ]);
  });

  it('never points a line back the way the sweep came', () => {
    // Every key on the left of an arrow sits one column left of the key on its
    // right, on both sides of the chart — that is what makes it read as one.
    for (const wire of wires('Review')) {
      const [from, to] = wire.split('->').map((key) => Number(key.split(':')[0]));
      expect(to! - from!).toBe(1);
    }
  });

  it('draws only what the sweep walked, not every transition it could have', () => {
    // Draft --> Live short-circuits the machine. Live is still reached through
    // Approved, so that is the one route the chart draws to it.
    const shortcut = parse(`${MACHINE}\n  Draft --> Live: publish`);
    const drawn = buildOverview(shortcut, 'Review').edges.map(
      (edge) => `${edge.fromKey}->${edge.toKey}`,
    );

    expect(drawn).toContain('1:Approved->2:Live');
    expect(drawn).not.toContain('-1:Draft->2:Live');
    // One line per state reached: a state is arrived at once per side.
    expect(drawn).toHaveLength(new Set(drawn.map((edge) => edge.split('->')[1])).size);
  });

  it('carries the transition label, so a line says what it is', () => {
    const submit = buildOverview(ast, 'Review').edges.find((edge) => edge.toKey === '0:Review');
    expect(submit?.label?.segments[0]).toMatchObject({ value: 'submit' });
  });

  it('wires the history side towards the active state', () => {
    // On the left the arrows lead here; the same one rule produces both sides.
    expect(wires('Live')).toEqual([
      '-1:Approved->0:Live',
      '-2:Review->-1:Approved',
      '-3:Draft->-2:Review',
      '-4:Rejected->-3:Draft',
    ]);
  });
});
