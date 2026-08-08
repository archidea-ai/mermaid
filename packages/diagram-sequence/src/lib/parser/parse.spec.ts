import { describe, expect, it } from 'vitest';
import { parse } from './parse';
import { preprocess } from './preprocess';
import { parseRichText } from '@archidea-ai/mermaid-scenario';
import { SequenceParseError } from './errors';
import type { Fragment, Message, Note } from './ast';

const ids = (statements: readonly { type: string }[]) => statements.map((s) => s.type);

describe('preprocess', () => {
  it('strips frontmatter and parses it', () => {
    const { frontmatter, lines } = preprocess(
      '---\ntitle: Login\nautonumber: true\n---\nsequenceDiagram',
    );

    expect(frontmatter).toEqual({ title: 'Login', autonumber: true });
    expect(lines).toHaveLength(1);
  });

  it('strips comments and directives but keeps original line numbers', () => {
    const { lines } = preprocess('sequenceDiagram\n%% a comment\n%%{init: {}}%%\n  A->>B: hi');

    expect(lines.map((line) => line.number)).toEqual([1, 4]);
    expect(lines[1]!.text).toBe('A->>B: hi');
    expect(lines[1]!.indent).toBe(2);
  });

  it('keeps %% that appears inside message text', () => {
    const { lines } = preprocess('sequenceDiagram\nA->>B: 50%% done');
    expect(lines[1]!.text).toBe('A->>B: 50%% done');
  });
});

describe('parseRichText', () => {
  it('splits text into literal and variable segments that reassemble', () => {
    const rich = parseRichText('POST /login as {{role}} for {{email : string}}');

    expect(rich.segments.map((s) => (s.kind === 'text' ? s.value : `<${s.name}>`)).join('')).toBe(
      'POST /login as <role> for <email>',
    );
    expect(rich.reads.map((read) => read.name)).toEqual(['role', 'email']);
    expect(rich.reads[1]!.declaredType).toBe('string');
  });

  it('reads a literal union type as a set of options', () => {
    const rich = parseRichText('{{role : "admin" | "member"}}');
    expect(rich.reads[0]!.declaredType).toEqual({ union: ['admin', 'member'] });
  });

  it('records an assignment as an effect', () => {
    const rich = parseRichText('{{userId = "u-8842"}}');

    expect(rich.effects).toEqual([{ name: 'userId', value: 'u-8842' }]);
    expect(rich.reads[0]!.assigns).toBe(true);
  });

  it('coerces numeric and boolean assignments', () => {
    expect(parseRichText('{{count = 42}}').effects[0]!.value).toBe(42);
    expect(parseRichText('{{ok = true}}').effects[0]!.value).toBe(true);
  });

  it('leaves an unclosed or invalid token as literal text', () => {
    expect(parseRichText('cost {{ 50').segments).toEqual([{ kind: 'text', value: 'cost {{ 50' }]);
    expect(parseRichText('{{not a name}}').reads).toEqual([]);
  });
});

describe('parse', () => {
  it('records declared participants first, then implicit ones in appearance order', () => {
    const ast = parse(`sequenceDiagram
      participant API
      Browser->>API: GET /
      API->>DB: query`);

    expect(ast.participants.map((p) => p.id)).toEqual(['API', 'Browser', 'DB']);
    expect(ast.participants[0]!.declared).toBe(true);
    expect(ast.participants[1]!.declared).toBe(false);
  });

  it('keeps aliases as labels and marks actors', () => {
    const ast = parse('sequenceDiagram\nactor U as End user\nU->>API: hi');

    expect(ast.participants[0]).toMatchObject({ id: 'U', label: 'End user', kind: 'actor' });
  });

  it('parses every arrow kind, longest operator first', () => {
    const ast = parse(`sequenceDiagram
      A->B: solid
      A-->B: dotted
      A->>B: solid arrow
      A-->>B: dotted arrow
      A-xB: solid cross
      A--xB: dotted cross
      A-)B: solid async
      A--)B: dotted async
      A<<->>B: bidirectional
      A<<-->>B: dotted bidirectional`);

    expect((ast.statements as Message[]).map((m) => m.arrow)).toEqual([
      '->',
      '-->',
      '->>',
      '-->>',
      '-x',
      '--x',
      '-)',
      '--)',
      '<<->>',
      '<<-->>',
    ]);
  });

  it('binds the activation suffix to the arrow, not the target name', () => {
    const ast = parse('sequenceDiagram\nA->>+B: start\nA->>-B: finish');
    const [start, finish] = ast.statements as Message[];

    expect(start).toMatchObject({ to: 'B', activate: true, deactivate: false });
    expect(finish).toMatchObject({ to: 'B', activate: false, deactivate: true });
    expect(ast.participants.map((p) => p.id)).toEqual(['A', 'B']);
  });

  it('parses all note placements including a two-target note', () => {
    const ast = parse(`sequenceDiagram
      A->>B: hi
      note left of A: on the left
      note right of B: on the right
      note over A,B: across both`);

    const notes = ast.statements.filter((s) => s.type === 'note') as Note[];
    expect(notes.map((n) => n.placement)).toEqual(['left of', 'right of', 'over']);
    expect(notes[2]!.targets).toEqual(['A', 'B']);
    expect(notes[0]!.text.raw).toBe('on the left');
  });

  it('nests fragments and splits alt into branches with parsed conditions', () => {
    const ast = parse(`sequenceDiagram
      loop every hour
        alt {{role}} == "admin"
          A->>B: audit
        else
          A->>B: plain
        end
      end`);

    const loop = ast.statements[0] as Fragment;
    expect(loop.kind).toBe('loop');
    expect(loop.branches[0]!.label).toBe('every hour');

    const alt = loop.branches[0]!.statements[0] as Fragment;
    expect(alt.kind).toBe('alt');
    expect(alt.branches.map((b) => b.label)).toEqual(['{{role}} == "admin"', '']);
    expect(alt.branches[0]!.condition).not.toBeNull();
    expect(alt.branches[1]!.condition).toBeNull();
  });

  it('parses par lanes and critical options as sibling branches', () => {
    const par = parse('sequenceDiagram\npar one\nA->>B: x\nand two\nA->>C: y\nend')
      .statements[0] as Fragment;
    const critical = parse(
      'sequenceDiagram\ncritical setup\nA->>B: x\noption failure\nA->>C: y\nend',
    ).statements[0] as Fragment;

    expect(par.branches.map((b) => b.label)).toEqual(['one', 'two']);
    expect(critical.branches.map((b) => b.label)).toEqual(['setup', 'failure']);
  });

  it('treats a prose fragment label as viewer-chosen rather than a condition', () => {
    const alt = parse('sequenceDiagram\nalt is the user logged in?\nA->>B: x\nend')
      .statements[0] as Fragment;

    expect(alt.branches[0]!.condition).toBeNull();
  });

  it('groups participants into a box and closes it on end', () => {
    const ast = parse(`sequenceDiagram
      box transparent Backend
        participant API
        participant DB
      end
      Browser->>API: GET /`);

    expect(ast.boxes).toHaveLength(1);
    expect(ast.boxes[0]).toMatchObject({ label: 'Backend', color: 'transparent' });
    expect(ast.boxes[0]!.participantIds).toEqual(['API', 'DB']);
    expect(ast.participants.find((p) => p.id === 'Browser')!.boxId).toBeNull();
  });

  it('parses create and destroy as their own statements', () => {
    const ast = parse('sequenceDiagram\nA->>B: hi\ncreate participant C\nB->>C: spawn\ndestroy C');
    expect(ids(ast.statements)).toEqual(['message', 'create', 'message', 'destroy']);
  });

  it('parses autonumber with and without arguments', () => {
    expect(parse('sequenceDiagram\nautonumber').autonumber).toEqual({
      enabled: true,
      start: 1,
      step: 1,
    });
    expect(parse('sequenceDiagram\nautonumber 10 10').autonumber).toEqual({
      enabled: true,
      start: 10,
      step: 10,
    });
    expect(parse('sequenceDiagram\nautonumber off').autonumber).toEqual({
      enabled: false,
      start: 1,
      step: 1,
    });
  });

  it('records unsupported directives as ignored rather than failing', () => {
    const ast = parse(
      'sequenceDiagram\nA->>B: hi\nlink A: Dashboard @ https://x\nstyle A fill:#f9f',
    );

    expect(ast.ignored.map((entry) => entry.line)).toEqual([3, 4]);
    expect(ast.statements).toHaveLength(1);
  });

  it('throws a diagnostic naming the unclosed construct and its opening line', () => {
    expect(() => parse('sequenceDiagram\nalt first\nA->>B: hi')).toThrow(SequenceParseError);
    expect(() => parse('sequenceDiagram\nalt first\nA->>B: hi')).toThrow(/unclosed "alt".*line 2/);
  });

  it('throws on an unmatched end', () => {
    expect(() => parse('sequenceDiagram\nA->>B: hi\nend')).toThrow(/unmatched "end"/);
  });
});

describe('parse — large real-world shapes', () => {
  const COMPLEX = `sequenceDiagram
    autonumber
    box rgb(225, 240, 255) Requesting side
      actor Requester as Requester
      actor Sponsor as Internal sponsor
    end
    box rgb(225, 245, 230) Platform
      participant Portal as Access portal
      participant Directory as Directory<br/>service
    end
    Note over Requester,Directory: Phase 1
    Requester->>Sponsor: request({{duration : "30 days" | "permanent"}})
    Sponsor->>Portal: submit(id)
    alt {{kind}} == "external"
      Portal->>Directory: verify()
      opt {{stepUp : boolean}}
        Portal->>Directory: strongAuth()
      end
    else
      Portal->>Directory: provision()
    end
    rect rgb(240, 240, 255)
      Portal->>Portal: evaluate()
      alt Low risk
        Portal->>Directory: auto()
      else Elevated risk
        Portal->>Sponsor: escalate()
      end
    end
    loop scheduled review
      Portal->>Sponsor: attest()
    end`;

  it('parses several boxes, keeping each oneis members', () => {
    const ast = parse(COMPLEX);

    expect(ast.boxes.map((box) => box.label)).toEqual(['Requesting side', 'Platform']);
    expect(ast.boxes[0]!.participantIds).toEqual(['Requester', 'Sponsor']);
    expect(ast.boxes[1]!.participantIds).toEqual(['Portal', 'Directory']);
    expect(ast.boxes[0]!.color).toBe('rgb(225, 240, 255)');
  });

  it('keeps a <br/> in a participant label as authored', () => {
    const ast = parse(COMPLEX);
    expect(ast.participants.find((p) => p.id === 'Directory')!.label).toBe('Directory<br/>service');
  });

  it('does not treat a rect colour as a displayable label', () => {
    const rect = parse(COMPLEX).statements.find(
      (statement) => statement.type === 'fragment' && statement.kind === 'rect',
    ) as Fragment;

    expect(rect.color).toBe('rgb(240, 240, 255)');
    expect(rect.branches[0]!.label).toBe('');
  });

  it('nests an opt inside an alt branch and an alt inside a rect', () => {
    const ast = parse(COMPLEX);
    const alt = ast.statements.find((s) => s.type === 'fragment' && s.kind === 'alt') as Fragment;
    const rect = ast.statements.find((s) => s.type === 'fragment' && s.kind === 'rect') as Fragment;

    expect(alt.branches[0]!.statements.some((s) => s.type === 'fragment' && s.kind === 'opt')).toBe(
      true,
    );
    expect(
      rect.branches[0]!.statements.some((s) => s.type === 'fragment' && s.kind === 'alt'),
    ).toBe(true);
  });

  it('reads declared types out of fragment labels as well as message text', async () => {
    const { parseCondition, conditionDeclarations } = await import('@archidea-ai/mermaid-scenario');
    const opt = parseCondition('{{stepUp : boolean}}')!;

    expect(conditionDeclarations(opt)).toEqual([
      { name: 'stepUp', declaredType: 'boolean', assigns: false },
    ]);
  });
});
