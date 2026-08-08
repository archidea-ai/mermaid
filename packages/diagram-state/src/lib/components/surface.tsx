import { Fragment, useEffect, useMemo, useState } from 'react';
import { proxyRenderer } from '@archidea-ai/mermaid-core';
import {
  RichLabel,
  ToggleGroup,
  ToggleGroupItem,
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
import { buildTrack } from '../model/track';
import { defaultActive } from '../model/overview';
import { StateOverview } from './overview';
import { StateNote } from './note';
import type { StateDiagramAst, StateNode } from '../parser/ast';
import type { TrackEntry, TrackRun } from '../model/track';
import type { ReactNode } from 'react';

/**
 * The renderer's Component.
 *
 * Same shape as the sequence surface: parse, and fall back to the proxy if we
 * cannot — so this package never renders worse than upstream.
 */
/** Two ways to read the same machine: one run through it, or the map around it. */
export type StateView = 'journey' | 'overview';

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
  const [view, setView] = useState<StateView>('journey');
  const [active, setActive] = useState<string | null>(() => defaultActive(ast));
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
      // No `via` at all: nothing led to the state the run began at.
      { stateId: walked[0]!.from, cursor: -1 },
      ...walked.slice(0, -1).map((step, index) => ({
        stateId: step.to,
        cursor: index,
        via: step.transition.label,
      })),
    ];
  }, [run.timeline, run.current]);

  /* The walk, grouped into contiguous runs that share a container chain. */
  const runs = useMemo(() => {
    const built = buildTrack(ast, trail, current);
    if (current === null || built.length === 0) return built;

    // The current entry's inbound transition is the step the cursor sits on.
    const step = run.timeline.steps[run.current];
    if (!step) return built;

    const last = built[built.length - 1]!;
    const entries = [...last.entries];
    entries[entries.length - 1] = { ...entries[entries.length - 1]!, via: step.transition.label };
    return [...built.slice(0, -1), { ...last, entries }];
  }, [ast, trail, current, run.timeline, run.current]);

  /** The line between two chips, carrying the transition it stands for. */
  const link = (entry: TrackEntry, key: string) =>
    entry.via === undefined ? null : (
      <span className="state-link" key={key} data-labelled={entry.via !== null}>
        {entry.via !== null ? (
          <span className="state-link__label">
            <RichLabel text={entry.via} values={run.bindings} />
          </span>
        ) : null}
      </span>
    );

  const lines = useMemo(() => {
    const from = current ? anchors.get(current) : undefined;
    if (!from) return [];

    return run.options.flatMap((option) => {
      const to = anchors.get(`option-${option.id}`);
      if (!to) return [];
      return [{ option, arc: computeArc(from, to, { bow: 0.12 }) }];
    });
  }, [run.options, anchors, current]);

  const chipBody = (stateId: string, now = false) => (
    <>
      <span className="seq-stage__name">
        {isTerminal(stateId)
          ? nameOf(stateId)
          : withBreaks(ast.stateById.get(stateId)?.label ?? stateId)}
      </span>
      {/* Only where the run stands: a note is about being here. */}
      {now ? <StateNote ast={ast} stateId={stateId} values={run.bindings} /> : null}
    </>
  );

  const chipKind = (stateId: string) =>
    ast.stateById.get(stateId)?.kind === 'choice' ? 'actor' : 'participant';

  const entryChip = (entry: TrackEntry, index: number) =>
    entry.cursor === null ? (
      <div
        key={`now-${entry.stateId}`}
        ref={register(entry.stateId)}
        className="seq-stage__object state-chip"
        data-kind={chipKind(entry.stateId)}
        data-state="sending"
        data-terminal={isTerminal(entry.stateId)}
      >
        {chipBody(entry.stateId, true)}
      </div>
    ) : (
      /* A past state is somewhere you can return to, so it is a control. */
      <button
        key={`past-${index}-${entry.stateId}`}
        type="button"
        className="seq-stage__object state-chip"
        data-kind={chipKind(entry.stateId)}
        data-state="resting"
        data-terminal={isTerminal(entry.stateId)}
        title={`Go back to ${nameOf(entry.stateId)}`}
        onClick={() => run.goTo(entry.cursor!)}
      >
        {chipBody(entry.stateId)}
      </button>
    );

  const optionChip = (option: (typeof run.options)[number], containers: readonly StateNode[]) => {
    const target = ast.stateById.get(option.to);
    const ends = isTerminal(option.to);
    const leaves =
      option.from !== current && depthWithin(ast, option.to, containers) < containers.length;

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

  /**
   * Renders one run, nesting its own boxes around its own entries.
   *
   * Only the last run carries the ways out, and each is placed at the level that
   * still holds its target — so an escape is drawn outside the box it leaves.
   */
  const renderRun = (track: TrackRun, isLast: boolean, level = 0): ReactNode => {
    const options = isLast
      ? run.options.filter((option) => depthWithin(ast, option.to, track.containers) === level)
      : [];

    const inner =
      level === track.containers.length ? (
        track.entries.flatMap((entry, index) =>
          // The first entry of a run is joined from outside its box, at track
          // level, so the line is not drawn inside the container it enters.
          index === 0
            ? [entryChip(entry, index)]
            : [link(entry, `link-${track.key}-${index}`), entryChip(entry, index)],
        )
      ) : (
        <section
          key={track.containers[level]!.id}
          className="state-box"
          aria-label={track.containers[level]!.label}
        >
          <h4 className="state-box__title">{withBreaks(track.containers[level]!.label)}</h4>
          <div className="state-track">{renderRun(track, isLast, level + 1)}</div>
        </section>
      );

    return (
      <>
        {inner}
        {options.length > 0 ? (
          <div className="state-options">
            {options.map((option) => optionChip(option, track.containers))}
          </div>
        ) : null}
      </>
    );
  };

  return (
    <div className={['archidea-sequence', className].filter(Boolean).join(' ')} style={style}>
      <div className="flex flex-wrap items-center gap-2">
        {view === 'journey' ? (
          <>
            <button className="seq-btn" onClick={run.prev} disabled={run.current < 0}>
              Back
            </button>
            <button className="seq-btn" onClick={run.reset}>
              Restart
            </button>
          </>
        ) : null}
        {view === 'journey' && run.options.length > 0 ? (
          <span className="text-muted-foreground text-xs">Click a transition to take it</span>
        ) : null}
        {view === 'overview' ? (
          <span className="text-muted-foreground text-xs">Click a state to centre on it</span>
        ) : null}

        <ToggleGroup
          className="ms-auto shrink-0"
          variant="outline"
          size="sm"
          value={[view]}
          aria-label="Diagram view"
          onValueChange={(value: string[]) => {
            if (value[0]) setView(value[0] as StateView);
          }}
        >
          <ToggleGroupItem value="journey" aria-label="Interactive journey">
            Interactive journey
          </ToggleGroupItem>
          <ToggleGroupItem value="overview" aria-label="Overview">
            Overview
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="seq-stage">
        {view === 'overview' ? (
          <div className="state-view">
            <StateOverview ast={ast} active={active} onActivate={setActive} />
          </div>
        ) : (
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
            <div className="state-track state-track--root">
              {runs.map((track, index) => (
                <Fragment key={track.key}>
                  {index > 0 ? link(track.entries[0]!, `enter-${track.key}`) : null}
                  {renderRun(track, index === runs.length - 1)}
                </Fragment>
              ))}
            </div>

            {run.options.length === 0 ? (
              <p className="seq-stage__idle">
                {currentIsEnd ? 'This is the end of the run.' : 'Nothing leaves this state.'}
              </p>
            ) : null}
          </div>
        )}

        {view === 'journey' && boxes.length > 0 ? (
          <p className="seq-stage__context">
            {boxes.map((box: StateNode) => (
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
