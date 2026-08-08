import { describe, expect, it } from 'vitest';
import { computeArc, computeStage } from './stage';
import type { Participant } from '../parser/ast';

const make = (...ids: string[]): Participant[] =>
  ids.map((id) => ({
    id,
    name: id,
    label: id,
    kind: 'participant' as const,
    boxId: null,
    declared: true,
  }));

const SIZE = { width: 800, height: 500 };

describe('computeStage', () => {
  it('returns nothing for an empty diagram', () => {
    expect(computeStage([], SIZE)).toEqual([]);
  });

  it('puts a lone participant centre stage', () => {
    const [only] = computeStage(make('A'), SIZE);
    expect(only).toMatchObject({ x: 400, y: 250 });
  });

  it('places the first participant on the left and travels clockwise', () => {
    const [a, b] = computeStage(make('A', 'B'), SIZE);

    expect(a!.x).toBeLessThan(400);
    expect(b!.x).toBeGreaterThan(400);
    expect(Math.round(a!.y)).toBe(Math.round(b!.y));
  });

  it('spreads participants around an ellipse without collapsing them', () => {
    const nodes = computeStage(make('A', 'B', 'C', 'D', 'E'), SIZE);

    expect(nodes).toHaveLength(5);
    const seen = new Set(nodes.map((n) => `${Math.round(n.x)}:${Math.round(n.y)}`));
    expect(seen.size).toBe(5);
  });

  it('keeps every node inside the stage', () => {
    for (const size of [SIZE, { width: 320, height: 240 }, { width: 1400, height: 700 }]) {
      for (const node of computeStage(make('A', 'B', 'C', 'D'), size)) {
        expect(node.x).toBeGreaterThanOrEqual(0);
        expect(node.x).toBeLessThanOrEqual(size.width);
        expect(node.y).toBeGreaterThanOrEqual(0);
        expect(node.y).toBeLessThanOrEqual(size.height);
      }
    }
  });

  it('scales the spread with the stage rather than using a fixed inset', () => {
    const narrow = computeStage(make('A', 'B', 'C'), { width: 240, height: 320 });
    const wide = computeStage(make('A', 'B', 'C'), { width: 960, height: 600 });

    const spread = (nodes: readonly { x: number }[]) =>
      Math.max(...nodes.map((n) => n.x)) - Math.min(...nodes.map((n) => n.x));

    // A fixed inset wider than half the stage collapsed everything onto the
    // centre point; the spread must stay proportional at every size.
    expect(spread(narrow)).toBeGreaterThan(240 * 0.3);
    expect(spread(wide)).toBeGreaterThan(960 * 0.3);
  });
});

describe('computeArc', () => {
  const [a, b] = computeStage(make('A', 'B'), SIZE);

  it('draws a quadratic curve from one node to the other', () => {
    const arc = computeArc(a!, b!);

    expect(arc.path).toMatch(/^M [\d.-]+ [\d.-]+ Q [\d.-]+ [\d.-]+ [\d.-]+ [\d.-]+$/);
    expect(arc.path).toContain(`M ${a!.x}`);
  });

  it('bows off the straight chord, so a call and its reply do not overlap', () => {
    const arc = computeArc(a!, b!);
    const straightMidY = (a!.y + b!.y) / 2;

    expect(Math.abs(arc.midY - straightMidY)).toBeGreaterThan(4);
  });

  it('bows a reply to the opposite side of the chord', () => {
    const straightMidY = (a!.y + b!.y) / 2;
    const outbound = computeArc(a!, b!).midY - straightMidY;
    const reply = computeArc(b!, a!).midY - straightMidY;

    expect(Math.sign(outbound)).not.toBe(Math.sign(reply));
  });

  it('loops a self call above its own node', () => {
    const arc = computeArc(a!, a!);

    expect(arc.path.startsWith('M')).toBe(true);
    expect(arc.path).toContain('C');
    expect(arc.midY).toBeLessThan(a!.y);
  });

  it('reports a length it can animate against', () => {
    expect(computeArc(a!, b!).length).toBeGreaterThan(0);
  });
});
