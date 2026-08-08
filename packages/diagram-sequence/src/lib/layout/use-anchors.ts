import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { StagePoint } from './stage';

export type AnchorMap = ReadonlyMap<string, StagePoint>;

/**
 * Measures the centre of each registered element, relative to a container.
 *
 * The modern view groups participants with CSS rather than placing them at
 * computed coordinates, so the arc layer has to ask the DOM where things ended
 * up. Re-measured on resize and whenever the registered set changes.
 */
export function useAnchors<C extends HTMLElement>() {
  const containerRef = useRef<C>(null);
  const elements = useRef(new Map<string, HTMLElement>());
  const [anchors, setAnchors] = useState<AnchorMap>(new Map());

  const register = useCallback(
    (id: string) => (element: HTMLElement | null) => {
      if (element) elements.current.set(id, element);
      else elements.current.delete(id);
    },
    [],
  );

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const origin = container.getBoundingClientRect();

    /*
     * Content coordinates, not viewport ones. getBoundingClientRect is relative
     * to the viewport, but the arc layer is absolutely positioned inside the
     * container and so scrolls with its content — the two diverge by exactly the
     * scroll offset, which drew every line adrift once the track scrolled.
     *
     * Measuring in content space also means scrolling alone cannot invalidate
     * these, so there is nothing to recompute on scroll.
     */
    const next = new Map<string, StagePoint>();
    for (const [id, element] of elements.current) {
      const box = element.getBoundingClientRect();
      next.set(id, {
        x: box.x - origin.x + container.scrollLeft + box.width / 2,
        y: box.y - origin.y + container.scrollTop + box.height / 2,
        width: box.width,
        height: box.height,
      });
    }

    setAnchors((previous) => (sameAnchors(previous, next) ? previous : next));
  }, []);

  useLayoutEffect(() => {
    measure();
    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);
    for (const element of elements.current.values()) observer.observe(element);
    return () => observer.disconnect();
  });

  return { containerRef, register, anchors };
}

function sameAnchors(a: AnchorMap, b: AnchorMap): boolean {
  if (a.size !== b.size) return false;
  for (const [id, point] of b) {
    const previous = a.get(id);
    if (
      !previous ||
      Math.abs(previous.x - point.x) > 0.5 ||
      Math.abs(previous.y - point.y) > 0.5 ||
      Math.abs((previous.width ?? 0) - (point.width ?? 0)) > 0.5
    ) {
      return false;
    }
  }
  return true;
}
