import {
  MermaidReplacementError,
  getLoadedUpstream,
  loadUpstream,
} from '@archidea-ai/mermaid-core';
import type { UpstreamMermaid } from '@archidea-ai/mermaid-core';

let parseErrorHandler: unknown;
let startOnLoadValue = false;

/** Load upstream and apply any property mirrors set before it resolved. */
export async function preloadUpstream(): Promise<void> {
  applyMirrors(await loadUpstream());
}

/**
 * Synchronous upstream handle for the API surface upstream itself exposes
 * synchronously. Throws rather than returning undefined so the failure explains
 * itself at the call site.
 *
 * This is the one place the drop-in deviates: upstream's detectType and
 * mermaidAPI are synchronous, but our upstream load is lazy. Changing their
 * signatures would break every caller, so instead they require a prior load —
 * which initialize/render/run/parse/contentLoaded all trigger.
 */
export function requireLoadedUpstream(member: string): UpstreamMermaid {
  const upstream = getLoadedUpstream();
  if (!upstream) {
    // Not UpstreamNotInstalledError's generic message: mermaid may well be
    // installed and simply not loaded yet, and the caller needs to know which.
    throw new MermaidReplacementError(
      'UPSTREAM_NOT_INSTALLED',
      `"${member}" mirrors upstream mermaid's synchronous API and needs upstream loaded. ` +
        'Await preloadUpstream() (or any of render/run/parse/contentLoaded) first.',
    );
  }
  return upstream;
}

export function setParseError(handler: unknown): void {
  parseErrorHandler = handler;
  const upstream = getLoadedUpstream();
  if (upstream) upstream.parseError = handler;
}

export function getParseError(): unknown {
  return getLoadedUpstream()?.parseError ?? parseErrorHandler;
}

export function setStartOnLoad(value: boolean): void {
  startOnLoadValue = value;
  const upstream = getLoadedUpstream();
  if (upstream) upstream.startOnLoad = value;
}

export function getStartOnLoad(): boolean {
  return getLoadedUpstream()?.startOnLoad ?? startOnLoadValue;
}

function applyMirrors(upstream: UpstreamMermaid): void {
  if (parseErrorHandler !== undefined) upstream.parseError = parseErrorHandler;
  upstream.startOnLoad = startOnLoadValue;
}

export function resetFacadeStateForTests(): void {
  parseErrorHandler = undefined;
  startOnLoadValue = false;
}
