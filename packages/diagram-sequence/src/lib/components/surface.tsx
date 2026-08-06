import { useEffect, useMemo, useState } from 'react';
import { proxyRenderer } from '@archidea-ai/mermaid-core';
import { parse } from '../parser/parse';
import { useSequenceRun } from '../model/controller';
import { buildTimeline } from '../model/timeline';
import { computeEmphasis } from '../layout/emphasis';
import { createCanvasMeasurer } from '../layout/measure';
import { layout as computeLayout } from '../layout/layout';
import { SequenceCanvas } from './canvas';
import { DecisionPanel, NotePanel, SequenceToolbar, StepList, VariablePanel } from './panels';
import type { DiagramSurfaceProps } from '@archidea-ai/mermaid-core';
import type { SequenceDiagramAst } from '../parser/ast';

const measurer = createCanvasMeasurer();

/** Rendered instead of the interactive surface when parsing fails (see §7). */
function ProxyFallback({ text, id, config, className, onError }: DiagramSurfaceProps) {
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
    <div className={className} data-renderer="proxy" dangerouslySetInnerHTML={{ __html: svg }} />
  );
}

function InteractiveSurface({
  ast,
  className,
  onStepController,
}: {
  ast: SequenceDiagramAst;
  className?: string;
  onStepController?: DiagramSurfaceProps['onStepController'];
}) {
  const controller = useSequenceRun(ast);
  const { timeline } = controller;

  useEffect(() => {
    onStepController?.(controller);
  }, [onStepController, controller]);

  const layout = useMemo(() => computeLayout(ast, timeline, measurer), [ast, timeline]);
  const emphasis = useMemo(
    () => computeEmphasis(timeline, controller.current),
    [timeline, controller.current],
  );

  return (
    <div className={['archidea-sequence', className].filter(Boolean).join(' ')}>
      <SequenceToolbar controller={controller} />
      <div className="archidea-sequence__body">
        <SequenceCanvas
          layout={layout}
          timeline={timeline}
          emphasis={emphasis}
          onSelectStep={controller.goTo}
        />
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
      onStepController={onStepController}
    />
  );
}

export { buildTimeline };
