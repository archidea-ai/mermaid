import { renderToStaticMarkup } from 'react-dom/server';
import { proxyRenderer } from '@archidea-ai/mermaid-core';
import { SequenceDiagramSurface } from './components/surface';
import type { DiagramRenderer, RenderInput, RenderResult } from '@archidea-ai/mermaid-core';

/**
 * Native React renderer for mermaid sequence diagrams.
 *
 * renderToSvg derives from the same Component via renderToStaticMarkup, which
 * is the mechanism phase 1's contract was designed around: native diagram types
 * keep the imperative mermaid API working with no second implementation.
 */
export const sequenceRenderer: DiagramRenderer = {
  id: 'sequence-react',
  supports: (type) => type === 'sequence',
  capabilities: { events: true, viewport: false, step: true },
  Component: SequenceDiagramSurface,

  async renderToSvg(input: RenderInput): Promise<RenderResult> {
    try {
      const markup = renderToStaticMarkup(
        <SequenceDiagramSurface text={input.text} id={input.id} config={input.config} />,
      );
      return { svg: markup, diagramType: 'sequence' };
    } catch {
      // Same fallback rule as the Component: never render worse than upstream.
      return proxyRenderer.renderToSvg(input);
    }
  },
};
