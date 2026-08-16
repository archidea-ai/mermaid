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
});
