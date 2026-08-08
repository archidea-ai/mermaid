import { describe, expect, it } from 'vitest';
import { parse } from '../parser/parse';
import { buildTrack } from './track';
import type { TrackEntry } from './track';

const MACHINE = `stateDiagram-v2
  [*] --> Start
  Start --> Work: begin
  state Work {
    [*] --> Doing
    Doing --> Checking: check
  }
  Work --> Start: retry
  Work --> Done: finish`;

const ast = parse(MACHINE);
const trail = (...ids: string[]): TrackEntry[] =>
  ids.map((stateId, index) => ({ stateId, cursor: index - 1 }));

const shape = (runs: ReturnType<typeof buildTrack>) =>
  runs.map((run) => [run.containers.map((c) => c.id), run.entries.map((e) => e.stateId)]);

describe('buildTrack', () => {
  it('returns nothing for an empty walk', () => {
    expect(buildTrack(ast, [], null)).toEqual([]);
  });

  it('keeps consecutive states with the same containers in one run', () => {
    expect(shape(buildTrack(ast, trail('Doing'), 'Checking'))).toEqual([
      [['Work'], ['Doing', 'Checking']],
    ]);
  });

  it('starts a new run when the walk enters a container', () => {
    expect(shape(buildTrack(ast, trail('Start'), 'Doing'))).toEqual([
      [[], ['Start']],
      [['Work'], ['Doing']],
    ]);
  });

  it('starts a new run when the walk leaves a container', () => {
    expect(shape(buildTrack(ast, trail('Start', 'Doing'), 'Done'))).toEqual([
      [[], ['Start']],
      [['Work'], ['Doing']],
      [[], ['Done']],
    ]);
  });

  it('gives a second visit to a container its own box, not the first one', () => {
    // Start → Work → Start → Work: the two stretches inside Work are separate
    // boxes, which filtering by nesting depth could not express.
    const runs = buildTrack(ast, trail('Start', 'Doing', 'Start'), 'Doing');

    expect(shape(runs)).toEqual([
      [[], ['Start']],
      [['Work'], ['Doing']],
      [[], ['Start']],
      [['Work'], ['Doing']],
    ]);
    expect(new Set(runs.map((run) => run.key)).size).toBe(4);
  });

  it('puts the current state in the same run as the entry before it when they agree', () => {
    const runs = buildTrack(ast, trail('Doing'), 'Checking');

    expect(runs).toHaveLength(1);
    expect(runs[0]!.entries.at(-1)).toEqual({ stateId: 'Checking', cursor: null });
  });

  it('marks only the current entry as current', () => {
    const runs = buildTrack(ast, trail('Start'), 'Doing');
    const cursors = runs.flatMap((run) => run.entries.map((entry) => entry.cursor));

    expect(cursors.filter((cursor) => cursor === null)).toHaveLength(1);
    expect(cursors.at(-1)).toBeNull();
  });

  it('handles a walk with no current state yet', () => {
    expect(shape(buildTrack(ast, trail('Start'), null))).toEqual([[[], ['Start']]]);
  });
});
