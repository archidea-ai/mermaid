import { useEffect, useMemo } from 'react';
import { proxyRenderer } from '@archidea-ai/mermaid-core';
import {
  RichLabel,
  computeArc,
  humaniseLabel,
  useAnchors,
  withBreaks,
} from '@archidea-ai/mermaid-diagram-sequence';
import { parse } from '../parser/parse';
import { useStateRun } from '../model/controller';
import { displayName, isTerminal } from '../parser/ast';
import type { DiagramSurfaceProps } from '@archidea-ai/mermaid-core';
import { enclosingStates } from '../model/nesting';
import type { StateDiagramAst, StateNode } from '../parser/ast';
import type { ReactNode } from 'react';
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
  return (
    <StateRun
      ast={parsed.ast}
      className={props.className}
      style={props.style}
      start={readStart(props.config)}
    />
  );
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

/** Consumers choose the starting state through mermaid config: `state.start`. */
function readStart(config: DiagramSurfaceProps['config']): string | null {
  const state = (config as { state?: { start?: unknown } } | undefined)?.state;
  return typeof state?.start === 'string' ? state.start : null;
}

function StateRun({
  ast,
  className,
  style,
  start,
}: {
  ast: StateDiagramAst;
  className?: string;
  style?: DiagramSurfaceProps['style'];
  start: string | null;
}) {
  const run = useStateRun(ast, { start });
  const { containerRef, register, anchors } = useAnchors<HTMLDivElement>();

  const current = run.at;
  const currentNode = current ? ast.stateById.get(current) : undefined;
  // Any `[*]` is an end and reads as one; whether it *stops* the run is separate.
  const currentIsEnd = isTerminal(current);
  const nameOf = (id: string) => displayName(id, (key) => ast.stateById.get(key)?.label);
  const boxes = useMemo(() => enclosingStates(ast, current), [ast, current]);

  // One line per way out of here. Clicking a line is choosing that way.
  const lines = useMemo(() => {
    const from = current ? anchors.get(current) : undefined;
    if (!from) return [];

    return run.options.flatMap((option) => {
      const to = anchors.get(`option-${option.id}`);
      if (!to) return [];
      return [{ option, arc: computeArc(from, to, { bow: 0.12 }) }];
    });
  }, [run.options, anchors, current]);

  return (
    <div className={['archidea-sequence', className].filter(Boolean).join(' ')} style={style}>
      <div className="flex flex-wrap items-center gap-2">
        <button className="seq-btn" onClick={run.prev} disabled={run.current < 0}>
          Back
        </button>
        <button className="seq-btn" onClick={run.reset}>
          Restart
        </button>
        <span className="text-muted-foreground text-xs tabular-nums">
          {run.current + 1} / {run.stepCount}
        </span>
        {run.options.length > 0 ? (
          <span className="text-muted-foreground text-xs">Click a transition to take it</span>
        ) : null}
      </div>

      <div className="archidea-sequence__body">
        <div className="seq-stage">
          {/* Each enclosing composite state is a box around everything inside it. */}
          <Nested boxes={boxes}>
            <div className="state-view" ref={containerRef}>
              <svg className="seq-stage__arcs state-view__lines" aria-hidden="true">
                {lines.map(({ option, arc }) => (
                  <path
                    key={option.id}
                    className="state-line"
                    d={arc.path}
                    pathLength={100}
                    fill="none"
                  />
                ))}
              </svg>

              <div className="state-view__now">
                {current ? (
                  <div
                    ref={register(current)}
                    className="seq-stage__object"
                    data-kind={currentNode?.kind === 'choice' ? 'actor' : 'participant'}
                    data-state="sending"
                    data-terminal={currentIsEnd}
                  >
                    <span className="seq-stage__name">
                      {currentIsEnd ? nameOf(current) : withBreaks(currentNode?.label ?? current)}
                    </span>
                  </div>
                ) : null}
              </div>

              <div className="state-view__next">
                {run.options.map((option) => {
                  const target = ast.stateById.get(option.to);
                  const ends = isTerminal(option.to);
                  return (
                    <button
                      key={option.id}
                      ref={register(`option-${option.id}`)}
                      className="state-option"
                      data-terminal={ends}
                      onClick={() => run.take(option.id)}
                    >
                      <span className="state-option__label">
                        {option.label ? humaniseLabel(option.label.raw) : 'go'}
                      </span>
                      <span className="seq-stage__name">
                        {ends ? nameOf(option.to) : withBreaks(target?.label ?? option.to)}
                      </span>
                    </button>
                  );
                })}

                {run.options.length === 0 ? (
                  <p className="seq-stage__idle">
                    {run.atEnd ? 'This is the end of the run.' : 'Nothing leaves this state.'}
                  </p>
                ) : null}
              </div>
            </div>
          </Nested>

          {boxes.length > 0 ? (
            <p className="seq-stage__context">
              {boxes.map((box) => (
                <span key={box.id}>
                  <span className="seq-stage__kind">in</span> {box.label}
                </span>
              ))}
            </p>
          ) : null}
        </div>

        <div>
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
            <h3>Path taken</h3>
            <div className="seq-steps grid max-h-64 gap-0.5 overflow-y-auto">
              {run.timeline.steps.slice(0, run.current + 1).map((step, index) => (
                <button
                  key={step.id}
                  className="seq-step"
                  data-emphasis={index === run.current ? 'current' : 'spent'}
                  onClick={() => run.goTo(index)}
                >
                  {step.transition.label ? (
                    <RichLabel text={step.transition.label} values={run.bindings} />
                  ) : (
                    `${nameOf(step.from)} \u2192 ${nameOf(step.to)}`
                  )}
                </button>
              ))}
              {run.current < 0 ? (
                <p className="text-muted-foreground m-0 text-xs">Nowhere yet.</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Wraps its children in one box per enclosing composite state, outermost first. */
function Nested({ boxes, children }: { boxes: readonly StateNode[]; children: ReactNode }) {
  return boxes.reduceRight(
    (inner, box) => (
      <section key={box.id} className="state-box" aria-label={box.label}>
        <h4 className="state-box__title">{withBreaks(box.label)}</h4>
        {inner}
      </section>
    ),
    children,
  );
}
