import { describe, expect, it } from 'vitest';
import { parse } from '../parser/parse';
import { buildTree } from './tree';
import { buildLinks } from './links';
import { computeLit } from './selection';

const ast = parse(`C4Context
System(a, "A")
System(b, "B")
System(c, "C")
System(d, "D")
Rel(a, b, "one")
Rel(a, b, "two")
Rel(b, c, "three")
Rel(c, d, "four")`);

const links = buildLinks(ast, buildTree(ast), new Set());

describe('computeLit', () => {
  it('lights nothing when nothing is chosen', () => {
    const lit = computeLit(null, links);
    expect([lit.boxes.size, lit.links.size, lit.relations.size]).toEqual([0, 0, 0]);
  });

  it('lights a chosen box, its first-degree neighbours, and the links between', () => {
    const lit = computeLit({ kind: 'element', id: 'b' }, links);

    expect([...lit.boxes].sort()).toEqual(['a', 'b', 'c']);
    expect([...lit.links].sort()).toEqual(['a::b', 'b::c']);
  });

  it('stops at one step — widening it lights the whole chart back up', () => {
    expect(computeLit({ kind: 'element', id: 'b' }, links).boxes.has('d')).toBe(false);
  });

  it('leaves a link between two neighbours dark, since it is not about the choice', () => {
    expect(computeLit({ kind: 'element', id: 'b' }, links).links.has('c::d')).toBe(false);
  });

  it('lights a chosen link and its two ends, and no single relation', () => {
    const lit = computeLit({ kind: 'link', id: 'a::b' }, links);

    expect([...lit.boxes].sort()).toEqual(['a', 'b']);
    expect([...lit.links]).toEqual(['a::b']);
    expect(lit.relations.size).toBe(0);
  });

  it('lights one relation, the line carrying it, and both its ends', () => {
    const relation = ast.relations[1]!; // the second a → b
    const lit = computeLit({ kind: 'relation', id: relation.id }, links);

    expect([...lit.boxes].sort()).toEqual(['a', 'b']);
    expect([...lit.links]).toEqual(['a::b']);
    expect([...lit.relations]).toEqual([relation.id]);
  });

  it('lights nothing for an id the link set does not know', () => {
    expect(computeLit({ kind: 'link', id: 'x::y' }, links).boxes.size).toBe(0);
  });
});
