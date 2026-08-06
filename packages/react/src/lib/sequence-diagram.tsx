import { Mermaid } from './mermaid';
import type { MermaidProps } from './mermaid';

export type SequenceDiagramProps = MermaidProps;

/**
 * Typed wrapper for sequence diagrams and the home of the step-through seam.
 *
 * `onStepController` receives null while the proxy renderer is active, because
 * an opaque SVG string cannot be stepped. Gate on the value you receive, or on
 * useRendererCapabilities().capabilities.step — there is no stub that silently
 * does nothing. Once a step-capable native renderer is registered for the
 * `sequence` type, the same callback starts receiving a live StepController
 * with no change here or in consumer code.
 */
export function SequenceDiagram(props: SequenceDiagramProps) {
  return <Mermaid {...props} />;
}
