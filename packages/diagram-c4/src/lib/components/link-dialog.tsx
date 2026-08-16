import { Dialog } from '@base-ui/react/dialog';
import type { CSSProperties } from 'react';
import type { C4Link } from '../model/links';
import type { C4Relation } from '../parser/ast';
import type { C4Tree } from '../model/tree';

function nameOf(id: string, tree: C4Tree): string {
  return tree.elementById.get(id)?.label ?? tree.boundaryById.get(id)?.label ?? id;
}

/**
 * The host's theme, and nothing else it happened to put on the root.
 *
 * A theme override is inline custom properties on the renderer root — that is
 * the documented mechanism, because an ancestor cannot beat the root's own
 * class rule. The portal breaks the inheritance that carries them, so they are
 * copied across by hand. Only the `--*` declarations: a width or a height the
 * host set for its diagram means nothing to a centred modal.
 */
function themeOf(style: CSSProperties | undefined): CSSProperties {
  if (!style) return {};
  return Object.fromEntries(
    Object.entries(style).filter(([property]) => property.startsWith('--')),
  ) as CSSProperties;
}

/**
 * What one aggregated line stands for.
 *
 * Picking a relation closes this and reveals it on the chart, rather than
 * showing the detail here: you cannot read a chart through a modal that covers
 * it, and the reveal is the point of picking.
 */
export function C4LinkDialog({
  link,
  tree,
  open,
  style,
  onOpenChange,
  onPick,
}: {
  link: C4Link | null;
  tree: C4Tree;
  open: boolean;
  /** The chart root's own style, so the portal carries the host's theme. */
  style?: CSSProperties;
  onOpenChange: (open: boolean) => void;
  onPick: (relation: C4Relation) => void;
}) {
  const theme = themeOf(style);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {/*
       * The portal appends to <body>, outside the chart root — so both halves
       * wear `archidea-sequence` themselves. Every --seq-* token is declared
       * on that class and nothing else, and a portalled element that does not
       * carry it renders with no background, no border and the host page's
       * font: exactly the "renders unstyled" failure the house rules name.
       */}
      <Dialog.Portal>
        <Dialog.Backdrop className="archidea-sequence c4-dialog__backdrop" style={theme} />
        <Dialog.Popup className="archidea-sequence c4-dialog" style={theme}>
          <Dialog.Title className="c4-dialog__title">
            {link ? `${nameOf(link.a, tree)} ↔ ${nameOf(link.b, tree)}` : ''}
          </Dialog.Title>
          <Dialog.Description className="c4-dialog__lead">
            {link?.relations.length ?? 0} relations. Pick one to see it on the chart.
          </Dialog.Description>

          <ul className="c4-dialog__list">
            {(link?.relations ?? []).map((relation) => (
              <li key={relation.id}>
                <button
                  type="button"
                  className="c4-dialog__relation"
                  onClick={() => onPick(relation)}
                >
                  <span className="c4-dialog__ends">
                    {nameOf(relation.from, tree)} {relation.bidirectional ? '↔' : '→'}{' '}
                    {nameOf(relation.to, tree)}
                  </span>
                  <span className="c4-dialog__label">{relation.label}</span>
                  {relation.technology ? (
                    <span className="c4-dialog__tech">{relation.technology}</span>
                  ) : null}
                  {relation.description ? (
                    <span className="c4-dialog__descr">{relation.description}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>

          <Dialog.Close className="c4-dialog__close">Close</Dialog.Close>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
