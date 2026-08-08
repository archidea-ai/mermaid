import { useEffect, useRef, useState } from 'react';
import type { StageSize } from './stage';

/**
 * Measures the stage so geometry can be computed in real pixels.
 *
 * The stage is free placement, not a grid, so CSS cannot position the nodes and
 * the arc layer for us the way it does in the classic view. Measuring once per
 * resize keeps `computeStage` pure and testable while the browser stays the
 * source of truth for size.
 */
export function useStageSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<StageSize>({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const read = () =>
      setSize((previous) => {
        const { width, height } = element.getBoundingClientRect();
        if (Math.abs(previous.width - width) < 1 && Math.abs(previous.height - height) < 1) {
          return previous;
        }
        return { width, height };
      });

    read();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, size };
}
