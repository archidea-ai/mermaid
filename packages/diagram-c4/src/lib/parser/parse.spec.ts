import { describe, expect, it } from 'vitest';
import { parse } from './parse';
import { C4ParseError } from './parse';

describe('parse — the header', () => {
  it('reads each of the five C4 headers', () => {
    expect(parse('C4Context').kind).toBe('context');
    expect(parse('C4Container').kind).toBe('container');
    expect(parse('C4Component').kind).toBe('component');
    expect(parse('C4Dynamic').kind).toBe('dynamic');
    expect(parse('C4Deployment').kind).toBe('deployment');
  });

  it('reads the title, quoted or bare', () => {
    expect(parse('C4Context\n    title Big Bank plc').title).toBe('Big Bank plc');
    expect(parse('C4Context\n    title "Big Bank plc"').title).toBe('Big Bank plc');
  });

  it('has no title when none was given', () => {
    expect(parse('C4Context').title).toBeNull();
  });

  it('skips blank lines and %% comments before the header', () => {
    expect(parse('\n%% a note to the reader\nC4Context').kind).toBe('context');
  });

  it('refuses a source that is not C4 at all, so the proxy can take it', () => {
    expect(() => parse('sequenceDiagram\n  A->>B: hi')).toThrow(C4ParseError);
  });

  it('refuses an empty source', () => {
    expect(() => parse('   \n\n')).toThrow(C4ParseError);
  });
});

describe('parse — elements', () => {
  it('reads a person, a system and their descriptions', () => {
    const ast = parse(`C4Context
    Person(customer, "Banking Customer", "A customer of the bank.")
    System(banking, "Internet Banking System", "Lets customers view balances.")`);

    expect(ast.elements).toEqual([
      expect.objectContaining({
        id: 'customer',
        kind: 'person',
        label: 'Banking Customer',
        description: 'A customer of the bank.',
        technology: null,
        external: false,
        variant: 'plain',
      }),
      expect.objectContaining({ id: 'banking', kind: 'system', label: 'Internet Banking System' }),
    ]);
  });

  it('reads technology from the third positional arg of a container or component', () => {
    const ast = parse(`C4Container
    Container(api, "API Application", "Java, Spring MVC", "Provides banking functionality.")`);

    expect(ast.elements[0]).toMatchObject({
      kind: 'container',
      technology: 'Java, Spring MVC',
      description: 'Provides banking functionality.',
    });
  });

  it('reads the Db and Queue variants, and the _Ext suffix', () => {
    const ast = parse(`C4Container
    ContainerDb(db, "Database", "Oracle 19c")
    ContainerQueue(bus, "Event Bus", "Kafka")
    System_Ext(email, "E-mail System")
    SystemDb_Ext(warehouse, "Warehouse")`);

    expect(ast.elements.map((e) => [e.id, e.variant, e.external])).toEqual([
      ['db', 'db', false],
      ['bus', 'queue', false],
      ['email', 'plain', true],
      ['warehouse', 'db', true],
    ]);
  });

  it('accepts named args in any order, and lets them beat a positional', () => {
    const ast = parse(`C4Container
    Container(api, "API", "Java", $descr="Serves the app", $tags="core,owned", $link="https://x.test")
    Container(spa, "SPA", "Angular", "positional", $descr="named wins")`);

    expect(ast.elements[0]).toMatchObject({
      description: 'Serves the app',
      tags: ['core', 'owned'],
      link: 'https://x.test',
    });
    expect(ast.elements[1]?.description).toBe('named wins');
  });

  it('turns a literal \\n inside a label into a line break', () => {
    const ast = parse('C4Context\n    System(a, "Two\\nLines")');
    expect(ast.elements[0]?.label).toBe('Two\nLines');
  });

  it('keeps a comma that sits inside a quoted arg', () => {
    const ast = parse('C4Container\n    Container(api, "API", "Java, Spring, Boot")');
    expect(ast.elements[0]?.technology).toBe('Java, Spring, Boot');
  });

  it('refuses a macro it does not know, so the proxy can take the whole diagram', () => {
    expect(() => parse('C4Context\n    Sprite(a, "b")')).toThrow(C4ParseError);
  });

  it('refuses an unterminated quote instead of keeping the stray quote in the value', () => {
    expect(() => parse('C4Context\n    System(a, "b, c)')).toThrow(C4ParseError);
  });
});

describe('parse — boundaries', () => {
  it('reads a boundary and gives its members a parent', () => {
    const ast = parse(`C4Container
    Person(customer, "Customer")
    System_Boundary(banking, "Internet Banking System") {
        Container(spa, "SPA", "Angular")
        Container(api, "API", "Java")
    }`);

    expect(ast.boundaries).toEqual([
      expect.objectContaining({ id: 'banking', label: 'Internet Banking System', type: 'System' }),
    ]);
    expect(ast.elements.map((e) => [e.id, e.parent])).toEqual([
      ['customer', null],
      ['spa', 'banking'],
      ['api', 'banking'],
    ]);
  });

  it('nests a boundary inside a boundary', () => {
    const ast = parse(`C4Component
    Container_Boundary(api, "API Application") {
        Component(signin, "Sign In Controller", "Spring MVC")
        Container_Boundary(services, "Domain Services") {
            Component(security, "Security Component", "Spring Bean")
        }
    }`);

    expect(ast.boundaries.map((b) => [b.id, b.parent])).toEqual([
      ['api', null],
      ['services', 'api'],
    ]);
    expect(ast.elements.map((e) => [e.id, e.parent])).toEqual([
      ['signin', 'api'],
      ['security', 'services'],
    ]);
  });

  it('reads every boundary macro, and the generic one takes its type from an argument', () => {
    const ast = parse(`C4Context
    Enterprise_Boundary(bank, "Big Bank plc") { }
    Boundary(region, "EU", "Region") { }`);

    expect(ast.boundaries.map((b) => [b.id, b.type, b.isNode])).toEqual([
      ['bank', 'Enterprise', false],
      ['region', 'Region', false],
    ]);
  });

  it('treats a deployment node as a boundary that is also a box', () => {
    const ast = parse(`C4Deployment
    Deployment_Node(dc, "Big Bank plc", "Data centre", "The primary site") {
        Node(host, "bigbank-api01", "Ubuntu 20.04") {
            Container(api, "API", "Java")
        }
    }`);

    expect(ast.boundaries.map((b) => [b.id, b.isNode, b.type, b.description])).toEqual([
      ['dc', true, 'Data centre', 'The primary site'],
      ['host', true, 'Ubuntu 20.04', null],
    ]);
    expect(ast.elements[0]?.parent).toBe('host');
  });

  it('accepts a brace on its own line', () => {
    const ast = parse(`C4Context
    System_Boundary(b, "B")
    {
        System(s, "S")
    }`);

    expect(ast.elements[0]?.parent).toBe('b');
  });

  it('refuses a closing brace that closes nothing', () => {
    expect(() => parse('C4Context\n    System(a, "A")\n}')).toThrow(C4ParseError);
  });

  it('refuses a boundary left open at the end of the source', () => {
    expect(() => parse('C4Context\n    System_Boundary(b, "B") {\n    System(a, "A")')).toThrow(
      C4ParseError,
    );
  });

  it('refuses an element that opens a block, instead of silently discarding the brace', () => {
    expect(() => parse('C4Context\n    Person(customer, "Customer") {')).toThrow(C4ParseError);
  });

  it('does not miscount a legitimately empty-id boundary as an unmatched brace', () => {
    const ast = parse(`C4Context
    System_Boundary(outer, "Outer") {
        System_Boundary(, "Inner") {
            System(a, "A")
        }
    }`);

    expect(ast.boundaries.map((b) => b.id)).toEqual(['outer', '']);
    expect(ast.elements[0]?.parent).toBe('');
  });
});

describe('parse — relations', () => {
  it('reads a relation with its label and technology', () => {
    const ast = parse(`C4Container
    Container(spa, "SPA", "Angular")
    Container(api, "API", "Java")
    Rel(spa, api, "Makes API calls to", "JSON/HTTPS")`);

    expect(ast.relations[0]).toMatchObject({
      from: 'spa',
      to: 'api',
      label: 'Makes API calls to',
      technology: 'JSON/HTTPS',
      bidirectional: false,
      hint: null,
    });
  });

  it('gives every relation an id derived from its source line, not its array index', () => {
    // A blank line before the second Rel, so the two ids differ by two rather
    // than by one: an index-derived id would read rel-1/rel-2 whatever the
    // source looked like, and the literal shape is what says which it is.
    const ast = parse('C4Context\nRel(a, b, "x")\n\nRel(a, b, "y")');

    expect(ast.relations.map((relation) => relation.id)).toEqual(['rel-2-0', 'rel-4-1']);
  });

  it('reads BiRel as bidirectional', () => {
    expect(parse('C4Context\nBiRel(a, b, "syncs with")').relations[0]?.bidirectional).toBe(true);
  });

  it('swaps the ends of Rel_Back, because the arrow points the other way', () => {
    const back = parse('C4Context\nRel_Back(a, b, "feeds")').relations[0];
    expect([back?.from, back?.to]).toEqual(['b', 'a']);
  });

  it('records a direction suffix as a hint and keeps the ends as written', () => {
    const ast = parse(`C4Context
    Rel_U(a, b, "up")
    Rel_Down(c, d, "down")
    Rel_L(e, f, "left")
    Rel_R(g, h, "right")`);

    expect(ast.relations.map((r) => [r.from, r.to, r.hint])).toEqual([
      ['a', 'b', 'up'],
      ['c', 'd', 'down'],
      ['e', 'f', 'left'],
      ['g', 'h', 'right'],
    ]);
  });

  it('numbers a dynamic diagram by declaration order, and honours RelIndex', () => {
    const dynamic = parse(`C4Dynamic
    Rel(a, b, "first")
    RelIndex(7, b, c, "seventh")
    Rel(c, d, "third")`);

    expect(dynamic.relations.map((r) => [r.label, r.index])).toEqual([
      ['first', 1],
      ['seventh', 7],
      ['third', 3],
    ]);
  });

  it('leaves index null outside a dynamic diagram', () => {
    expect(parse('C4Context\nRel(a, b, "x")').relations[0]?.index).toBeNull();
  });

  it('reads a description from the fifth positional arg or a named one', () => {
    const ast = parse(`C4Container
    Rel(a, b, "calls", "HTTPS", "Only on the happy path")
    Rel(c, d, "calls", "HTTPS", $descr="Named instead")`);

    expect(ast.relations.map((r) => r.description)).toEqual([
      'Only on the happy path',
      'Named instead',
    ]);
  });
});

describe('parse — style directives', () => {
  it('applies an element style as author-declared colour', () => {
    const ast = parse(`C4Context
    Person(customer, "Customer")
    UpdateElementStyle(customer, $bgColor="#1168bd", $fontColor="#ffffff")`);

    expect(ast.elements[0]?.style).toEqual({
      background: '#1168bd',
      border: null,
      text: '#ffffff',
    });
  });

  it('applies a relation style to every relation between the named pair', () => {
    const ast = parse(`C4Context
    Rel(a, b, "one")
    Rel(a, b, "two")
    Rel(b, c, "three")
    UpdateRelStyle(a, b, $lineColor="#ff0000")`);

    expect(ast.relations.map((r) => r.style?.border ?? null)).toEqual(['#ff0000', '#ff0000', null]);
  });

  it('applies a boundary style', () => {
    const ast = parse(`C4Context
    System_Boundary(b, "B") { }
    UpdateBoundaryStyle(b, $borderColor="#00ff00")`);

    expect(ast.boundaries[0]?.style?.border).toBe('#00ff00');
  });

  it('records UpdateLayoutConfig as ignored — it configures a solver we do not run', () => {
    const ast = parse('C4Context\nUpdateLayoutConfig($c4ShapeInRow="3")');
    expect(ast.ignored).toEqual([{ text: 'UpdateLayoutConfig($c4ShapeInRow="3")', line: 2 }]);
    expect(ast.relations).toEqual([]);
  });
});
