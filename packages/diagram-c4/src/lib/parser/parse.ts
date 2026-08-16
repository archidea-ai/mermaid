import { MermaidReplacementError } from '@archidea-ai/mermaid-core';
import type { C4Ast, C4DiagramKind, C4Element, C4Kind } from './ast';

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

    const macro = /^([A-Za-z_][A-Za-z0-9_]*)\s*\(([\s\S]*)\)\s*\{?\s*$/.exec(text);
    if (!macro) throw new C4ParseError('Unrecognised statement', index + 1, raw.trim());

    const name = macro[1]!;
    const args = readArgs(splitArgs(macro[2]!));

    const element = ELEMENT.exec(name);
    if (element) {
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
        parent: null,
        style: null,
      });
      continue;
    }

    throw new C4ParseError(`Unrecognised statement "${name}"`, index + 1, raw.trim());
  }

  if (!kind) throw new C4ParseError('Not a C4 diagram', 1, lines[0]?.trim() ?? '');
  void headerLine;

  return { kind, title, elements, boundaries: [], relations: [], ignored: [] };
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
