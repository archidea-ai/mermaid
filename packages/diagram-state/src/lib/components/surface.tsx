import { useEffect, useMemo } from 'react';
import { proxyRenderer } from '@archidea-ai/mermaid-core';
import {
  computeArc,
  humaniseLabel,
  useAnchors,
  withBreaks,
} from '@archidea-ai/mermaid-diagram-sequence';
import { parse } from '../parser/parse';
import { useStateRun } from '../model/controller';
import { displayName, isTerminal } from '../parser/ast';
import type { DiagramSurfaceProps } from '@archidea-ai/mermaid-core';
import { depthWithin, enclosingStates } from '../model/nesting';
import type { StateDiagramAst } from '../parser/ast';
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
  const currentIsEnd = isTerminal(current);
  const nameOf = (id: string) => displayName(id, (key) => ast.stateById.get(key)?.label);

  // Containers around where we stand, outermost first.
  const boxes = useMemo(() => enclosingStates(ast, current), [ast, current]);

  /**
   * Everywhere the run has been, oldest first, stopping before the current
   * state. Each entry carries the cursor that puts the run back there, so
   * clicking a past state rewinds to it.
   */
  const trail = useMemo(() => {
    const walked = run.timeline.steps.slice(0, run.current + 1);
    if (walked.length === 0) return [];

    // trail[0] is where the run started, which is cursor -1; trail[i] is where
    // step i-1 landed.
    return [
      { stateId: walked[0]!.from, cursor: -1 },
      ...walked.slice(0, -1).map((step, index) => ({ stateId: step.to, cursor: index })),
    ];
  }, [run.timeline, run.current]);

  /*
   * Each element is placed at the nesting level that actually holds it. A state
   * visited before entering a composite belongs outside its box; an option that
   * leaves a composite belongs outside it too. Level 0 is outside everything.
   */
  const levelOf = (stateId: string) => depthWithin(ast, stateId, boxes);

  /*
   * The track grows rightwards, so the newest part is the part off screen.
   * Scroll to the end whenever the cursor moves — including backwards, where
   * the run shortens and the end is what you just returned to.
   */
  useEffect(() => {
    const track = containerRef.current;
    if (!track) return;

    const reduced =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    // jsdom implements neither scrollTo nor smooth behaviour.
    if (typeof track.scrollTo === 'function') {
      track.scrollTo({ left: track.scrollWidth, behavior: reduced ? 'auto' : 'smooth' });
    } else {
      track.scrollLeft = track.scrollWidth;
    }
  }, [run.current, run.at, containerRef]);

  const lines = useMemo(() => {
    const from = current ? anchors.get(current) : undefined;
    if (!from) return [];

    return run.options.flatMap((option) => {
      const to = anchors.get(`option-${option.id}`);
      if (!to) return [];
      return [{ option, arc: computeArc(from, to, { bow: 0.12 }) }];
    });
  }, [run.options, anchors, current]);

  const chipBody = (stateId: string) => (
    <span className="seq-stage__name">
      {isTerminal(stateId)
        ? nameOf(stateId)
        : withBreaks(ast.stateById.get(stateId)?.label ?? stateId)}
    </span>
  );

  const currentChip = (stateId: string) => (
    <div
      key={`now-${stateId}`}
      ref={register(stateId)}
      className="seq-stage__object state-chip"
      data-kind={ast.stateById.get(stateId)?.kind === 'choice' ? 'actor' : 'participant'}
      data-state="sending"
      data-terminal={isTerminal(stateId)}
    >
      {chipBody(stateId)}
    </div>
  );

  /* A past state is a place you can go back to, so it is a control. */
  const pastChip = (entry: { stateId: string; cursor: number }, index: number) => (
    <button
      key={`past-${index}-${entry.stateId}`}
      type="button"
      className="seq-stage__object state-chip"
      data-kind={ast.stateById.get(entry.stateId)?.kind === 'choice' ? 'actor' : 'participant'}
      data-state="resting"
      data-terminal={isTerminal(entry.stateId)}
      title={`Go back to ${nameOf(entry.stateId)}`}
      onClick={() => run.goTo(entry.cursor)}
    >
      {chipBody(entry.stateId)}
    </button>
  );

  const optionChip = (option: (typeof run.options)[number]) => {
    const target = ast.stateById.get(option.to);
    const ends = isTerminal(option.to);
    const leaves = option.from !== current && levelOf(option.to) < boxes.length;

    return (
      <button
        key={option.id}
        ref={register(`option-${option.id}`)}
        className="state-option"
        data-terminal={ends}
        onClick={() => run.take(option.id)}
      >
        {option.label ? (
          <span className="state-option__label">{humaniseLabel(option.label.raw)}</span>
        ) : null}
        {leaves ? <span className="state-option__from">leaves {nameOf(option.from)}</span> : null}
        <span className="seq-stage__name">
          {ends ? nameOf(option.to) : withBreaks(target?.label ?? option.to)}
        </span>
      </button>
    );
  };

  /** Renders the track from the outside in, so the boxes nest around it. */
  const renderLevel = (level: number): ReactNode => {
    const past = trail
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => levelOf(entry.stateId) === level)
      .map(({ entry, index }) => pastChip(entry, index));
    const options = run.options.filter((option) => levelOf(option.to) === level).map(optionChip);

    const inner =
      level === boxes.length ? (
        current ? (
          currentChip(current)
        ) : null
      ) : (
        <section key={boxes[level]!.id} className="state-box" aria-label={boxes[level]!.label}>
          <h4 className="state-box__title">{withBreaks(boxes[level]!.label)}</h4>
          <div className="state-track">{renderLevel(level + 1)}</div>
        </section>
      );

    return (
      <>
        {past}
        {inner}
        {options.length > 0 ? <div className="state-options">{options}</div> : null}
      </>
    );
  };

  return (
    <div className={['archidea-sequence', className].filter(Boolean).join(' ')} style={style}>
      <div className="flex flex-wrap items-center gap-2">
        <button className="seq-btn" onClick={run.prev} disabled={run.current < 0}>
          Back
        </button>
        <button className="seq-btn" onClick={run.reset}>
          Restart
        </button>
        {run.options.length > 0 ? (
          <span className="text-muted-foreground text-xs">Click a transition to take it</span>
        ) : null}
      </div>

      <div className="seq-stage">
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

          {/* Grows rightwards: where we came from, where we are, where we can go. */}
          <div className="state-track state-track--root">{renderLevel(0)}</div>

          {run.options.length === 0 ? (
            <p className="seq-stage__idle">
              {currentIsEnd ? 'This is the end of the run.' : 'Nothing leaves this state.'}
            </p>
          ) : null}
        </div>

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
    </div>
  );
}
