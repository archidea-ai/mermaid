import type { C4Link } from './links';

/**
 * Where something outside the set counts, for the member of it that relates
 * to it.
 *
 * A relation leaving the set has no declared position here to average
 * against — the thing on the other end is not one of these members. Rather
 * than drop it, it is projected onto whichever edge of *this* ordering sits
 * nearest the member's own declared spot: index `-1` just before the front,
 * or `last + 1` just past the back. That pulls a member with only outward
 * relations away from wherever its author happened to place it and toward
 * the side of the group it actually faces, instead of leaving it stranded
 * wherever a purely-internal pass would have kept it.
 */
function outwardEdge(position: number, last: number): number {
  return position <= last - position ? -1 : last + 1;
}

/**
 * Orders one boundary's members so related ones sit near each other.
 *
 * A single barycentre pass: each member moves to the mean position of the
 * members it relates to — a real declared position for a neighbour inside the
 * set, or its projected edge (`outwardEdge`) for one outside it — ties broken
 * by declaration order. A member with no relations at all, inside or out,
 * keeps the place its author gave it: there is nothing here to pull it
 * anywhere else.
 *
 * One pass only, and deliberately not iterated. The reference frame here is
 * every member's fixed declared position, never the order a previous pass
 * produced — iterating this a second time would recompute the identical
 * scores from the identical reference and change nothing. A pass that instead
 * read the *evolving* order does not converge on repetition: a pair whose
 * only neighbour is each other swaps fully on one pass and swaps fully back on
 * the next, so an even number of passes lands exactly where it started,
 * undoing the pull the function exists to apply. Anchoring to declaration
 * order avoids that oscillation, and having done so, a second pass is not a
 * refinement — it is a no-op, so there is only one.
 *
 * Pure integer arithmetic over the link set. No measurement and no solver,
 * which is what keeps it testable and its output the same every render.
 */
export function orderMembers(
  memberIds: readonly string[],
  links: readonly C4Link[],
): readonly string[] {
  const members = new Set(memberIds);
  const declared = new Map(memberIds.map((id, at) => [id, at]));
  const last = memberIds.length - 1;

  const neighbours = new Map<string, number[]>();
  const addNeighbour = (from: string, atPosition: number): void => {
    const existing = neighbours.get(from);
    if (existing) {
      existing.push(atPosition);
    } else {
      neighbours.set(from, [atPosition]);
    }
  };

  for (const link of links) {
    const aIn = members.has(link.a);
    const bIn = members.has(link.b);
    if (aIn && bIn) {
      addNeighbour(link.a, declared.get(link.b)!);
      addNeighbour(link.b, declared.get(link.a)!);
    } else if (aIn) {
      // link.b is outside the set: project it onto the edge nearest link.a's
      // own declared spot, rather than discarding the relation.
      addNeighbour(link.a, outwardEdge(declared.get(link.a)!, last));
    } else if (bIn) {
      addNeighbour(link.b, outwardEdge(declared.get(link.b)!, last));
    }
  }

  const scored = memberIds.map((id) => {
    const mine = neighbours.get(id) ?? [];
    const sum = mine.reduce((total, position) => total + position, 0);
    return { id, score: mine.length ? sum / mine.length : (declared.get(id) ?? 0) };
  });

  scored.sort((left, right) =>
    left.score === right.score
      ? (declared.get(left.id) ?? 0) - (declared.get(right.id) ?? 0)
      : left.score - right.score,
  );

  return scored.map((entry) => entry.id);
}
