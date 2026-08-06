import type { SourceLine } from './preprocess';

/** Mermaid arrow operators, longest first so `-->>` never matches as `->`. */
export const ARROWS = [
  '<<-->>',
  '<<->>',
  '-->>',
  '--x',
  '--)',
  '-->',
  '->>',
  '-x',
  '-)',
  '->',
] as const;

export type ArrowKind = (typeof ARROWS)[number];

export type NotePlacement = 'left of' | 'right of' | 'over';

export type Token =
  | { kind: 'header'; line: number }
  | { kind: 'participant'; actor: boolean; name: string; alias: string | null; line: number }
  | { kind: 'create'; actor: boolean; name: string; alias: string | null; line: number }
  | { kind: 'destroy'; name: string; line: number }
  | { kind: 'boxOpen'; label: string; color: string | null; line: number }
  | {
      kind: 'message';
      from: string;
      to: string;
      arrow: ArrowKind;
      activate: boolean;
      deactivate: boolean;
      text: string;
      line: number;
    }
  | { kind: 'activate'; name: string; line: number }
  | { kind: 'deactivate'; name: string; line: number }
  | { kind: 'note'; placement: NotePlacement; targets: string[]; text: string; line: number }
  | { kind: 'fragmentOpen'; fragment: FragmentKeyword; label: string; line: number }
  | { kind: 'fragmentBranch'; keyword: 'else' | 'and' | 'option'; label: string; line: number }
  | { kind: 'end'; line: number }
  | { kind: 'autonumber'; enabled: boolean; start: number; step: number; line: number }
  | { kind: 'ignored'; text: string; line: number };

export type FragmentKeyword = 'loop' | 'alt' | 'opt' | 'par' | 'critical' | 'break' | 'rect';

const FRAGMENT_KEYWORDS: readonly FragmentKeyword[] = [
  'loop',
  'alt',
  'opt',
  'par',
  'critical',
  'break',
  'rect',
];

const IGNORED_KEYWORDS = [
  'links',
  'link',
  'properties',
  'style',
  'classDef',
  'accTitle',
  'accDescr',
];

export function tokenize(lines: readonly SourceLine[]): Token[] {
  return lines.map((line) => tokenizeLine(line));
}

function tokenizeLine(line: SourceLine): Token {
  const { text, number } = line;
  const lower = text.toLowerCase();

  if (lower === 'sequencediagram' || lower.startsWith('sequencediagram ')) {
    return { kind: 'header', line: number };
  }
  if (lower === 'end') return { kind: 'end', line: number };

  if (lower.startsWith('autonumber')) return autonumberToken(text, number);

  // A message can contain any keyword in its text, so arrows win over keywords.
  const message = messageToken(text, number);
  if (message) return message;

  if (lower.startsWith('participant ') || lower.startsWith('actor ')) {
    const actor = lower.startsWith('actor ');
    const { name, alias } = splitAlias(text.slice(actor ? 6 : 12));
    return { kind: 'participant', actor, name, alias, line: number };
  }

  if (lower.startsWith('create ')) {
    const rest = text.slice(7).trim();
    const actor = rest.toLowerCase().startsWith('actor ');
    const body = rest.replace(/^(participant|actor)\s+/i, '');
    const { name, alias } = splitAlias(body);
    return { kind: 'create', actor, name, alias, line: number };
  }

  if (lower.startsWith('destroy ')) {
    return { kind: 'destroy', name: text.slice(8).trim(), line: number };
  }

  if (lower.startsWith('box')) {
    const rest = text.slice(3).trim();
    const colorMatch = rest.match(/^(transparent|rgb\([^)]*\)|rgba\([^)]*\)|#[0-9a-fA-F]{3,8})\s*/);
    return {
      kind: 'boxOpen',
      color: colorMatch ? colorMatch[1]! : null,
      label: colorMatch ? rest.slice(colorMatch[0].length).trim() : rest,
      line: number,
    };
  }

  if (lower.startsWith('activate ')) {
    return { kind: 'activate', name: text.slice(9).trim(), line: number };
  }
  if (lower.startsWith('deactivate ')) {
    return { kind: 'deactivate', name: text.slice(11).trim(), line: number };
  }

  if (lower.startsWith('note ')) return noteToken(text, number);

  for (const keyword of FRAGMENT_KEYWORDS) {
    if (lower === keyword || lower.startsWith(`${keyword} `)) {
      return {
        kind: 'fragmentOpen',
        fragment: keyword,
        label: text.slice(keyword.length).trim(),
        line: number,
      };
    }
  }

  for (const keyword of ['else', 'and', 'option'] as const) {
    if (lower === keyword || lower.startsWith(`${keyword} `)) {
      return {
        kind: 'fragmentBranch',
        keyword,
        label: text.slice(keyword.length).trim(),
        line: number,
      };
    }
  }

  if (IGNORED_KEYWORDS.some((keyword) => lower.startsWith(keyword.toLowerCase()))) {
    return { kind: 'ignored', text, line: number };
  }

  return { kind: 'ignored', text, line: number };
}

function messageToken(text: string, line: number): Token | null {
  const found = findArrow(text);
  if (!found) return null;

  const { arrow, index } = found;
  const from = text.slice(0, index).trim();
  let rest = text.slice(index + arrow.length);

  let activate = false;
  let deactivate = false;
  if (rest.startsWith('+')) {
    activate = true;
    rest = rest.slice(1);
  } else if (rest.startsWith('-')) {
    deactivate = true;
    rest = rest.slice(1);
  }

  const colon = rest.indexOf(':');
  const to = (colon === -1 ? rest : rest.slice(0, colon)).trim();
  const body = colon === -1 ? '' : rest.slice(colon + 1).trim();

  if (!from || !to) return null;

  return { kind: 'message', from, to, arrow, activate, deactivate, text: body, line };
}

/** Scans left to right, trying the longest operator at each position. */
function findArrow(text: string): { arrow: ArrowKind; index: number } | null {
  const limit = text.indexOf(':') === -1 ? text.length : text.indexOf(':');

  for (let index = 0; index < limit; index += 1) {
    for (const arrow of ARROWS) {
      if (text.startsWith(arrow, index)) return { arrow, index };
    }
  }
  return null;
}

function noteToken(text: string, line: number): Token {
  const rest = text.slice(5).trim();
  const lower = rest.toLowerCase();

  let placement: NotePlacement = 'over';
  let remainder = rest;
  if (lower.startsWith('left of')) {
    placement = 'left of';
    remainder = rest.slice(7);
  } else if (lower.startsWith('right of')) {
    placement = 'right of';
    remainder = rest.slice(8);
  } else if (lower.startsWith('over')) {
    placement = 'over';
    remainder = rest.slice(4);
  }

  const colon = remainder.indexOf(':');
  const targetPart = colon === -1 ? remainder : remainder.slice(0, colon);
  const body = colon === -1 ? '' : remainder.slice(colon + 1).trim();

  return {
    kind: 'note',
    placement,
    targets: targetPart
      .split(',')
      .map((target) => target.trim())
      .filter(Boolean),
    text: body,
    line,
  };
}

function autonumberToken(text: string, line: number): Token {
  const parts = text.split(/\s+/).slice(1);
  if (parts[0]?.toLowerCase() === 'off') {
    return { kind: 'autonumber', enabled: false, start: 1, step: 1, line };
  }
  return {
    kind: 'autonumber',
    enabled: true,
    start: parts[0] ? Number(parts[0]) : 1,
    step: parts[1] ? Number(parts[1]) : 1,
    line,
  };
}

function splitAlias(input: string): { name: string; alias: string | null } {
  const match = input.trim().match(/^(.*?)\s+as\s+(.*)$/i);
  if (!match) return { name: input.trim(), alias: null };
  return { name: match[1]!.trim(), alias: match[2]!.trim() };
}
