import { proxyRenderer } from '@archidea-ai/mermaid-core';
import { FlowchartSurface } from './components/surface';
import type { DiagramRenderer, RenderInput, RenderResult } from '@archidea-ai/mermaid-core';

/**
 * Native React renderer for mermaid flowcharts.
 *
 * A flowchart is a map rather than a run, so it declares no stepping: the whole
 * chart is drawn and selecting a node shows what it touches. As with the other
 * native renderers, the imperative render() path delegates to upstream so it
 * keeps returning a portable SVG.
 */
export const flowchartRenderer: DiagramRenderer = {
  id: 'flowchart-react',
  supports: (type) => type === 'flowchart' || type === 'flowchart-v2' || type === 'graph',
  capabilities: { events: true, viewport: false, step: false },
  Component: FlowchartSurface,
  renderToSvg: (input: RenderInput): Promise<RenderResult> => proxyRenderer.renderToSvg(input),
};
