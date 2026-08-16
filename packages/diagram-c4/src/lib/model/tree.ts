import type { C4Ast, C4Boundary, C4Element } from '../parser/ast';

export interface C4Box {
  readonly id: string;
  readonly kind: 'element' | 'boundary';
  readonly parent: string | null;
  readonly children: readonly string[];
}

export interface C4Tree {
  readonly boxes: ReadonlyMap<string, C4Box>;
  /** Boxes with no parent, in declaration order. */
  readonly roots: readonly string[];
  readonly elementById: ReadonlyMap<string, C4Element>;
  readonly boundaryById: ReadonlyMap<string, C4Boundary>;
}

/**
 * The containment forest, which is the only structure the chart is laid out
 * from. Everything else — what a collapse hides, which link a relation joins,
 * what a boundary says it holds — is a walk over this.
 */
export function buildTree(ast: C4Ast): C4Tree {
  const boxes = new Map<
    string,
    { id: string; kind: 'element' | 'boundary'; parent: string | null; children: string[] }
  >();
  const elementById = new Map<string, C4Element>();
  const boundaryById = new Map<string, C4Boundary>();

  /*
   * Elements first, then boundaries, both in declaration order. Members are
   * reordered by the barycentre pass before they are drawn, so this only fixes
   * the tie-break — and a boundary reading after its sibling elements is a
   * steadier default than one with boundaries mixed among elements.
   * When a duplicate id appears (same kind), the first declaration is kept and
   * linked; subsequent declarations with the same id are skipped.
   */
  const declared: { id: string; kind: 'element' | 'boundary'; parent: string | null }[] = [
    ...ast.elements.map((element) => ({
      id: element.id,
      kind: 'element' as const,
      parent: element.parent,
    })),
    ...ast.boundaries.map((boundary) => ({
      id: boundary.id,
      kind: 'boundary' as const,
      parent: boundary.parent,
    })),
  ];

  for (const entry of declared) {
    if (!entry.id || boxes.has(entry.id)) continue;
    boxes.set(entry.id, { ...entry, children: [] });
  }

  // Build source record maps, only including the first occurrence of each id
  const seenElementIds = new Set<string>();
  for (const element of ast.elements) {
    if (element.id && !seenElementIds.has(element.id)) {
      seenElementIds.add(element.id);
      elementById.set(element.id, element);
    }
  }

  const seenBoundaryIds = new Set<string>();
  for (const boundary of ast.boundaries) {
    if (boundary.id && !seenBoundaryIds.has(boundary.id)) {
      seenBoundaryIds.add(boundary.id);
      boundaryById.set(boundary.id, boundary);
    }
  }

  const roots: string[] = [];
  const linked = new Set<string>();
  for (const entry of declared) {
    if (linked.has(entry.id)) continue;
    const box = boxes.get(entry.id);
    if (!box || box.kind !== entry.kind) continue;
    linked.add(entry.id);
    const parent = box.parent ? boxes.get(box.parent) : null;
    if (parent) parent.children.push(box.id);
    else roots.push(box.id);
  }

  return {
    boxes,
    roots,
    elementById,
    boundaryById,
  };
}

/** Enclosing boxes, innermost first. The box itself is not among them. */
export function ancestorsOf(tree: C4Tree, id: string): readonly string[] {
  const chain: string[] = [];
  const seen = new Set<string>([id]);

  let current = tree.boxes.get(id)?.parent ?? null;
  while (current && !seen.has(current)) {
    chain.push(current);
    seen.add(current);
    current = tree.boxes.get(current)?.parent ?? null;
  }

  return chain;
}

export function descendantsOf(tree: C4Tree, id: string): readonly string[] {
  const out: string[] = [];
  const queue = [...(tree.boxes.get(id)?.children ?? [])];

  while (queue.length) {
    const next = queue.shift()!;
    out.push(next);
    queue.push(...(tree.boxes.get(next)?.children ?? []));
  }

  return out;
}

/** How many elements a boundary holds, at any depth. A boundary is not one. */
export function elementCountOf(tree: C4Tree, id: string): number {
  return descendantsOf(tree, id).filter((child) => tree.boxes.get(child)?.kind === 'element')
    .length;
}
