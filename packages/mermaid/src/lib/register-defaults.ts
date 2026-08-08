import { defaultRegistry } from '@archidea-ai/mermaid-core';
import { sequenceRenderer } from '@archidea-ai/mermaid-diagram-sequence';
import { stateRenderer } from '@archidea-ai/mermaid-diagram-state';
import { flowchartRenderer } from '@archidea-ai/mermaid-diagram-flowchart';

/**
 * Registers the renderers the drop-in ships with.
 *
 * Called from every entry point — index, /react and /registry — because a
 * consumer importing only the React surface must still get the native renderers.
 *
 * This is an explicit exported call rather than a bare side-effect module: with
 * `sideEffects` unset, bundlers tree-shook the import away and the *published*
 * package silently fell back to the proxy, while source-aliased dev and tests
 * kept working. `sideEffects` in package.json now names these entry points too.
 */
export function registerDefaultRenderers(): void {
  for (const renderer of [sequenceRenderer, stateRenderer, flowchartRenderer]) {
    if (defaultRegistry.list().some((existing) => existing.id === renderer.id)) continue;
    defaultRegistry.register(renderer);
  }
}
