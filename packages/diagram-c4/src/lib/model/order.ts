import type { C4Link } from './links';

/**
 * Orders one boundary's members so related ones sit near each other.
 *
 * A single barycentre pass: each member moves to the mean *declared* position
 * of the members it relates to, ties broken by declaration order. Only
 * relations *within* the set count — a member's link to something outside has
 * no position here to average against, so that member keeps the place its
 * author gave it.
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

  const neighbours = new Map<string, string[]>();
  const addNeighbour = (from: string, to: string): void => {
    const existing = neighbours.get(from);
    if (existing) {
      existing.push(to);
    } else {
      neighbours.set(from, [to]);
    }
  };
  for (const link of links) {
    if (!members.has(link.a) || !members.has(link.b)) continue;
    addNeighbour(link.a, link.b);
    addNeighbour(link.b, link.a);
  }

  const declared = new Map(memberIds.map((id, at) => [id, at]));

  const scored = memberIds.map((id) => {
    const mine = neighbours.get(id) ?? [];
    const sum = mine.reduce((total, other) => total + (declared.get(other) ?? 0), 0);
    return { id, score: mine.length ? sum / mine.length : (declared.get(id) ?? 0) };
  });

  scored.sort((left, right) =>
    left.score === right.score
      ? (declared.get(left.id) ?? 0) - (declared.get(right.id) ?? 0)
      : left.score - right.score,
  );

  return scored.map((entry) => entry.id);
}
