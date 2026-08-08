import { parseCondition } from '@archidea-ai/mermaid-scenario';
import { SequenceParseError } from './errors';
import { preprocess } from './preprocess';
import { tokenize } from './tokenize';
import { parseRichText } from '@archidea-ai/mermaid-scenario';
import type { Token } from './tokenize';
import type {
  Fragment,
  VariableDeclaration,
  VariableType,
  FragmentBranch,
  Participant,
  ParticipantBox,
  SequenceDiagramAst,
  Statement,
} from './ast';

interface OpenFragment {
  readonly token: Extract<Token, { kind: 'fragmentOpen' }>;
  readonly branches: { id: string; label: string; statements: Statement[] }[];
}

/**
 * Line tokens plus an explicit block stack. Mermaid sequence syntax is a
 * statement-per-line language, so this is sufficient and far easier to test
 * than a general parser.
 */
export function parse(source: string): SequenceDiagramAst {
  const { lines, frontmatter } = preprocess(source);
  const tokens = tokenize(lines);

  const participants = new Map<string, Participant>();
  const boxes: ParticipantBox[] = [];
  const ignored: { text: string; line: number }[] = [];
  const root: Statement[] = [];
  const stack: OpenFragment[] = [];

  let autonumber = { enabled: false, start: 1, step: 1 };
  let openBox: {
    id: string;
    label: string;
    color: string | null;
    participantIds: string[];
  } | null = null;

  const emit = (statement: Statement): void => {
    const frame = stack[stack.length - 1];
    if (!frame) {
      root.push(statement);
      return;
    }
    frame.branches[frame.branches.length - 1]!.statements.push(statement);
  };

  const ensureParticipant = (
    name: string,
    options: { kind?: 'participant' | 'actor'; label?: string; declared?: boolean } = {},
  ): void => {
    const existing = participants.get(name);
    if (existing) {
      if (options.declared && !existing.declared) {
        participants.set(name, {
          ...existing,
          declared: true,
          kind: options.kind ?? existing.kind,
          label: options.label ?? existing.label,
        });
      }
      return;
    }

    participants.set(name, {
      id: name,
      name,
      label: options.label ?? name,
      kind: options.kind ?? 'participant',
      boxId: openBox?.id ?? null,
      declared: options.declared ?? false,
    });
    if (openBox) openBox.participantIds.push(name);
  };

  for (const token of tokens) {
    switch (token.kind) {
      case 'header':
        break;

      case 'autonumber':
        autonumber = { enabled: token.enabled, start: token.start, step: token.step };
        break;

      case 'participant':
      case 'create': {
        ensureParticipant(token.name, {
          kind: token.actor ? 'actor' : 'participant',
          label: token.alias ?? token.name,
          declared: true,
        });
        if (token.kind === 'create') {
          emit({
            type: 'create',
            id: `create-${token.line}`,
            line: token.line,
            target: token.name,
          });
        }
        break;
      }

      case 'destroy':
        ensureParticipant(token.name);
        emit({
          type: 'destroy',
          id: `destroy-${token.line}`,
          line: token.line,
          target: token.name,
        });
        break;

      case 'boxOpen':
        openBox = {
          id: `box-${token.line}`,
          label: token.label,
          color: token.color,
          participantIds: [],
        };
        break;

      case 'message': {
        ensureParticipant(token.from);
        ensureParticipant(token.to);
        emit({
          type: 'message',
          id: `msg-${token.line}`,
          line: token.line,
          from: token.from,
          to: token.to,
          arrow: token.arrow,
          activate: token.activate,
          deactivate: token.deactivate,
          text: parseRichText(token.text),
        });
        break;
      }

      case 'activate':
      case 'deactivate':
        ensureParticipant(token.name);
        emit({
          type: token.kind,
          id: `${token.kind}-${token.line}`,
          line: token.line,
          target: token.name,
        });
        break;

      case 'note':
        token.targets.forEach((target) => ensureParticipant(target));
        emit({
          type: 'note',
          id: `note-${token.line}`,
          line: token.line,
          placement: token.placement,
          targets: token.targets,
          text: parseRichText(token.text),
        });
        break;

      case 'fragmentOpen':
        stack.push({
          token,
          branches: [
            {
              id: `${token.fragment}-${token.line}-0`,
              // A rect's "label" is the background colour it declares, which is
              // styling rather than something to render on the frame.
              label: token.fragment === 'rect' ? '' : token.label,
              statements: [],
            },
          ],
        });
        break;

      case 'fragmentBranch': {
        const frame = stack[stack.length - 1];
        if (!frame) {
          throw new SequenceParseError(
            `"${token.keyword}" outside any fragment`,
            token.line,
            token.keyword,
          );
        }
        frame.branches.push({
          id: `${frame.token.fragment}-${frame.token.line}-${frame.branches.length}`,
          label: token.label,
          statements: [],
        });
        break;
      }

      case 'end': {
        // `end` closes a box when one is open and no fragment is, matching mermaid.
        if (stack.length === 0 && openBox) {
          boxes.push({ ...openBox, participantIds: [...openBox.participantIds] });
          openBox = null;
          break;
        }

        const frame = stack.pop();
        if (!frame) throw new SequenceParseError('unmatched "end"', token.line, 'end');

        const fragment: Fragment = {
          type: 'fragment',
          id: `${frame.token.fragment}-${frame.token.line}`,
          line: frame.token.line,
          kind: frame.token.fragment,
          color: frame.token.fragment === 'rect' ? frame.token.label : null,
          branches: frame.branches.map((branch): FragmentBranch => ({
            id: branch.id,
            label: branch.label,
            condition: parseCondition(branch.label),
            statements: branch.statements,
          })),
        };
        emit(fragment);
        break;
      }

      case 'ignored':
        ignored.push({ text: token.text, line: token.line });
        break;
    }
  }

  if (stack.length > 0) {
    const unclosed = stack[stack.length - 1]!;
    throw new SequenceParseError(
      `unclosed "${unclosed.token.fragment}" — expected a matching "end"`,
      unclosed.token.line,
      unclosed.token.fragment,
    );
  }
  if (openBox) {
    throw new SequenceParseError('unclosed "box" — expected a matching "end"', 0, 'box');
  }

  // Declared participants keep declaration order; the rest follow first appearance.
  const ordered = [...participants.values()];
  const declared = ordered.filter((participant) => participant.declared);
  const implicit = ordered.filter((participant) => !participant.declared);

  return {
    participants: [...declared, ...implicit],
    boxes,
    statements: root,
    autonumber,
    frontmatter,
    ignored,
  };
}

/**
 * Every type declared anywhere in the diagram, keyed by variable name.
 *
 * A type is a property of the variable, declared once — usually at its first
 * mention in message text. A prompt raised somewhere else, typically by a
 * fragment condition that just reads `{{identityKind}}`, must still get it, or
 * it falls back to a free-text box for what is actually a two-option choice.
 */
export function collectDeclaredTypes(ast: SequenceDiagramAst): ReadonlyMap<string, VariableType> {
  const types = new Map<string, VariableType>();

  const remember = (declarations: readonly VariableDeclaration[]): void => {
    for (const declaration of declarations) {
      if (declaration.declaredType && !types.has(declaration.name)) {
        types.set(declaration.name, declaration.declaredType);
      }
    }
  };

  const walk = (statements: readonly Statement[]): void => {
    for (const statement of statements) {
      if (statement.type === 'message' || statement.type === 'note') {
        remember(statement.text.reads);
        continue;
      }
      if (statement.type === 'fragment') {
        for (const branch of statement.branches) {
          remember(parseRichText(branch.label).reads);
          walk(branch.statements);
        }
      }
    }
  };

  walk(ast.statements);
  return types;
}
