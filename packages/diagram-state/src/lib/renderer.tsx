import { proxyRenderer } from '@archidea-ai/mermaid-core';
import { StateDiagramSurface } from './components/surface';
import type { DiagramRenderer, RenderInput, RenderResult } from '@archidea-ai/mermaid-core';

/**
 * Native React renderer for mermaid state diagrams.
 *
 * The viewer stands in a state; its outgoing transitions are the choices. As
 * with sequence, the imperative render() path delegates to upstream so it keeps
 * returning a portable SVG.
 */
export const stateRenderer: DiagramRenderer = {
  id: 'state-react',
  supports: (type) => type === 'stateDiagram' || type === 'stateDiagram-v2',
  capabilities: { events: true, viewport: false, step: true },
  Component: StateDiagramSurface,
  renderToSvg: (input: RenderInput): Promise<RenderResult> => proxyRenderer.renderToSvg(input),
};
