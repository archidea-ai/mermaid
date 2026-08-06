import { describe, expect, it } from 'vitest';
import { parse } from '../parser/parse';
import { buildTimeline } from './timeline';
import { createBindings } from './bindings';
import type { Decision, DecisionMap } from './timeline';

const decisions = (...list: Decision[]): DecisionMap =>
  new Map(list.map((decision) => [decision.fragmentId, decision]));

const build = (source: string, list: Decision[] = [], values = {}) =>
  buildTimeline(parse(source), decisions(...list), createBindings(values));

const kinds = (source: string, list: Decision[] = [], values = {}) =>
  build(source, list, values).steps.map((step) => step.kind);

const texts = (source: string, list: Decision[] = [], values = {}) =>
  build(source, list, values).steps.map((step) =>
    step.node.type === 'message' ? step.node.text.raw : `[${step.kind}]`,
  );

describe('buildTimeline', () => {
  it('emits one step per message with both endpoints involved', () => {
    const timeline = build('sequenceDiagram\nA->>B: one\nB->>C: two');

    expect(timeline.steps).toHaveLength(2);
    expect(timeline.steps[0]!.involved).toEqual(['A', 'B']);
    expect(timeline.steps[1]!.involved).toEqual(['B', 'C']);
    expect(timeline.steps.map((step) => step.index)).toEqual([0, 1]);
    expect(timeline.pending).toBeNull();
  });

  it('numbers steps only when autonumber is on', () => {
    expect(build('sequenceDiagram\nA->>B: x').steps[0]!.ordinal).toBeNull();

    const numbered = build('sequenceDiagram\nautonumber 10 5\nA->>B: x\nB->>A: y');
    expect(numbered.steps.map((step) => step.ordinal)).toEqual([10, 15]);
  });

  it('emits an activation step for the +/- shorthand without consuming an ordinal', () => {
    const timeline = build('sequenceDiagram\nautonumber\nA->>+B: start\nB-->>-A: done');

    expect(timeline.steps.map((step) => step.kind)).toEqual([
      'message',
      'activate',
      'message',
      'deactivate',
    ]);
    expect(timeline.steps.map((step) => step.ordinal)).toEqual([1, null, 2, null]);
  });

  it('makes a standalone note its own step and attaches it for the aside', () => {
    const timeline = build('sequenceDiagram\nA->>B: x\nnote over A,B: heads up');

    expect(timeline.steps[1]!.kind).toBe('note');
    expect(timeline.steps[1]!.involved).toEqual(['A', 'B']);
    expect(timeline.steps[1]!.notes[0]!.text.raw).toBe('heads up');
  });

  it('emits create and destroy as steps naming their target', () => {
    const timeline = build('sequenceDiagram\nA->>B: x\ncreate participant C\nB->>C: go\ndestroy C');

    expect(timeline.steps.map((step) => step.kind)).toEqual([
      'message',
      'create',
      'message',
      'destroy',
    ]);
    expect(timeline.steps[1]!.involved).toEqual(['C']);
  });

  const ALT = `sequenceDiagram
    alt {{role}} == "admin"
      A->>B: audit
    else
      A->>B: plain
    end`;

  it('takes the branch an explicit decision names and skips the other', () => {
    const timeline = build(ALT, [{ kind: 'branch', fragmentId: 'alt-2', branchId: 'alt-2-1' }]);

    expect(texts(ALT, [{ kind: 'branch', fragmentId: 'alt-2', branchId: 'alt-2-1' }])).toEqual([
      'plain',
    ]);
    expect(timeline.skipped.map((region) => region.branchId)).toEqual(['alt-2-0']);
  });

  it('resolves a branch from bindings with no prompt at all', () => {
    const timeline = build(ALT, [], { role: 'admin' });

    expect(timeline.pending).toBeNull();
    expect(timeline.steps.map((s) => (s.node.type === 'message' ? s.node.text.raw : ''))).toEqual([
      'audit',
    ]);
  });

  it('falls to else when every condition is false', () => {
    expect(texts(ALT, [], { role: 'member' })).toEqual(['plain']);
  });

  it('pauses for the variable rather than silently taking else when unknown', () => {
    const timeline = build(ALT);

    expect(timeline.steps).toHaveLength(0);
    expect(timeline.pending).toMatchObject({ kind: 'variable', names: ['role'] });
  });

  it('asks the viewer to choose when branches carry prose labels', () => {
    const timeline = build(
      'sequenceDiagram\nalt logged in\nA->>B: x\nelse anonymous\nA->>B: y\nend',
    );

    expect(timeline.pending).toMatchObject({ kind: 'branch', reason: 'unresolved' });
    expect(timeline.steps).toHaveLength(0);
  });

  it('includes opt by default and skips it when excluded', () => {
    const OPT = 'sequenceDiagram\nA->>B: before\nopt extras\nA->>B: inside\nend\nA->>B: after';

    expect(texts(OPT)).toEqual(['before', 'inside', 'after']);
    expect(texts(OPT, [{ kind: 'include', fragmentId: 'opt-3', included: false }])).toEqual([
      'before',
      'after',
    ]);
    expect(
      build(OPT, [{ kind: 'include', fragmentId: 'opt-3', included: false }]).skipped,
    ).toHaveLength(1);
  });

  it('resolves an opt from its condition when the label is an expression', () => {
    const OPT = 'sequenceDiagram\nopt {{verbose}}\nA->>B: detail\nend';

    expect(texts(OPT, [], { verbose: true })).toEqual(['detail']);
    expect(texts(OPT, [], { verbose: false })).toEqual([]);
    expect(build(OPT).pending).toMatchObject({ kind: 'variable', names: ['verbose'] });
  });

  it('expands a loop the requested number of times with distinct step ids', () => {
    const LOOP = 'sequenceDiagram\nloop retry\nA->>B: ping\nend';

    expect(texts(LOOP)).toEqual(['ping']);

    const thrice = build(LOOP, [{ kind: 'iterations', fragmentId: 'loop-2', count: 3 }]);
    expect(thrice.steps).toHaveLength(3);
    expect(new Set(thrice.steps.map((step) => step.id)).size).toBe(3);
    expect(thrice.steps[2]!.path[0]!.iteration).toBe(2);
  });

  const PAR = `sequenceDiagram
    par lane one
      A->>B: one-a
      A->>B: one-b
    and lane two
      A->>C: two-a
      A->>C: two-b
    end`;

  it('interleaves parallel lanes round-robin instead of running one to completion', () => {
    expect(texts(PAR)).toEqual(['one-a', 'two-a', 'one-b', 'two-b']);
  });

  it('skips a deselected par lane', () => {
    const timeline = build(PAR, [{ kind: 'lanes', fragmentId: 'par-2', branchIds: ['par-2-0'] }]);

    expect(texts(PAR, [{ kind: 'lanes', fragmentId: 'par-2', branchIds: ['par-2-0'] }])).toEqual([
      'one-a',
      'one-b',
    ]);
    expect(timeline.skipped.map((region) => region.branchId)).toEqual(['par-2-1']);
  });

  it('records the enclosing fragment path outermost first', () => {
    const timeline = build(
      `sequenceDiagram
        loop hourly
          alt {{role}} == "admin"
            A->>B: audit
          else
            A->>B: plain
          end
        end`,
      [],
      { role: 'admin' },
    );

    expect(timeline.steps[0]!.path.map((entry) => entry.kind)).toEqual(['loop', 'alt']);
    expect(timeline.steps[0]!.path[1]!.label).toBe('{{role}} == "admin"');
  });

  it('carries variable effects and non-assigning reads on the steps that own them', () => {
    const timeline = build(
      'sequenceDiagram\nA->>B: login {{role : string}}\nB-->>A: {{userId = "u-1"}}',
    );

    expect(timeline.steps[0]!.reads.map((read) => read.name)).toEqual(['role']);
    expect(timeline.steps[0]!.effects).toEqual([]);
    expect(timeline.steps[1]!.effects).toEqual([{ name: 'userId', value: 'u-1' }]);
    expect(timeline.steps[1]!.reads).toEqual([]);
  });

  it('lets an effect bound earlier resolve a later branch with no prompt', () => {
    const timeline = build(`sequenceDiagram
      A->>B: login
      B-->>A: {{role = "admin"}}
      alt {{role}} == "admin"
        A->>B: audit
      else
        A->>B: plain
      end`);

    expect(timeline.pending).toBeNull();
    expect(timeline.steps).toHaveLength(3);
    expect((timeline.steps[2]!.node as { text: { raw: string } }).text.raw).toBe('audit');
  });

  it('truncates the timeline at the pending decision', () => {
    const timeline = build(`sequenceDiagram
      A->>B: before
      alt {{role}} == "admin"
        A->>B: inside
      end
      A->>B: after`);

    expect(
      texts(
        timeline === timeline
          ? `sequenceDiagram
      A->>B: before
      alt {{role}} == "admin"
        A->>B: inside
      end
      A->>B: after`
          : '',
      ),
    ).toEqual(['before']);
    expect(timeline.pending).not.toBeNull();
  });

  it('renders a rect fragment inline without asking anything', () => {
    expect(texts('sequenceDiagram\nrect rgb(200,200,255)\nA->>B: inside\nend')).toEqual(['inside']);
  });
});
