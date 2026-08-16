import type { ReactNode } from 'react';
import { elementCountOf } from '../model/tree';
import type { C4Ast } from '../parser/ast';
import type { C4LinkSet } from '../model/links';
import type { C4Selection } from '../model/selection';
import type { C4Tree } from '../model/tree';

/**
 * Whatever is selected, in words.
 *
 * Docked rather than floating, and empty-stated rather than hidden: a panel
 * that appears on selection shifts the layout out from under the pointer that
 * caused it.
 */
export function C4Detail({
  selection,
  ast,
  tree,
  links,
}: {
  selection: C4Selection | null;
  ast: C4Ast;
  tree: C4Tree;
  links: C4LinkSet;
}) {
  return (
    <aside className="c4-detail" aria-label="Selection details">
      {renderSelection(selection, ast, tree, links)}
    </aside>
  );
}

function renderSelection(
  selection: C4Selection | null,
  ast: C4Ast,
  tree: C4Tree,
  links: C4LinkSet,
): ReactNode {
  if (!selection) {
    return (
      <p className="c4-detail__empty">Select an element, a boundary or a line to see what it is.</p>
    );
  }

  if (selection.kind === 'element') return renderElement(selection.id, tree);
  if (selection.kind === 'boundary') return renderBoundary(selection.id, tree, links);
  if (selection.kind === 'relation') return renderRelation(selection.id, ast, tree);
  return renderLink(selection.id, links, tree);
}

function renderElement(id: string, tree: C4Tree): ReactNode {
  const element = tree.elementById.get(id);
  if (!element) return null;

  return (
    <>
      <h4 className="c4-detail__name">{element.label}</h4>
      <dl className="c4-detail__facts">
        <Fact label="Type" value={element.external ? `${element.kind} (external)` : element.kind} />
        <Fact label="Technology" value={element.technology} />
        <Fact label="Description" value={element.description} />
        <Fact label="Tags" value={element.tags.length ? element.tags.join(', ') : null} />
      </dl>
      {element.link ? (
        <a className="c4-detail__link" href={element.link} rel="noreferrer noopener">
          {element.link}
        </a>
      ) : null}
    </>
  );
}

function renderBoundary(id: string, tree: C4Tree, links: C4LinkSet): ReactNode {
  const boundary = tree.boundaryById.get(id);
  if (!boundary) return null;

  const members = elementCountOf(tree, boundary.id);
  const inside = links.internal.get(boundary.id) ?? 0;

  return (
    <>
      <h4 className="c4-detail__name">{boundary.label}</h4>
      <dl className="c4-detail__facts">
        <Fact label="Type" value={boundary.type} />
        <Fact label="Description" value={boundary.description} />
        <Fact label="Holds" value={`${members} ${members === 1 ? 'element' : 'elements'}`} />
        {/*
         * A relation whose two ends are both inside a shut boundary leaves
         * the arc layer — drawing it as a loop would state a relationship
         * with itself. Saying how many there are is what keeps that honest.
         */}
        <Fact
          label="Inside"
          value={inside ? `${inside} internal ${inside === 1 ? 'relation' : 'relations'}` : null}
        />
      </dl>
    </>
  );
}

function renderRelation(id: string, ast: C4Ast, tree: C4Tree): ReactNode {
  const relation = ast.relations.find((candidate) => candidate.id === id);
  if (!relation) return null;

  return (
    <>
      <h4 className="c4-detail__name">{relation.label || 'Relation'}</h4>
      <dl className="c4-detail__facts">
        <Fact label="From" value={nameOf(relation.from, tree)} />
        <Fact label="To" value={nameOf(relation.to, tree)} />
        <Fact label="Technology" value={relation.technology} />
        <Fact label="Description" value={relation.description} />
      </dl>
    </>
  );
}

function renderLink(id: string, links: C4LinkSet, tree: C4Tree): ReactNode {
  const link = links.byId.get(id);
  if (!link) return null;

  return (
    <>
      <h4 className="c4-detail__name">
        {nameOf(link.a, tree)} ↔ {nameOf(link.b, tree)}
      </h4>
      <dl className="c4-detail__facts">
        <Fact
          label="Carries"
          value={`${link.relations.length} ${link.relations.length === 1 ? 'relation' : 'relations'}`}
        />
      </dl>
    </>
  );
}

function nameOf(id: string, tree: C4Tree): string {
  return tree.elementById.get(id)?.label ?? tree.boundaryById.get(id)?.label ?? id;
}

function Fact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}
