export interface StagePoint {
  readonly x: number;
  readonly y: number;
}

export interface StageArc {
  /** Quadratic bezier through a control point offset from the chord midpoint. */
  readonly path: string;
  readonly midX: number;
  readonly midY: number;
  readonly length: number;
}

/**
 * A curved connection between two measured points.
 *
 * Deliberately not a straight line: an arc reads as a message travelling
 * somewhere, and it keeps a call and its reply from sitting on top of each
 * other. The endpoints come from the DOM because the modern view groups
 * participants with CSS rather than placing them at computed coordinates.
 */
export function computeArc(
  from: StagePoint,
  to: StagePoint,
  options: { bow?: number; self?: boolean } = {},
): StageArc {
  const { bow = 0.2, self = false } = options;
  if (self) return selfArc(from);

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const chord = Math.hypot(dx, dy) || 1;

  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;

  // Perpendicular offset, always the same way round, so a call and its reply
  // bow apart instead of overlapping.
  const controlX = midX + (-dy / chord) * chord * bow;
  const controlY = midY + (dx / chord) * chord * bow;

  return {
    path: `M ${r(from.x)} ${r(from.y)} Q ${r(controlX)} ${r(controlY)} ${r(to.x)} ${r(to.y)}`,
    // Midpoint of a quadratic bezier at t = 0.5.
    midX: r(0.25 * from.x + 0.5 * controlX + 0.25 * to.x),
    midY: r(0.25 * from.y + 0.5 * controlY + 0.25 * to.y),
    length: chord,
  };
}

function selfArc(point: StagePoint): StageArc {
  const radius = 30;
  const path =
    `M ${r(point.x - radius * 0.5)} ${r(point.y - radius * 0.3)} ` +
    `C ${r(point.x - radius * 1.7)} ${r(point.y - radius * 1.9)} ` +
    `${r(point.x + radius * 1.7)} ${r(point.y - radius * 1.9)} ` +
    `${r(point.x + radius * 0.5)} ${r(point.y - radius * 0.3)}`;

  return { path, midX: point.x, midY: r(point.y - radius * 1.3), length: radius * 4 };
}

const r = (value: number) => Math.round(value * 100) / 100;
