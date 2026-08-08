import { MermaidReplacementError } from '@archidea-ai/mermaid-core';
import { parseCondition, parseRichText } from '@archidea-ai/mermaid-scenario';
import { TERMINAL } from './ast';
import type { StateDiagramAst, StateKind, StateNode, StateTransition } from './ast';

export class StateParseError extends MermaidReplacementError {
  readonly line: number;

  constructor(message: string, line: number, lineText: string) {
    super('DIAGRAM_PARSE_ERROR', `${message} (line ${line}: "${lineText}")`);
    this.line = line;
  }
}

const DIRECTIVE = /%%\{.*?\}%%/g;
const TRANSITION = /-->/;

interface Draft {
  id: string;
  label: string;
  kind: StateKind;
  children: string[];
  parent: string | null;
  note: string | null;
}

/**
 * Line-oriented parser for `stateDiagram-v2`.
 *
 * Same shape as the sequence parser and for the same reason: upstream's grammar
 * is private, and every interactive behaviour needs a structured model no public
 * API returns.
 */
export function parse(source: string): StateDiagramAst {
  const drafts = new Map<string, Draft>();
  const transitions: StateTransition[] = [];
  const ignored: { text: string; line: number }[] = [];
  const stack: string[] = [];
  let direction: StateDiagramAst['direction'] = 'TB';

  const ensure = (id: string, label?: string, kind?: StateKind): Draft => {
    const existing = drafts.get(id);
    if (existing) {
      if (label) existing.label = label;
      if (kind) existing.kind = kind;
      return existing;
    }

    const parent = stack[stack.length - 1] ?? null;
    const draft: Draft = {
      id,
      label: label ?? id,
      kind: kind ?? (id.startsWith(TERMINAL) ? 'terminal' : 'state'),
      children: [],
      parent,
      note: null,
    };
    drafts.set(id, draft);
    if (parent) drafts.get(parent)?.children.push(id);
    return draft;
  };

  const lines = source.replace(/\r\n?/g, '\n').split('\n');

  for (const [index, raw] of lines.entries()) {
    const line = index + 1;
    const text = raw.replace(DIRECTIVE, '').split('%%')[0]!.trim();
    if (!text) continue;

    const lower = text.toLowerCase();
    if (lower.startsWith('statediagram')) continue;

    if (lower.startsWith('direction ')) {
      const value = text.slice(10).trim().toUpperCase();
      if (value === 'TB' || value === 'BT' || value === 'LR' || value === 'RL') direction = value;
      continue;
    }

    if (text === '}') {
      if (!stack.pop()) throw new StateParseError('unmatched "}"', line, text);
      continue;
    }

    // `state Name {` opens a composite; `state "desc" as id` just names one.
    const composite = text.match(/^state\s+(?:"([^"]+)"\s+as\s+)?([A-Za-z0-9_.-]+)\s*\{$/);
    if (composite) {
      const id = composite[2]!;
      ensure(id, composite[1] ?? id);
      stack.push(id);
      continue;
    }

    const described = text.match(/^state\s+"([^"]+)"\s+as\s+([A-Za-z0-9_.-]+)$/);
    if (described) {
      ensure(described[2]!, described[1]!);
      continue;
    }

    const stereotype = text.match(/^state\s+([A-Za-z0-9_.-]+)\s+<<(choice|fork|join)>>$/);
    if (stereotype) {
      ensure(stereotype[1]!, stereotype[1]!, stereotype[2] as StateKind);
      continue;
    }

    const note = text.match(/^note\s+(?:left of|right of)\s+([A-Za-z0-9_.-]+)\s*:\s*(.*)$/i);
    if (note) {
      ensure(note[1]!).note = note[2]!;
      continue;
    }

    if (TRANSITION.test(text)) {
      transitions.push(readTransition(text, line, ensure, stack[stack.length - 1] ?? null));
      continue;
    }

    const bare = text.match(/^state\s+([A-Za-z0-9_.-]+)$/);
    if (bare) {
      ensure(bare[1]!);
      continue;
    }

    ignored.push({ text, line });
  }

  if (stack.length > 0) {
    throw new StateParseError(`unclosed composite state "${stack[stack.length - 1]}"`, 0, '{');
  }

  const states: StateNode[] = [...drafts.values()].map((draft) => ({
    id: draft.id,
    label: draft.label,
    kind: draft.kind,
    children: draft.children,
    parent: draft.parent,
    note: draft.note === null ? null : parseRichText(draft.note),
  }));

  return {
    states,
    stateById: new Map(states.map((state) => [state.id, state])),
    transitions,
    direction,
    ignored,
  };
}

/**
 * `[*]` is scoped to the composite it appears in.
 *
 * Every composite declares its own start and end with the same `[*]` token, so
 * treating them as one shared node made the machine's entry ambiguous and let a
 * nested start masquerade as the diagram's.
 */
export function scopeTerminal(id: string, parent: string | null): string {
  return id === TERMINAL && parent ? `${TERMINAL}@${parent}` : id;
}

function readTransition(
  text: string,
  line: number,
  ensure: (id: string, label?: string, kind?: StateKind) => Draft,
  parent: string | null,
): StateTransition {
  const [connection, ...rest] = text.split(':');
  const [fromRaw, toRaw] = connection!.split('-->');
  const from = scopeTerminal(fromRaw!.trim(), parent);
  const to = scopeTerminal(toRaw?.trim() ?? '', parent);

  if (!from || !to) throw new StateParseError('incomplete transition', line, text);

  ensure(from);
  ensure(to);

  const labelText = rest.join(':').trim();
  const label = labelText ? parseRichText(labelText) : null;

  return {
    id: `t-${line}`,
    line,
    from,
    to,
    label,
    // A label that reads as an expression resolves itself; prose stays a choice.
    condition: labelText ? parseCondition(labelText) : null,
  };
}
