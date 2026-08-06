import { describe, expect, it } from 'vitest';
import { NO_CAPABILITIES } from './types';
import type { DiagramRenderer, RenderResult } from './types';
import type { StepController } from './interaction';

describe('renderer contract', () => {
  it('is satisfied by an svg-only renderer that omits Component', () => {
    const renderer: DiagramRenderer = {
      id: 'svg-only',
      supports: () => true,
      capabilities: NO_CAPABILITIES,
      renderToSvg: async ({ text }): Promise<RenderResult> => ({
        svg: `<svg data-len="${text.length}"></svg>`,
        diagramType: 'sequence',
      }),
    };

    expect(renderer.Component).toBeUndefined();
    expect(renderer.capabilities).toEqual({ events: false, viewport: false, step: false });
  });

  it('is satisfied by a native renderer supplying a Component and real capabilities', () => {
    const renderer: DiagramRenderer = {
      id: 'native-sequence',
      supports: (type) => type === 'sequence',
      capabilities: { events: true, viewport: true, step: true },
      renderToSvg: async () => ({ svg: '<svg></svg>', diagramType: 'sequence' }),
      Component: () => null,
    };

    expect(renderer.supports('sequence')).toBe(true);
    expect(renderer.supports('flowchart')).toBe(false);
    expect(renderer.Component).toBeTypeOf('function');
  });

  it('exposes NO_CAPABILITIES as a frozen shared value', () => {
    expect(Object.isFrozen(NO_CAPABILITIES)).toBe(true);
  });

  it('models a step controller that can be driven and observed', () => {
    let current = -1;
    const listeners = new Set<(index: number) => void>();

    const controller: StepController = {
      stepCount: 3,
      get current() {
        return current;
      },
      goTo: (index) => {
        current = Math.min(Math.max(index, -1), 2);
        listeners.forEach((listener) => listener(current));
      },
      next: () => controller.goTo(current + 1),
      prev: () => controller.goTo(current - 1),
      reset: () => controller.goTo(-1),
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };

    const seen: number[] = [];
    const unsubscribe = controller.subscribe((index) => seen.push(index));

    controller.next();
    controller.next();
    controller.goTo(99);
    controller.reset();
    unsubscribe();
    controller.next();

    expect(seen).toEqual([0, 1, 2, -1]);
    expect(controller.current).toBe(0);
  });
});
