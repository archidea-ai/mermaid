import { enclosingStates } from './nesting';
import type { RichText } from '@archidea-ai/mermaid-scenario';
import type { StateDiagramAst, StateNode } from '../parser/ast';

export interface TrackEntry {
  readonly stateId: string;
  /** Cursor that returns the run here, or null for where it stands now. */
  readonly cursor: number | null;
  /**
   * The transition that led here.
   *
   * `undefined` means nothing led here — this is where the run began. `null`
   * means a transition led here but said nothing, which still draws a line;
   * conflating the two lost the connection entirely for unlabelled moves.
   *
   * Carried on the entry rather than looked up while rendering: the arrival is
   * what the transition belongs to, and a connector between two chips has no
   * other way to know which step it stands for.
   */
  readonly via?: RichText | null;
}

export interface TrackRun {
  readonly key: string;
  /** Containers around every entry in this run, outermost first. */
  readonly containers: readonly StateNode[];
  readonly entries: readonly TrackEntry[];
}

/**
 * Groups the walk into contiguous runs that share a container chain.
 *
 * A box should wrap exactly the stretch of the walk that happened inside it, so
 * the grouping has to follow the chronology rather than filter by nesting depth.
 * Filtering could not tell a second visit to a container from the first, and
 * merged them into one box; and it stranded states visited before a container
 * was entered, since they belong to no level of the *current* chain.
 *
 * Consecutive entries sharing a chain stay in one run — which is also what puts
 * the current state in the same box as the entry before it when they agree.
 */
export function buildTrack(
  ast: StateDiagramAst,
  trail: readonly TrackEntry[],
  current: string | null,
): readonly TrackRun[] {
  const items: TrackEntry[] = [...trail];
  if (current !== null) items.push({ stateId: current, cursor: null });
  if (items.length === 0) return [];

  const runs: TrackRun[] = [];
  let chainKey: string | null = null;

  for (const item of items) {
    const containers = enclosingStates(ast, item.stateId);
    const key = containers.map((container) => container.id).join('/');

    if (key !== chainKey || runs.length === 0) {
      runs.push({ key: `${key}#${runs.length}`, containers, entries: [item] });
      chainKey = key;
      continue;
    }

    const last = runs[runs.length - 1]!;
    runs[runs.length - 1] = { ...last, entries: [...last.entries, item] };
  }

  return runs;
}
