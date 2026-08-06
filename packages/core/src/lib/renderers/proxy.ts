import { defaultConfigStore } from '../config-store';
import { deepMerge } from '../deep-merge';
import { DiagramParseError, isMermaidReplacementError } from '../errors';
import { loadUpstream } from '../upstream';
import { NO_CAPABILITIES } from '../types';
import type { ConfigStore } from '../config-store';
import type { DiagramRenderer, MermaidConfig, RenderInput, RenderResult } from '../types';

/**
 * The registry's terminal fallback: delegates rendering to upstream mermaid for
 * every diagram type.
 *
 * Declares no capabilities — it produces an opaque SVG string, so events,
 * viewport control and stepping are genuinely unavailable. It has no Component,
 * so the React host takes the innerHTML path.
 */
export function createProxyRenderer(
  configStore: ConfigStore = defaultConfigStore,
): DiagramRenderer {
  return {
    id: 'proxy',
    supports: () => true,
    capabilities: NO_CAPABILITIES,

    async renderToSvg({ id, text, config, container }: RenderInput): Promise<RenderResult> {
      const upstream = await loadUpstream();
      const effective: MermaidConfig = config
        ? deepMerge(configStore.get(), config)
        : configStore.get();

      try {
        if (Object.keys(effective).length > 0) upstream.initialize(effective);

        const diagramType = upstream.detectType(text, effective);
        const { svg, bindFunctions } = await upstream.render(id, text, container);

        return { svg, diagramType, bindFunctions };
      } catch (cause) {
        if (isMermaidReplacementError(cause)) throw cause;
        throw new DiagramParseError(text, cause);
      }
    },
  };
}

export const proxyRenderer = createProxyRenderer();
