import { describe, expect, it } from 'vitest';
import { computeArc } from './stage';

const A = { x: 100, y: 200 };
const B = { x: 400, y: 260 };

describe('computeArc', () => {
  it('draws a quadratic curve from one point to the other', () => {
    const arc = computeArc(A, B);

    expect(arc.path).toMatch(/^M [\d.-]+ [\d.-]+ Q [\d.-]+ [\d.-]+ [\d.-]+ [\d.-]+$/);
    expect(arc.path.startsWith(`M ${A.x} ${A.y}`)).toBe(true);
    expect(arc.path.endsWith(`${B.x} ${B.y}`)).toBe(true);
  });

  it('bows off the straight chord, so a call and its reply do not overlap', () => {
    const straightMidY = (A.y + B.y) / 2;
    expect(Math.abs(computeArc(A, B).midY - straightMidY)).toBeGreaterThan(4);
  });

  it('bows a reply to the opposite side of the chord', () => {
    const straightMidY = (A.y + B.y) / 2;
    const outbound = computeArc(A, B).midY - straightMidY;
    const reply = computeArc(B, A).midY - straightMidY;

    expect(Math.sign(outbound)).not.toBe(Math.sign(reply));
  });

  it('scales the bow with the distance rather than using a fixed offset', () => {
    const near = computeArc(A, { x: 160, y: 200 });
    const far = computeArc(A, { x: 900, y: 200 });

    expect(Math.abs(far.midY - 200)).toBeGreaterThan(Math.abs(near.midY - 200));
  });

  it('loops a self call above its own point', () => {
    const arc = computeArc(A, A, { self: true });

    expect(arc.path).toContain('C');
    expect(arc.midY).toBeLessThan(A.y);
    expect(arc.midX).toBe(A.x);
  });

  it('does not divide by zero for two coincident points', () => {
    const arc = computeArc(A, A);
    expect(Number.isNaN(arc.midX)).toBe(false);
    expect(Number.isNaN(arc.midY)).toBe(false);
  });

  it('reports a length it can animate against', () => {
    expect(computeArc(A, B).length).toBeGreaterThan(0);
  });
});
