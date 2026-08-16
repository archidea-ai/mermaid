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
