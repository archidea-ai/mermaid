import {
  DiagramParseError,
  defaultConfigStore,
  defaultRegistry,
  isMermaidReplacementError,
  loadUpstream,
  resolveRendererForText,
} from '@archidea-ai/mermaid-core';
import { preloadUpstream, requireLoadedUpstream } from './upstream-state';
import type { DiagramType, MermaidConfig, RenderResult } from '@archidea-ai/mermaid-core';

export { preloadUpstream };

/**
 * Synchronous like upstream's. Stores config; the proxy forwards it to upstream
 * before each render, which is what keeps this call sync despite the lazy load.
 */
export function initialize(config: MermaidConfig = {}): void {
  defaultConfigStore.merge(config);
}

export async function render(id: string, text: string, container?: Element): Promise<RenderResult> {
  const { renderer } = await resolveRendererForText(
    text,
    defaultRegistry,
    defaultConfigStore.get(),
  );
  return renderer.renderToSvg({ id, text, container, config: defaultConfigStore.get() });
}

export async function parse(
  text: string,
  options?: { suppressErrors?: boolean },
): Promise<unknown> {
  const upstream = await loadUpstream();
  try {
    return await upstream.parse(text, options);
  } catch (cause) {
    if (options?.suppressErrors) return false;
    if (isMermaidReplacementError(cause)) throw cause;
    throw new DiagramParseError(text, cause);
  }
}

/** Synchronous like upstream's; requires upstream loaded. See upstream-state.ts. */
export function detectType(text: string, config?: MermaidConfig): DiagramType {
  return requireLoadedUpstream('detectType').detectType(text, config);
}

export async function registerExternalDiagrams(
  diagrams: unknown[],
  options?: unknown,
): Promise<void> {
  return (await loadUpstream()).registerExternalDiagrams(diagrams, options);
}

export async function registerIconPacks(packs: unknown[]): Promise<void> {
  (await loadUpstream()).registerIconPacks(packs);
}

export async function registerLayoutLoaders(loaders: unknown[]): Promise<void> {
  (await loadUpstream()).registerLayoutLoaders(loaders);
}

/** Upstream's deprecated alias for initialize + run. Kept for drop-in parity. */
export function init(config?: MermaidConfig, nodes?: unknown, callback?: unknown): void {
  if (config) initialize(config);
  void loadUpstream().then((upstream) => {
    const legacy = upstream as unknown as {
      init?: (config?: MermaidConfig, nodes?: unknown, callback?: unknown) => void;
    };
    legacy.init?.(config, nodes, callback);
  });
}

export async function setParseErrorHandler(handler: unknown): Promise<void> {
  const upstream = (await loadUpstream()) as unknown as {
    setParseErrorHandler?: (handler: unknown) => void;
  };
  upstream.setParseErrorHandler?.(handler);
}

export async function getRegisteredDiagramsMetadata(): Promise<unknown> {
  const upstream = (await loadUpstream()) as unknown as {
    getRegisteredDiagramsMetadata?: () => unknown;
  };
  return upstream.getRegisteredDiagramsMetadata?.();
}
