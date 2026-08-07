import { proxyRenderer } from '@archidea-ai/mermaid-core';
import { SequenceDiagramSurface } from './components/surface';
import type { DiagramRenderer, RenderInput, RenderResult } from '@archidea-ai/mermaid-core';

/**
 * Native React renderer for mermaid sequence diagrams.
 *
 * The Component renders HTML on a CSS Grid, so it cannot also produce a valid
 * standalone <svg>. Rather than wrap the markup in a <foreignObject> — which
 * renders in browsers but breaks Inkscape, ImageMagick and every SVG-to-image
 * converter people actually point at mermaid output — the imperative
 * mermaid.render() path delegates to upstream.
 *
 * The two paths have genuinely different jobs: render() produces a portable
 * artefact, the Component produces an interactive surface. Drop-in parity for
 * render() therefore stays exactly true.
 */
export const sequenceRenderer: DiagramRenderer = {
  id: 'sequence-react',
  supports: (type) => type === 'sequence',
  capabilities: { events: true, viewport: false, step: true },
  Component: SequenceDiagramSurface,

  renderToSvg(input: RenderInput): Promise<RenderResult> {
    return proxyRenderer.renderToSvg(input);
  },
};
