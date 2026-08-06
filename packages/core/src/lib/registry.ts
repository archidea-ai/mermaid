import type { DiagramRenderer, DiagramType } from './types';

/**
 * Strategy registry mapping a diagram type to the renderer that handles it.
 *
 * Registered renderers are consulted in registration order; the fallback (the
 * proxy, in practice) supports every type, so resolution never fails. Adding a
 * native diagram type is one register() call — no change to the facade or host.
 */
export class DiagramRegistry {
  readonly fallback: DiagramRenderer;
  #renderers: DiagramRenderer[] = [];

  constructor(fallback: DiagramRenderer) {
    this.fallback = fallback;
  }

  register(renderer: DiagramRenderer): () => void {
    this.#renderers.push(renderer);
    return () => {
      const index = this.#renderers.indexOf(renderer);
      if (index !== -1) this.#renderers.splice(index, 1);
    };
  }

  resolve(type: DiagramType): DiagramRenderer {
    for (const renderer of this.#renderers) {
      try {
        if (renderer.supports(type)) return renderer;
      } catch {
        // A third-party predicate must not break resolution for everyone else.
      }
    }
    return this.fallback;
  }

  list(): readonly DiagramRenderer[] {
    return Object.freeze([...this.#renderers, this.fallback]);
  }
}
