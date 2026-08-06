import type { ArrowKind } from '../parser/tokenize';
import type { SequenceLayout } from '../layout/layout';
import type { EmphasisMap } from '../layout/emphasis';
import type { Timeline } from '../model/timeline';

const DOTTED: readonly ArrowKind[] = ['-->', '-->>', '--x', '--)', '<<-->>'];

const strokeFor = (emphasis: string) =>
  emphasis === 'current'
    ? 'var(--seq-message-current)'
    : emphasis === 'spent'
      ? 'var(--seq-message-spent)'
      : 'var(--seq-message)';

export interface SequenceCanvasProps {
  layout: SequenceLayout;
  timeline: Timeline;
  emphasis: EmphasisMap;
  onSelectStep?: (index: number) => void;
}

/**
 * Pure SVG built from React elements — no innerHTML anywhere in this package.
 * Geometry comes from the layout and emphasis from the emphasis map; nothing
 * here recomputes either.
 */
export function SequenceCanvas({ layout, timeline, emphasis, onSelectStep }: SequenceCanvasProps) {
  return (
    <svg
      className="archidea-sequence__canvas"
      role="img"
      aria-label="Sequence diagram"
      viewBox={`0 0 ${Math.max(layout.width, 1)} ${Math.max(layout.height, 1)}`}
      width="100%"
      style={{ maxHeight: '70vh' }}
    >
      <defs>
        <marker
          id="seq-arrow-solid"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
        </marker>
        <marker
          id="seq-arrow-open"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10" fill="none" stroke="context-stroke" strokeWidth="1.5" />
        </marker>
        <marker
          id="seq-arrow-cross"
          viewBox="0 0 10 10"
          refX="5"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path d="M 1 1 L 9 9 M 9 1 L 1 9" stroke="context-stroke" strokeWidth="1.5" fill="none" />
        </marker>
      </defs>

      {layout.fragments.map((fragment) => {
        const state = emphasis.fragmentBranch(fragment.branchId);
        return (
          <g key={`${fragment.branchId}-${fragment.y}`} data-emphasis={state}>
            <rect
              x={fragment.x}
              y={fragment.y}
              width={fragment.width}
              height={fragment.height}
              rx={6}
              fill="none"
              stroke={
                state === 'path' ? 'var(--seq-fragment-path-stroke)' : 'var(--seq-fragment-stroke)'
              }
              strokeWidth={state === 'path' ? 1.6 : 1}
              strokeDasharray="4 3"
            />
            <rect
              x={fragment.x}
              y={fragment.y}
              width={Math.max(48, fragment.kind.length * 8 + 16)}
              height={17}
              rx={4}
              fill="var(--seq-fragment-label-fill)"
              stroke="var(--seq-fragment-stroke)"
            />
            <text x={fragment.x + 6} y={fragment.y + 12} fontSize={10} fill="var(--seq-text-muted)">
              {fragment.kind}
            </text>
            {fragment.label ? (
              <text
                x={fragment.x + Math.max(48, fragment.kind.length * 8 + 16) + 8}
                y={fragment.y + 12}
                fontSize={10}
                fill="var(--seq-text-muted)"
              >
                {fragment.label}
              </text>
            ) : null}
          </g>
        );
      })}

      {layout.columns.map((column) => {
        const state = emphasis.participant(column.participantId);
        return (
          <line
            key={`life-${column.participantId}`}
            x1={column.centerX}
            x2={column.centerX}
            y1={layout.lifelineTop}
            y2={layout.lifelineBottom}
            stroke={state === 'current' ? 'var(--seq-lifeline-current)' : 'var(--seq-lifeline)'}
            strokeWidth={state === 'current' ? 1.75 : 1}
            strokeDasharray="5 5"
          />
        );
      })}

      {layout.activations.map((activation, index) => (
        <rect
          key={`act-${activation.participantId}-${index}`}
          x={activation.x}
          y={activation.y}
          width={activation.width}
          height={activation.height}
          rx={2}
          fill={
            emphasis.participant(activation.participantId) === 'current'
              ? 'var(--seq-activation-current-fill)'
              : 'var(--seq-activation-fill)'
          }
        />
      ))}

      {layout.columns.map((column) => {
        const state = emphasis.participant(column.participantId);
        const isCurrent = state === 'current';
        return (
          <g key={`head-${column.participantId}`} data-emphasis={state}>
            <rect
              x={column.x}
              y={layout.lifelineTop - 36}
              width={column.width}
              height={32}
              rx={column.participant.kind === 'actor' ? 16 : 6}
              fill={
                isCurrent ? 'var(--seq-participant-current-fill)' : 'var(--seq-participant-fill)'
              }
              stroke={
                isCurrent
                  ? 'var(--seq-participant-current-stroke)'
                  : 'var(--seq-participant-stroke)'
              }
              strokeWidth={isCurrent ? 1.75 : 1}
            />
            <text
              x={column.centerX}
              y={layout.lifelineTop - 15}
              textAnchor="middle"
              fontSize={12}
              fontWeight={isCurrent ? 600 : 500}
              fill="var(--seq-participant-text)"
            >
              {column.participant.label}
            </text>
          </g>
        );
      })}

      {layout.arrows.map((arrow) => {
        const step = timeline.steps[arrow.stepIndex]!;
        const node = step.node as { arrow: ArrowKind; text: { raw: string } };
        const state = emphasis.step(arrow.stepId);
        const stroke = strokeFor(state);
        const marker = node.arrow.endsWith('x')
          ? 'seq-arrow-cross'
          : node.arrow.endsWith(')') || node.arrow === '->' || node.arrow === '-->'
            ? 'seq-arrow-open'
            : 'seq-arrow-solid';

        const path = arrow.selfLoop
          ? `M ${arrow.fromX} ${arrow.y - arrow.loopHeight / 2} h 34 v ${arrow.loopHeight} h -34`
          : `M ${arrow.fromX} ${arrow.y} L ${arrow.toX} ${arrow.y}`;

        return (
          <g
            key={arrow.stepId}
            data-emphasis={state}
            onClick={() => onSelectStep?.(arrow.stepIndex)}
            style={{ cursor: onSelectStep ? 'pointer' : undefined }}
          >
            <path
              d={path}
              fill="none"
              stroke={stroke}
              strokeWidth={state === 'current' ? 2 : 1.25}
              strokeDasharray={DOTTED.includes(node.arrow) ? '5 4' : undefined}
              markerEnd={`url(#${marker})`}
            />
            {node.arrow.startsWith('<<') ? (
              <path d={path} fill="none" stroke={stroke} markerStart={`url(#${marker})`} />
            ) : null}
            <text
              x={arrow.selfLoop ? arrow.fromX + 42 : (arrow.fromX + arrow.toX) / 2}
              y={arrow.y - 7}
              textAnchor={arrow.selfLoop ? 'start' : 'middle'}
              fontSize={11}
              fontWeight={state === 'current' ? 600 : 400}
              fill={state === 'current' ? 'var(--seq-message-current)' : 'var(--seq-message-text)'}
            >
              {step.ordinal !== null ? `${step.ordinal}. ` : ''}
              {node.text.raw}
            </text>
          </g>
        );
      })}

      {layout.notes.map((note) => {
        const step = timeline.steps[note.stepIndex]!;
        const state = emphasis.step(note.stepId);
        return (
          <g key={note.stepId} data-emphasis={state}>
            <title>{(step.node as { text: { raw: string } }).text.raw}</title>
            <rect
              x={note.x}
              y={note.y}
              width={note.width}
              height={note.height}
              rx={4}
              fill="var(--seq-note-fill)"
              stroke={state === 'current' ? 'var(--seq-accent)' : 'var(--seq-note-stroke)'}
              strokeWidth={state === 'current' ? 1.75 : 1}
            />
            <text
              x={note.x + note.width / 2}
              y={note.y + note.height / 2 + 4}
              textAnchor="middle"
              fontSize={11}
              fill="var(--seq-note-text)"
            >
              {(step.node as { text: { raw: string } }).text.raw}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
