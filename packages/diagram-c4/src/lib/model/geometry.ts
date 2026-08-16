import type { StagePoint } from '@archidea-ai/mermaid-diagram-sequence';

/**
 * Moves two measured centres out to the borders facing each other.
 *
 * A line between centres runs underneath both boxes, and its midpoint — where
 * a count badge or an edge's own words go — lands on top of one of them rather
 * than in the gap. The chart wraps in two dimensions rather than running along
 * one axis, so which border to use is decided per pair by the larger delta.
 */
export function insetEndpoints(
  from: StagePoint,
  to: StagePoint,
): readonly [StagePoint, StagePoint] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    const sign = dx >= 0 ? 1 : -1;
    return [
      { ...from, x: from.x + ((from.width ?? 0) / 2) * sign },
      { ...to, x: to.x - ((to.width ?? 0) / 2) * sign },
    ];
  }

  const sign = dy >= 0 ? 1 : -1;
  return [
    { ...from, y: from.y + ((from.height ?? 0) / 2) * sign },
    { ...to, y: to.y - ((to.height ?? 0) / 2) * sign },
  ];
}
