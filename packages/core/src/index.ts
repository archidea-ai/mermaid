export {
  DiagramParseError,
  MermaidReplacementError,
  UnsupportedDiagramError,
  UpstreamNotInstalledError,
  isMermaidReplacementError,
} from './lib/errors';
export type { MermaidErrorCode } from './lib/errors';

export { deepMerge } from './lib/deep-merge';

export { NO_CAPABILITIES } from './lib/types';
export type {
  DiagramRenderer,
  DiagramSurfaceProps,
  DiagramType,
  MermaidConfig,
  RenderInput,
  RenderResult,
  RendererCapabilities,
} from './lib/types';

export type {
  DiagramElementRef,
  DiagramEventMap,
  StepController,
  ViewportController,
  ViewportState,
} from './lib/interaction';

export { ConfigStore, defaultConfigStore } from './lib/config-store';
export type { ConfigListener } from './lib/config-store';

export {
  getLoadedUpstream,
  isUpstreamAvailable,
  loadUpstream,
  resetUpstreamForTests,
} from './lib/upstream';
export type { UpstreamMermaid, UpstreamRenderResult, UpstreamRunOptions } from './lib/upstream';

export { DiagramRegistry } from './lib/registry';
export { detectDiagramType, resolveRendererForText } from './lib/detect';
export { createProxyRenderer, proxyRenderer } from './lib/renderers/proxy';
export { defaultRegistry } from './lib/default-registry';
