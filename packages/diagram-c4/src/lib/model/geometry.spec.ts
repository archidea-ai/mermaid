import { describe, expect, it } from 'vitest';
import { insetEndpoints } from './geometry';

const box = (x: number, y: number) => ({ x, y, width: 100, height: 40 });

describe('insetEndpoints', () => {
  it('leaves and lands on the vertical borders when the pair is side by side', () => {
    const [start, end] = insetEndpoints(box(0, 0), box(300, 0));

    expect(start).toMatchObject({ x: 50, y: 0 });
    expect(end).toMatchObject({ x: 250, y: 0 });
  });

  it('leaves and lands on the horizontal borders when the pair is stacked', () => {
    const [start, end] = insetEndpoints(box(0, 0), box(0, 300));

    expect(start).toMatchObject({ x: 0, y: 20 });
    expect(end).toMatchObject({ x: 0, y: 280 });
  });

  it('inverts along the axis when the target sits behind the source', () => {
    const [start, end] = insetEndpoints(box(300, 0), box(0, 0));

    expect(start.x).toBe(250);
    expect(end.x).toBe(50);
  });

  it('picks the axis by the larger delta, so a line does not cross its own box', () => {
    // Mostly vertical: 40 across, 300 down.
    const [start] = insetEndpoints(box(0, 0), box(40, 300));
    expect(start.y).toBe(20);
    expect(start.x).toBe(0);
  });

  it('is unchanged by a zero-sized box, which is what jsdom measures', () => {
    const flat = { x: 0, y: 0, width: 0, height: 0 };
    const [start, end] = insetEndpoints(flat, { ...flat, x: 100 });

    expect(start.x).toBe(0);
    expect(end.x).toBe(100);
  });
});
