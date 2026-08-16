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
