import { HEADER_ROW } from '../layout/grid';
import { RichLabel, withBreaks } from './rich-label';
import type { ArrowKind } from '../parser/tokenize';
import type { SequenceGrid } from '../layout/grid';
import type { EmphasisMap } from '../layout/emphasis';
import type { Timeline } from '../model/timeline';
import type { RichText } from '../parser/ast';
import type { CSSProperties } from 'react';

const DOTTED: readonly ArrowKind[] = ['-->', '-->>', '--x', '--)', '<<-->>'];

const headFor = (arrow: ArrowKind): 'solid' | 'open' | 'cross' | 'async' => {
  if (arrow.endsWith('x')) return 'cross';
  if (arrow.endsWith(')')) return 'async';
  if (arrow === '->' || arrow === '-->') return 'open';
  return 'solid';
};

export interface SequenceCanvasProps {
  grid: SequenceGrid;
  timeline: Timeline;
  emphasis: EmphasisMap;
  onSelectStep?: (index: number) => void;
}

/**
 * Plain HTML on a CSS Grid — no SVG, no absolute positioning, no measurement.
 *
 * Every sequence arrow is horizontal, so a message is a grid item spanning from
 * its sender's column to its receiver's, and the browser centres the label for
 * us. Text wraps natively, is selectable and findable, and screen readers get
 * real content rather than <text> nodes.
 */
export function SequenceCanvas({ grid, timeline, emphasis, onSelectStep }: SequenceCanvasProps) {
  const style = {
    '--seq-column-count': grid.columnCount,
    gridTemplateColumns: `repeat(${grid.columnCount}, minmax(7rem, 1fr))`,
    gridTemplateRows: `auto repeat(${grid.rows.length}, minmax(2.75rem, auto))`,
  } as CSSProperties;

  return (
    <div className="seq-canvas" role="group" aria-label="Sequence diagram">
      <div className="seq-grid" style={style}>
        {/* Lifelines sit behind everything, one per column, spanning all steps. */}
        {grid.columns.map((column) => (
          <div
            key={`life-${column.participantId}`}
            className="seq-lifeline"
            data-emphasis={emphasis.participant(column.participantId)}
            style={{ gridColumn: column.index, gridRow: `${HEADER_ROW + 1} / -1` }}
            aria-hidden="true"
          />
        ))}

        {grid.fragments.map((fragment) => (
          <div
            key={`${fragment.branchId}-${fragment.rowStart}`}
            className="seq-fragment"
            data-emphasis={emphasis.fragmentBranch(fragment.branchId)}
            style={{
              gridColumn: '1 / -1',
              gridRow: `${fragment.rowStart} / ${fragment.rowEnd}`,
              margin: `0 ${fragment.depth * 8}px`,
            }}
          >
            <span className="seq-fragment__tag">{fragment.kind}</span>
            {fragment.label ? <span className="seq-fragment__label">{fragment.label}</span> : null}
          </div>
        ))}

        {grid.activations.map((activation, index) => (
          <div
            key={`act-${activation.participantId}-${index}`}
            className="seq-activation"
            data-emphasis={emphasis.participant(activation.participantId)}
            style={{
              gridColumn: activation.column,
              gridRow: `${activation.rowStart} / ${activation.rowEnd}`,
              marginLeft: activation.depth * 6,
            }}
            aria-hidden="true"
          />
        ))}

        {grid.columns.map((column) => (
          <div
            key={`head-${column.participantId}`}
            className="seq-participant"
            data-kind={column.kind}
            data-emphasis={emphasis.participant(column.participantId)}
            style={{ gridColumn: column.index, gridRow: HEADER_ROW }}
          >
            {withBreaks(column.label)}
          </div>
        ))}

        {grid.messages.map((message) => {
          const step =
            timeline.steps[grid.rows.find((row) => row.stepId === message.stepId)!.stepIndex]!;
          const node = step.node as { arrow: ArrowKind; text: RichText };
          const state = emphasis.step(message.stepId);

          return (
            <button
              key={message.stepId}
              type="button"
              className="seq-message"
              data-emphasis={state}
              data-direction={message.direction}
              data-head={headFor(node.arrow)}
              data-dotted={DOTTED.includes(node.arrow)}
              data-self={message.selfLoop}
              data-bidirectional={node.arrow.startsWith('<<')}
              style={
                {
                  gridColumn: `${message.columnStart} / ${message.columnEnd + 1}`,
                  gridRow: message.row,
                  // Lifelines sit at column centres, so the line is inset by half
                  // a column at each end. CSS needs the span count to compute it.
                  '--seq-span': message.columnEnd - message.columnStart + 1,
                } as CSSProperties
              }
              onClick={() => onSelectStep?.(step.index)}
            >
              <span className="seq-message__label">
                {step.ordinal !== null ? <b>{step.ordinal}. </b> : null}
                <RichLabel text={node.text} />
              </span>
              <span className="seq-message__line" aria-hidden="true" />
            </button>
          );
        })}

        {grid.notes.map((note) => {
          const step =
            timeline.steps[grid.rows.find((row) => row.stepId === note.stepId)!.stepIndex]!;
          const node = step.node as { text: RichText };

          return (
            <div
              key={note.stepId}
              className="seq-note"
              data-emphasis={emphasis.step(note.stepId)}
              style={{
                gridColumn: `${note.columnStart} / ${note.columnEnd + 1}`,
                gridRow: note.row,
              }}
            >
              <RichLabel text={node.text} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
