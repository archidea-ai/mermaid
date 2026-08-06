import { defaultRegistry } from '@archidea-ai/mermaid-core';
import { sequenceRenderer } from '@archidea-ai/mermaid-diagram-sequence';

/**
 * Side-effect module registering the renderers the drop-in ships with.
 *
 * Imported by every entry point — index, /react and /registry — because a
 * consumer who only imports the React surface must still get the native
 * sequence renderer. Registering from one entry point only meant the renderer
 * silently fell back to the proxy depending on which subpath you imported.
 */
if (!defaultRegistry.list().some((renderer) => renderer.id === sequenceRenderer.id)) {
  defaultRegistry.register(sequenceRenderer);
}
