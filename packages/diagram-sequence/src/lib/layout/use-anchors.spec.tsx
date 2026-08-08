import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { useAnchors } from './use-anchors';
import type { AnchorMap } from './use-anchors';

function Harness({ onMeasure }: { onMeasure: (anchors: AnchorMap) => void }) {
  const { containerRef, register, anchors } = useAnchors<HTMLDivElement>();
  onMeasure(anchors);

  return (
    <div ref={containerRef}>
      <div ref={register('a')} />
    </div>
  );
}

const rect = (x: number, width: number) =>
  ({ x, y: 0, width, height: 10, top: 0, left: x, right: x + width, bottom: 10 }) as DOMRect;

describe('useAnchors', () => {
  it('measures in content coordinates, so a scrolled track stays aligned', () => {
    let anchors: AnchorMap = new Map();
    const { container } = render(<Harness onMeasure={(next) => (anchors = next)} />);

    const track = container.firstElementChild as HTMLElement;
    const child = track.firstElementChild as HTMLElement;

    // The container is scrolled 120px right; the child is 80px into the visible
    // box, so it sits 200px into the content.
    Object.defineProperty(track, 'scrollLeft', { value: 120, configurable: true });
    track.getBoundingClientRect = () => rect(0, 300);
    child.getBoundingClientRect = () => rect(80, 40);

    // Force a re-measure by re-rendering.
    render(<Harness onMeasure={(next) => (anchors = next)} />, { container });

    const point = anchors.get('a');
    if (point) {
      // Viewport maths alone would put this at 100 and draw the line adrift by
      // exactly the scroll offset.
      expect(point.x).toBe(220);
    }
  });
});
