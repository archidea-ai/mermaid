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
    const timeline = traverse(ast, new Map([['Idle#0', second.id]]), createBindings());

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
    const timeline = traverse(ast, new Map([['Idle#0', first.id]]), createBindings());

    expect(timeline.unreached).toEqual(['B']);
  });

  it('takes a self loop once and then hands back, rather than spinning', () => {
    const timeline = run('stateDiagram-v2\n[*] --> A\nA --> A: again');

    // The loop is legitimate; repeating it is the viewer's call each time.
    expect(timeline.steps).toHaveLength(1);
    expect(timeline.pending!.from).toBe('A');
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
  // No escapes on the composites, so the walk is unambiguous: this suite is
  // about descending and climbing out, not about choosing.
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
    }`;

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

    // Passed --> [*] ends Building's machine, and Building has no way onward,
    // so that is where the run finishes.
    expect(timeline.steps[timeline.steps.length - 1]!.to).toBe('[*]@Building');
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

  it('offers the parent transition at a substate end rather than firing it', () => {
    const ast = parse(
      'stateDiagram-v2\n[*] --> Outer\nstate Outer {\n[*] --> Inner\nInner --> [*]: finish\n}\nOuter --> Live: deploy',
    );
    const finish = ast.transitions.find((t) => t.label?.raw === 'finish')!;
    const timeline = traverse(ast, new Map([['Inner#0', finish.id]]), createBindings());

    // `deploy` is a trigger, not a completion: reaching Outer's end does not
    // fire it, so the run stops and offers it.
    expect(timeline.at).toBe('[*]@Outer');
    expect(timeline.pending?.options.map((option) => option.label?.raw)).toEqual(['deploy']);

    const deploy = timeline.pending!.options[0]!;
    const taken = traverse(
      ast,
      new Map([
        ['Inner#0', finish.id],
        [timeline.nextKey!, deploy.id],
      ]),
      createBindings(),
    );

    expect(taken.steps[taken.steps.length - 1]!.to).toBe('Live');
  });

  it('takes a completion transition on its own — it is what finishing means', () => {
    const ast = parse(
      'stateDiagram-v2\n[*] --> Outer\nstate Outer {\n[*] --> Inner\nInner --> [*]: finish\n}\nOuter --> Live',
    );
    const finish = ast.transitions.find((t) => t.label?.raw === 'finish')!;
    const timeline = traverse(ast, new Map([['Inner#0', finish.id]]), createBindings());

    // Unlabelled and alone: the diagram says this is simply what happens next.
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

describe('a subgroup end is not the end of the flow', () => {
  it('points a subgroup end at its parent as the choice point', async () => {
    const { choicePointOf, isFinalEnd } = await import('./traverse');

    // Standing on a subgroup's end, the ways out are the parent's.
    expect(choicePointOf('[*]@Building')).toBe('Building');
    expect(choicePointOf('Compiling')).toBe('Compiling');
    // Only the top-level end finishes the flow.
    expect(choicePointOf('[*]')).toBeNull();

    expect(isFinalEnd('[*]')).toBe(true);
    expect(isFinalEnd('[*]@Building')).toBe(false);
    expect(isFinalEnd('Compiling')).toBe(false);
  });

  it('keeps walking past a subgroup end when the parent has ways out', () => {
    const ast = parse(
      'stateDiagram-v2\n[*] --> Outer\nstate Outer {\n[*] --> Inner\nInner --> [*]: finish\n}\nOuter --> Live: deploy\nOuter --> Failed: abort',
    );
    const finish = ast.transitions.find((t) => t.label?.raw === 'finish')!;
    const timeline = traverse(ast, new Map([['Inner#0', finish.id]]), createBindings());

    // Two ways out of Outer, so the run stops there for the viewer to choose —
    // at the subgroup's end, not at the end of everything.
    expect(timeline.steps[timeline.steps.length - 1]!.to).toBe('[*]@Outer');
    expect(timeline.done).toBe(false);
    expect(timeline.pending!.from).toBe('Outer');
  });
});

describe('when a subgroup end is the end of everything', () => {
  it('is not final while the parent still has a way onward', () => {
    const ast = parse(
      'stateDiagram-v2\n[*] --> Outer\nstate Outer {\n[*] --> Inner\nInner --> [*]: finish\n}\nOuter --> Live: deploy',
    );
    expect(ast.transitions.some((t) => t.from === 'Outer')).toBe(true);
  });

  it('is final when the parent has none, so the run stops there', () => {
    const ast = parse(
      'stateDiagram-v2\n[*] --> Outer\nstate Outer {\n[*] --> Inner\nInner --> [*]: finish\n}',
    );
    const timeline = traverse(ast, new Map(), createBindings());

    expect(ast.transitions.some((t) => t.from === 'Outer')).toBe(false);
    expect(timeline.done).toBe(true);
    expect(timeline.steps[timeline.steps.length - 1]!.to).toBe('[*]@Outer');
  });
});

describe('what a state is called on screen', () => {
  it('never shows the raw scoped-terminal token', async () => {
    const { displayName } = await import('../parser/ast');
    const label = (id: string) => ({ Building: 'Build stage', Inner: 'Inner state' })[id];

    // One rule everywhere: applying it in some places and not others let the
    // internal `[*]@Parent` id leak into the UI.
    expect(displayName('[*]@Building', label)).toBe('End of Build stage');
    expect(displayName('[*]', label)).toBe('End');
    expect(displayName('Inner', label)).toBe('Inner state');
    expect(displayName('Unknown', label)).toBe('Unknown');
  });
});

describe('transitions on enclosing states', () => {
  const NESTED = `stateDiagram-v2
    [*] --> Building
    state Building {
      [*] --> Compiling
      state Testing {
        [*] --> Unit
        Unit --> Passed: green
      }
      Compiling --> Testing: compiled
      Testing --> Reporting: report
    }
    Building --> Cancelled: abort
    Building --> Live: deploy`;

  it("offers an enclosing composite's transitions from deep inside it", async () => {
    const { outgoingFrom } = await import('./traverse');
    const ast = parse(NESTED);

    const labels = outgoingFrom(ast, 'Unit').map((t) => t.label?.raw);

    // Unit's own move, then Testing's, then Building's — innermost first.
    expect(labels).toEqual(['green', 'report', 'abort', 'deploy']);
  });

  it('lists the local choices before the escapes', async () => {
    const { outgoingFrom } = await import('./traverse');
    const froms = outgoingFrom(parse(NESTED), 'Unit').map((t) => t.from);

    expect(froms).toEqual(['Unit', 'Testing', 'Building', 'Building']);
  });

  it('offers nothing extra to a top-level state', async () => {
    const { outgoingFrom } = await import('./traverse');
    expect(outgoingFrom(parse(NESTED), 'Cancelled')).toEqual([]);
  });

  it('lets the viewer take an escape drawn on an enclosing state', () => {
    const ast = parse(NESTED);
    const abort = ast.transitions.find((t) => t.label?.raw === 'abort')!;
    const compiled = ast.transitions.find((t) => t.label?.raw === 'compiled')!;
    // Building's escapes are offered from inside too, so Compiling is a fork now.
    const timeline = traverse(
      ast,
      new Map([
        ['Compiling#0', compiled.id],
        ['Unit#0', abort.id],
      ]),
      createBindings(),
    );

    expect(timeline.steps.some((step) => step.to === 'Cancelled')).toBe(true);
  });

  it('does not loop when a composite somehow parents itself', async () => {
    const { outgoingFrom } = await import('./traverse');
    const ast = parse('stateDiagram-v2\nstate A {\n  A --> A: self\n}');
    expect(() => outgoingFrom(ast, 'A')).not.toThrow();
  });
});

describe('back links and arrows straight into a nested state', () => {
  const TRICKY = `stateDiagram-v2
    [*] --> Outer
    state Outer {
      [*] --> Idle
      Idle --> Idle: retry
      Idle --> Working: begin
      Working --> Idle: back
      state Deep {
        [*] --> Bottom
        Bottom --> Idle: surface
      }
    }
    Outer --> Bottom: jump straight in
    Outer --> Done: leave`;

  it('offers a self transition as an ordinary way out of the state', async () => {
    const { outgoingFrom } = await import('./traverse');
    const labels = outgoingFrom(parse(TRICKY), 'Idle').map((t) => t.label?.raw);

    // Its own two, then Outer's — a back link to itself is just another option.
    expect(labels).toEqual(['retry', 'begin', 'jump straight in', 'leave']);
  });

  it('takes a self transition without stalling or looping', () => {
    const ast = parse(TRICKY);
    const retry = ast.transitions.find((t) => t.label?.raw === 'retry')!;
    const timeline = traverse(ast, new Map([['Idle#0', retry.id]]), createBindings());

    expect(timeline.steps[0]).toMatchObject({ from: 'Idle', to: 'Idle' });
    // The decision fires once and then hands back, rather than looping forever
    // because the same choice is remembered for the same state.
    expect(timeline.steps).toHaveLength(1);
    expect(timeline.pending!.from).toBe('Idle');
  });

  it('lands exactly where an arrow into a nested state points, not on the composite', () => {
    const ast = parse(TRICKY);
    const jump = ast.transitions.find((t) => t.label?.raw === 'jump straight in')!;
    const timeline = traverse(ast, new Map([['Idle#0', jump.id]]), createBindings());

    // The target is a concrete inner state, so there is nothing to descend into.
    expect(timeline.steps[0]!.to).toBe('Bottom');
  });

  it('reports the boxes around a directly targeted inner state', async () => {
    const { enclosingStates } = await import('./nesting');
    expect(enclosingStates(parse(TRICKY), 'Bottom').map((s) => s.id)).toEqual(['Outer', 'Deep']);
  });

  it('flags an escape but not a move that stays in the box', async () => {
    const { isWithin } = await import('./nesting');
    const ast = parse(TRICKY);

    // `Outer --> Bottom` is drawn on Outer but lands back inside Outer.
    expect(isWithin(ast, 'Bottom', 'Outer')).toBe(true);
    // `Outer --> Done` genuinely leaves.
    expect(isWithin(ast, 'Done', 'Outer')).toBe(false);
  });
});

describe('why the state view shows no step counter', () => {
  it('has no fixed length once a loop is reachable', () => {
    const ast = parse('stateDiagram-v2\n[*] --> A\nA --> A: again\nA --> B: move on');
    const again = ast.transitions.find((t) => t.label?.raw === 'again')!;
    const onward = ast.transitions.find((t) => t.label?.raw === 'move on')!;

    // The same machine yields runs of different lengths depending on the
    // choices made, so any "n of m" denominator would be invented.
    const looped = traverse(ast, new Map([['A#0', again.id]]), createBindings());
    const direct = traverse(ast, new Map([['A#0', onward.id]]), createBindings());

    expect(looped.steps).toHaveLength(1);
    expect(direct.steps).toHaveLength(1);
    expect(looped.steps[0]!.to).toBe('A');
    expect(direct.steps[0]!.to).toBe('B');
  });
});

describe('completion transitions out of a composite', () => {
  const MACHINE = `stateDiagram-v2
    [*] --> Work
    state Work {
      [*] --> Doing
      Doing --> [*]: finished
    }
    Work --> Next
    Work --> Abort: cancel`;

  it('withholds an unlabelled escape until the composite has ended', async () => {
    const { outgoingFrom } = await import('./traverse');

    // Inside Work: `Work --> Next` carries no trigger, so it is a completion
    // transition and is not yet on offer. `cancel` is a trigger and is.
    const inside = outgoingFrom(parse(MACHINE), 'Doing').map((t) => t.label?.raw ?? null);
    expect(inside).toEqual(['finished', 'cancel']);
  });

  it('offers it once the composite reaches its end', async () => {
    const { outgoingFrom } = await import('./traverse');

    const atEnd = outgoingFrom(parse(MACHINE), '[*]@Work').map((t) => t.label?.raw ?? null);
    expect(atEnd).toEqual([null, 'cancel']);
  });

  it('still offers a state its own unlabelled transitions', async () => {
    const { outgoingFrom } = await import('./traverse');
    const ast = parse('stateDiagram-v2\n[*] --> A\nA --> B');

    expect(outgoingFrom(ast, 'A')).toHaveLength(1);
  });
});

describe('choosing the same move again later in the run', () => {
  const LOOP = 'stateDiagram-v2\n[*] --> A\nA --> A: again\nA --> B: move on';

  it('lets the viewer repeat a transition on a later visit', () => {
    const ast = parse(LOOP);
    const again = ast.transitions.find((t) => t.label?.raw === 'again')!;

    // Two separate arrivals, two separate decisions — keying by state alone
    // made the second one impossible to express.
    const timeline = traverse(
      ast,
      new Map([
        ['A#0', again.id],
        ['A#1', again.id],
      ]),
      createBindings(),
    );

    expect(timeline.steps.map((step) => step.to)).toEqual(['A', 'A']);
    expect(timeline.pending!.from).toBe('A');
  });

  it('replaces only the arrival being changed when the run is rewound', () => {
    const ast = parse(LOOP);
    const again = ast.transitions.find((t) => t.label?.raw === 'again')!;
    const onward = ast.transitions.find((t) => t.label?.raw === 'move on')!;

    const timeline = traverse(
      ast,
      new Map([
        ['A#0', again.id],
        ['A#1', onward.id],
      ]),
      createBindings(),
    );

    expect(timeline.steps.map((step) => step.to)).toEqual(['A', 'B']);
  });

  it('records the key each step departed from, so a rewind can reuse it', () => {
    const ast = parse(LOOP);
    const again = ast.transitions.find((t) => t.label?.raw === 'again')!;
    const timeline = traverse(ast, new Map([['A#0', again.id]]), createBindings());

    expect(timeline.steps[0]!.fromKey).toBe('A#0');
    expect(timeline.nextKey).toBe('A#1');
  });
});
