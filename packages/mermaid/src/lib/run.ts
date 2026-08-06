import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { defaultConfigStore, defaultRegistry, loadUpstream } from '@archidea-ai/mermaid-core';
import { Mermaid } from '@archidea-ai/mermaid-react';
import type { UpstreamRunOptions } from '@archidea-ai/mermaid-core';

export type RunOptions = UpstreamRunOptions;

const PROCESSED_ATTRIBUTE = 'data-processed';

/**
 * Partitions candidate elements: types a native renderer claims mount with
 * createRoot, the rest go to upstream in a single call.
 *
 * With only the proxy registered every element takes the upstream branch, but
 * the partitioning exists and is tested now so a native renderer works the day
 * it registers.
 */
export async function run(options: RunOptions = {}): Promise<void> {
  const upstream = await loadUpstream();
  const { querySelector = '.mermaid', nodes, postRenderCallback, suppressErrors } = options;

  const elements = nodes ? Array.from(nodes) : Array.from(document.querySelectorAll(querySelector));

  const native: Element[] = [];
  const proxied: Element[] = [];

  for (const element of elements) {
    if (element.getAttribute(PROCESSED_ATTRIBUTE) === 'true') continue;

    let hasNativeRenderer = false;
    try {
      hasNativeRenderer = Boolean(
        defaultRegistry.resolve(upstream.detectType(readSource(element))).Component,
      );
    } catch {
      // Undetectable source: let upstream own the error reporting, as it would alone.
      hasNativeRenderer = false;
    }

    (hasNativeRenderer ? native : proxied).push(element);
  }

  if (proxied.length > 0) {
    await upstream.run({ ...options, nodes: proxied });
  }

  for (const element of native) {
    mountNative(element, postRenderCallback, suppressErrors);
  }
}

/** Synchronous like upstream's; kicks off the async work without awaiting it. */
export function contentLoaded(): void {
  void run();
}

function readSource(element: Element): string {
  return (element.textContent ?? '').trim();
}

function mountNative(
  element: Element,
  postRenderCallback: RunOptions['postRenderCallback'],
  suppressErrors: boolean | undefined,
): void {
  const text = readSource(element);
  const id = element.id || `mermaid-${Math.abs(hash(text)).toString(36)}`;

  element.textContent = '';
  element.setAttribute(PROCESSED_ATTRIBUTE, 'true');

  createRoot(element).render(
    createElement(Mermaid, {
      text,
      id,
      config: defaultConfigStore.get(),
      onRender: () => postRenderCallback?.(id),
      onError: (error: Error) => {
        if (!suppressErrors) throw error;
      },
    }),
  );
}

function hash(value: string): number {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = (result * 31 + value.charCodeAt(index)) | 0;
  }
  return result;
}
