import { useMemo } from 'react';
import { RichLabel, humaniseLabel, withBreaks } from './rich-label';
import { computeArc } from '../layout/stage';
import { useAnchors } from '../layout/use-anchors';
import { isPhaseBanner } from '../model/notes';
import type { ArrowKind } from '../parser/tokenize';
import type { Timeline } from '../model/timeline';
import type { VariableBindings } from '../model/bindings';
import type { Participant, RichText, SequenceDiagramAst } from '../parser/ast';

const DOTTED: readonly ArrowKind[] = ['-->', '-->>', '--x', '--)', '<<-->>'];

interface StageGroup {
  readonly id: string;
  readonly label: string | null;
  readonly members: readonly Participant[];
}

/**
 * Groups participants by the `box` they were declared in.
 *
 * A ring of eight objects is unreadable — they collide, and the arrangement
 * says nothing true about the system. The boxes already carry the author's own
 * grouping, so the layout uses it: each box is one panel, its members sit
 * together inside it, and the panels flow in a grid the browser sizes.
 */
function toGroups(ast: SequenceDiagramAst): readonly StageGroup[] {
  const groups: StageGroup[] = [];
  const byBox = new Map<string, Participant[]>();

  for (const participant of ast.participants) {
    const key = participant.boxId ?? '__loose__';
    const bucket = byBox.get(key);
    if (bucket) bucket.push(participant);
    else byBox.set(key, [participant]);
  }

  for (const box of ast.boxes) {
    const members = byBox.get(box.id);
    if (members?.length) groups.push({ id: box.id, label: box.label || null, members });
  }

  const loose = byBox.get('__loose__');
  if (loose?.length) groups.push({ id: '__loose__', label: null, members: loose });

  return groups;
}

export interface SequenceStageProps {
  ast: SequenceDiagramAst;
  timeline: Timeline;
  cursor: number;
  bindings: VariableBindings;
}

/**
 * The modern view: participants shown in the groups their author declared, with
 * only the call happening right now drawn between them.
 *
 * Nodes are HTML so their text wraps, selects and reaches screen readers, and
 * so CSS can do the grouping; only the arc is SVG, because curves are genuinely
 * a vector problem. Endpoints come from measuring the DOM.
 */
export function SequenceStage({ ast, timeline, cursor, bindings }: SequenceStageProps) {
  const { containerRef, register, anchors } = useAnchors<HTMLDivElement>();
  const groups = useMemo(() => toGroups(ast), [ast]);

  const step = cursor >= 0 ? timeline.steps[cursor] : undefined;
  const involved = new Set(step?.involved ?? []);

  const call = useMemo(() => {
    if (!step || step.kind !== 'message' || step.node.type !== 'message') return null;
    const from = anchors.get(step.node.from);
    const to = anchors.get(step.node.to);
    if (!from || !to) return null;

    return {
      arc: computeArc(from, to, { self: step.node.from === step.node.to }),
      arrow: step.node.arrow,
      text: step.node.text,
    };
  }, [step, anchors]);

  const note = step && step.kind === 'note' && step.node.type === 'note' ? step.node : null;
  const banner = note && isPhaseBanner(note, ast) ? note : null;

  return (
    <div className="seq-stage" role="group" aria-label="Sequence diagram">
      {/* A phase note is a section heading for the whole run, not an aside. */}
      {banner ? (
        <p key={`banner-${step!.id}`} className="seq-stage__banner" role="heading" aria-level={3}>
          <RichLabel text={banner.text} values={bindings} />
        </p>
      ) : null}

      <div className="seq-stage__floor" ref={containerRef}>
        <svg className="seq-stage__arcs" aria-hidden="true">
          {call ? (
            <g key={step!.id} className="seq-stage__call" data-dotted={DOTTED.includes(call.arrow)}>
              <path className="seq-stage__arc" d={call.arc.path} pathLength={100} fill="none" />
              <circle className="seq-stage__packet" r={5}>
                <animateMotion dur="0.9s" begin="0.15s" fill="freeze" path={call.arc.path} />
              </circle>
            </g>
          ) : null}
        </svg>

        <div className="seq-stage__groups">
          {groups.map((group) => (
            <section
              key={group.id}
              className="seq-stage__group"
              data-active={group.members.some((m) => involved.has(m.id))}
              aria-label={group.label ?? 'Participants'}
            >
              {group.label ? (
                <h4 className="seq-stage__group-title">{withBreaks(group.label)}</h4>
              ) : null}
              <div className="seq-stage__members">
                {group.members.map((participant) => (
                  <div
                    key={participant.id}
                    ref={register(participant.id)}
                    className="seq-stage__object"
                    data-kind={participant.kind}
                    data-state={objectState(participant.id, involved, step)}
                  >
                    <span className="seq-stage__ripple" aria-hidden="true" />
                    <span className="seq-stage__name">{withBreaks(participant.label)}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

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

        {/* An ordinary note is an aside from the author; it takes the stage. */}
        {note && !banner ? (
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
  participantId: string,
  involved: Set<string>,
  step: Timeline['steps'][number] | undefined,
): ObjectState {
  if (!step) return 'idle';
  if (!involved.has(participantId)) return 'resting';

  const first = step.involved[0];
  const last = step.involved[step.involved.length - 1];
  if (participantId === last && last !== first) return 'receiving';
  return 'sending';
}
