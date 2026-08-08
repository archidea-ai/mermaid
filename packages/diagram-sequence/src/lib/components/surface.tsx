import { useEffect, useMemo, useState } from 'react';
import { proxyRenderer } from '@archidea-ai/mermaid-core';
import { parse } from '../parser/parse';
import { useSequenceRun } from '../model/controller';
import { buildTimeline } from '../model/timeline';
import { computeEmphasis } from '../layout/emphasis';
import { computeGrid } from '../layout/grid';
import { SequenceCanvas } from './canvas';
import { SequenceStage } from './stage';
import { DecisionPanel, NotePanel, SequenceToolbar, StepList, VariablePanel } from './panels';
import type { SequenceVariant } from './panels';
import type { DiagramSurfaceProps } from '@archidea-ai/mermaid-core';
import type { SequenceDiagramAst } from '../parser/ast';

/** Rendered instead of the interactive surface when parsing fails (see §7). */
function ProxyFallback({ text, id, config, className, style, onError }: DiagramSurfaceProps) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void proxyRenderer
      .renderToSvg({ id, text, config })
      .then((result) => {
        if (!cancelled) setSvg(result.svg);
      })
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

function InteractiveSurface({
  ast,
  className,
  style,
  initialVariant,
  onStepController,
}: {
  ast: SequenceDiagramAst;
  className?: string;
  style?: DiagramSurfaceProps['style'];
  initialVariant: SequenceVariant;
  onStepController?: DiagramSurfaceProps['onStepController'];
}) {
  const controller = useSequenceRun(ast);
  const { timeline, current } = controller;
  const [variant, setVariant] = useState<SequenceVariant>(initialVariant);

  useEffect(() => {
    onStepController?.(controller);
  }, [onStepController, controller]);

  const grid = useMemo(() => computeGrid(ast, timeline), [ast, timeline]);
  const emphasis = useMemo(() => computeEmphasis(timeline, current), [timeline, current]);

  return (
    <div className={['archidea-sequence', className].filter(Boolean).join(' ')} style={style}>
      <SequenceToolbar controller={controller} variant={variant} onVariantChange={setVariant} />
      <div className="archidea-sequence__body">
        {variant === 'modern' ? (
          <SequenceStage
            ast={ast}
            timeline={timeline}
            cursor={current}
            bindings={controller.bindings}
          />
        ) : (
          <SequenceCanvas
            grid={grid}
            timeline={timeline}
            emphasis={emphasis}
            onSelectStep={controller.goTo}
          />
        )}
        <div>
          <VariablePanel controller={controller} />
          <DecisionPanel controller={controller} />
          <NotePanel controller={controller} />
          <StepList controller={controller} emphasis={emphasis} timeline={timeline} />
        </div>
      </div>
    </div>
  );
}

/**
 * The renderer's Component. A diagram we cannot parse falls back to the proxy
 * rather than erroring, so this package never renders worse than upstream —
 * the worst case is that it renders exactly as upstream does.
 */
export function SequenceDiagramSurface(props: DiagramSurfaceProps) {
  const { text, onViewportController, onStepController, onError } = props;

  const parsed = useMemo(() => {
    try {
      return { ast: parse(text), error: null as Error | null };
    } catch (cause) {
      return { ast: null, error: cause instanceof Error ? cause : new Error(String(cause)) };
    }
  }, [text]);

  useEffect(() => {
    // No viewport implementation yet; say so rather than staying silent.
    onViewportController?.(null);
  }, [onViewportController]);

  useEffect(() => {
    if (parsed.error) {
      onStepController?.(null);
      onError?.(parsed.error);
    }
  }, [parsed.error, onStepController, onError]);

  if (!parsed.ast) return <ProxyFallback {...props} />;

  return (
    <InteractiveSurface
      ast={parsed.ast}
      className={props.className}
      style={props.style}
      initialVariant={readVariant(props.config)}
      onStepController={onStepController}
    />
  );
}

/**
 * Consumers pick the starting view through mermaid config: `sequence.variant`.
 * Modern is the default — it is the view built for being walked through a system,
 * which is what this renderer exists for.
 */
function readVariant(config: DiagramSurfaceProps['config']): SequenceVariant {
  const sequence = (config as { sequence?: { variant?: unknown } } | undefined)?.sequence;
  return sequence?.variant === 'classic' ? 'classic' : 'modern';
}

export { buildTimeline };
