import { MermaidReplacementError } from '@archidea-ai/mermaid-core';
import type {
  C4Ast,
  C4Boundary,
  C4DiagramKind,
  C4Element,
  C4Hint,
  C4Kind,
  C4Relation,
  C4Style,
} from './ast';

export class C4ParseError extends MermaidReplacementError {
  readonly line: number;

  constructor(message: string, line: number, lineText: string) {
    super('DIAGRAM_PARSE_ERROR', `${message} (line ${line}: "${lineText}")`);
    this.line = line;
  }
}

const HEADERS: Readonly<Record<string, C4DiagramKind>> = {
  C4Context: 'context',
  C4Container: 'container',
  C4Component: 'component',
  C4Dynamic: 'dynamic',
  C4Deployment: 'deployment',
};

/** Person / System / Container / Component, with their Db, Queue and _Ext suffixes. */
const ELEMENT = /^(Person|System|Container|Component)(Db|Queue)?(_Ext)?$/;

/** Kinds whose third positional argument is technology rather than description. */
const HAS_TECHNOLOGY = new Set<C4Kind>(['container', 'component']);

/**
 * Signals an unterminated quote back to `splitArgs`'s caller.
 *
 * `splitArgs` has no line number of its own — it operates on one macro's
 * argument text, not the source — so it cannot raise `C4ParseError` itself.
 * The caller, which does have the line, is what turns this into one.
 */
export class UnterminatedQuoteError extends Error {}

/**
 * Splits a macro's argument list on top-level commas.
 *
 * Not a `split(',')`: a technology reads "Java, Spring MVC" more often than it
 * does not, and splitting inside the quotes cut it into two arguments and
 * shifted every later one along by a place.
 */
export function splitArgs(text: string): string[] {
  const out: string[] = [];
  let current = '';
  let quote: string | null = null;
  let depth = 0;

  for (const character of text) {
    if (quote) {
      if (character === quote) quote = null;
      current += character;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      current += character;
      continue;
    }
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    if (character === ',' && depth === 0) {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += character;
  }

  // A quote left open means the text ran out before the value did — that is
  // unreadable, not empty, so it must not fall through to `unquote` and come
  // out the other side as a corrupted string with a stray leading quote.
  if (quote) throw new UnterminatedQuoteError('Unterminated quote');

  if (current.trim()) out.push(current.trim());
  return out;
}

export interface C4Args {
  readonly positional: readonly string[];
  readonly named: Readonly<Record<string, string>>;
}

/** `$key="value"` in any position; everything else keeps its place in order. */
export function readArgs(raw: readonly string[]): C4Args {
  const positional: string[] = [];
  const named: Record<string, string> = {};

  for (const argument of raw) {
    const match = /^\$(\w+)\s*=\s*([\s\S]*)$/.exec(argument);
    if (match) named[match[1]!] = unquote(match[2]!);
    else positional.push(unquote(argument));
  }

  return { positional, named };
}

function readTags(value: string | undefined): readonly string[] {
  if (!value) return [];
  return value
    .split(/[,+]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

/** Boundary macros, and the type each one implies when the author gives none. */
const BOUNDARIES: Readonly<Record<string, string | null>> = {
  Enterprise_Boundary: 'Enterprise',
  System_Boundary: 'System',
  Container_Boundary: 'Container',
  Boundary: null,
};

/** A Deployment_Node and its aliases are boundaries that are also boxes. */
const NODES = new Set(['Deployment_Node', 'Node', 'Node_L', 'Node_R']);

/** Rel / BiRel, with the reversing `_Back` and the ignored direction hints. */
const RELATION = /^(BiRel|Rel)(_Back)?(_U|_Up|_D|_Down|_L|_Left|_R|_Right)?$/;

/**
 * Direction suffixes are hints for upstream's graph solver, not for this
 * layout — our boxes sit where the containment tree puts them, so a per-edge
 * "draw this one going up" is recorded and never obeyed. `Rel_Back` is kept
 * out of this table because it is not a hint: it swaps the ends outright.
 */
const HINTS: Readonly<Record<string, C4Hint>> = {
  _U: 'up',
  _Up: 'up',
  _D: 'down',
  _Down: 'down',
  _L: 'left',
  _Left: 'left',
  _R: 'right',
  _Right: 'right',
};

/** Directives whose colour is applied once the whole source has been read. */
const STYLE_TARGETS = new Set(['UpdateElementStyle', 'UpdateRelStyle', 'UpdateBoundaryStyle']);

/**
 * Author-declared colour is content, the same sanctioned exception this
 * repo's sequence renderer already makes for mermaid's own `rect rgb(...)`.
 */
function readStyle(args: C4Args): C4Style {
  return {
    background: args.named['bgColor'] ?? null,
    border: args.named['borderColor'] ?? args.named['lineColor'] ?? null,
    text: args.named['fontColor'] ?? args.named['textColor'] ?? null,
  };
}

/**
 * Line-oriented parser for the C4 family.
 *
 * Same shape and the same reason as the sequence, state and flowchart parsers:
 * upstream's grammar is private and no public API hands back an AST, and an
 * interactive renderer needs a structured model. Anything it cannot read it
 * refuses, so the surface falls back to the proxy and the diagram never renders
 * worse than upstream.
 *
 * Note that upstream detects all five headers as the single type `c4`, so the
 * header line here is the only thing that says which of the five this is.
 */
export function parse(source: string): C4Ast {
  const lines = source.split('\n');

  let kind: C4DiagramKind | null = null;
  let title: string | null = null;
  let headerLine = 0;
  const elements: C4Element[] = [];
  const boundaries: C4Boundary[] = [];
  const relations: C4Relation[] = [];
  const ignored: { text: string; line: number }[] = [];
  // A directive can name something declared later in the source, so it is
  // collected here and applied only once every element, boundary and
  // relation it might refer to has been read.
  const styles: { name: string; args: C4Args }[] = [];

  // Boundaries nest, so "whose child is this line" is whatever is still open —
  // a stack of ids, innermost last.
  const stack: string[] = [];
  const parent = () => stack[stack.length - 1] ?? null;

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index] ?? '';
    const text = stripComment(raw).trim();
    if (!text) continue;

    if (!kind) {
      const header = /^(C4Context|C4Container|C4Component|C4Dynamic|C4Deployment)\b/.exec(text);
      if (!header) throw new C4ParseError('Not a C4 diagram', index + 1, raw.trim());
      kind = HEADERS[header[1]!]!;
      headerLine = index + 1;
      continue;
    }

    const titled = /^title\s+(.*)$/.exec(text);
    if (titled) {
      title = unquote(titled[1]!);
      continue;
    }

    // A `{` on its own line just opens the block the preceding boundary macro
    // already declared — the stack was pushed there, whether or not the brace
    // shared its line, so there is nothing left for this one to do.
    if (text === '{') continue;
    if (text === '}') {
      // An empty id is a legitimate (if unwise) boundary alias and pushes ''
      // onto the stack — truthiness of the popped value is not a safe "was
      // the stack empty" test, so check the stack itself.
      if (stack.length === 0) throw new C4ParseError('Unmatched "}"', index + 1, raw.trim());
      stack.pop();
      continue;
    }

    // The third group tells a boundary apart from a self-closing one: a plain
    // `{` opens a block that a later `}` must close, while `{ }` (or `{}`)
    // opens and closes it right there, with nothing declared inside.
    const macro = /^([A-Za-z_][A-Za-z0-9_]*)\s*\(([\s\S]*)\)\s*(\{\s*\}|\{)?\s*$/.exec(text);
    if (!macro) throw new C4ParseError('Unrecognised statement', index + 1, raw.trim());

    const name = macro[1]!;
    let args: C4Args;
    try {
      args = readArgs(splitArgs(macro[2]!));
    } catch (error) {
      if (!(error instanceof UnterminatedQuoteError)) throw error;
      throw new C4ParseError('Unterminated quote', index + 1, raw.trim());
    }

    const element = ELEMENT.exec(name);
    if (element) {
      // Only a boundary/node macro is allowed to open a block — an element
      // that does is input this parser cannot read, not one it can discard
      // the brace from, or a later `}` closes the wrong thing.
      if (macro[3] !== undefined) {
        throw new C4ParseError(`"${name}" cannot open a block`, index + 1, raw.trim());
      }

      const kindOfElement = element[1]!.toLowerCase() as C4Kind;
      const hasTechnology = HAS_TECHNOLOGY.has(kindOfElement);

      elements.push({
        id: args.positional[0] ?? '',
        kind: kindOfElement,
        label: args.named['label'] ?? args.positional[1] ?? args.positional[0] ?? '',
        technology: hasTechnology
          ? (args.named['techn'] ?? args.positional[2] ?? null)
          : (args.named['techn'] ?? null),
        description:
          args.named['descr'] ?? (hasTechnology ? args.positional[3] : args.positional[2]) ?? null,
        external: element[3] === '_Ext',
        variant: element[2] === 'Db' ? 'db' : element[2] === 'Queue' ? 'queue' : 'plain',
        tags: readTags(args.named['tags']),
        link: args.named['link'] ?? null,
        parent: parent(),
        style: null,
      });
      continue;
    }

    const isNode = NODES.has(name);
    if (isNode || name in BOUNDARIES) {
      const id = args.positional[0] ?? '';

      boundaries.push({
        id,
        label: args.named['label'] ?? args.positional[1] ?? id,
        type: args.named['type'] ?? args.positional[2] ?? (isNode ? null : BOUNDARIES[name]!),
        isNode,
        description: args.named['descr'] ?? args.positional[3] ?? null,
        parent: parent(),
        tags: readTags(args.named['tags']),
        style: null,
      });

      /*
       * A boundary opens a block, whether the brace shares its declaration
       * line or sits on the next one by itself — a standalone `{` is skipped
       * above, so pushing here is right either way. The one exception is an
       * inline `{ }`: it closes on the same line, so nothing after this
       * statement belongs to it and it must not stay on the stack.
       */
      const closesImmediately = macro[3] !== undefined && macro[3] !== '{';
      if (!closesImmediately) stack.push(id);
      continue;
    }

    // UpdateLayoutConfig tunes the upstream graph solver we do not run, so it
    // is inert here — recorded rather than thrown away, so nothing vanishes
    // silently, but never applied.
    if (name === 'UpdateLayoutConfig') {
      ignored.push({ text, line: index + 1 });
      continue;
    }

    if (STYLE_TARGETS.has(name)) {
      styles.push({ name, args });
      continue;
    }

    // RelIndex takes an extra leading positional (the number), so it is read
    // as a plain `Rel` once that argument has been split off.
    const relation = name === 'RelIndex' ? RELATION.exec('Rel') : RELATION.exec(name);
    if (relation) {
      const indexed = name === 'RelIndex';
      const positional = indexed ? args.positional.slice(1) : args.positional;

      // Rel_Back's arrow points from its second argument to its first — every
      // other form, including the direction hints, keeps them as written.
      const [from, to] =
        relation[2] === '_Back'
          ? [positional[1] ?? '', positional[0] ?? '']
          : [positional[0] ?? '', positional[1] ?? ''];

      relations.push({
        id: `rel-${index + 1}-${relations.length}`,
        line: index + 1,
        from,
        to,
        label: args.named['label'] ?? positional[2] ?? '',
        technology: args.named['techn'] ?? positional[3] ?? null,
        description: args.named['descr'] ?? positional[4] ?? null,
        bidirectional: relation[1] === 'BiRel',
        index: null,
        hint: relation[3] ? (HINTS[relation[3]] ?? null) : null,
        style: null,
      });

      if (indexed) {
        // A non-numeric or missing index argument leaves `index` at its
        // default of `null` — this is a dynamic diagram's step number, not
        // something the parser refuses to read.
        const number = Number(args.positional[0]);
        const last = relations[relations.length - 1];
        if (Number.isFinite(number) && last) {
          relations[relations.length - 1] = { ...last, index: number };
        }
      }
      continue;
    }

    throw new C4ParseError(`Unrecognised statement "${name}"`, index + 1, raw.trim());
  }

  if (!kind) throw new C4ParseError('Not a C4 diagram', 1, lines[0]?.trim() ?? '');
  void headerLine;

  if (stack.length) {
    throw new C4ParseError(
      `Boundary "${stack[stack.length - 1]}" is never closed`,
      lines.length,
      '',
    );
  }

  /*
   * A dynamic diagram's relations are its steps, so they carry a number.
   * Declaration order supplies it wherever RelIndex did not. The `[...]` copy
   * (rather than reusing `relations` itself) keeps the style pass below from
   * mutating an array something else might still hold a reference to.
   */
  const numbered: C4Relation[] =
    kind === 'dynamic'
      ? relations.map((relation, position) => ({
          ...relation,
          index: relation.index ?? position + 1,
        }))
      : [...relations];

  const elementById = new Map(elements.map((element, position) => [element.id, position]));
  const boundaryById = new Map(boundaries.map((boundary, position) => [boundary.id, position]));

  for (const { name, args } of styles) {
    const style = readStyle(args);
    const target = args.positional[0] ?? '';

    if (name === 'UpdateElementStyle') {
      const at = elementById.get(target);
      if (at !== undefined) elements[at] = { ...elements[at]!, style };
      continue;
    }
    if (name === 'UpdateBoundaryStyle') {
      const at = boundaryById.get(target);
      if (at !== undefined) boundaries[at] = { ...boundaries[at]!, style };
      continue;
    }

    // UpdateRelStyle names a pair, and every relation between them takes it,
    // in either direction — the author is styling the connection, not one
    // arrow's-worth of `from`/`to` bookkeeping.
    const other = args.positional[1] ?? '';
    for (let at = 0; at < numbered.length; at += 1) {
      const relation = numbered[at]!;
      const matches =
        (relation.from === target && relation.to === other) ||
        (relation.from === other && relation.to === target);
      if (matches) numbered[at] = { ...relation, style };
    }
  }

  return { kind, title, elements, boundaries, relations: numbered, ignored };
}

/** Strips a `%%` comment, but only outside a quoted string. */
export function stripComment(text: string): string {
  let quoted = false;
  for (let index = 0; index < text.length - 1; index += 1) {
    if (text[index] === '"') quoted = !quoted;
    if (!quoted && text[index] === '%' && text[index + 1] === '%') return text.slice(0, index);
  }
  return text;
}

/** Removes surrounding quotes and turns the literal `\n` into a line break. */
export function unquote(text: string): string {
  const trimmed = text.trim();
  const quoted = /^"(.*)"$/s.exec(trimmed) ?? /^'(.*)'$/s.exec(trimmed);
  return (quoted ? quoted[1]! : trimmed).replace(/\\n/g, '\n');
}
