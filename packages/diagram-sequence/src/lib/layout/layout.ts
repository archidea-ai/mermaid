import { DEFAULT_FONT } from './measure';
import type { FontSpec, TextMeasurer } from './measure';
import type { Participant, SequenceDiagramAst } from '../parser/ast';
import type { Step, Timeline } from '../model/timeline';

export interface LayoutOptions {
  readonly columnGap: number;
  readonly columnMinWidth: number;
  readonly headerHeight: number;
  readonly rowHeight: number;
  readonly noteRowHeight: number;
  readonly padding: number;
  readonly activationWidth: number;
  readonly fragmentPadding: number;
  readonly font: FontSpec;
}

export const DEFAULT_LAYOUT_OPTIONS: LayoutOptions = {
  columnGap: 48,
  columnMinWidth: 110,
  headerHeight: 56,
  rowHeight: 52,
  noteRowHeight: 44,
  padding: 24,
  activationWidth: 10,
  fragmentPadding: 12,
  font: DEFAULT_FONT,
};

export interface Column {
  readonly participantId: string;
  readonly participant: Participant;
  readonly x: number;
  readonly centerX: number;
  readonly width: number;
}

export interface Row {
  readonly stepId: string;
  readonly stepIndex: number;
  readonly y: number;
  readonly height: number;
}

export interface ArrowGeometry {
  readonly stepId: string;
  readonly stepIndex: number;
  readonly fromX: number;
  readonly toX: number;
  readonly y: number;
  readonly selfLoop: boolean;
  readonly loopHeight: number;
}

export interface ActivationRect {
  readonly participantId: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
}

export interface FragmentRect {
  readonly fragmentId: string;
  readonly branchId: string;
  readonly label: string;
  readonly kind: string;
  readonly depth: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface NoteRect {
  readonly stepId: string;
  readonly stepIndex: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SequenceLayout {
  readonly columns: readonly Column[];
  readonly columnById: ReadonlyMap<string, Column>;
  readonly rows: readonly Row[];
  readonly rowByStepId: ReadonlyMap<string, Row>;
  readonly arrows: readonly ArrowGeometry[];
  readonly activations: readonly ActivationRect[];
  readonly fragments: readonly FragmentRect[];
  readonly notes: readonly NoteRect[];
  readonly width: number;
  readonly height: number;
  readonly lifelineTop: number;
  readonly lifelineBottom: number;
}

/**
 * Pure geometry: no DOM, no React. Text measurement arrives through the
 * injected measurer, which is what keeps the visual core unit-testable given
 * that jsdom provides no SVG layout at all.
 */
export function layout(
  ast: SequenceDiagramAst,
  timeline: Timeline,
  measurer: TextMeasurer,
  overrides: Partial<LayoutOptions> = {},
): SequenceLayout {
  const options = { ...DEFAULT_LAYOUT_OPTIONS, ...overrides };
  const { padding, columnGap, columnMinWidth, headerHeight, font } = options;

  const columns: Column[] = [];
  let cursorX = padding;

  for (const participant of ast.participants) {
    const measured = measurer.measure(participant.label, font).width + 32;
    const width = Math.max(columnMinWidth, measured);
    columns.push({
      participantId: participant.id,
      participant,
      x: cursorX,
      centerX: cursorX + width / 2,
      width,
    });
    cursorX += width + columnGap;
  }

  const columnById = new Map(columns.map((column) => [column.participantId, column]));

  const lifelineTop = padding + headerHeight;
  const maxDepth = Math.max(0, ...timeline.steps.map((step) => step.path.length));

  const rows: Row[] = [];
  let cursorY = lifelineTop + options.fragmentPadding * (maxDepth + 1);

  for (const [stepIndex, step] of timeline.steps.entries()) {
    const height = step.kind === 'note' ? options.noteRowHeight : options.rowHeight;
    rows.push({ stepId: step.id, stepIndex, y: cursorY + height / 2, height });
    cursorY += height;
  }

  const rowByStepId = new Map(rows.map((row) => [row.stepId, row]));

  const arrows: ArrowGeometry[] = [];
  const notes: NoteRect[] = [];

  for (const [stepIndex, step] of timeline.steps.entries()) {
    const row = rows[stepIndex]!;

    if (step.kind === 'message' && step.node.type === 'message') {
      const from = columnById.get(step.node.from);
      const to = columnById.get(step.node.to);
      if (!from || !to) continue;

      arrows.push({
        stepId: step.id,
        stepIndex,
        fromX: from.centerX,
        toX: to.centerX,
        y: row.y,
        selfLoop: from.participantId === to.participantId,
        loopHeight: options.rowHeight * 0.6,
      });
      continue;
    }

    if (step.kind === 'note' && step.node.type === 'note') {
      const targets = step.node.targets
        .map((target) => columnById.get(target))
        .filter((column): column is Column => Boolean(column));
      if (targets.length === 0) continue;

      const measured = measurer.measure(step.node.text.raw, font);
      const left = Math.min(...targets.map((column) => column.centerX));
      const right = Math.max(...targets.map((column) => column.centerX));
      const width = Math.max(measured.width + 28, right - left + 60);

      const anchor =
        step.node.placement === 'left of'
          ? left - width - 12
          : step.node.placement === 'right of'
            ? right + 12
            : (left + right) / 2 - width / 2;

      notes.push({
        stepId: step.id,
        stepIndex,
        x: anchor,
        y: row.y - options.noteRowHeight / 2 + 4,
        width,
        height: options.noteRowHeight - 8,
      });
    }
  }

  const activations = computeActivations(timeline, columnById, rows, options);
  const fragments = computeFragments(timeline, rows, columns, options);

  const contentRight = Math.max(
    cursorX - columnGap + padding,
    ...notes.map((note) => note.x + note.width + padding),
    padding,
  );

  return {
    columns,
    columnById,
    rows,
    rowByStepId,
    arrows,
    activations,
    fragments,
    notes,
    width: contentRight,
    height: cursorY + padding + options.fragmentPadding * (maxDepth + 1),
    lifelineTop,
    lifelineBottom: cursorY + options.fragmentPadding * maxDepth,
  };
}

function computeActivations(
  timeline: Timeline,
  columnById: ReadonlyMap<string, Column>,
  rows: readonly Row[],
  options: LayoutOptions,
): ActivationRect[] {
  const open = new Map<string, { startIndex: number; depth: number }[]>();
  const result: ActivationRect[] = [];

  const close = (participantId: string, endIndex: number): void => {
    const stack = open.get(participantId);
    const entry = stack?.pop();
    if (!entry) return;

    const column = columnById.get(participantId);
    const startRow = rows[entry.startIndex];
    const endRow = rows[endIndex];
    if (!column || !startRow || !endRow) return;

    result.push({
      participantId,
      x: column.centerX - options.activationWidth / 2 + entry.depth * 6,
      y: startRow.y,
      width: options.activationWidth,
      height: Math.max(endRow.y - startRow.y, options.rowHeight / 2),
      depth: entry.depth,
    });
  };

  for (const [index, step] of timeline.steps.entries()) {
    const target = step.involved[step.involved.length - 1];
    if (!target) continue;

    if (step.kind === 'activate') {
      const stack = open.get(target) ?? [];
      stack.push({ startIndex: index, depth: stack.length });
      open.set(target, stack);
    } else if (step.kind === 'deactivate') {
      close(target, index);
    }
  }

  // Anything still open runs to the end of the diagram, as mermaid renders it.
  for (const participantId of open.keys()) {
    while ((open.get(participantId)?.length ?? 0) > 0) {
      close(participantId, rows.length - 1);
    }
  }

  return result;
}

function computeFragments(
  timeline: Timeline,
  rows: readonly Row[],
  columns: readonly Column[],
  options: LayoutOptions,
): FragmentRect[] {
  const spans = new Map<
    string,
    {
      fragmentId: string;
      branchId: string;
      label: string;
      kind: string;
      depth: number;
      first: number;
      last: number;
    }
  >();

  for (const [index, step] of timeline.steps.entries()) {
    for (const [depth, entry] of step.path.entries()) {
      const key = `${entry.branchId}#${entry.iteration ?? 'x'}`;
      const existing = spans.get(key);
      if (existing) {
        existing.last = index;
        continue;
      }
      spans.set(key, {
        fragmentId: entry.fragmentId,
        branchId: entry.branchId,
        label: entry.label,
        kind: entry.kind,
        depth,
        first: index,
        last: index,
      });
    }
  }

  const left = Math.min(...columns.map((column) => column.x), options.padding);
  const right = Math.max(...columns.map((column) => column.x + column.width), options.padding);

  return [...spans.values()].map((span) => {
    const firstRow = rows[span.first]!;
    const lastRow = rows[span.last]!;
    const inset = span.depth * options.fragmentPadding;

    return {
      fragmentId: span.fragmentId,
      branchId: span.branchId,
      label: span.label,
      kind: span.kind,
      depth: span.depth,
      x: left - options.fragmentPadding + inset,
      y: firstRow.y - firstRow.height / 2 - options.fragmentPadding + inset,
      width: right - left + options.fragmentPadding * 2 - inset * 2,
      height:
        lastRow.y +
        lastRow.height / 2 -
        (firstRow.y - firstRow.height / 2) +
        options.fragmentPadding * 2 -
        inset * 2,
    };
  });
}

export type { Step };
