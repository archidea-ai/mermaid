import { describe, expect, it } from 'vitest';
import { orderMembers } from './order';
import type { C4Link } from './links';

const link = (a: string, b: string): C4Link => ({
  id: `${a}::${b}`,
  a,
  b,
  relations: [],
  forward: 1,
  backward: 0,
});

describe('orderMembers', () => {
  it('keeps declaration order when nothing relates', () => {
    expect(orderMembers(['a', 'b', 'c'], [])).toEqual(['a', 'b', 'c']);
  });

  it('pulls a member towards the ones it relates to', () => {
    // d sits last but only touches a, which is first.
    const ordered = orderMembers(['a', 'b', 'c', 'd'], [link('a', 'd')]);
    expect(ordered.indexOf('d')).toBeLessThan(ordered.indexOf('c'));
  });

  it('ignores a link to something outside the set — it has no position here', () => {
    expect(orderMembers(['a', 'b'], [link('a', 'faraway')])).toEqual(['a', 'b']);
  });

  it('is stable: the same input gives the same order every time', () => {
    const links = [link('a', 'c'), link('b', 'd'), link('a', 'd')];
    const once = orderMembers(['a', 'b', 'c', 'd'], links);
    expect(orderMembers(['a', 'b', 'c', 'd'], links)).toEqual(once);
  });

  it('breaks a tie by declaration order rather than by chance', () => {
    // b and c are both unrelated, so both keep their barycentre; b was first.
    const ordered = orderMembers(['b', 'c'], []);
    expect(ordered).toEqual(['b', 'c']);
  });

  it('never drops or duplicates a member', () => {
    const members = ['a', 'b', 'c', 'd', 'e'];
    const ordered = orderMembers(members, [link('e', 'a'), link('d', 'b')]);
    expect([...ordered].sort()).toEqual([...members].sort());
  });

  it('does not oscillate: a second, evolving-reference pass must not undo the pull', () => {
    // a and b are each other's only neighbour, so the one legitimate pass
    // swaps them — that is the same pull the four-member test above exercises,
    // just with nothing sitting between the two ends to hide it. A second pass
    // that re-read the *previous pass's* order (instead of declared order)
    // would swap them right back to ['a', 'b']; anchoring to declared order
    // stops there, at the one true swap.
    expect(orderMembers(['a', 'b'], [link('a', 'b')])).toEqual(['b', 'a']);
  });

  it('pulls a member with only an outward relation toward the near edge, rather than leaving it where it was declared', () => {
    // b is declared second of four, closer to the front than the back, so its
    // one relation — to something outside the set entirely — projects onto
    // the front edge and pulls it ahead of a, which has no relation to pull it
    // anywhere at all.
    expect(orderMembers(['a', 'b', 'c', 'd'], [link('b', 'far-away')])).toEqual([
      'b',
      'a',
      'c',
      'd',
    ]);
  });

  it('pulls a member with only an outward relation toward the back edge when that is nearer', () => {
    // c is declared third of four, closer to the back, so the same kind of
    // outward relation projects onto the back edge instead and pulls it past
    // d, which — like a above — has nothing pulling it anywhere.
    expect(orderMembers(['a', 'b', 'c', 'd'], [link('c', 'far-away')])).toEqual([
      'a',
      'b',
      'd',
      'c',
    ]);
  });

  it('places a member with both an inside and an outside relation sensibly relative to both', () => {
    // b relates to a (a real, internal position) and to something outside the
    // set (projected onto the near edge). Both count, so b's score is the
    // mean of two positions rather than either alone — the mean divisor here
    // is 2, not the 1 every other case in this file exercises — and it lands
    // ahead of a, which is pulled only toward b in return.
    const ordered = orderMembers(['a', 'b', 'c'], [link('b', 'a'), link('b', 'far-away')]);
    expect(ordered).toEqual(['b', 'a', 'c']);
  });

  it('is stable across repeated calls once outward relations are in play', () => {
    const links = [link('b', 'far-away'), link('c', 'elsewhere')];
    const once = orderMembers(['a', 'b', 'c', 'd'], links);
    expect(orderMembers(['a', 'b', 'c', 'd'], links)).toEqual(once);
  });
});
