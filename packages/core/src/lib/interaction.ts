import type { DiagramType } from './types';

export interface ViewportState {
  readonly scale: number;
  readonly translate: { readonly x: number; readonly y: number };
}

/** Pan/zoom surface. Implemented by native renderers that declare capabilities.viewport. */
export interface ViewportController {
  readonly scale: number;
  readonly translate: { readonly x: number; readonly y: number };
  zoomTo(scale: number, origin?: { x: number; y: number }): void;
  panBy(dx: number, dy: number): void;
  fit(): void;
  reset(): void;
  subscribe(listener: (state: ViewportState) => void): () => void;
}

export interface DiagramElementRef {
  readonly kind: 'node' | 'edge' | 'message' | 'participant' | 'group' | 'note';
  readonly id: string;
  readonly diagramType: DiagramType;
  /** Renderer-specific payload, narrowed per diagram type by native renderers. */
  readonly data?: unknown;
}

export interface DiagramEventMap {
  /**
   * `element` is null when a selection is cleared — deselection has to be
   * expressible. `originalEvent` is optional for the same reason: a selection
   * can arrive from the keyboard, from a stepped run, or from the controlling
   * prop, and inventing a MouseEvent for those would be a lie.
   */
  select: { element: DiagramElementRef | null; originalEvent?: MouseEvent };
  hover: { element: DiagramElementRef | null; originalEvent: MouseEvent };
  activate: { element: DiagramElementRef; originalEvent: MouseEvent };
}

/**
 * Step-through playback. `current` is -1 when nothing is revealed yet.
 * Timers, autoplay and easing are deliberately absent: those are renderer
 * concerns, not part of the contract consumers program against.
 */
export interface StepController {
  readonly stepCount: number;
  readonly current: number;
  goTo(index: number): void;
  next(): void;
  prev(): void;
  reset(): void;
  subscribe(listener: (index: number) => void): () => void;
}
