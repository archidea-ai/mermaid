import {
  detectType,
  getRegisteredDiagramsMetadata,
  init,
  initialize,
  parse,
  preloadUpstream,
  registerExternalDiagrams,
  registerIconPacks,
  registerLayoutLoaders,
  render,
  setParseErrorHandler,
} from './lib/api';
import { contentLoaded, run } from './lib/run';
import './lib/register-defaults';
import {
  getParseError,
  getStartOnLoad,
  requireLoadedUpstream,
  setParseError,
  setStartOnLoad,
} from './lib/upstream-state';

export {
  contentLoaded,
  detectType,
  getRegisteredDiagramsMetadata,
  init,
  initialize,
  parse,
  preloadUpstream,
  registerExternalDiagrams,
  registerIconPacks,
  registerLayoutLoaders,
  render,
  run,
  setParseErrorHandler,
};
export type { RunOptions } from './lib/run';

// Re-exported so a single install covers every use.
export { Mermaid, MermaidProvider, SequenceDiagram } from '@archidea-ai/mermaid-react';
export { defaultRegistry } from '@archidea-ai/mermaid-core';

/**
 * Mirrors upstream mermaid's default export. Named exports above cover the
 * `import { render } from 'mermaid'` style; this object covers
 * `import mermaid from 'mermaid'`. Upstream supports both, so we do too.
 */
const mermaid = {
  contentLoaded,
  detectType,
  getRegisteredDiagramsMetadata,
  init,
  initialize,
  parse,
  preloadUpstream,
  registerExternalDiagrams,
  registerIconPacks,
  registerLayoutLoaders,
  render,
  run,
  setParseErrorHandler,
  get parseError() {
    return getParseError();
  },
  set parseError(handler: unknown) {
    setParseError(handler);
  },
  get startOnLoad() {
    return getStartOnLoad();
  },
  set startOnLoad(value: boolean) {
    setStartOnLoad(value);
  },
  get mermaidAPI() {
    return requireLoadedUpstream('mermaidAPI').mermaidAPI;
  },
};

export default mermaid;
