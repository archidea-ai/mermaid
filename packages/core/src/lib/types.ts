import type { ComponentType, CSSProperties } from 'react';
import type { StepController, ViewportController } from './interaction';

/** Upstream mermaid's diagram type id, e.g. 'sequence', 'flowchart-v2'. */
export type DiagramType = string;

/**
 * Structural stand-in for upstream's MermaidConfig. Deliberately open: mirroring
 * upstream's full config type would couple us to one mermaid version.
 */
export interface MermaidConfig {
  [key: string]: unknown;
}

export interface RenderInput {
  /** DOM-safe unique id for the produced SVG. */
  readonly id: string;
  readonly text: string;
  readonly config?: MermaidConfig;
  /** Optional measurement host, as in upstream render(). */
  readonly container?: Element;
}

export interface RenderResult {
  readonly svg: string;
  readonly diagramType: DiagramType;
  bindFunctions?: (element: Element) => void;
}

export interface RendererCapabilities {
  readonly events: boolean;
  readonly viewport: boolean;
  readonly step: boolean;
}

export const NO_CAPABILITIES: RendererCapabilities = Object.freeze({
  events: false,
  viewport: false,
  step: false,
});

/** Props a native renderer's Component receives from the React host. */
export interface DiagramSurfaceProps {
  readonly text: string;
  readonly id: string;
  readonly config?: MermaidConfig;
  readonly className?: string;
  /**
   * Applied to the renderer's root element. Theme tokens must land on the root
   * itself — an ancestor cannot win against the root's own class rule.
   */
  readonly style?: CSSProperties;
  /** Called with a controller when capabilities.step is true, else with null. */
  readonly onStepController?: (controller: StepController | null) => void;
  /** Called with a controller when capabilities.viewport is true, else with null. */
  readonly onViewportController?: (controller: ViewportController | null) => void;
  readonly onError?: (error: Error) => void;
}

/**
 * A rendering Strategy for one or more diagram types.
 *
 * renderToSvg serves the imperative mermaid-compatible API; Component serves
 * the React tree. The proxy implements only renderToSvg. A native renderer
 * implements Component and derives renderToSvg from it via renderToStaticMarkup,
 * so native types keep the imperative API working without a second path.
 *
 * Consumers branch on `capabilities`, never on which fields are present.
 */
export interface DiagramRenderer {
  /** Renderer id, e.g. 'proxy'. Distinct from the diagram type. */
  readonly id: string;
  supports(type: DiagramType): boolean;
  readonly capabilities: RendererCapabilities;
  renderToSvg(input: RenderInput): Promise<RenderResult>;
  readonly Component?: ComponentType<DiagramSurfaceProps>;
}
