import { RichLabel, humaniseLabel } from './rich-label';
import { computeArc, computeStage } from '../layout/stage';
import { useStageSize } from '../layout/use-stage-size';
import { useMemo } from 'react';
import type { ArrowKind } from '../parser/tokenize';
import type { StageNode } from '../layout/stage';
import type { Timeline } from '../model/timeline';
import type { VariableBindings } from '../model/bindings';
import type { RichText, SequenceDiagramAst } from '../parser/ast';

const DOTTED: readonly ArrowKind[] = ['-->', '-->>', '--x', '--)', '<<-->>'];

/**
 * Used until the stage has been measured. Without it the first paint places
 * every object at the origin and draws nothing, which reads as a flash — and it
 * is also why nothing rendered under jsdom, where getBoundingClientRect is 0.
 */
const UNMEASURED_STAGE = { width: 880, height: 550 } as const;

export interface SequenceStageProps {
  ast: SequenceDiagramAst;
  timeline: Timeline;
  cursor: number;
  bindings: VariableBindings;
}

/**
 * The modern view: objects on a stage, not lanes.
 *
 * Participants are placed freely around an ellipse and the call happening right
 * now is drawn as a curved arc that draws itself in, with a packet travelling
 * along it. Nothing else is on screen. The lane metaphor is what makes a
 * sequence diagram read as a specification; removing it makes the same data
 * read as a system doing something, which is what someone being walked through
 * it needs.
 *
 * Nodes are HTML so their text wraps, selects and reaches screen readers; only
 * the arcs are SVG, because curves are genuinely a vector problem.
 */
export function SequenceStage({ ast, timeline, cursor, bindings }: SequenceStageProps) {
  const { ref, size } = useStageSize<HTMLDivElement>();
  const stageSize = size.width > 0 && size.height > 0 ? size : UNMEASURED_STAGE;

  const nodes = useMemo(
    () => computeStage(ast.participants, stageSize),
    [ast.participants, stageSize],
  );
  const byId = useMemo(() => new Map(nodes.map((node) => [node.participantId, node])), [nodes]);

  const step = cursor >= 0 ? timeline.steps[cursor] : undefined;
  const involved = new Set(step?.involved ?? []);

  const call = useMemo(() => {
    // step.kind, not node.type: a lifecycle step shares the message's node and
    // would otherwise redraw the same call a second time.
    if (!step || step.kind !== 'message' || step.node.type !== 'message') return null;
    const from = byId.get(step.node.from);
    const to = byId.get(step.node.to);
    if (!from || !to) return null;
    return { arc: computeArc(from, to), arrow: step.node.arrow, text: step.node.text };
  }, [step, byId]);

  const note = step && step.kind === 'note' && step.node.type === 'note' ? step.node : null;

  return (
    <div className="seq-stage" role="group" aria-label="Sequence diagram">
      <div className="seq-stage__floor" ref={ref}>
        {/* Arc layer sits under the objects so connections run behind them. */}
        <svg className="seq-stage__arcs" aria-hidden="true">
          {call ? (
            <g
              /* Keyed on the step so every new call replays its entrance. */
              key={step!.id}
              className="seq-stage__call"
              data-dotted={DOTTED.includes(call.arrow)}
            >
              <path className="seq-stage__arc" d={call.arc.path} pathLength={100} fill="none" />
              <circle className="seq-stage__packet" r={5}>
                <animateMotion dur="0.9s" begin="0.15s" fill="freeze" path={call.arc.path} />
              </circle>
            </g>
          ) : null}
        </svg>

        {nodes.map((node) => (
          <StageObject
            key={node.participantId}
            node={node}
            state={objectState(node, step ? involved : null, step)}
          />
        ))}

        {call && step ? (
          <p
            key={`label-${step.id}`}
            className="seq-stage__label"
            style={{ left: call.arc.midX, top: call.arc.midY }}
          >
            {step.ordinal !== null ? <b>{step.ordinal}. </b> : null}
            <RichLabel text={call.text} values={bindings} />
          </p>
        ) : null}

        {/*
          A note is an aside from the author, not part of the mechanism — so it
          takes the whole stage rather than hanging off one participant, where it
          competed with the objects and could not be read at a glance.

          role="note" with aria-live, not role="dialog": it is informational and
          the stepper dismisses it, so claiming dialog semantics without focus
          management would announce a trap that does not exist.
        */}
        {note ? (
          <div key={`note-${step!.id}`} className="seq-stage__overlay">
            <div className="seq-stage__scrim" aria-hidden="true" />
            <p className="seq-stage__note" role="note" aria-live="polite">
              <span className="seq-stage__note-tag">note</span>
              <RichLabel text={note.text as RichText} values={bindings} />
            </p>
          </div>
        ) : null}

        {!step ? <p className="seq-stage__idle">Press Next step to begin</p> : null}
      </div>

      {step && step.path.length > 0 ? (
        <p className="seq-stage__context">
          {step.path.map((entry) => (
            <span key={`${entry.branchId}-${entry.iteration ?? 'x'}`}>
              <span className="seq-stage__kind">{entry.kind}</span>
              {entry.label ? ` ${humaniseLabel(entry.label)}` : ''}
              {entry.iteration !== null ? ` · pass ${entry.iteration + 1}` : ''}
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}

type ObjectState = 'idle' | 'sending' | 'receiving' | 'resting';

function objectState(
  node: StageNode,
  involved: Set<string> | null,
  step: Timeline['steps'][number] | undefined,
): ObjectState {
  if (!involved || !step) return 'idle';
  if (!involved.has(node.participantId)) return 'resting';

  // The sender is the first element of `involved`, the receiver the last.
  const first = step.involved[0];
  const last = step.involved[step.involved.length - 1];
  if (node.participantId === last && last !== first) return 'receiving';
  return 'sending';
}

function StageObject({ node, state }: { node: StageNode; state: ObjectState }) {
  return (
    <div
      className="seq-stage__object"
      data-kind={node.kind}
      data-state={state}
      style={{ left: node.x, top: node.y }}
    >
      <span className="seq-stage__ripple" aria-hidden="true" />
      <span className="seq-stage__name">{node.label}</span>
    </div>
  );
}
