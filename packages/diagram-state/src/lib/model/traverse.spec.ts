import { describe, expect, it } from 'vitest';
import { createBindings } from '@archidea-ai/mermaid-scenario';
import { parse } from '../parser/parse';
import { entryOf, traverse } from './traverse';

const run = (source: string, decisions: [string, string][] = [], values = {}) =>
  traverse(parse(source), new Map(decisions), createBindings(values));

const LINEAR = 'stateDiagram-v2\n[*] --> Idle\nIdle --> Running: start\nRunning --> [*]';

describe('traverse', () => {
  it('starts at the state the entry terminal points to', () => {
    expect(entryOf(parse(LINEAR))).toBe('Idle');
  });

  it('walks a machine with no choices all the way to the exit', () => {
    const timeline = run(LINEAR);

    expect(timeline.steps.map((s) => [s.from, s.to])).toEqual([
      ['Idle', 'Running'],
      ['Running', '[*]'],
    ]);
    expect(timeline.done).toBe(true);
    expect(timeline.pending).toBeNull();
  });

  it('stops at a fork and offers the options', () => {
    const timeline = run('stateDiagram-v2\n[*] --> Idle\nIdle --> A: one\nIdle --> B: two');

    expect(timeline.steps).toHaveLength(0);
    expect(timeline.pending!.from).toBe('Idle');
    expect(timeline.pending!.options.map((o) => o.to)).toEqual(['A', 'B']);
  });

  it('takes the transition the viewer chose', () => {
    const ast = parse('stateDiagram-v2\n[*] --> Idle\nIdle --> A: one\nIdle --> B: two');
    const second = ast.transitions[2]!;
    const timeline = traverse(ast, new Map([['Idle', second.id]]), createBindings());

    expect(timeline.steps.map((s) => s.to)).toEqual(['B']);
  });

  it('resolves a fork from bindings with no prompt at all', () => {
    const source =
      'stateDiagram-v2\n[*] --> Idle\nIdle --> Admin: {{role}} == "admin"\nIdle --> Member: otherwise';

    expect(run(source, [], { role: 'admin' }).steps.map((s) => s.to)).toEqual(['Admin']);
    expect(run(source, [], { role: 'x' }).steps.map((s) => s.to)).toEqual(['Member']);
  });

  it('asks rather than defaulting when a condition cannot be evaluated', () => {
    const timeline = run(
      'stateDiagram-v2\n[*] --> Idle\nIdle --> Admin: {{role}} == "admin"\nIdle --> Member: otherwise',
    );

    expect(timeline.pending).not.toBeNull();
    expect(timeline.steps).toHaveLength(0);
  });

  it('always asks at a <<choice>>, even with one way out', () => {
    const timeline = run('stateDiagram-v2\n[*] --> Pick\nstate Pick <<choice>>\nPick --> Only: go');

    expect(timeline.pending).toMatchObject({ from: 'Pick', forced: true });
  });

  it('applies a variable effect as it passes through', () => {
    const timeline = run(
      'stateDiagram-v2\n[*] --> A\nA --> B: {{token = "t-1"}}\nB --> C: {{token}} == "t-1"',
    );

    expect(timeline.steps.map((s) => s.to)).toEqual(['B', 'C']);
  });

  it('reports states never reached under the current decisions', () => {
    const ast = parse('stateDiagram-v2\n[*] --> Idle\nIdle --> A: one\nIdle --> B: two');
    const first = ast.transitions[1]!;
    const timeline = traverse(ast, new Map([['Idle', first.id]]), createBindings());

    expect(timeline.unreached).toEqual(['B']);
  });

  it('terminates on a machine that loops rather than running forever', () => {
    const timeline = run('stateDiagram-v2\n[*] --> A\nA --> A: again');

    expect(timeline.steps.length).toBeGreaterThan(1);
    expect(timeline.steps.length).toBeLessThanOrEqual(500);
  });

  it('ends the run at a state with no way out', () => {
    const timeline = run('stateDiagram-v2\n[*] --> A\nA --> B: go');

    expect(timeline.done).toBe(true);
    expect(timeline.at).toBe('B');
  });
});

describe('where the viewer stands', () => {
  // traverse() walks as far as the decisions allow, so its `at` is the end of
  // that walk. Before the first step the viewer is still at the entry, and
  // conflating the two showed a state several transitions ahead of the cursor.
  it('separates the end of the walk from the entry point', () => {
    const ast = parse('stateDiagram-v2\n[*] --> A\nA --> B: one\nB --> C: two');
    const timeline = traverse(ast, new Map(), createBindings());

    expect(entryOf(ast)).toBe('A');
    expect(timeline.at).toBe('C');
    expect(timeline.steps.map((s) => s.to)).toEqual(['B', 'C']);
  });
});

describe('composite states', () => {
  const NESTED = `stateDiagram-v2
    [*] --> Queued
    Queued --> Building: pick up
    state Building {
      [*] --> Compiling
      Compiling --> Testing: compiled
      state Testing {
        [*] --> Unit
        Unit --> Passed: green
      }
      Passed --> [*]
    }
    Building --> Live: deploy`;

  it("scopes each composite's [*] so a nested start is not the diagram's", () => {
    const ast = parse(NESTED);

    expect(entryOf(ast)).toBe('Queued');
    expect(ast.stateById.has('[*]@Building')).toBe(true);
    expect(ast.stateById.has('[*]@Testing')).toBe(true);
  });

  it('descends into a composite on entering it, not just onto its name', () => {
    const ast = parse(NESTED);
    const timeline = traverse(ast, new Map(), createBindings());

    // Entering Building means entering its machine, so the run lands on the
    // inner state rather than on the composite's name.
    expect(timeline.steps.map((s) => s.to)).toContain('Compiling');
    expect(timeline.steps.map((s) => s.to)).not.toContain('Building');
    expect(timeline.steps.some((s) => s.transition.label?.raw === 'compiled')).toBe(true);
  });

  it("climbs back out when a composite's internal machine finishes", () => {
    const ast = parse(NESTED);
    const timeline = traverse(ast, new Map(), createBindings());

    // Passed --> [*] ends Building's machine, so the run continues from Building.
    expect(timeline.steps.some((s) => s.transition.label?.raw === 'deploy')).toBe(true);
    expect(timeline.done).toBe(true);
  });
});

describe('ends are a special state', () => {
  const WITH_END = 'stateDiagram-v2\n[*] --> Live\nLive --> [*]';

  it('names the machine end and a substate end differently', async () => {
    const { endLabel, isTerminal, terminalOwner } = await import('../parser/ast');
    const label = (id: string) => ({ Testing: 'Testing phase' })[id];

    expect(isTerminal('[*]')).toBe(true);
    expect(isTerminal('[*]@Testing')).toBe(true);
    expect(isTerminal('Live')).toBe(false);

    expect(terminalOwner('[*]')).toBeNull();
    expect(terminalOwner('[*]@Testing')).toBe('Testing');

    // A substate has its own end, and it is not the machine's.
    expect(endLabel('[*]', label)).toBe('End');
    expect(endLabel('[*]@Testing', label)).toBe('End of Testing phase');
  });

  it("offers nothing out of an end, rather than the start's transitions", () => {
    const ast = parse(WITH_END);
    const timeline = traverse(ast, new Map(), createBindings());

    // `[*]` is both start and end, so a naive lookup from the end matched the
    // transitions leaving the start and offered the machine's opening moves.
    expect(timeline.steps[timeline.steps.length - 1]!.to).toBe('[*]');
    expect(ast.transitions.filter((t) => t.from === '[*]')).toHaveLength(1);
    expect(timeline.done).toBe(true);
  });

  it('ends the run at a substate end when the parent has nowhere to go', () => {
    const ast = parse(
      'stateDiagram-v2\n[*] --> Outer\nstate Outer {\n[*] --> Inner\nInner --> [*]: finish\n}',
    );
    const timeline = traverse(ast, new Map(), createBindings());

    // Outer has no outgoing transitions, so finishing its machine finishes the run.
    expect(timeline.steps[timeline.steps.length - 1]!.to).toBe('[*]@Outer');
    expect(timeline.done).toBe(true);
  });

  it('continues from the parent when the parent does have somewhere to go', () => {
    const ast = parse(
      'stateDiagram-v2\n[*] --> Outer\nstate Outer {\n[*] --> Inner\nInner --> [*]: finish\n}\nOuter --> Live: deploy',
    );
    const timeline = traverse(ast, new Map(), createBindings());

    expect(timeline.steps.some((s) => s.transition.label?.raw === 'deploy')).toBe(true);
    expect(timeline.steps[timeline.steps.length - 1]!.to).toBe('Live');
  });
});

describe('choosing where the run begins', () => {
  const MACHINE = `stateDiagram-v2
    [*] --> Draft
    Draft --> Review: submit
    Review --> Live: approve
    Live --> [*]`;

  it('honours the state the consumer asked for', () => {
    const ast = parse(MACHINE);
    expect(entryOf(ast, 'Review')).toBe('Review');
    expect(traverse(ast, new Map(), createBindings(), 'Review').steps[0]!.from).toBe('Review');
  });

  it('falls back to [*] when nothing was asked for', () => {
    expect(entryOf(parse(MACHINE))).toBe('Draft');
    expect(entryOf(parse(MACHINE), null)).toBe('Draft');
  });

  it('falls back to the first state when there is no [*]', () => {
    expect(entryOf(parse('stateDiagram-v2\nAlpha --> Beta: go'))).toBe('Alpha');
  });

  it('ignores a state that does not exist rather than starting nowhere', () => {
    expect(entryOf(parse(MACHINE), 'Nonexistent')).toBe('Draft');
  });

  it('will not start on an end, which is not a state you can be in', () => {
    expect(entryOf(parse(MACHINE), '[*]')).toBe('Draft');
  });

  it('descends when the chosen state is a composite', () => {
    const ast = parse(
      'stateDiagram-v2\n[*] --> A\nstate Outer {\n[*] --> Inner\nInner --> Done: go\n}',
    );
    expect(entryOf(ast, 'Outer')).toBe('Inner');
  });
});
