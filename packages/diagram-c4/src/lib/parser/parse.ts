import { MermaidReplacementError } from '@archidea-ai/mermaid-core';
import type { C4Ast, C4DiagramKind } from './ast';

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
  }

  if (!kind) throw new C4ParseError('Not a C4 diagram', 1, lines[0]?.trim() ?? '');
  void headerLine;

  return { kind, title, elements: [], boundaries: [], relations: [], ignored: [] };
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
