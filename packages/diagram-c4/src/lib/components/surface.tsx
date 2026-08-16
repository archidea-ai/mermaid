import { useEffect, useMemo, useState } from 'react';
import { proxyRenderer } from '@archidea-ai/mermaid-core';
import { parse } from '../parser/parse';
import { C4Chart } from './chart';
import type { DiagramSurfaceProps } from '@archidea-ai/mermaid-core';

/**
 * Parse, and fall back to the proxy if we cannot — the same shape as the
 * sequence, state and flowchart surfaces, and the reason this package can never
 * render worse than upstream.
 */
export function C4Surface(props: DiagramSurfaceProps) {
  const { text, onStepController, onViewportController, onError } = props;

  const parsed = useMemo(() => {
    try {
      return { ast: parse(text), error: null as Error | null };
    } catch (cause) {
      return { ast: null, error: cause instanceof Error ? cause : new Error(String(cause)) };
    }
  }, [text]);

  /*
   * A static C4 chart is a map, not a run, so it offers no step controller and
   * the transport disables itself rather than pretending. C4Dynamic supplies
   * one — see the run controller.
   */
  useEffect(() => {
    onViewportController?.(null);
    if (parsed.ast?.kind !== 'dynamic') onStepController?.(null);
  }, [parsed.ast, onStepController, onViewportController]);

  useEffect(() => {
    if (!parsed.error) return;
    onError?.(parsed.error);
  }, [parsed.error, onError]);

  if (!parsed.ast) return <ProxyFallback {...props} />;
  return <C4Chart ast={parsed.ast} id={props.id} className={props.className} style={props.style} />;
}

function ProxyFallback({ text, id, config, className, style, onError }: DiagramSurfaceProps) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void proxyRenderer
      .renderToSvg({ id, text, config })
      .then((result) => !cancelled && setSvg(result.svg))
      .catch((cause: unknown) => {
        if (!cancelled) onError?.(cause instanceof Error ? cause : new Error(String(cause)));
      });
    return () => {
      cancelled = true;
    };
  }, [text, id, config, onError]);

  if (!svg) return null;
  return (
    <div
      className={className}
      style={style}
      data-renderer="proxy"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
