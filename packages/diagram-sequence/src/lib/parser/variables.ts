import type {
  RichText,
  TextSegment,
  VariableDeclaration,
  VariableEffect,
  VariableType,
} from './ast';

const TOKEN = /\{\{([^}]*)\}\}/g;

/**
 * Parses our {{...}} extension out of message and note text.
 *
 * The braces stay inside the mermaid source so one document renders in both
 * this renderer and upstream — upstream simply shows the braces literally.
 */
export function parseRichText(raw: string): RichText {
  const segments: TextSegment[] = [];
  const reads: VariableDeclaration[] = [];
  const effects: VariableEffect[] = [];

  let cursor = 0;
  TOKEN.lastIndex = 0;

  for (let match = TOKEN.exec(raw); match !== null; match = TOKEN.exec(raw)) {
    if (match.index > cursor) {
      segments.push({ kind: 'text', value: raw.slice(cursor, match.index) });
    }

    const parsed = parseToken(match[1]!);
    if (parsed) {
      segments.push({ kind: 'variable', name: parsed.name, declaredType: parsed.declaredType });
      reads.push({ name: parsed.name, declaredType: parsed.declaredType, assigns: parsed.assigns });
      if (parsed.assigns && parsed.value !== undefined) {
        effects.push({ name: parsed.name, value: parsed.value });
      }
    } else {
      segments.push({ kind: 'text', value: match[0]! });
    }

    cursor = match.index + match[0]!.length;
  }

  if (cursor < raw.length) segments.push({ kind: 'text', value: raw.slice(cursor) });

  return { raw, segments, reads, effects };
}

interface ParsedToken {
  name: string;
  declaredType: VariableType | null;
  assigns: boolean;
  value?: string | number | boolean;
}

function parseToken(body: string): ParsedToken | null {
  const equals = splitOutsideQuotes(body, '=');
  const left = (equals ? equals.before : body).trim();
  const right = equals ? equals.after.trim() : null;

  const colon = splitOutsideQuotes(left, ':');
  const name = (colon ? colon.before : left).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return null;

  const declaredType = colon ? parseType(colon.after.trim()) : null;

  if (right === null) return { name, declaredType, assigns: false };
  return { name, declaredType, assigns: true, value: parseLiteral(right) };
}

export function parseType(input: string): VariableType | null {
  if (input === 'string' || input === 'number' || input === 'boolean') return input;

  if (input.includes('|')) {
    const union = input
      .split('|')
      .map((option) => option.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
    if (union.length > 0) return { union };
  }
  return null;
}

export function parseLiteral(input: string): string | number | boolean {
  const trimmed = input.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed !== '' && !Number.isNaN(Number(trimmed))) return Number(trimmed);
  return trimmed.replace(/^["']|["']$/g, '');
}

/** Splits on the first separator that is not inside quotes, so "a=b" stays whole. */
export function splitOutsideQuotes(
  input: string,
  separator: string,
): { before: string; after: string } | null {
  let quote: string | null = null;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]!;
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    // Never split on a comparison operator that merely contains '='.
    if (character === separator) {
      const next = input[index + 1];
      const previous = input[index - 1];
      if (
        separator === '=' &&
        (next === '=' || previous === '!' || previous === '<' || previous === '>')
      ) {
        continue;
      }
      return { before: input.slice(0, index), after: input.slice(index + 1) };
    }
  }
  return null;
}

export function collectEffects(text: RichText): readonly VariableEffect[] {
  return text.effects;
}

/**
 * Splits a `{{...}}` body into its name and declared type.
 *
 * Shared with the condition grammar: a fragment label may annotate a type the
 * same way message text does (`opt {{sendSms : boolean}}`), and reading the body
 * as one opaque identifier there meant the variable was called
 * "sendSms : boolean" and lost its type entirely.
 */
export function parseVariableToken(body: string): {
  name: string;
  declaredType: VariableType | null;
} {
  const colon = splitOutsideQuotes(body, ':');
  const name = (colon ? colon.before : body).trim();
  return { name, declaredType: colon ? parseType(colon.after.trim()) : null };
}
