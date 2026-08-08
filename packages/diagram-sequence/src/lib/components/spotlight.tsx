import { RichLabel } from './rich-label';
import type { ArrowKind } from '../parser/tokenize';
import type { SequenceGrid } from '../layout/grid';
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

export interface SequenceSpotlightProps {
  grid: SequenceGrid;
  timeline: Timeline;
  cursor: number;
}

/**
 * The "modern" view: participants pinned across the top, and only the call
 * happening right now drawn between them.
 *
 * The classic view answers "what is the whole protocol?"; this one answers
 * "what is happening at this moment?" — which is the question someone being
 * walked through a system is actually asking. Everything not involved in the
 * current step recedes rather than competing for attention.
 *
 * It reuses the same grid columns and the same message markup as the classic
 * canvas, so arrow geometry, heads and theming are shared rather than
 * reimplemented.
 */
export function SequenceSpotlight({ grid, timeline, cursor }: SequenceSpotlightProps) {
  const step = cursor >= 0 ? timeline.steps[cursor] : undefined;
  const involved = new Set(step?.involved ?? []);

  const gridStyle = {
    // minmax(0, 1fr), not a fixed minimum: the whole point of this view is that
    // every participant is visible at once, so columns shrink rather than
    // pushing anyone off the edge into a horizontal scroll.
    gridTemplateColumns: `repeat(${grid.columnCount}, minmax(0, 1fr))`,
  } as CSSProperties;

  const message = step ? grid.messages.find((entry) => entry.stepId === step.id) : undefined;
  const note = step ? grid.notes.find((entry) => entry.stepId === step.id) : undefined;

  return (
    <div className="seq-canvas seq-spotlight" role="group" aria-label="Sequence diagram, focused">
      <div className="seq-spotlight__stage" style={gridStyle}>
        {grid.columns.map((column) => (
          <div
            key={column.participantId}
            className="seq-participant"
            data-kind={column.kind}
            data-emphasis={involved.has(column.participantId) ? 'current' : 'rest'}
            data-dimmed={step ? !involved.has(column.participantId) : false}
            style={{ gridColumn: column.index, gridRow: 1 }}
          >
            {column.label}
          </div>
        ))}

        {message && step ? (
          <div
            className="seq-message"
            data-emphasis="current"
            data-direction={message.direction}
            data-head={headFor((step.node as { arrow: ArrowKind }).arrow)}
            data-dotted={DOTTED.includes((step.node as { arrow: ArrowKind }).arrow)}
            data-self={message.selfLoop}
            data-bidirectional={(step.node as { arrow: ArrowKind }).arrow.startsWith('<<')}
            style={
              {
                gridColumn: `${message.columnStart} / ${message.columnEnd + 1}`,
                gridRow: 2,
                '--seq-span': message.columnEnd - message.columnStart + 1,
              } as CSSProperties
            }
          >
            <span className="seq-message__label">
              {step.ordinal !== null ? <b>{step.ordinal}. </b> : null}
              <RichLabel text={(step.node as { text: RichText }).text} />
            </span>
            <span className="seq-message__line" aria-hidden="true" />
          </div>
        ) : null}

        {note && step ? (
          <div
            className="seq-note"
            data-emphasis="current"
            style={{ gridColumn: `${note.columnStart} / ${note.columnEnd + 1}`, gridRow: 2 }}
          >
            <RichLabel text={(step.node as { text: RichText }).text} />
          </div>
        ) : null}

        {/* Steps with no drawable shape of their own still need to say what happened. */}
        {step && !message && !note ? (
          <p className="seq-spotlight__event" style={{ gridColumn: '1 / -1', gridRow: 2 }}>
            {step.kind} · {step.involved.join(', ')}
          </p>
        ) : null}

        {!step ? (
          <p className="seq-spotlight__idle" style={{ gridColumn: '1 / -1', gridRow: 2 }}>
            Press <b>Next step</b> to begin.
          </p>
        ) : null}
      </div>

      {/* Enclosing fragments are the context a single call loses on its own. */}
      {step && step.path.length > 0 ? (
        <p className="seq-spotlight__context">
          {step.path.map((entry) => (
            <span key={`${entry.branchId}-${entry.iteration ?? 'x'}`}>
              <span className="seq-spotlight__kind">{entry.kind}</span>
              {entry.label ? ` ${entry.label}` : ''}
              {entry.iteration !== null ? ` · pass ${entry.iteration + 1}` : ''}
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}
