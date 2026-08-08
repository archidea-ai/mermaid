import type { Participant } from '../parser/ast';

export interface StageSize {
  readonly width: number;
  readonly height: number;
}

export interface StageNode {
  readonly participantId: string;
  readonly label: string;
  readonly kind: 'participant' | 'actor';
  readonly x: number;
  readonly y: number;
  /** Angle from the stage centre, radians. Used to push labels outward. */
  readonly angle: number;
}

export interface StageArc {
  /** Quadratic bezier through a control point offset from the chord midpoint. */
  readonly path: string;
  readonly midX: number;
  readonly midY: number;
  readonly length: number;
}

/**
 * Radii as a fraction of the stage, not a fixed inset.
 *
 * A fixed inset larger than half the stage collapses the radius to nothing and
 * piles every object on the centre — which is exactly what happened at the
 * width the examples app actually gives this view.
 */
export const STAGE_RADIUS_RATIO = { x: 0.3, y: 0.31 } as const;

/**
 * Places participants around an ellipse rather than in lanes.
 *
 * The lane metaphor is what makes a sequence diagram feel like a spec. Dropping
 * it — objects on a stage, one connection lit at a time — makes it feel like a
 * system doing something, which is the whole point of this view.
 *
 * Pure geometry in real pixels: the caller measures the stage and passes the
 * size in, so this stays testable under `node` with no DOM.
 */
export function computeStage(
  participants: readonly Participant[],
  size: StageSize,
  ratio: { x: number; y: number } = STAGE_RADIUS_RATIO,
): readonly StageNode[] {
  const count = participants.length;
  if (count === 0) return [];

  const centreX = size.width / 2;
  const centreY = size.height / 2;
  const radiusX = size.width * ratio.x;
  const radiusY = size.height * ratio.y;

  // A single participant sits centre stage; two read best facing each other.
  if (count === 1) {
    const only = participants[0]!;
    return [
      {
        participantId: only.id,
        label: only.label,
        kind: only.kind,
        x: centreX,
        y: centreY,
        angle: 0,
      },
    ];
  }

  return participants.map((participant, index) => {
    // Start at due west and travel clockwise, so the first participant declared
    // is on the left — the reading order people already expect.
    const angle = Math.PI + (index * 2 * Math.PI) / count;

    return {
      participantId: participant.id,
      label: participant.label,
      kind: participant.kind,
      x: centreX + radiusX * Math.cos(angle),
      y: centreY + radiusY * Math.sin(angle),
      angle,
    };
  });
}

/**
 * A curved connection between two nodes.
 *
 * Deliberately not a straight line: an arc reads as a message travelling
 * somewhere, and it keeps two-way calls between the same pair from overlapping.
 */
export function computeArc(from: StageNode, to: StageNode, bow = 0.22): StageArc {
  if (from.participantId === to.participantId) return selfArc(from);

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const chord = Math.hypot(dx, dy) || 1;

  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;

  // Perpendicular offset, always bowing the same way round the stage so a call
  // and its reply curve apart instead of sitting on top of each other.
  const controlX = midX + (-dy / chord) * chord * bow;
  const controlY = midY + (dx / chord) * chord * bow;

  return {
    path: `M ${round(from.x)} ${round(from.y)} Q ${round(controlX)} ${round(controlY)} ${round(to.x)} ${round(to.y)}`,
    // Midpoint of a quadratic bezier at t = 0.5.
    midX: round(0.25 * from.x + 0.5 * controlX + 0.25 * to.x),
    midY: round(0.25 * from.y + 0.5 * controlY + 0.25 * to.y),
    length: chord,
  };
}

function selfArc(node: StageNode): StageArc {
  const r = 34;
  const path =
    `M ${round(node.x - r * 0.5)} ${round(node.y - r * 0.4)} ` +
    `C ${round(node.x - r * 1.6)} ${round(node.y - r * 1.8)} ` +
    `${round(node.x + r * 1.6)} ${round(node.y - r * 1.8)} ` +
    `${round(node.x + r * 0.5)} ${round(node.y - r * 0.4)}`;

  return { path, midX: node.x, midY: round(node.y - r * 1.25), length: r * 4 };
}

const round = (value: number) => Math.round(value * 100) / 100;
