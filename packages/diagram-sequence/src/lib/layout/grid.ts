import type { SequenceDiagramAst } from '../parser/ast';
import type { Timeline } from '../model/timeline';

/**
 * Placement for a CSS Grid, not pixel geometry.
 *
 * Every sequence arrow is horizontal, so the browser can place everything from
 * column and row spans alone — no text measurement, no absolute positioning, no
 * SVG overlay. This module stays pure and unit-testable precisely because it
 * computes indices rather than coordinates.
 *
 * All indices are 1-based, as CSS Grid lines are. Row 1 is the participant
 * header; steps begin at row 2.
 */

export const HEADER_ROW = 1;
const FIRST_STEP_ROW = 2;

export interface GridColumn {
  readonly participantId: string;
  readonly label: string;
  readonly kind: 'participant' | 'actor';
  readonly boxId: string | null;
  /** 1-based grid column line. */
  readonly index: number;
}

export interface GridRow {
  readonly stepId: string;
  readonly stepIndex: number;
  readonly index: number;
}

export interface GridMessage {
  readonly stepId: string;
  readonly row: number;
  readonly columnStart: number;
  readonly columnEnd: number;
  readonly direction: 'forward' | 'backward';
  readonly selfLoop: boolean;
}

export interface GridNote {
  readonly stepId: string;
  readonly row: number;
  readonly columnStart: number;
  readonly columnEnd: number;
}

export interface GridActivation {
  readonly participantId: string;
  readonly column: number;
  readonly rowStart: number;
  /** Exclusive grid line, as CSS `grid-row: start / end` expects. */
  readonly rowEnd: number;
  readonly depth: number;
}

export interface GridFragment {
  readonly fragmentId: string;
  readonly branchId: string;
  readonly kind: string;
  readonly label: string;
  readonly depth: number;
  readonly rowStart: number;
  /** Exclusive grid line, as CSS `grid-row: start / end` expects. */
  readonly rowEnd: number;
}

export interface SequenceGrid {
  readonly columns: readonly GridColumn[];
  readonly columnByParticipant: ReadonlyMap<string, GridColumn>;
  readonly rows: readonly GridRow[];
  readonly messages: readonly GridMessage[];
  readonly notes: readonly GridNote[];
  readonly activations: readonly GridActivation[];
  readonly fragments: readonly GridFragment[];
  readonly columnCount: number;
  readonly rowCount: number;
}

export function computeGrid(ast: SequenceDiagramAst, timeline: Timeline): SequenceGrid {
  const columns: GridColumn[] = ast.participants.map((participant, position) => ({
    participantId: participant.id,
    label: participant.label,
    kind: participant.kind,
    boxId: participant.boxId,
    index: position + 1,
  }));
  const columnByParticipant = new Map(columns.map((column) => [column.participantId, column]));

  const rows: GridRow[] = timeline.steps.map((step, stepIndex) => ({
    stepId: step.id,
    stepIndex,
    index: stepIndex + FIRST_STEP_ROW,
  }));

  const messages: GridMessage[] = [];
  const notes: GridNote[] = [];

  for (const [stepIndex, step] of timeline.steps.entries()) {
    const row = rows[stepIndex]!.index;

    if (step.kind === 'message' && step.node.type === 'message') {
      const from = columnByParticipant.get(step.node.from);
      const to = columnByParticipant.get(step.node.to);
      if (!from || !to) continue;

      messages.push({
        stepId: step.id,
        row,
        columnStart: Math.min(from.index, to.index),
        columnEnd: Math.max(from.index, to.index),
        direction: from.index <= to.index ? 'forward' : 'backward',
        selfLoop: from.index === to.index,
      });
      continue;
    }

    if (step.kind === 'note' && step.node.type === 'note') {
      const targets = step.node.targets
        .map((target) => columnByParticipant.get(target))
        .filter((column): column is GridColumn => Boolean(column));
      if (targets.length === 0) continue;

      const left = Math.min(...targets.map((column) => column.index));
      const right = Math.max(...targets.map((column) => column.index));

      // A note beside a single participant leans into the neighbouring column
      // when there is one, so it does not sit on top of the lifeline.
      const columnStart = step.node.placement === 'left of' ? Math.max(1, left - 1) : left;
      const columnEnd =
        step.node.placement === 'right of' ? Math.min(columns.length, right + 1) : right;

      notes.push({ stepId: step.id, row, columnStart, columnEnd });
    }
  }

  return {
    columns,
    columnByParticipant,
    rows,
    messages,
    notes,
    activations: computeActivations(timeline, columnByParticipant, rows),
    fragments: computeFragments(timeline, rows),
    columnCount: columns.length,
    rowCount: rows.length + 1,
  };
}

function computeActivations(
  timeline: Timeline,
  columnByParticipant: ReadonlyMap<string, GridColumn>,
  rows: readonly GridRow[],
): GridActivation[] {
  const open = new Map<string, { startRow: number; depth: number }[]>();
  const result: GridActivation[] = [];

  const close = (participantId: string, endRow: number): void => {
    const stack = open.get(participantId);
    const entry = stack?.pop();
    const column = columnByParticipant.get(participantId);
    if (!entry || !column) return;

    result.push({
      participantId,
      column: column.index,
      rowStart: entry.startRow,
      rowEnd: Math.max(endRow + 1, entry.startRow + 1),
      depth: entry.depth,
    });
  };

  for (const [stepIndex, step] of timeline.steps.entries()) {
    const target = step.involved[step.involved.length - 1];
    const row = rows[stepIndex]?.index;
    if (!target || row === undefined) continue;

    if (step.kind === 'activate') {
      const stack = open.get(target) ?? [];
      stack.push({ startRow: row, depth: stack.length });
      open.set(target, stack);
    } else if (step.kind === 'deactivate') {
      close(target, row);
    }
  }

  // Anything still open runs to the end of the diagram, as mermaid renders it.
  const lastRow = (rows[rows.length - 1]?.index ?? FIRST_STEP_ROW) + 1;
  for (const participantId of [...open.keys()]) {
    while ((open.get(participantId)?.length ?? 0) > 0) close(participantId, lastRow);
  }

  return result;
}

function computeFragments(timeline: Timeline, rows: readonly GridRow[]): GridFragment[] {
  const spans = new Map<string, GridFragment & { firstIndex: number; lastIndex: number }>();

  for (const [stepIndex, step] of timeline.steps.entries()) {
    const row = rows[stepIndex]!.index;

    for (const [depth, entry] of step.path.entries()) {
      const key = `${entry.branchId}#${entry.iteration ?? 'x'}`;
      const existing = spans.get(key);

      if (existing) {
        spans.set(key, { ...existing, rowEnd: row + 1, lastIndex: stepIndex });
        continue;
      }

      spans.set(key, {
        fragmentId: entry.fragmentId,
        branchId: entry.branchId,
        kind: entry.kind,
        label: entry.label,
        depth,
        rowStart: row,
        rowEnd: row + 1,
        firstIndex: stepIndex,
        lastIndex: stepIndex,
      });
    }
  }

  return [...spans.values()].map(({ firstIndex: _f, lastIndex: _l, ...fragment }) => fragment);
}
