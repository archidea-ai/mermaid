import { UpstreamNotInstalledError } from './errors';
import type { DiagramType, MermaidConfig } from './types';

export interface UpstreamRenderResult {
  svg: string;
  diagramType?: DiagramType;
  bindFunctions?: (element: Element) => void;
}

export interface UpstreamRunOptions {
  querySelector?: string;
  nodes?: ArrayLike<Element>;
  postRenderCallback?: (id: string) => void;
  suppressErrors?: boolean;
}

/**
 * Narrow structural view of upstream mermaid — only the surface the proxy and
 * facade call. Deliberately not upstream's own type: a change to unrelated
 * upstream API must not break our build.
 */
export interface UpstreamMermaid {
  initialize(config: MermaidConfig): void;
  render(id: string, text: string, container?: Element): Promise<UpstreamRenderResult>;
  parse(text: string, options?: { suppressErrors?: boolean }): Promise<unknown>;
  detectType(text: string, config?: MermaidConfig): DiagramType;
  run(options?: UpstreamRunOptions): Promise<void>;
  contentLoaded(): void;
  registerExternalDiagrams(diagrams: unknown[], options?: unknown): Promise<void>;
  registerIconPacks(packs: unknown[]): void;
  registerLayoutLoaders(loaders: unknown[]): void;
  startOnLoad: boolean;
  mermaidAPI: unknown;
  parseError?: unknown;
}

let pending: Promise<UpstreamMermaid> | undefined;
let loaded: UpstreamMermaid | undefined;

/**
 * Memoised dynamic import of the optional `mermaid` peer. Concurrent callers
 * share one in-flight promise; the rejection is memoised too, because a module
 * that cannot resolve will not resolve on retry, and re-importing on every
 * render would turn one failure into a stream of them.
 */
export function loadUpstream(): Promise<UpstreamMermaid> {
  pending ??= importUpstream();
  return pending;
}

async function importUpstream(): Promise<UpstreamMermaid> {
  let module: unknown;
  try {
    module = await import('mermaid');
  } catch (cause) {
    throw new UpstreamNotInstalledError(cause);
  }

  const candidate = (module as { default?: unknown }).default ?? module;
  if (!candidate || typeof (candidate as UpstreamMermaid).render !== 'function') {
    throw new UpstreamNotInstalledError(
      new Error('The resolved "mermaid" module does not expose a render() function.'),
    );
  }

  loaded = candidate as UpstreamMermaid;
  return loaded;
}

export async function isUpstreamAvailable(): Promise<boolean> {
  try {
    await loadUpstream();
    return true;
  } catch {
    return false;
  }
}

/**
 * Synchronous handle to upstream, undefined until a load has resolved. Lets the
 * facade keep detectType() synchronous like upstream's.
 */
export function getLoadedUpstream(): UpstreamMermaid | undefined {
  return loaded;
}

export function resetUpstreamForTests(): void {
  pending = undefined;
  loaded = undefined;
}
