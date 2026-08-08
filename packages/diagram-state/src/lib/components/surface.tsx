import { useEffect, useMemo } from 'react';
import { proxyRenderer } from '@archidea-ai/mermaid-core';
import { RichLabel, humaniseLabel, withBreaks } from '@archidea-ai/mermaid-diagram-sequence';
import { parse } from '../parser/parse';
import { useStateRun } from '../model/controller';
import { TERMINAL } from '../parser/ast';
import type { DiagramSurfaceProps } from '@archidea-ai/mermaid-core';
import type { StateDiagramAst } from '../parser/ast';
import { useState } from 'react';

/**
 * The renderer's Component.
 *
 * Same shape as the sequence surface: parse, and fall back to the proxy if we
 * cannot — so this package never renders worse than upstream.
 */
export function StateDiagramSurface(props: DiagramSurfaceProps) {
  const { text, onStepController, onViewportController, onError } = props;

  const parsed = useMemo(() => {
    try {
      return { ast: parse(text), error: null as Error | null };
    } catch (cause) {
      return { ast: null, error: cause instanceof Error ? cause : new Error(String(cause)) };
    }
  }, [text]);

  useEffect(() => {
    onViewportController?.(null);
  }, [onViewportController]);

  useEffect(() => {
    if (!parsed.error) return;
    onStepController?.(null);
    onError?.(parsed.error);
  }, [parsed.error, onStepController, onError]);

  if (!parsed.ast) return <ProxyFallback {...props} />;
  return <StateRun ast={parsed.ast} className={props.className} style={props.style} />;
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

function StateRun({
  ast,
  className,
  style,
}: {
  ast: StateDiagramAst;
  className?: string;
  style?: DiagramSurfaceProps['style'];
}) {
  const run = useStateRun(ast);
  const visited = useMemo(
    () => new Set(run.timeline.steps.slice(0, run.current + 1).flatMap((s) => [s.from, s.to])),
    [run.timeline, run.current],
  );
  const unreached = new Set(run.timeline.unreached);

  const states = ast.states.filter((state) => state.kind !== 'terminal');

  return (
    <div className={['archidea-sequence', className].filter(Boolean).join(' ')} style={style}>
      <div className="flex flex-wrap items-center gap-2">
        <button className="seq-btn" onClick={run.prev} disabled={run.current < 0}>
          Back
        </button>
        <button
          className="seq-btn seq-next"
          data-primary="true"
          data-unblocked={false}
          onClick={run.next}
          disabled={!run.canAdvance}
        >
          Next step
        </button>
        <button className="seq-btn" onClick={run.reset}>
          Restart
        </button>
        <span className="text-muted-foreground text-xs tabular-nums">
          {run.current + 1} / {run.stepCount}
        </span>
      </div>

      <div className="archidea-sequence__body">
        <div className="seq-stage">
          <div className="seq-stage__floor">
            <div className="seq-stage__groups">
              {states.map((state) => (
                <div
                  key={state.id}
                  className="seq-stage__object"
                  data-kind={state.kind === 'choice' ? 'actor' : 'participant'}
                  data-state={
                    state.id === run.at
                      ? 'sending'
                      : unreached.has(state.id)
                        ? 'resting'
                        : visited.has(state.id)
                          ? 'receiving'
                          : 'resting'
                  }
                >
                  <span className="seq-stage__name">{withBreaks(state.label)}</span>
                </div>
              ))}
            </div>
            {run.timeline.done && run.current + 1 >= run.stepCount ? (
              <p className="seq-stage__idle">The machine has reached a final state.</p>
            ) : null}
          </div>

          {run.current >= 0 ? (
            <p className="seq-stage__context">
              <span>
                <span className="seq-stage__kind">now in</span>{' '}
                {ast.stateById.get(run.at ?? '')?.label ?? run.at}
              </span>
            </p>
          ) : null}
        </div>

        <div>
          {run.pending ? (
            <div className="seq-decision-card archidea-sequence__panel">
              <h3>Choose a transition</h3>
              <div className="seq-decision grid gap-1.5" data-fresh="true">
                {run.pending.options.map((option) => (
                  <button
                    key={option.id}
                    className="seq-btn justify-start"
                    onClick={() => run.choose(run.pending!.from, option.id)}
                  >
                    {option.label ? humaniseLabel(option.label.raw) : `→ ${option.to}`}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="archidea-sequence__panel">
            <h3>Values</h3>
            {run.bindings.entries().length === 0 ? (
              <p className="text-muted-foreground m-0 text-xs">No values yet.</p>
            ) : (
              run.bindings.entries().map(([name, value]) => (
                <div key={name} className="flex justify-between gap-2 font-mono text-xs">
                  <b>{name}</b>
                  <span>{String(value)}</span>
                </div>
              ))
            )}
          </div>

          <div className="archidea-sequence__panel">
            <h3>Steps</h3>
            <div className="seq-steps grid max-h-64 gap-0.5 overflow-y-auto">
              {run.timeline.steps.map((step, index) => (
                <button
                  key={step.id}
                  className="seq-step"
                  data-emphasis={
                    index === run.current ? 'current' : index < run.current ? 'spent' : 'rest'
                  }
                  onClick={() => run.goTo(index)}
                >
                  {step.transition.label ? (
                    <RichLabel text={step.transition.label} values={run.bindings} />
                  ) : (
                    `${step.from} → ${step.to === TERMINAL ? 'end' : step.to}`
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
