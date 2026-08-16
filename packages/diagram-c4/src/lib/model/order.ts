import type { C4Link } from './links';

const PASSES = 2;

/**
 * Orders one boundary's members so related ones sit near each other.
 *
 * A barycentre pass: a member moves to the mean position of the members it
 * relates to, twice, with declaration order breaking every tie. Only relations
 * *within* the set count — a member's link to something outside has no position
 * here to average against, so that member keeps the place its author gave it.
 *
 * A neighbour's contribution is always its *declared* position, never its
 * position after a previous pass. Feeding a pass's own output back in lets a
 * pair whose only neighbour is each other swap fully on one pass and swap
 * fully back on the next — an even number of passes then lands exactly where
 * it started, undoing the pull the function exists to apply. Anchoring every
 * pass to declaration order keeps the result stable instead.
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
  let order = [...memberIds];

  for (let pass = 0; pass < PASSES; pass += 1) {
    const scored = order.map((id) => {
      const mine = neighbours.get(id) ?? [];
      const sum = mine.reduce((total, other) => total + (declared.get(other) ?? 0), 0);
      return { id, score: mine.length ? sum / mine.length : (declared.get(id) ?? 0) };
    });

    scored.sort((left, right) =>
      left.score === right.score
        ? (declared.get(left.id) ?? 0) - (declared.get(right.id) ?? 0)
        : left.score - right.score,
    );

    order = scored.map((entry) => entry.id);
  }

  return order;
}
