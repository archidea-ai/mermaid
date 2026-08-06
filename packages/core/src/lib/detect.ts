import { DiagramParseError, isMermaidReplacementError } from './errors';
import { loadUpstream } from './upstream';
import type { DiagramRegistry } from './registry';
import type { DiagramRenderer, DiagramType, MermaidConfig } from './types';

/**
 * Delegates to upstream rather than re-implementing frontmatter, directive and
 * comment handling. Consequence: type detection currently needs upstream even
 * for a type a native renderer would claim.
 */
export async function detectDiagramType(
  text: string,
  config?: MermaidConfig,
): Promise<DiagramType> {
  const upstream = await loadUpstream();
  try {
    return upstream.detectType(text, config);
  } catch (cause) {
    if (isMermaidReplacementError(cause)) throw cause;
    throw new DiagramParseError(text, cause);
  }
}

export async function resolveRendererForText(
  text: string,
  registry: DiagramRegistry,
  config?: MermaidConfig,
): Promise<{ renderer: DiagramRenderer; diagramType: DiagramType }> {
  const diagramType = await detectDiagramType(text, config);
  return { renderer: registry.resolve(diagramType), diagramType };
}
