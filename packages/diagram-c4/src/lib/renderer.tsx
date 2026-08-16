import { proxyRenderer } from '@archidea-ai/mermaid-core';
import { C4Surface } from './components/surface';
import type { DiagramRenderer, RenderInput, RenderResult } from '@archidea-ai/mermaid-core';

/**
 * Native React renderer for the C4 family.
 *
 * Upstream detects all five headers as the single type `c4`, so one renderer
 * claims them all and the header line inside the source says which is which.
 *
 * `step` is declared because C4Dynamic genuinely has a run; the four static
 * types hand the host a null controller, so the transport is disabled and
 * visible rather than hidden. renderToSvg delegates to upstream, because an
 * HTML component cannot also be a standalone <svg> — that is what keeps
 * mermaid.render() returning a portable SVG and drop-in parity exactly true.
 */
export const c4Renderer: DiagramRenderer = {
  id: 'c4-react',
  supports: (type) => type === 'c4',
  capabilities: { events: true, viewport: false, step: true },
  Component: C4Surface,
  renderToSvg: (input: RenderInput): Promise<RenderResult> => proxyRenderer.renderToSvg(input),
};
