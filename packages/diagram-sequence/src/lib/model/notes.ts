import type { Note, SequenceDiagramAst } from '../parser/ast';

/**
 * A note spanning every participant is a phase heading, not an aside.
 *
 * `Note over First,Last: Phase 1 - Submission` is how mermaid diagrams mark
 * sections, and rendering it like an ordinary sticky note buries the one label
 * that tells a reader where they are.
 */
export function isPhaseBanner(note: Note, ast: SequenceDiagramAst): boolean {
  if (note.placement !== 'over' || note.targets.length < 2) return false;

  const order = new Map(ast.participants.map((participant, index) => [participant.id, index]));
  const indices = note.targets
    .map((target) => order.get(target))
    .filter((index): index is number => index !== undefined);

  if (indices.length < 2) return false;

  // It must reach both ends of the cast; anything narrower is a real note.
  return Math.min(...indices) === 0 && Math.max(...indices) === ast.participants.length - 1;
}
