/**
 * The way back to the whole chart.
 *
 * With every boundary shut on first paint, an expand-all is not chrome — it is
 * how a viewer sees the model they wrote.
 */
import type { ReactNode } from 'react';

export function C4Toolbar({
  onExpandAll,
  onCollapseAll,
  children,
}: {
  onExpandAll: () => void;
  onCollapseAll: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="c4-toolbar">
      <button type="button" className="c4-toolbar__button" onClick={onExpandAll}>
        Expand all
      </button>
      <button type="button" className="c4-toolbar__button" onClick={onCollapseAll}>
        Collapse all
      </button>
      {children}
    </div>
  );
}

/**
 * The transport for a numbered run.
 *
 * A static C4 chart is a map, not a run: `count` is 0 for one, and the
 * transport says "No run" and disables both buttons rather than hiding
 * itself — controls the active renderer cannot support are disabled and
 * visible, never hidden.
 */
export function C4Transport({
  current,
  count,
  onPrev,
  onNext,
}: {
  current: number;
  count: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="c4-transport">
      <button
        type="button"
        className="c4-toolbar__button"
        aria-label="Previous step"
        disabled={current < 0}
        onClick={onPrev}
      >
        ◀
      </button>
      <span className="c4-transport__where">
        {/*
         * A static chart is a map, so the transport says so rather than
         * showing a step count it does not have — disabled and visible, never
         * hidden.
         */}
        {count ? (current < 0 ? `${count} steps` : `Step ${current + 1} of ${count}`) : 'No run'}
      </span>
      <button
        type="button"
        className="c4-toolbar__button"
        aria-label="Next step"
        disabled={current >= count - 1}
        onClick={onNext}
      >
        ▶
      </button>
    </div>
  );
}
