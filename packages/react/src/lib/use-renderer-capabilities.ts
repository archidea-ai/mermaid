import { useEffect, useRef, useState } from 'react';
import { resolveRendererForText } from '@archidea-ai/mermaid-core';
import { useEffectiveConfig, useMermaidContext } from './context';
import type {
  DiagramRegistry,
  DiagramType,
  MermaidConfig,
  RendererCapabilities,
} from '@archidea-ai/mermaid-core';

export interface UseRendererCapabilitiesResult {
  rendererId: string | null;
  diagramType: DiagramType | null;
  capabilities: RendererCapabilities | null;
}

const EMPTY: UseRendererCapabilitiesResult = {
  rendererId: null,
  diagramType: null,
  capabilities: null,
};

/**
 * Reports which renderer handles `text` and what it can do, so a UI can disable
 * controls the active renderer does not support.
 */
export function useRendererCapabilities(
  text: string,
  options: { registry?: DiagramRegistry; config?: MermaidConfig } = {},
): UseRendererCapabilitiesResult {
  const { registry } = options;
  const { registry: contextRegistry } = useMermaidContext();
  const activeRegistry = registry ?? contextRegistry;
  const effectiveConfig = useEffectiveConfig(options.config);

  const [state, setState] = useState<UseRendererCapabilitiesResult>(EMPTY);
  const sequenceRef = useRef(0);

  useEffect(() => {
    const sequence = ++sequenceRef.current;

    void resolveRendererForText(text, activeRegistry, effectiveConfig)
      .then(({ renderer, diagramType }) => {
        if (sequence !== sequenceRef.current) return;
        setState({ rendererId: renderer.id, diagramType, capabilities: renderer.capabilities });
      })
      .catch(() => {
        if (sequence !== sequenceRef.current) return;
        setState(EMPTY);
      });

    return () => {
      if (sequence === sequenceRef.current) sequenceRef.current += 1;
    };
  }, [text, activeRegistry, effectiveConfig]);

  return state;
}
