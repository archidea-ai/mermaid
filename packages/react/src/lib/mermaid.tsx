import { useEffect, useId, useRef } from 'react';
import { useDiagramRender } from './use-diagram-render';
import type {
  DiagramRegistry,
  MermaidConfig,
  RenderResult,
  StepController,
  ViewportController,
} from '@archidea-ai/mermaid-core';
import type { CSSProperties, ReactNode } from 'react';

export interface MermaidProps {
  text: string;
  /** Defaults to a generated DOM-safe id. */
  id?: string;
  config?: MermaidConfig;
  registry?: DiagramRegistry;
  className?: string;
  /** Applied to the renderer's root element, so theme tokens reach it. */
  style?: CSSProperties;
  onRender?: (result: RenderResult) => void;
  onError?: (error: Error) => void;
  /** Receives a controller from renderers with capabilities.step, else null. */
  onStepController?: (controller: StepController | null) => void;
  /** Receives a controller from renderers with capabilities.viewport, else null. */
  onViewportController?: (controller: ViewportController | null) => void;
  fallback?: ReactNode;
  errorFallback?: ReactNode | ((error: Error) => ReactNode);
}

/**
 * Host for whichever renderer the registry resolves.
 *
 * The SVG path injects markup produced by upstream mermaid, which sanitises it
 * with DOMPurify per its own securityLevel config. We add no sanitisation and
 * no bypass — securityLevel still governs.
 */
export function Mermaid({
  text,
  id,
  config,
  registry,
  className,
  style,
  onRender,
  onError,
  onStepController,
  onViewportController,
  fallback,
  errorFallback,
}: MermaidProps) {
  const generatedId = useId();
  const diagramId = id ?? `mermaid-${generatedId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const { status, mode, result, error, renderer } = useDiagramRender(text, {
    id: diagramId,
    config,
    registry,
  });
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status === 'ready' && result) onRender?.(result);
  }, [status, result, onRender]);

  useEffect(() => {
    if (status === 'error' && error) onError?.(error);
  }, [status, error, onError]);

  // bindFunctions needs committed DOM, so it runs in an effect, not during render.
  useEffect(() => {
    if (mode !== 'svg' || !result?.bindFunctions || !hostRef.current) return;
    result.bindFunctions(hostRef.current);
  }, [mode, result]);

  // The svg path exposes no interaction surface — say so rather than staying silent.
  useEffect(() => {
    if (mode !== 'svg') return;
    onStepController?.(null);
    onViewportController?.(null);
  }, [mode, onStepController, onViewportController]);

  if (status === 'error' && error) {
    const rendered = typeof errorFallback === 'function' ? errorFallback(error) : errorFallback;
    return <>{rendered ?? null}</>;
  }

  if (mode === 'native' && renderer?.Component) {
    const Native = renderer.Component;
    return (
      <Native
        text={text}
        id={diagramId}
        config={config}
        className={className}
        style={style}
        onStepController={onStepController}
        onViewportController={onViewportController}
        onError={onError}
      />
    );
  }

  if (mode !== 'svg' || !result) return <>{fallback ?? null}</>;

  return (
    <div
      ref={hostRef}
      className={className}
      style={style}
      data-renderer={renderer?.id}
      data-diagram-type={result.diagramType}
      dangerouslySetInnerHTML={{ __html: result.svg }}
    />
  );
}
