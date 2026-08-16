import { Dialog } from '@base-ui/react/dialog';
import type { C4Link } from '../model/links';
import type { C4Relation } from '../parser/ast';
import type { C4Tree } from '../model/tree';

function nameOf(id: string, tree: C4Tree): string {
  return tree.elementById.get(id)?.label ?? tree.boundaryById.get(id)?.label ?? id;
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
  onOpenChange,
  onPick,
}: {
  link: C4Link | null;
  tree: C4Tree;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (relation: C4Relation) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="c4-dialog__backdrop" />
        <Dialog.Popup className="c4-dialog">
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
