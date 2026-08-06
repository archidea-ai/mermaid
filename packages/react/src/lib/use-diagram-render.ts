import { useEffect, useRef, useState } from 'react';
import { resolveRendererForText } from '@archidea-ai/mermaid-core';
import { useEffectiveConfig, useMermaidContext } from './context';
import type {
  DiagramRegistry,
  DiagramRenderer,
  MermaidConfig,
  RenderResult,
} from '@archidea-ai/mermaid-core';

export type DiagramRenderMode = 'native' | 'svg';
export type DiagramRenderStatus = 'idle' | 'rendering' | 'ready' | 'error';

export interface UseDiagramRenderOptions {
  id?: string;
  config?: MermaidConfig;
  registry?: DiagramRegistry;
}

export interface UseDiagramRenderResult {
  status: DiagramRenderStatus;
  mode: DiagramRenderMode | null;
  result: RenderResult | null;
  error: Error | null;
  renderer: DiagramRenderer | null;
}

const IDLE: UseDiagramRenderResult = {
  status: 'idle',
  mode: null,
  result: null,
  error: null,
  renderer: null,
};

export function useDiagramRender(
  text: string,
  options: UseDiagramRenderOptions = {},
): UseDiagramRenderResult {
  const { id = 'diagram', config, registry } = options;
  const { registry: contextRegistry } = useMermaidContext();
  const activeRegistry = registry ?? contextRegistry;
  const effectiveConfig = useEffectiveConfig(config);

  const [state, setState] = useState<UseDiagramRenderResult>(IDLE);
  const sequenceRef = useRef(0);

  useEffect(() => {
    const sequence = ++sequenceRef.current;
    const isCurrent = () => sequence === sequenceRef.current;

    setState((previous) => ({ ...previous, status: 'rendering', error: null }));

    void (async () => {
      try {
        const { renderer } = await resolveRendererForText(text, activeRegistry, effectiveConfig);
        if (!isCurrent()) return;

        if (renderer.Component) {
          setState({ status: 'ready', mode: 'native', result: null, error: null, renderer });
          return;
        }

        const result = await renderer.renderToSvg({ id, text, config: effectiveConfig });
        if (!isCurrent()) return;

        setState({ status: 'ready', mode: 'svg', result, error: null, renderer });
      } catch (cause) {
        if (!isCurrent()) return;
        setState({
          status: 'error',
          mode: null,
          result: null,
          error: cause instanceof Error ? cause : new Error(String(cause)),
          renderer: null,
        });
      }
    })();

    return () => {
      // Supersede this render so a late resolution cannot commit stale output.
      if (sequence === sequenceRef.current) sequenceRef.current += 1;
    };
  }, [text, id, activeRegistry, effectiveConfig]);

  return state;
}
