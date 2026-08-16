import { describe, expect, it } from 'vitest';
import { parse } from '../parser/parse';
import { buildTree } from './tree';
import { buildLinks } from './links';

const source = `C4Container
Person(customer, "Customer")
System_Boundary(banking, "Internet Banking System") {
    Container(spa, "SPA", "Angular")
    Container(mobile, "Mobile App", "Kotlin")
    Container(api, "API", "Java")
    ContainerDb(db, "Database", "Oracle")
}
Rel(customer, spa, "views balances")
Rel(customer, mobile, "views balances")
Rel(mobile, customer, "sends push to")
Rel(spa, api, "calls")
Rel(mobile, api, "calls")
Rel(api, db, "reads from")
Rel(api, db, "writes access logs to")`;

const ast = parse(source);
const tree = buildTree(ast);
const open = new Set<string>();

describe('buildLinks — expanded', () => {
  it('merges every relation between the same pair into one line', () => {
    const link = buildLinks(ast, tree, open).links.find((l) => l.id === 'api::db');
    expect(link?.relations).toHaveLength(2);
    expect(link?.forward).toBe(2);
    expect(link?.backward).toBe(0);
  });

  it('merges both directions onto one line, and counts each way', () => {
    const link = buildLinks(ast, tree, open).links.find((l) => l.id === 'customer::mobile');
    expect(link?.relations).toHaveLength(2);
    expect(link?.forward).toBe(1);
    expect(link?.backward).toBe(1);
  });

  it('keys a link by its two ends, sorted, so the pair has one id either way round', () => {
    const ids = buildLinks(ast, tree, open)
      .links.map((link) => link.id)
      .sort();
    expect(ids).toEqual([
      'api::db',
      'api::mobile',
      'api::spa',
      'customer::mobile',
      'customer::spa',
    ]);
  });

  it('counts a BiRel in both directions', () => {
    const bi = parse('C4Context\nSystem(a, "A")\nSystem(b, "B")\nBiRel(a, b, "syncs")');
    const link = buildLinks(bi, buildTree(bi), open).links[0];
    expect([link?.forward, link?.backward]).toEqual([1, 1]);
  });
});

describe('buildLinks — collapsed', () => {
  const collapsed = new Set(['banking']);

  it('re-points a hidden end onto the boundary that hides it', () => {
    const links = buildLinks(ast, tree, collapsed).links;
    const link = links.find((l) => l.id === 'banking::customer');

    expect(link?.relations).toHaveLength(3);
    // customer → spa, customer → mobile run one way; mobile → customer the other.
    expect(link?.forward).toBe(1); // banking → customer
    expect(link?.backward).toBe(2); // customer → banking
  });

  it('takes a relation whose ends both land in the same box off the arc layer', () => {
    const { links, internal } = buildLinks(ast, tree, collapsed);

    expect(links.map((link) => link.id)).toEqual(['banking::customer']);
    // spa→api, mobile→api, api→db twice are all inside now.
    expect(internal.get('banking')).toBe(4);
  });

  it('resolves to the outermost shut boundary', () => {
    const nested = parse(`C4Component
Person(p, "P")
Container_Boundary(outer, "Outer") {
    Container_Boundary(inner, "Inner") {
        Component(c, "C", "Bean")
    }
}
Rel(p, c, "calls")`);

    const links = buildLinks(nested, buildTree(nested), new Set(['inner', 'outer'])).links;
    expect(links[0]?.id).toBe('outer::p');
  });
});

describe('buildLinks — endpoints nothing declared', () => {
  it('drops a relation naming an alias the source never declared', () => {
    const stray = parse('C4Context\nSystem(a, "A")\nRel(a, ghost, "calls")');
    expect(buildLinks(stray, buildTree(stray), open).links).toEqual([]);
  });
});
